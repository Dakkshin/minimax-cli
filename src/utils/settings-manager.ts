import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Current settings version - increment this when adding new models or changing settings structure
 * This triggers automatic migration for existing users
 */
const SETTINGS_VERSION = 2;

/**
 * User-level settings stored in ~/.minimax/user-settings.json
 * These are global settings that apply across all projects
 */
export interface UserSettings {
  apiKey?: string; // MiniMax API key
  baseURL?: string; // API base URL
  defaultModel?: string; // User's preferred default model
  models?: string[]; // Available models list
  settingsVersion?: number; // Version for migration tracking
}

/**
 * Project-level settings stored in .minimax/settings.json
 * These are project-specific settings
 */
export interface ProjectSettings {
  model?: string; // Current model for this project
  mcpServers?: Record<string, any>; // MCP server configurations
}

/**
 * Global MCP settings stored in ~/.minimax/mcp-config.json
 * These are global MCP server configurations available across all projects
 */
export interface GlobalMCPSettings {
  servers: Record<string, any>; // Global MCP server configurations
  defaultServers: string[]; // Server names to auto-load globally
  lastHealthCheck?: Date;
  healthStatus?: Record<string, 'healthy' | 'unhealthy' | 'unknown'>;
}

/**
 * Default values for user settings
 */
const DEFAULT_USER_SETTINGS: Partial<UserSettings> = {
  baseURL: "https://api.minimax.chat/v1",
  defaultModel: "minimax-01",
  models: [
    // MiniMax models (optimized for different use cases)
    "minimax-01",
    "minimax-pro",
    "minimax-pro-128k",
    "minimax-pro-voice",
    "minimax-vision",
    "minimax-speech-01",
    "minimax-tts",
  ],
};

/**
 * Default values for project settings
 */
const DEFAULT_PROJECT_SETTINGS: Partial<ProjectSettings> = {
  model: "minimax-01",
};

/**
 * Unified settings manager that handles both user-level and project-level settings
 */
export class SettingsManager {
  private static instance: SettingsManager;

  private userSettingsPath: string;
  private projectSettingsPath: string;
  private globalMCPSettingsPath: string;

