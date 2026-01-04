import * as fs from 'fs';
import * as path from 'path';
import { BashTool } from '../tools/index.js';
import { ToolResult } from '../types/index.js';

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  isCurrent: boolean;
  isBare: boolean;
  lastModified: Date;
}

export interface WorktreeCompatibility {
  compatible: boolean;
  issues: string[];
  recommendations: string[];
}

export class WorktreeManager {
  private bash: BashTool;

  constructor(bash: BashTool) {
    this.bash = bash;
  }

  /**
   * Detect all Git worktrees in the current repository
   */
  async detectWorktrees(projectRoot?: string): Promise<WorktreeInfo[]> {
    try {
      const root = projectRoot || await this.findGitRoot();
      if (!root) {
        return [];
      }

      const result = await this.bash.execute('git worktree list --porcelain');

      if (!result.success) {
        return [];
      }

      const worktrees: WorktreeInfo[] = [];
      const lines = result.output.trim().split('\n');
      let currentWorktree: Partial<WorktreeInfo> | null = null;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          // Save previous worktree if exists
          if (currentWorktree && currentWorktree.path) {
            worktrees.push(currentWorktree as WorktreeInfo);
          }

          // Start new worktree
          const worktreePath = line.replace('worktree ', '').trim();
          currentWorktree = {
            path: worktreePath,
            isCurrent: false,
            isBare: false,
            lastModified: new Date()
          };
        } else if (line.startsWith('HEAD ')) {
          if (currentWorktree) {
            currentWorktree.commit = line.replace('HEAD ', '').trim();
          }
        } else if (line.startsWith('branch ')) {
          if (currentWorktree) {
            currentWorktree.branch = line.replace('branch refs/heads/', '').trim();
          }
        } else if (line.includes('bare')) {
          if (currentWorktree) {
            currentWorktree.isBare = true;
          }
        }
      }

      // Add the last worktree
      if (currentWorktree && currentWorktree.path) {
        worktrees.push(currentWorktree as WorktreeInfo);
      }

      // Mark current worktree
      const currentDir = process.cwd();
      worktrees.forEach(wt => {
        wt.isCurrent = path.resolve(wt.path) === path.resolve(currentDir);
        try {
          const stats = fs.statSync(wt.path);
          wt.lastModified = stats.mtime;
        } catch {
          // Keep default date if can't read
        }
      });

      return worktrees;
    } catch (error) {
      console.warn('Failed to detect worktrees:', error);
      return [];
    }
  }

  /**
   * Validate compatibility across worktrees
   */
  async validateWorktreeCompatibility(worktrees: WorktreeInfo[]): Promise<WorktreeCompatibility> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (worktrees.length === 0) {
      return {
        compatible: true,
        issues: [],
        recommendations: ['No worktrees detected - single instance mode']
      };
    }

    // Check for branch conflicts
    const branches = worktrees.map(wt => wt.branch).filter(Boolean);
    const uniqueBranches = new Set(branches);

    if (uniqueBranches.size !== branches.length) {
      issues.push('Multiple worktrees on same branch detected');
      recommendations.push('Use separate branches for different worktrees to avoid conflicts');
    }

    // Check for detached HEAD states
    const detachedWorktrees = worktrees.filter(wt => wt.commit && !wt.branch);
    if (detachedWorktrees.length > 0) {
      issues.push(`${detachedWorktrees.length} worktree(s) in detached HEAD state`);
      recommendations.push('Consider creating branches for detached HEAD worktrees');
    }

    // Check for stale worktrees
    const now = Date.now();
    const staleWorktrees = worktrees.filter(wt => {
      const age = now - wt.lastModified.getTime();
      return age > 30 * 24 * 60 * 60 * 1000; // 30 days
    });

    if (staleWorktrees.length > 0) {
      recommendations.push(`${staleWorktrees.length} worktree(s) haven't been modified in 30+ days - consider cleanup`);
    }

    // Check for concurrent modifications (basic check)
    try {
      const statusResults = await Promise.all(
        worktrees.map(wt => this.bash.execute('git status --porcelain'))
      );

      const modifiedWorktrees = statusResults.filter(result => result.success && result.output.trim()).length;

      if (modifiedWorktrees > 1) {
        issues.push(`${modifiedWorktrees} worktrees have uncommitted changes`);
        recommendations.push('Commit or stash changes before running multiple agents');
      }
    } catch (error) {
      issues.push('Unable to check worktree status consistency');
    }

    return {
      compatible: issues.length === 0,
      issues,
      recommendations
    };
  }

  /**
   * Create a new worktree for isolated agent execution
   */
  async createIsolatedWorktree(baseBranch: string = 'main', worktreeName?: string): Promise<{
    success: boolean;
    worktreePath?: string;
    error?: string;
  }> {
    try {
      // Generate unique worktree name
      const timestamp = Date.now();
      const name = worktreeName || `agent_${timestamp}`;

      // Create worktree directory
      const worktreePath = path.join(process.cwd(), '..', name);

      // Ensure parent directory exists
      const parentDir = path.dirname(worktreePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Create the worktree
      const result = await this.bash.execute(`git worktree add ${worktreePath} ${baseBranch}`);

      if (result.success) {
        return {
          success: true,
          worktreePath
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to create worktree'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Worktree creation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Clean up a worktree after agent execution
   */
  async cleanupWorktree(worktreePath: string, force: boolean = false): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Check if worktree has uncommitted changes
      const statusResult = await this.bash.execute('git status --porcelain');

      if (!force && statusResult.success && statusResult.output.trim()) {
        return {
          success: false,
          error: 'Worktree has uncommitted changes. Use force=true to override.'
        };
      }

      // Remove the worktree
      const removeResult = await this.bash.execute(`git worktree remove ${worktreePath}`);

      if (removeResult.success) {
        return { success: true };
      } else {
        return {
          success: false,
          error: removeResult.error || 'Failed to remove worktree'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Worktree cleanup failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Get worktree-specific session data
   */
  async getWorktreeSessionData(worktreePath: string): Promise<{
    branch: string;
    commit: string;
    status: string;
    recentCommits: string[];
  }> {
    try {
      const branchResult = await this.bash.execute('git branch --show-current');
      const commitResult = await this.bash.execute('git rev-parse HEAD');
      const statusResult = await this.bash.execute('git status --short');
      const logResult = await this.bash.execute('git log --oneline -5');

      return {
        branch: branchResult.success ? branchResult.output.trim() : 'unknown',
        commit: commitResult.success ? commitResult.output.trim() : 'unknown',
        status: statusResult.success ? statusResult.output.trim() : 'unknown',
        recentCommits: logResult.success ? logResult.output.trim().split('\n').filter(Boolean) : []
      };
    } catch (error) {
      return {
        branch: 'error',
        commit: 'error',
        status: 'error',
        recentCommits: []
      };
    }
  }

  /**
   * Find the Git repository root
   */
  private async findGitRoot(): Promise<string | null> {
    try {
      const result = await this.bash.execute('git rev-parse --show-toplevel');
      return result.success ? result.output.trim() : null;
    } catch {
      return null;
    }
  }

  /**
   * Check if current directory is a valid worktree
   */
  async isValidWorktree(dirPath: string = process.cwd()): Promise<boolean> {
    try {
      const result = await this.bash.execute('git rev-parse --git-dir');
      return result.success && fs.existsSync(path.join(dirPath, '.git'));
    } catch {
      return false;
    }
  }
}