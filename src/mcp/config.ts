import { getSettingsManager } from "../utils/settings-manager.js";
import { MCPServerConfig } from "./client.js";

export interface MCPConfig {
  servers: MCPServerConfig[];
}

/**
 * Load MCP configuration from both global and project settings
 * Project settings override global settings for same server names
 */
export function loadMCPConfig(): MCPConfig {
  const manager = getSettingsManager();
  const allServers = manager.getAllMCPServers();
  const servers = Object.values(allServers);
  return { servers };
}

/**
 * Load only global MCP configuration
 */
export function loadGlobalMCPConfig(): MCPConfig {
  const manager = getSettingsManager();
  const globalSettings = manager.loadGlobalMCPSettings();
  const servers = Object.values(globalSettings.servers);
  return { servers };
}

/**
 * Load only project MCP configuration
 */
export function loadProjectMCPConfig(): MCPConfig {
  const manager = getSettingsManager();
  const projectSettings = manager.loadProjectSettings();
  const servers = projectSettings.mcpServers ? Object.values(projectSettings.mcpServers) : [];
  return { servers };
}

export function saveMCPConfig(config: MCPConfig, scope: 'global' | 'project' = 'project'): void {
  const manager = getSettingsManager();

  // Convert servers array to object keyed by name
  const mcpServers: Record<string, MCPServerConfig> = {};
  for (const server of config.servers) {
    mcpServers[server.name] = server;
  }

  if (scope === 'global') {
    // For global scope, update the global MCP settings
    const globalSettings = manager.loadGlobalMCPSettings();
    globalSettings.servers = mcpServers;
    manager.saveGlobalMCPSettings(globalSettings);
  } else {
    // For project scope, update project settings
    manager.updateProjectSetting('mcpServers', mcpServers);
  }
}

export function addMCPServer(config: MCPServerConfig, scope: 'global' | 'project' = 'project'): void {
  if (scope === 'global') {
    const manager = getSettingsManager();
    manager.addGlobalMCPServer(config.name, config);
  } else {
    const manager = getSettingsManager();
    const projectSettings = manager.loadProjectSettings();
    const mcpServers = projectSettings.mcpServers || {};

    mcpServers[config.name] = config;
    manager.updateProjectSetting('mcpServers', mcpServers);
  }
}

export function removeMCPServer(serverName: string, scope: 'global' | 'project' | 'both' = 'project'): void {
  const manager = getSettingsManager();

  if (scope === 'global' || scope === 'both') {
    manager.removeGlobalMCPServer(serverName);
  }

  if (scope === 'project' || scope === 'both') {
    const projectSettings = manager.loadProjectSettings();
    const mcpServers = projectSettings.mcpServers;

    if (mcpServers) {
      delete mcpServers[serverName];
      manager.updateProjectSetting('mcpServers', mcpServers);
    }
  }
}

export function getMCPServer(serverName: string): MCPServerConfig | undefined {
  const manager = getSettingsManager();
  const allServers = manager.getAllMCPServers();
  return allServers[serverName];
}

/**
 * Get MCP server with scope information
 */
export function getMCPServerWithScope(serverName: string): { config: MCPServerConfig; scope: 'global' | 'project' } | undefined {
  const manager = getSettingsManager();

  // Check project settings first (higher priority)
  const projectSettings = manager.loadProjectSettings();
  if (projectSettings.mcpServers?.[serverName]) {
    return { config: projectSettings.mcpServers[serverName], scope: 'project' };
  }

  // Check global settings
  const globalSettings = manager.loadGlobalMCPSettings();
  if (globalSettings.servers[serverName]) {
    return { config: globalSettings.servers[serverName], scope: 'global' };
  }

  return undefined;
}

// Predefined server configurations
export const PREDEFINED_SERVERS: Record<string, MCPServerConfig> = {};