  private constructor() {
    // User settings path: ~/.minimax/user-settings.json
    this.userSettingsPath = path.join(
      os.homedir(),
      ".minimax",
      "user-settings.json"
    );

    // Project settings path: .minimax/settings.json (in current working directory)
    this.projectSettingsPath = path.join(
      process.cwd(),
      ".minimax",
      "settings.json"
    );

    // Global MCP settings path: ~/.minimax/mcp-config.json
    this.globalMCPSettingsPath = path.join(
      os.homedir(),
      ".minimax",
      "mcp-config.json"
    );
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  /**
   * Ensure directory exists for a given file path
   */
  private ensureDirectoryExists(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Load user settings from ~/.minimax/user-settings.json
   */
  public loadUserSettings(): UserSettings {
    try {
      if (!fs.existsSync(this.userSettingsPath)) {
        // Create default user settings if file doesn't exist
        const newSettings = { ...DEFAULT_USER_SETTINGS, settingsVersion: SETTINGS_VERSION };
        this.saveUserSettings(newSettings);
        return newSettings;
      }

      const content = fs.readFileSync(this.userSettingsPath, "utf-8");
      const settings = JSON.parse(content);

      // Check if migration is needed
      const currentVersion = settings.settingsVersion || 1;
      if (currentVersion < SETTINGS_VERSION) {
        const migratedSettings = this.migrateSettings(settings, currentVersion);
        this.saveUserSettings(migratedSettings);
        return migratedSettings;
      }

      // Merge with defaults to ensure all required fields exist
      return { ...DEFAULT_USER_SETTINGS, ...settings };
    } catch (error) {
      console.warn(
        "Failed to load user settings:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return { ...DEFAULT_USER_SETTINGS };
    }
  }

  /**
   * Migrate settings from an older version to the current version
   */
  private migrateSettings(settings: UserSettings, fromVersion: number): UserSettings {
    let migrated = { ...settings };

    // Migration from version 1 to 2: Add new MiniMax 4.1 and MiniMax 4 Fast models
    if (fromVersion < 2) {
      const defaultModels = DEFAULT_USER_SETTINGS.models || [];
      const existingModels = new Set(migrated.models || []);
      
      // Add any new models that don't exist in user's current list
      const newModels = defaultModels.filter(model => !existingModels.has(model));
      
      // Prepend new models to the list (newest models first)
      migrated.models = [...newModels, ...(migrated.models || [])];
    }

    // Add future migrations here:
    // if (fromVersion < 3) { ... }

    migrated.settingsVersion = SETTINGS_VERSION;
    return migrated;
  }

  /**
   * Save user settings to ~/.minimax/user-settings.json
   */
  public saveUserSettings(settings: Partial<UserSettings>): void {
    try {
      this.ensureDirectoryExists(this.userSettingsPath);

      // Read existing settings directly to avoid recursion
      let existingSettings: UserSettings = { ...DEFAULT_USER_SETTINGS };
      if (fs.existsSync(this.userSettingsPath)) {
        try {
          const content = fs.readFileSync(this.userSettingsPath, "utf-8");
          const parsed = JSON.parse(content);
          existingSettings = { ...DEFAULT_USER_SETTINGS, ...parsed };
        } catch (error) {
          // If file is corrupted, use defaults
          console.warn("Corrupted user settings file, using defaults");
        }
      }

      const mergedSettings = { ...existingSettings, ...settings };

      fs.writeFileSync(
        this.userSettingsPath,
        JSON.stringify(mergedSettings, null, 2),
        { mode: 0o600 } // Secure permissions for API key
      );
    } catch (error) {
      console.error(
        "Failed to save user settings:",
        error instanceof Error ? error.message : "Unknown error"
      );
      throw error;
    }
  }

  /**
   * Update a specific user setting
   */
  public updateUserSetting<K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ): void {
    const settings = { [key]: value } as Partial<UserSettings>;
    this.saveUserSettings(settings);
  }

  /**
   * Get a specific user setting
   */
  public getUserSetting<K extends keyof UserSettings>(key: K): UserSettings[K] {
    const settings = this.loadUserSettings();
    return settings[key];
  }

  /**
   * Load project settings from .minimax/settings.json
   */
  public loadProjectSettings(): ProjectSettings {
    try {
      if (!fs.existsSync(this.projectSettingsPath)) {
        // Create default project settings if file doesn't exist
        this.saveProjectSettings(DEFAULT_PROJECT_SETTINGS);
        return { ...DEFAULT_PROJECT_SETTINGS };
      }

      const content = fs.readFileSync(this.projectSettingsPath, "utf-8");
      const settings = JSON.parse(content);

      // Merge with defaults
      return { ...DEFAULT_PROJECT_SETTINGS, ...settings };
    } catch (error) {
      console.warn(
        "Failed to load project settings:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return { ...DEFAULT_PROJECT_SETTINGS };
    }
  }

  /**
   * Save project settings to .minimax/settings.json
   */
  public saveProjectSettings(settings: Partial<ProjectSettings>): void {
    try {
      this.ensureDirectoryExists(this.projectSettingsPath);

      // Read existing settings directly to avoid recursion
      let existingSettings: ProjectSettings = { ...DEFAULT_PROJECT_SETTINGS };
      if (fs.existsSync(this.projectSettingsPath)) {
        try {
          const content = fs.readFileSync(this.projectSettingsPath, "utf-8");
          const parsed = JSON.parse(content);
          existingSettings = { ...DEFAULT_PROJECT_SETTINGS, ...parsed };
        } catch (error) {
          // If file is corrupted, use defaults
          console.warn("Corrupted project settings file, using defaults");
        }
      }

      const mergedSettings = { ...existingSettings, ...settings };

      fs.writeFileSync(
        this.projectSettingsPath,
        JSON.stringify(mergedSettings, null, 2)
      );
    } catch (error) {
      console.error(
        "Failed to save project settings:",
        error instanceof Error ? error.message : "Unknown error"
      );
      throw error;
    }
  }

  /**
   * Update a specific project setting
   */
  public updateProjectSetting<K extends keyof ProjectSettings>(
    key: K,
    value: ProjectSettings[K]
  ): void {
    const settings = { [key]: value } as Partial<ProjectSettings>;
    this.saveProjectSettings(settings);
  }

  /**
   * Get a specific project setting
   */
  public getProjectSetting<K extends keyof ProjectSettings>(
    key: K
  ): ProjectSettings[K] {
    const settings = this.loadProjectSettings();
    return settings[key];
  }

  /**
   * Get the current model with proper fallback logic:
   * 1. Project-specific model setting
   * 2. User's default model
   * 3. System default
   */
  public getCurrentModel(): string {
    const projectModel = this.getProjectSetting("model");
    if (projectModel) {
      return projectModel;
    }

    const userDefaultModel = this.getUserSetting("defaultModel");
    if (userDefaultModel) {
      return userDefaultModel;
    }

    return DEFAULT_PROJECT_SETTINGS.model || "minimax-01";
  }

  /**
   * Set the current model for the project
   */
  public setCurrentModel(model: string): void {
    this.updateProjectSetting("model", model);
  }

  /**
   * Get available models list from user settings
   */
  public getAvailableModels(): string[] {
    const models = this.getUserSetting("models");
    return models || DEFAULT_USER_SETTINGS.models || [];
  }

  /**
   * Get API key from user settings or environment
   */
  public getApiKey(): string | undefined {
    // First check environment variable
    const envApiKey = process.env.MINIMAX_API_KEY;
    if (envApiKey) {
      return envApiKey;
    }

    // Then check user settings
    return this.getUserSetting("apiKey");
  }

  /**
   * Get base URL from user settings or environment
   */
  public getBaseURL(): string {
    // First check environment variable
    const envBaseURL = process.env.MINIMAX_BASE_URL;
    if (envBaseURL) {
      return envBaseURL;
    }

    // Then check user settings
    const userBaseURL = this.getUserSetting("baseURL");
    return (
      userBaseURL || DEFAULT_USER_SETTINGS.baseURL || "https://api.x.ai/v1"
    );
  }

  /**
   * Load global MCP settings from ~/.minimax/mcp-config.json
   */
  public loadGlobalMCPSettings(): GlobalMCPSettings {
    try {
      if (!fs.existsSync(this.globalMCPSettingsPath)) {
        // Create default global MCP settings if file doesn't exist
        const defaultSettings: GlobalMCPSettings = {
          servers: {},
          defaultServers: [],
          lastHealthCheck: new Date(),
          healthStatus: {}
        };
        this.saveGlobalMCPSettings(defaultSettings);
        return defaultSettings;
      }

      const content = fs.readFileSync(this.globalMCPSettingsPath, "utf-8");
      const settings = JSON.parse(content);

      // Merge with defaults
      return {
        servers: settings.servers || {},
        defaultServers: settings.defaultServers || [],
        lastHealthCheck: settings.lastHealthCheck ? new Date(settings.lastHealthCheck) : new Date(),
        healthStatus: settings.healthStatus || {}
      };
    } catch (error) {
      console.warn(
        "Failed to load global MCP settings:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return {
        servers: {},
        defaultServers: [],
        lastHealthCheck: new Date(),
        healthStatus: {}
      };
    }
  }

  /**
   * Save global MCP settings to ~/.minimax/mcp-config.json
   */
  public saveGlobalMCPSettings(settings: Partial<GlobalMCPSettings>): void {
    try {
      this.ensureDirectoryExists(this.globalMCPSettingsPath);

      // Read existing settings
      let existingSettings: GlobalMCPSettings = {
        servers: {},
        defaultServers: [],
        lastHealthCheck: new Date(),
        healthStatus: {}
      };

      if (fs.existsSync(this.globalMCPSettingsPath)) {
        try {
          const content = fs.readFileSync(this.globalMCPSettingsPath, "utf-8");
          const parsed = JSON.parse(content);
          existingSettings = { ...existingSettings, ...parsed };
        } catch (error) {
          // If file is corrupted, use defaults
          console.warn("Corrupted global MCP settings file, using defaults");
        }
      }

      const mergedSettings = { ...existingSettings, ...settings };
      fs.writeFileSync(
        this.globalMCPSettingsPath,
        JSON.stringify(mergedSettings, null, 2),
        { mode: 0o600 }
      );
    } catch (error) {
      console.error(
        "Failed to save global MCP settings:",
        error instanceof Error ? error.message : "Unknown error"
      );
      throw error;
    }
  }

  /**
   * Add a global MCP server
   */
  public addGlobalMCPServer(name: string, config: any): void {
    const settings = this.loadGlobalMCPSettings();
    settings.servers[name] = config;
    this.saveGlobalMCPSettings(settings);
  }

  /**
   * Remove a global MCP server
   */
  public removeGlobalMCPServer(name: string): void {
    const settings = this.loadGlobalMCPSettings();
    delete settings.servers[name];
    // Also remove from default servers if present
    settings.defaultServers = settings.defaultServers.filter(s => s !== name);
    this.saveGlobalMCPSettings(settings);
  }

  /**
   * Get all available MCP servers (global + project)
   */
  public getAllMCPServers(): Record<string, any> {
    const globalSettings = this.loadGlobalMCPSettings();
    const projectSettings = this.loadProjectSettings();

    // Project settings override global settings
    return { ...globalSettings.servers, ...projectSettings.mcpServers };
  }

  /**
   * Update health status for MCP servers
   */
  public updateMCPHealthStatus(healthStatus: Record<string, 'healthy' | 'unhealthy' | 'unknown'>): void {
    const settings = this.loadGlobalMCPSettings();
    settings.healthStatus = { ...settings.healthStatus, ...healthStatus };
    settings.lastHealthCheck = new Date();
    this.saveGlobalMCPSettings(settings);
  }

  /**
   * Get MCP health status
   */
  public getMCPHealthStatus(): { status: Record<string, 'healthy' | 'unhealthy' | 'unknown'>; lastCheck: Date } {
    const settings = this.loadGlobalMCPSettings();
    return {
      status: settings.healthStatus || {},
      lastCheck: settings.lastHealthCheck || new Date()
    };
  }
}

/**
 * Convenience function to get the singleton instance
 */
export function getSettingsManager(): SettingsManager {
  return SettingsManager.getInstance();
}
