import * as fs from 'fs';
import * as path from 'path';
import { ToolResult } from '../types/index.js';

export interface VerificationCriterion {
  type: 'file_exists' | 'file_contains' | 'output_contains' | 'output_matches' | 'command_success' | 'no_errors';
  target?: string; // file path for file operations, pattern for output matching
  value?: string; // expected content, pattern, etc.
  description?: string;
}

export interface VerificationResult {
  verified: boolean;
  explanation: string;
  details?: any;
}

/**
 * Engine for verifying command execution results against expected criteria
 */
export class VerificationEngine {
  /**
   * Verify a single criterion
   */
  async verifyCriterion(criterion: VerificationCriterion, result: ToolResult): Promise<VerificationResult> {
    try {
      switch (criterion.type) {
        case 'command_success':
          return this.verifyCommandSuccess(result, criterion);

        case 'no_errors':
          return this.verifyNoErrors(result, criterion);

        case 'output_contains':
          return this.verifyOutputContains(result, criterion);

        case 'output_matches':
          return this.verifyOutputMatches(result, criterion);

        case 'file_exists':
          return this.verifyFileExists(result, criterion);

        case 'file_contains':
          return this.verifyFileContains(result, criterion);

        default:
          return {
            verified: false,
            explanation: `Unknown verification criterion type: ${criterion.type}`
          };
      }
    } catch (error: any) {
      return {
        verified: false,
        explanation: `Verification error: ${error.message}`
      };
    }
  }

  /**
   * Verify multiple criteria (all must pass)
   */
  async verifyAllCriteria(criteria: VerificationCriterion[], result: ToolResult): Promise<VerificationResult> {
    const results: VerificationResult[] = [];

    for (const criterion of criteria) {
      const criterionResult = await this.verifyCriterion(criterion, result);
      results.push(criterionResult);

      if (!criterionResult.verified) {
        return {
          verified: false,
          explanation: `Failed criterion: ${criterion.description || criterion.type} - ${criterionResult.explanation}`,
          details: { failedCriterion: criterion, results }
        };
      }
    }

    return {
      verified: true,
      explanation: `All ${criteria.length} criteria verified successfully`,
      details: { results }
    };
  }

  private verifyCommandSuccess(result: ToolResult, criterion: VerificationCriterion): VerificationResult {
    const success = result.success && !result.error;
    return {
      verified: success,
      explanation: success
        ? 'Command executed successfully'
        : `Command failed: ${result.error || 'Unknown error'}`
    };
  }

  private verifyNoErrors(result: ToolResult, criterion: VerificationCriterion): VerificationResult {
    const hasErrors = result.error ||
                     (typeof result.output === 'string' && result.output.includes('ERROR')) ||
                     (typeof result.output === 'string' && result.output.includes('Error'));

    return {
      verified: !hasErrors,
      explanation: hasErrors
        ? `Errors detected: ${result.error || 'Error found in output'}`
        : 'No errors detected in command output'
    };
  }

  private verifyOutputContains(result: ToolResult, criterion: VerificationCriterion): VerificationResult {
    if (!result.output || typeof result.output !== 'string') {
      return {
        verified: false,
        explanation: 'No output to check for content'
      };
    }

    if (!criterion.value) {
      return {
        verified: false,
        explanation: 'No expected value specified for output_contains criterion'
      };
    }

    const contains = result.output.includes(criterion.value);
    return {
      verified: contains,
      explanation: contains
        ? `Output contains expected text: "${criterion.value}"`
        : `Output does not contain expected text: "${criterion.value}"`
    };
  }

  private verifyOutputMatches(result: ToolResult, criterion: VerificationCriterion): VerificationResult {
    if (!result.output || typeof result.output !== 'string') {
      return {
        verified: false,
        explanation: 'No output to check for pattern'
      };
    }

    if (!criterion.value) {
      return {
        verified: false,
        explanation: 'No pattern specified for output_matches criterion'
      };
    }

    try {
      const regex = new RegExp(criterion.value);
      const matches = regex.test(result.output);
      return {
        verified: matches,
        explanation: matches
          ? `Output matches pattern: ${criterion.value}`
          : `Output does not match pattern: ${criterion.value}`
      };
    } catch (error: any) {
      return {
        verified: false,
        explanation: `Invalid regex pattern: ${error.message}`
      };
    }
  }

