export interface ParsedOutput {
  success: boolean;
  exitCode?: number;
  errors: string[];
  warnings: string[];
  data: any;
  structuredData?: Record<string, any>;
}

export interface VerificationResult {
  verified: boolean;
  confidence: number;
  reasoning: string;
  extractedData?: any;
}

export class OutputParser {
  /**
   * Parse generic command output
   */
  static parseCommandOutput(output: string, errorOutput?: string): ParsedOutput {
    const combined = (output + '\n' + (errorOutput || '')).trim();
    const lines = combined.split('\n');

    const result: ParsedOutput = {
      success: !errorOutput || errorOutput.trim() === '',
      errors: [],
      warnings: [],
      data: combined
    };

    // Extract errors and warnings
    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('exception')) {
        result.errors.push(line);
        result.success = false;
      }

      if (lowerLine.includes('warning') || lowerLine.includes('warn')) {
        result.warnings.push(line);
      }
    }

    return result;
  }

  /**
   * Parse Git command output
   */
  static parseGitOutput(output: string, command: string): ParsedOutput {
    const result = this.parseCommandOutput(output);

    if (command.includes('status')) {
      result.structuredData = this.parseGitStatus(output);
    } else if (command.includes('log')) {
      result.structuredData = this.parseGitLog(output);
    } else if (command.includes('diff')) {
      result.structuredData = this.parseGitDiff(output);
    }

    return result;
  }

  /**
   * Parse file operation output
   */
  static parseFileOperation(output: string, operation: string): ParsedOutput {
    const result = this.parseCommandOutput(output);

    if (operation.includes('read') || operation.includes('cat') || operation.includes('view')) {
      result.structuredData = {
        content: output,
        lines: output.split('\n').length,
        size: output.length
      };
    }

    return result;
  }

  /**
   * Verify operation result against expected criteria
   */
  static verifyResult(
    parsedOutput: ParsedOutput,
    criteria: string[],
    operation: string
  ): VerificationResult {
    let verified = parsedOutput.success;
    let confidence = parsedOutput.success ? 0.8 : 0.2;
    const reasons: string[] = [];

    for (const criterion of criteria) {
      const matches = this.checkCriterion(parsedOutput, criterion, operation);

      if (!matches.passed) {
        verified = false;
        confidence = Math.min(confidence, matches.confidence);
        reasons.push(matches.reason);
      } else {
        confidence = Math.max(confidence, matches.confidence);
      }
    }

    return {
      verified,
      confidence,
      reasoning: reasons.join('; ') || 'All criteria met',
      extractedData: parsedOutput.structuredData
    };
  }

  /**
   * Parse specific verification criteria
   */
  private static checkCriterion(
    output: ParsedOutput,
    criterion: string,
    operation: string
  ): { passed: boolean; confidence: number; reason: string } {
    const crit = criterion.toLowerCase();
    const data = output.data.toLowerCase();

    // File existence checks
    if (crit.includes('file exists') || crit.includes('created successfully')) {
      const exists = !output.errors.some(e => e.toLowerCase().includes('no such file'));
      return {
        passed: exists,
        confidence: exists ? 0.9 : 0.8,
        reason: exists ? 'File operation successful' : 'File operation failed'
      };
    }

    // Git operation checks
    if (operation.includes('git')) {
      if (crit.includes('committed') || crit.includes('commit')) {
        const committed = data.includes('commit') && !data.includes('failed');
        return {
          passed: committed,
          confidence: committed ? 0.9 : 0.7,
          reason: committed ? 'Git commit successful' : 'Git commit failed'
        };
      }

      if (crit.includes('pushed') || crit.includes('push')) {
        const pushed = data.includes('push') && !output.errors.length;
        return {
          passed: pushed,
          confidence: pushed ? 0.9 : 0.6,
          reason: pushed ? 'Git push successful' : 'Git push failed'
        };
      }
    }

    // Test execution checks
    if (operation.includes('test') || crit.includes('test')) {
      const passed = data.includes('pass') || data.includes('ok');
      const failed = data.includes('fail') || data.includes('error');
      const success = passed && !failed && output.errors.length === 0;

      return {
        passed: success,
        confidence: success ? 0.95 : 0.3,
        reason: success ? 'Tests passed' : 'Tests failed or had errors'
      };
    }

    // Build/compilation checks
    if (crit.includes('build') || crit.includes('compile')) {
      const success = !output.errors.some(e =>
        e.toLowerCase().includes('error') || e.toLowerCase().includes('failed')
      );

      return {
        passed: success,
        confidence: success ? 0.9 : 0.4,
        reason: success ? 'Build successful' : 'Build failed'
      };
    }

    // Network operation checks
    if (crit.includes('connected') || crit.includes('reachable')) {
      const connected = !output.errors.some(e =>
        e.toLowerCase().includes('connection refused') ||
        e.toLowerCase().includes('timeout')
      );

      return {
        passed: connected,
        confidence: connected ? 0.8 : 0.6,
        reason: connected ? 'Network operation successful' : 'Network operation failed'
      };
    }

    // Default: check for general success indicators
    const hasSuccess = data.includes('success') || data.includes('ok') || data.includes('complete');
    const hasErrors = output.errors.length > 0;

    return {
      passed: hasSuccess && !hasErrors,
      confidence: hasSuccess && !hasErrors ? 0.7 : 0.4,
      reason: hasSuccess && !hasErrors ? 'Operation completed successfully' : 'Operation had issues'
    };
  }

  /**
   * Parse Git status output
   */
  private static parseGitStatus(output: string): any {
    const lines = output.split('\n');
    const status = {
      modified: [] as string[],
      added: [] as string[],
      deleted: [] as string[],
      untracked: [] as string[],
      clean: false
    };

    for (const line of lines) {
      if (line.startsWith('M ')) {
        status.modified.push(line.substring(3));
      } else if (line.startsWith('A ')) {
        status.added.push(line.substring(3));
      } else if (line.startsWith('D ')) {
        status.deleted.push(line.substring(3));
      } else if (line.startsWith('?? ')) {
        status.untracked.push(line.substring(3));
      } else if (line.includes('clean')) {
        status.clean = true;
      }
    }

    return status;
  }

  /**
   * Parse Git log output
   */
  private static parseGitLog(output: string): any {
    const commits = output.split('\n\n').filter(c => c.trim());
    return {
      commitCount: commits.length,
      commits: commits.map(commit => {
        const lines = commit.split('\n');
        return {
          hash: lines[0]?.split(' ')[0],
          message: lines[0]?.substring(lines[0].indexOf(' ') + 1),
          author: lines[1]?.replace('Author: ', ''),
          date: lines[2]?.replace('Date: ', '')
        };
      })
    };
  }

  /**
   * Parse Git diff output
   */
  private static parseGitDiff(output: string): any {
    const lines = output.split('\n');
    let additions = 0;
    let deletions = 0;
    const files: string[] = [];

    for (const line of lines) {
      if (line.startsWith('+++ b/')) {
        files.push(line.substring(6));
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    }

    return {
      files,
      additions,
      deletions,
      totalChanges: additions + deletions
    };
  }

  /**
   * Extract structured data from various command outputs
   */
  static extractStructuredData(output: string, commandType: string): any {
    switch (commandType) {
      case 'git-status':
        return this.parseGitStatus(output);
      case 'git-log':
        return this.parseGitLog(output);
      case 'git-diff':
        return this.parseGitDiff(output);
      case 'ls':
        return this.parseLsOutput(output);
      case 'ps':
        return this.parsePsOutput(output);
      default:
        return { raw: output };
    }
  }

  /**
   * Parse ls command output
   */
  private static parseLsOutput(output: string): any {
    const lines = output.split('\n').filter(l => l.trim());
    return {
      files: lines,
      count: lines.length,
      directories: lines.filter(line => line.endsWith('/')),
      executables: lines.filter(line => line.includes('x'))
    };
  }

  /**
   * Parse ps command output
   */
  private static parsePsOutput(output: string): any {
    const lines = output.split('\n').filter(l => l.trim());
    if (lines.length < 2) return { processes: [] };

    // Skip header
    const processes = lines.slice(1).map(line => {
      const parts = line.trim().split(/\s+/);
      return {
        pid: parts[0],
        tty: parts[1],
        time: parts[2],
        cmd: parts.slice(3).join(' ')
      };
    });

    return { processes, count: processes.length };
  }
}