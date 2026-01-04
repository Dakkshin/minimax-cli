import { MiniMaxAgent } from './minimax-agent.js';
import * as crypto from 'crypto';

export interface SubagentConfig {
  id: string;
  specialization: string;
  context: string;
  maxToolRounds: number;
  workingDirectory?: string;
  parentAgentId?: string;
}

export interface SubagentTask {
  id: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  context: string;
  timeout?: number; // in milliseconds
}

export interface SubagentResult {
  subagentId: string;
  taskId: string;
  success: boolean;
  result: any;
  executionTime: number;
  error?: string;
}

export class SubagentManager {
  private subagents: Map<string, MiniMaxAgent> = new Map();
  private activeTasks: Map<string, SubagentTask> = new Map();
  private taskResults: Map<string, SubagentResult> = new Map();
  private parentAgent: MiniMaxAgent;

  constructor(parentAgent: MiniMaxAgent) {
    this.parentAgent = parentAgent;
  }

  /**
   * Spawn a new specialized subagent
   */
  async spawnSubagent(config: Omit<SubagentConfig, 'id'>): Promise<string> {
    const subagentId = `subagent_${crypto.randomUUID()}`;

    // Create subagent configuration
    const fullConfig: SubagentConfig = {
      id: subagentId,
      ...config
    };

    // Create the subagent instance
    const subagent = new MiniMaxAgent(
      process.env.MINIMAX_API_KEY || '',
      process.env.MINIMAX_BASE_URL,
      this.parentAgent.getCurrentModel(),
      config.maxToolRounds
    );

    // Change to specified working directory if provided
    if (config.workingDirectory) {
      process.chdir(config.workingDirectory);
    }

    // Set up specialized system prompt
    const specializedPrompt = this.createSpecializedPrompt(config);

    // Store the subagent
    this.subagents.set(subagentId, subagent);

    return subagentId;
  }

  /**
   * Execute a task using a specific subagent
   */
  async executeTask(subagentId: string, task: SubagentTask): Promise<SubagentResult> {
    const subagent = this.subagents.get(subagentId);
    if (!subagent) {
      throw new Error(`Subagent ${subagentId} not found`);
    }

    this.activeTasks.set(task.id, task);
    const startTime = Date.now();

    try {
      // Execute the task
      const result = await this.executeTaskWithTimeout(subagent, task);

      const executionTime = Date.now() - startTime;
      const taskResult: SubagentResult = {
        subagentId,
        taskId: task.id,
        success: true,
        result,
        executionTime
      };

      this.taskResults.set(task.id, taskResult);
      this.activeTasks.delete(task.id);

      return taskResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const taskResult: SubagentResult = {
        subagentId,
        taskId: task.id,
        success: false,
        result: null,
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      };

      this.taskResults.set(task.id, taskResult);
      this.activeTasks.delete(task.id);

      return taskResult;
    }
  }

  /**
   * Execute multiple tasks in parallel using available subagents
   */
  async executeTasksParallel(tasks: SubagentTask[], subagentConfigs: SubagentConfig[]): Promise<SubagentResult[]> {
    // Spawn subagents
    const subagentIds = await Promise.all(
      subagentConfigs.map(config => this.spawnSubagent(config))
    );

    // Execute tasks in parallel
    const taskPromises = tasks.map((task, index) => {
      const subagentId = subagentIds[index % subagentIds.length];
      return this.executeTask(subagentId, task);
    });

    return await Promise.all(taskPromises);
  }

  /**
   * Clean up a subagent
   */
  cleanupSubagent(subagentId: string): void {
    this.subagents.delete(subagentId);
  }

  /**
   * Clean up all subagents
   */
  cleanupAllSubagents(): void {
    this.subagents.clear();
    this.activeTasks.clear();
  }

  /**
   * Get active subagents
   */
  getActiveSubagents(): string[] {
    return Array.from(this.subagents.keys());
  }

  /**
   * Get task results
   */
  getTaskResults(taskIds?: string[]): SubagentResult[] {
    if (taskIds) {
      return taskIds.map(id => this.taskResults.get(id)).filter(Boolean) as SubagentResult[];
    }
    return Array.from(this.taskResults.values());
  }

  /**
   * Get subagent statistics
   */
  getSubagentStats(): {
    totalSubagents: number;
    activeTasks: number;
    completedTasks: number;
    failedTasks: number;
  } {
    const totalResults = Array.from(this.taskResults.values());
    const completedTasks = totalResults.filter(r => r.success).length;
    const failedTasks = totalResults.filter(r => !r.success).length;

    return {
      totalSubagents: this.subagents.size,
      activeTasks: this.activeTasks.size,
      completedTasks,
      failedTasks
    };
  }

  /**
   * Create specialized system prompt for subagent
   */
  private createSpecializedPrompt(config: Omit<SubagentConfig, 'id'>): string {
    const basePrompt = this.parentAgent['messages'][0]?.content || '';

    // Add specialization context
    const specializationContext = `
SUBAGENT SPECIALIZATION: ${config.specialization.toUpperCase()}
CONTEXT: ${config.context}

As a specialized subagent focused on ${config.specialization}, you should:
- Stay focused on your specific area of expertise
- Provide detailed, technical responses
- Coordinate with the main agent when needed
- Complete your assigned tasks efficiently

Parent Agent ID: ${config.parentAgentId || 'main'}
Working Directory: ${config.workingDirectory || process.cwd()}
`;

    return basePrompt + specializationContext;
  }

  /**
   * Execute task with timeout
   */
  private async executeTaskWithTimeout(subagent: MiniMaxAgent, task: SubagentTask): Promise<any> {
    const timeout = task.timeout || 300000; // 5 minutes default

    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Task timeout after ${timeout}ms`));
      }, timeout);

      try {
        // Execute the task using the subagent
        const result = await subagent.processUserMessage(task.description);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Specialized subagent types
   */
  static createFileAnalysisSubagent(workingDirectory?: string): Omit<SubagentConfig, 'id'> {
    return {
      specialization: 'file_analysis',
      context: 'Analyze files, understand code structure, identify patterns and dependencies',
      maxToolRounds: 20,
      workingDirectory
    };
  }

  static createLogAnalysisSubagent(workingDirectory?: string): Omit<SubagentConfig, 'id'> {
    return {
      specialization: 'log_analysis',
      context: 'Parse and analyze log files, identify errors, performance issues, and patterns',
      maxToolRounds: 15,
      workingDirectory
    };
  }

  static createDatabaseSubagent(workingDirectory?: string): Omit<SubagentConfig, 'id'> {
    return {
      specialization: 'database_operations',
      context: 'Handle database queries, schema analysis, and data manipulation tasks',
      maxToolRounds: 25,
      workingDirectory
    };
  }

  static createTestingSubagent(workingDirectory?: string): Omit<SubagentConfig, 'id'> {
    return {
      specialization: 'testing_and_quality',
      context: 'Run tests, analyze code quality, perform linting and validation',
      maxToolRounds: 30,
      workingDirectory
    };
  }

  static createDeploymentSubagent(workingDirectory?: string): Omit<SubagentConfig, 'id'> {
    return {
      specialization: 'deployment_and_infrastructure',
      context: 'Handle deployment, configuration management, and infrastructure tasks',
      maxToolRounds: 35,
      workingDirectory
    };
  }
}