  private async verifyFileExists(result: ToolResult, criterion: VerificationCriterion): Promise<VerificationResult> {
    if (!criterion.target) {
      return {
        verified: false,
        explanation: 'No file path specified for file_exists criterion'
      };
    }

    try {
      const exists = fs.existsSync(criterion.target);
      return {
        verified: exists,
        explanation: exists
          ? `File exists: ${criterion.target}`
          : `File does not exist: ${criterion.target}`
      };
    } catch (error: any) {
      return {
        verified: false,
        explanation: `Error checking file existence: ${error.message}`
      };
    }
  }

  private async verifyFileContains(result: ToolResult, criterion: VerificationCriterion): Promise<VerificationResult> {
    if (!criterion.target) {
      return {
        verified: false,
        explanation: 'No file path specified for file_contains criterion'
      };
    }

    if (!criterion.value) {
      return {
        verified: false,
        explanation: 'No expected content specified for file_contains criterion'
      };
    }

    try {
      if (!fs.existsSync(criterion.target)) {
        return {
          verified: false,
          explanation: `File does not exist: ${criterion.target}`
        };
      }

      const content = fs.readFileSync(criterion.target, 'utf-8');
      const contains = content.includes(criterion.value);

      return {
        verified: contains,
        explanation: contains
          ? `File contains expected content: "${criterion.value}"`
          : `File does not contain expected content: "${criterion.value}"`
      };
    } catch (error: any) {
      return {
        verified: false,
        explanation: `Error reading file: ${error.message}`
      };
    }
  }

  /**
   * Parse verification criteria from natural language descriptions
   */
  parseVerificationCriteria(criteria: string[]): VerificationCriterion[] {
    const parsedCriteria: VerificationCriterion[] = [];

    for (const criterion of criteria) {
      const parsed = this.parseSingleCriterion(criterion);
      if (parsed) {
        parsedCriteria.push(parsed);
      }
    }

    return parsedCriteria;
  }

  private parseSingleCriterion(criterion: string): VerificationCriterion | null {
    const lowerCriterion = criterion.toLowerCase().trim();

    // File existence checks
    if (lowerCriterion.includes('file exists') || lowerCriterion.includes('should exist')) {
      const fileMatch = criterion.match(/(?:file\s+)?["']?([^"'\s]+)["']?\s+(?:should\s+)?exists?/i);
      if (fileMatch) {
        return {
          type: 'file_exists',
          target: fileMatch[1],
          description: criterion
        };
      }
    }

    // File content checks
    if (lowerCriterion.includes('contains') || lowerCriterion.includes('should include')) {
      const contentMatch = criterion.match(/["']?([^"']+)["']?\s+(?:should\s+)?(?:contains?|includes?)\s+["']?([^"']+)["']?/i);
      if (contentMatch) {
        return {
          type: 'file_contains',
          target: contentMatch[1],
          value: contentMatch[2],
          description: criterion
        };
      }
    }

    // Output content checks
    if (lowerCriterion.includes('output') && lowerCriterion.includes('contains')) {
      const outputMatch = criterion.match(/output.*contains?\s+["']?([^"']+)["']?/i);
      if (outputMatch) {
        return {
          type: 'output_contains',
          value: outputMatch[1],
          description: criterion
        };
      }
    }

    // Success checks
    if (lowerCriterion.includes('succeeds') || lowerCriterion.includes('successful')) {
      return {
        type: 'command_success',
        description: criterion
      };
    }

    // Error checks
    if (lowerCriterion.includes('no errors') || lowerCriterion.includes('without errors')) {
      return {
        type: 'no_errors',
        description: criterion
      };
    }

    // Default fallback
    return {
      type: 'output_contains',
      value: criterion,
      description: criterion
    };
  }
}