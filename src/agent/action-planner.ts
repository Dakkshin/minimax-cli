import { MiniMaxClient } from '../minimax/client.js';
import { ToolResult } from '../types/index.js';
import { BashTool } from '../tools/index.js';

export interface ActionStep {
  id: string;
  description: string;
  command: string;
  expectedOutcome: string;
  verificationCriteria: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: ToolResult;
  verified?: boolean;
  reasoning?: string;
}

export interface ActionPlan {
  id: string;
  originalTask: string;
  steps: ActionStep[];
  currentStepIndex: number;
  status: 'planning' | 'executing' | 'verifying' | 'completed' | 'failed';
  overallResult?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface VerificationResult {
  verified: boolean;
  reasoning: string;
  confidence: number; // 0-1
  suggestions?: string[];
}

export class ActionPlanner {
  private miniMaxClient: MiniMaxClient;
  private bash: BashTool;

  constructor(miniMaxClient: MiniMaxClient, bash: BashTool) {
    this.miniMaxClient = miniMaxClient;
    this.bash = bash;
  }

  /**
   * IOEEA Loop Phase 1: INVESTIGATE
   * Analyze the task and current environment to understand what needs to be done
   */
  async investigate(task: string): Promise<{
    analysis: string;
    prerequisites: string[];
    potentialChallenges: string[];
    suggestedApproach: string;
  }> {
    const investigationPrompt = `INVESTIGATE this task thoroughly:

Task: "${task}"

Current working directory: ${process.cwd()}

Please analyze:
1. What needs to be accomplished?
2. What prerequisites or dependencies exist?
3. What potential challenges or edge cases?
4. What approach would be most effective?

Provide a structured analysis that will guide planning.`;

    try {
      const response = await this.miniMaxClient.chat([
        { role: 'user', content: investigationPrompt }
      ]);

      const analysis = response.choices[0]?.message?.content || 'Analysis failed';

      // Parse the response to extract structured information
      return this.parseInvestigationResponse(analysis);
    } catch (error) {
      console.warn('Investigation failed:', error);
      return {
        analysis: 'Investigation failed due to error',
        prerequisites: [],
        potentialChallenges: ['Unknown challenges due to investigation failure'],
        suggestedApproach: 'Proceed with caution and manual verification'
      };
    }
  }

  /**
   * IOEEA Loop Phase 2: OBSERVE
   * Gather current state information to inform planning
   */
  async observe(): Promise<{
    gitStatus?: string;
    fileStructure?: string;
    environment?: string;
    recentHistory?: string;
  }> {
    const observations: any = {};

    try {
      // Check git status
      const gitStatus = await this.bash.execute('git status --porcelain');
      observations.gitStatus = gitStatus.success ? gitStatus.output : 'Not a git repository';

      // Get directory structure
      const fileStructure = await this.bash.execute('find . -maxdepth 2 -type f | head -20');
      observations.fileStructure = fileStructure.success ? fileStructure.output : 'Unable to read directory';

      // Environment info
      const env = await this.bash.execute('echo "Node: $(node --version), NPM: $(npm --version), Git: $(git --version)"');
      observations.environment = env.success ? env.output : 'Unable to get environment info';

    } catch (error) {
      console.warn('Observation phase failed:', error);
    }

    return observations;
  }

  /**
   * IOEEA Loop Phase 3: EVALUATE & PLAN
   * Create a structured action plan based on investigation and observation
   */
  async createActionPlan(task: string, investigation: any, observations: any): Promise<ActionPlan> {
    const planningPrompt = `EVALUATE and CREATE an action plan for this task:

Task: "${task}"

INVESTIGATION RESULTS:
${JSON.stringify(investigation, null, 2)}

CURRENT STATE/OBSERVATIONS:
${JSON.stringify(observations, null, 2)}

Create a detailed, step-by-step action plan with:
1. Sequential steps that can be independently executed and verified
2. Each step should have:
   - description: What the step accomplishes
   - command: The exact command/tool to execute
   - expectedOutcome: What should happen when successful
   - verificationCriteria: How to verify the step worked

Return the plan as a JSON object with this structure:
{
  "steps": [
    {
      "id": "step_1",
      "description": "Clear description",
      "command": "exact command or tool call",
      "expectedOutcome": "What should happen",
      "verificationCriteria": ["Criterion 1", "Criterion 2"]
    }
  ]
}

Make steps atomic, verifiable, and recoverable.`;

    try {
      const response = await this.miniMaxClient.chat([
        { role: 'user', content: planningPrompt }
      ]);

      const planContent = response.choices[0]?.message?.content || '{}';

      // Extract JSON from response
      const jsonMatch = planContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                       planContent.match(/```\s*([\s\S]*?)\s*```/) ||
                       planContent;

      const planData = JSON.parse(jsonMatch[1] || jsonMatch[0] || '{}');

      return {
        id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        originalTask: task,
        steps: (planData.steps || []).map((step: any, index: number) => ({
          id: step.id || `step_${index + 1}`,
          description: step.description || '',
          command: step.command || '',
          expectedOutcome: step.expectedOutcome || '',
          verificationCriteria: step.verificationCriteria || [],
          status: 'pending' as const
        })),
        currentStepIndex: 0,
        status: 'planning',
        createdAt: new Date()
      };
    } catch (error) {
      console.warn('Plan creation failed:', error);
      // Fallback to basic plan
      return {
        id: `plan_${Date.now()}_fallback`,
        originalTask: task,
        steps: [{
          id: 'step_1',
          description: 'Execute the requested task',
          command: task,
          expectedOutcome: 'Task completed successfully',
          verificationCriteria: ['Command executed without error'],
          status: 'pending'
        }],
        currentStepIndex: 0,
        status: 'planning',
        createdAt: new Date()
      };
    }
  }

