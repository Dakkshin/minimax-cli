import { exec } from "child_process";
import { promisify } from "util";
import { EventEmitter } from "events";

const execAsync = promisify(exec);

export interface ConfirmationOptions {
  operation: string;
  filename: string;
  showVSCodeOpen?: boolean;
  content?: string; // Content to show in confirmation dialog
  riskLevel?: 'low' | 'medium' | 'high' | 'critical'; // Risk assessment
  permissionCategory?: string; // Category like 'file', 'network', 'system', etc.
  contextInfo?: Record<string, any>; // Additional context for decision making
}

export interface ConfirmationResult {
  confirmed: boolean;
  dontAskAgain?: boolean;
  feedback?: string;
}

export class ConfirmationService extends EventEmitter {
  private static instance: ConfirmationService;
  private skipConfirmationThisSession = false;
  private pendingConfirmation: Promise<ConfirmationResult> | null = null;
  private resolveConfirmation: ((result: ConfirmationResult) => void) | null =
    null;

  // Granular session permissions by category and risk level
  private sessionPermissions = {
    // By category
    file: {
      read: false,
      write: false,
      delete: false,
    },
    network: {
      http: false,
      websocket: false,
      external: false,
    },
    system: {
      process: false,
      filesystem: false,
      environment: false,
    },
    git: {
      read: false,
      write: false,
      destructive: false,
    },
    // By risk level (overrides category permissions)
    riskLevels: {
      low: false,      // Safe operations like reading files
      medium: false,   // Operations that modify state but are recoverable
      high: false,     // Operations that could cause data loss
      critical: false, // Operations that could break the system
    },
    // Global override
    allOperations: false,
    // Plan mode: show plans but require confirmation for execution
    planMode: false,
  };

  static getInstance(): ConfirmationService {
    if (!ConfirmationService.instance) {
      ConfirmationService.instance = new ConfirmationService();
    }
    return ConfirmationService.instance;
  }

  constructor() {
    super();
  }

  async requestConfirmation(
    options: ConfirmationOptions,
    operationType: "file" | "bash" = "file"
  ): Promise<ConfirmationResult> {
    const riskLevel = options.riskLevel || 'medium';
    const category = options.permissionCategory || this.inferCategory(operationType, options.operation);

    // Check if operation is pre-approved based on session permissions
    if (this.isPreApproved(category, riskLevel)) {
      return { confirmed: true };
    }

    // For critical operations, always require confirmation regardless of session flags
    if (riskLevel === 'critical') {
      // Continue to confirmation dialog
    }

    // If VS Code should be opened, try to open it
    if (options.showVSCodeOpen) {
      try {
        await this.openInVSCode(options.filename);
      } catch (error) {
        // If VS Code opening fails, continue without it
        options.showVSCodeOpen = false;
      }
    }

    // Create a promise that will be resolved by the UI component
    this.pendingConfirmation = new Promise<ConfirmationResult>((resolve) => {
      this.resolveConfirmation = resolve;
    });

    // Emit custom event that the UI can listen to (using setImmediate to ensure the UI updates)
    setImmediate(() => {
      this.emit("confirmation-requested", options);
    });

    const result = await this.pendingConfirmation;

    if (result.dontAskAgain) {
      // Set granular permissions based on operation details
      this.setGranularPermission(category, riskLevel);
    }

    return result;
  }

  confirmOperation(confirmed: boolean, dontAskAgain?: boolean): void {
    if (this.resolveConfirmation) {
      this.resolveConfirmation({ confirmed, dontAskAgain });
      this.resolveConfirmation = null;
      this.pendingConfirmation = null;
    }
  }

  private inferCategory(operationType: string, operation: string): string {
    // Infer permission category based on operation type and content
    if (operationType === 'bash') {
      return 'system';
    }

    // Analyze operation content to determine category
    const lowerOp = operation.toLowerCase();
    if (lowerOp.includes('read') || lowerOp.includes('view') || lowerOp.includes('list')) {
      return 'file';
    }
    if (lowerOp.includes('write') || lowerOp.includes('edit') || lowerOp.includes('create') || lowerOp.includes('delete')) {
      return 'file';
    }
    if (lowerOp.includes('network') || lowerOp.includes('http') || lowerOp.includes('api')) {
      return 'network';
    }
    if (lowerOp.includes('git') || lowerOp.includes('commit') || lowerOp.includes('push') || lowerOp.includes('pull')) {
      return 'git';
    }

    return 'file'; // Default to file operations
  }