  /**
   * IOEEA Loop Phase 4: EXECUTE
   * Execute the action plan step by step with verification
   */
  async executeAndVerify(plan: ActionPlan): Promise<ActionPlan> {
    plan.status = 'executing';

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      plan.currentStepIndex = i;

      if (step.status !== 'pending') continue;

      step.status = 'running';

      try {
        // Execute the step
        const result = await this.executeStep(step);
        step.result = result;

        // Verify the execution
        const verification = await this.verifyStep(step, result);
        step.verified = verification.verified;
        step.reasoning = verification.reasoning;

        if (verification.verified) {
          step.status = 'completed';
        } else {
          step.status = 'failed';
          plan.status = 'failed';
          plan.overallResult = `Step ${step.id} failed verification: ${verification.reasoning}`;
          break;
        }
      } catch (error) {
        step.status = 'failed';
        step.reasoning = `Execution error: ${error instanceof Error ? error.message : String(error)}`;
        plan.status = 'failed';
        break;
      }
    }

    if (plan.status === 'executing') {
      plan.status = 'completed';
      plan.completedAt = new Date();
      plan.overallResult = 'All steps completed successfully';
    }

    return plan;
  }

  /**
   * IOEEA Loop Phase 5: ACT/ADAPT
   * Based on execution results, suggest improvements or next actions
   */
  async adapt(plan: ActionPlan): Promise<{
    success: boolean;
    nextActions: string[];
    learnedLessons: string[];
    suggestions: string[];
  }> {
    const adaptationPrompt = `ANALYZE this execution and suggest improvements:

EXECUTION RESULTS:
Plan ID: ${plan.id}
Original Task: ${plan.originalTask}
Status: ${plan.status}
Steps Completed: ${plan.steps.filter(s => s.status === 'completed').length}/${plan.steps.length}

DETAILED STEP RESULTS:
${plan.steps.map(step => `
Step ${step.id}: ${step.status}
- Description: ${step.description}
- Command: ${step.command}
- Result: ${step.result?.success ? 'SUCCESS' : 'FAILED'}
- Verified: ${step.verified}
- Reasoning: ${step.reasoning}
`).join('\n')}

Based on this execution, provide:
1. Was the overall task successful?
2. What lessons were learned?
3. What could be improved for future executions?
4. Any follow-up actions needed?`;

    try {
      const response = await this.miniMaxClient.chat([
        { role: 'user', content: adaptationPrompt }
      ]);

      const analysis = response.choices[0]?.message?.content || 'Analysis failed';

      return this.parseAdaptationResponse(analysis);
    } catch (error) {
      return {
        success: plan.status === 'completed',
        nextActions: ['Manual verification recommended'],
        learnedLessons: ['Error occurred during adaptation analysis'],
        suggestions: ['Review execution manually']
      };
    }
  }

  private async executeStep(step: ActionStep): Promise<ToolResult> {
    // For now, execute as bash command. Later this could be extended to different tool types
    if (step.command.startsWith('bash ')) {
      return await this.bash.execute(step.command.substring(5));
    } else {
      return await this.bash.execute(step.command);
    }
  }

  private async verifyStep(step: ActionStep, result: ToolResult): Promise<VerificationResult> {
    const verificationPrompt = `VERIFY if this step execution matches expectations:

STEP: ${step.description}
COMMAND: ${step.command}
EXPECTED OUTCOME: ${step.expectedOutcome}
VERIFICATION CRITERIA:
${step.verificationCriteria.map(c => `- ${c}`).join('\n')}

ACTUAL RESULT:
Success: ${result.success}
Output: ${result.output || 'No output'}
Error: ${result.error || 'No error'}

Does this execution meet the verification criteria? Provide:
1. VERIFIED or FAILED
2. Detailed reasoning
3. Confidence level (0-1)
4. Any suggestions for improvement

Format: VERIFIED|FAILED|confidence|reasoning|suggestions`;

    try {
      const response = await this.miniMaxClient.chat([
        { role: 'user', content: verificationPrompt }
      ]);

      const verificationText = response.choices[0]?.message?.content || 'FAILED|0|Unable to verify';

      return this.parseVerificationResponse(verificationText);
    } catch (error) {
      return {
        verified: false,
        reasoning: `Verification failed: ${error instanceof Error ? error.message : String(error)}`,
        confidence: 0
      };
    }
  }

  private parseInvestigationResponse(response: string): any {
    // Simple parsing - could be enhanced with better NLP
    return {
      analysis: response,
      prerequisites: [],
      potentialChallenges: [],
      suggestedApproach: 'Proceed with the plan'
    };
  }

  private parseVerificationResponse(response: string): VerificationResult {
    const parts = response.split('|');
    if (parts.length < 3) {
      return {
        verified: false,
        reasoning: 'Unable to parse verification response',
        confidence: 0
      };
    }

    return {
      verified: parts[0].trim().toUpperCase() === 'VERIFIED',
      reasoning: parts[3] || 'No reasoning provided',
      confidence: parseFloat(parts[2]) || 0,
      suggestions: parts[4] ? parts[4].split(',').map(s => s.trim()) : undefined
    };
  }

  private parseAdaptationResponse(response: string): any {
    // Simple parsing - could be enhanced
    return {
      success: response.includes('successful') || response.includes('completed'),
      nextActions: [],
      learnedLessons: [],
      suggestions: []
    };
  }
}