  private isPreApproved(category: string, riskLevel: string): boolean {
    // Check if operation is pre-approved based on session permissions

    // Global override takes precedence
    if (this.sessionPermissions.allOperations) {
      return true;
    }

    // Check risk level override
    if (this.sessionPermissions.riskLevels[riskLevel as keyof typeof this.sessionPermissions.riskLevels]) {
      return true;
    }

    // Check category-specific permissions
    const categoryPerms = this.sessionPermissions[category as keyof typeof this.sessionPermissions];
    if (categoryPerms && typeof categoryPerms === 'object') {
      // For file operations, check if any file permission is granted
      if (category === 'file') {
        return Object.values(categoryPerms).some(perm => perm === true);
      }
      // For other categories, check if the category has any permissions
      return Object.values(categoryPerms).some(perm => perm === true);
    }

    return false;
  }

  private setGranularPermission(category: string, riskLevel: string): void {
    // Set granular permissions based on category and risk level

    // Set risk level permission
    if (riskLevel in this.sessionPermissions.riskLevels) {
      this.sessionPermissions.riskLevels[riskLevel as keyof typeof this.sessionPermissions.riskLevels] = true;
    }

    // Set category-specific permissions
    if (category === 'file') {
      const filePerms = this.sessionPermissions.file;
      if (riskLevel === 'low') {
        filePerms.read = true;
      } else if (riskLevel === 'medium') {
        filePerms.read = true;
        filePerms.write = true;
      } else if (riskLevel === 'high') {
        filePerms.read = true;
        filePerms.write = true;
        filePerms.delete = true;
      }
    } else if (category === 'system') {
      const systemPerms = this.sessionPermissions.system;
      systemPerms.process = true;
    } else if (category === 'network') {
      const networkPerms = this.sessionPermissions.network;
      networkPerms.http = true;
    } else if (category === 'git') {
      const gitPerms = this.sessionPermissions.git;
      if (riskLevel === 'high') {
        gitPerms.destructive = true;
      } else {
        gitPerms.read = true;
        gitPerms.write = true;
      }
    }
  }

  rejectOperation(feedback?: string): void {
    if (this.resolveConfirmation) {
      this.resolveConfirmation({ confirmed: false, feedback });
      this.resolveConfirmation = null;
      this.pendingConfirmation = null;
    }
  }

  private async openInVSCode(filename: string): Promise<void> {
    // Try different VS Code commands
    const commands = ["code", "code-insiders", "codium"];

    for (const cmd of commands) {
      try {
        await execAsync(`which ${cmd}`);
        await execAsync(`${cmd} "${filename}"`);
        return;
      } catch (error) {
        // Continue to next command
        continue;
      }
    }

    throw new Error("VS Code not found");
  }

  isPending(): boolean {
    return this.pendingConfirmation !== null;
  }

  resetSession(): void {
    // Reset all session permissions to false
    this.sessionPermissions = {
      file: {
        read: false,
        write: false,
        delete: false,
      },
      network: {
        http: false,
        websocket: false,
        external: false,
      },
      system: {
        process: false,
        filesystem: false,
        environment: false,
      },
      git: {
        read: false,
        write: false,
        destructive: false,
      },
      riskLevels: {
        low: false,
        medium: false,
        high: false,
        critical: false,
      },
      allOperations: false,
      planMode: false,
    };
  }

  getSessionFlags() {
    return {
      fileOperations: this.sessionPermissions.file.read || this.sessionPermissions.file.write,
      bashCommands: this.sessionPermissions.system.process,
      allOperations: this.sessionPermissions.allOperations,
      planMode: this.sessionPermissions.planMode,
    };
  }

  setSessionFlag(
    flagType: "fileOperations" | "bashCommands" | "allOperations" | "planMode",
    value: boolean
  ) {
    if (flagType === "allOperations") {
      this.sessionPermissions.allOperations = value;
    } else if (flagType === "fileOperations") {
      this.sessionPermissions.file.read = value;
      this.sessionPermissions.file.write = value;
    } else if (flagType === "bashCommands") {
      this.sessionPermissions.system.process = value;
    } else if (flagType === "planMode") {
      this.sessionPermissions.planMode = value;
    }
  }
}
