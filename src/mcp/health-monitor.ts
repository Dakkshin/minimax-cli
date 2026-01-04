import { MCPServerConfig, MCPManager } from './client.js';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { EventEmitter } from 'events';

export interface ServerHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastChecked: Date;
  responseTime?: number;
  error?: string;
  toolsCount?: number;
  lastError?: string;
}

export interface HealthCheckResult {
  server: MCPServerConfig;
  healthy: boolean;
  responseTime: number;
  toolsCount?: number;
  error?: string;
}

export class MCPHealthMonitor extends EventEmitter {
  private healthStatus: Map<string, ServerHealth> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  constructor(private checkIntervalMs: number = 30000) { // 30 seconds default
    super();
  }

  /**
   * Start monitoring MCP servers
   */
  startMonitoring(servers: MCPServerConfig[]): void {
    if (this.isMonitoring) {
      this.stopMonitoring();
    }

    this.isMonitoring = true;

    // Initial health check
    this.checkAllServers(servers);

    // Set up periodic checks
    this.checkInterval = setInterval(() => {
      this.checkAllServers(servers);
    }, this.checkIntervalMs);

    this.emit('monitoringStarted');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isMonitoring = false;
    this.emit('monitoringStopped');
  }

  /**
   * Check health of a single server
   */
  async checkServerHealth(server: MCPServerConfig): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const client = new Client(
        {
          name: "minimax-cli-health-check",
          version: "1.0.0"
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );
      // Note: Client connection setup would require transport layer
      // For now, skip the actual connection and return unknown status

      // TODO: Implement proper MCP client connection for health checking
      // For now, return unknown status to avoid build errors
      return {
        server,
        healthy: null, // unknown
        responseTime: Date.now() - startTime,
        error: 'Health check not implemented'
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      return {
        server,
        healthy: false,
        responseTime,
        error: error.message
      };
    }
  }

  /**
   * Check health of all servers
   */
  async checkAllServers(servers: MCPServerConfig[]): Promise<void> {
    const results = await Promise.allSettled(
      servers.map(server => this.checkServerHealth(server))
    );

    const healthUpdates: ServerHealth[] = [];

    results.forEach((result, index) => {
      const server = servers[index];

      if (result.status === 'fulfilled') {
        const healthResult = result.value;
        const health: ServerHealth = {
          name: server.name,
          status: healthResult.healthy ? 'healthy' : 'unhealthy',
          lastChecked: new Date(),
          responseTime: healthResult.responseTime,
          toolsCount: healthResult.toolsCount,
          error: healthResult.error
        };

        this.healthStatus.set(server.name, health);
        healthUpdates.push(health);

        this.emit('serverHealthUpdate', health);
      } else {
        // Promise rejected
        const health: ServerHealth = {
          name: server.name,
          status: 'unknown',
          lastChecked: new Date(),
          lastError: result.reason?.message || 'Unknown error'
        };

        this.healthStatus.set(server.name, health);
        healthUpdates.push(health);

        this.emit('serverHealthUpdate', health);
      }
    });

    this.emit('healthCheckComplete', healthUpdates);
  }

  /**
   * Get health status of a specific server
   */
  getServerHealth(serverName: string): ServerHealth | undefined {
    return this.healthStatus.get(serverName);
  }

  /**
   * Get health status of all servers
   */
  getAllServerHealth(): ServerHealth[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Get only healthy servers
   */
  getHealthyServers(): ServerHealth[] {
    return this.getAllServerHealth().filter(health => health.status === 'healthy');
  }

  /**
   * Get only unhealthy servers
   */
  getUnhealthyServers(): ServerHealth[] {
    return this.getAllServerHealth().filter(health => health.status === 'unhealthy');
  }

  /**
   * Auto-discover MCP servers in common locations
   */
  async autoDiscoverServers(): Promise<MCPServerConfig[]> {
    const discoveredServers: MCPServerConfig[] = [];

    // Common locations to check for MCP servers
    const searchPaths = [
      '/usr/local/bin',
      '/usr/bin',
      '/opt/homebrew/bin', // macOS
      '/home/linuxbrew/.linuxbrew/bin', // Linux
      process.env.HOME ? path.join(process.env.HOME, '.local', 'bin') : null,
      process.env.HOME ? path.join(process.env.HOME, 'bin') : null,
    ].filter(Boolean) as string[];

    // Common MCP server names to look for
    const commonServerNames = [
      'mcp-server-git',
      'mcp-server-github',
      'mcp-server-linear',
      'mcp-server-slack',
      'mcp-server-filesystem',
      'mcp-server-sql',
      'mcp-server-postgres',
      'mcp-server-mysql'
    ];

    for (const searchPath of searchPaths) {
      if (!fs.existsSync(searchPath)) continue;

      try {
        const files = fs.readdirSync(searchPath);

        for (const file of files) {
          if (commonServerNames.some(name => file.includes(name))) {
            const fullPath = path.join(searchPath, file);

            // Check if it's executable
            try {
              const stats = fs.statSync(fullPath);
              if (stats.isFile() && (stats.mode & parseInt('111', 8))) { // executable
                const serverName = file.replace('mcp-server-', '').replace(/-/g, '_');
                const serverConfig: MCPServerConfig = {
                  name: `auto_${serverName}`,
                  transport: {
                    type: 'stdio',
                    command: fullPath,
                    args: []
                  }
                };

                discoveredServers.push(serverConfig);
              }
            } catch (error) {
              // Skip files we can't stat
              continue;
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
        continue;
      }
    }

    // Check for common HTTP-based MCP servers
    const commonHttpServers = [
      { name: 'linear', url: 'https://mcp.linear.app/sse', type: 'sse' as const },
      // Add more common HTTP servers here
    ];

    for (const server of commonHttpServers) {
      try {
        // Quick connectivity check with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(server.url, {
          method: 'HEAD',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          const serverConfig: MCPServerConfig = {
            name: `auto_${server.name}`,
            transport: {
              type: server.type,
              url: server.url
            }
          };
          discoveredServers.push(serverConfig);
        }
      } catch (error) {
        // Server not available, skip
        continue;
      }
    }

    return discoveredServers;
  }

  /**
   * Suggest MCP servers based on project characteristics
   */
  suggestServersForProject(projectRoot: string): MCPServerConfig[] {
    const suggestions: MCPServerConfig[] = [];

    try {
      // Check for package.json to detect Node.js projects
      if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
        suggestions.push({
          name: 'suggested_npm',
          transport: {
            type: 'stdio',
            command: 'npx',
            args: ['mcp-server-npm']
          }
        });
      }

      // Check for Python projects
      if (fs.existsSync(path.join(projectRoot, 'requirements.txt')) ||
          fs.existsSync(path.join(projectRoot, 'pyproject.toml')) ||
          fs.existsSync(path.join(projectRoot, 'Pipfile'))) {
        suggestions.push({
          name: 'suggested_python',
          transport: {
            type: 'stdio',
            command: 'python',
            args: ['-m', 'mcp_server_python']
          }
        });
      }

      // Check for Git repository
      if (fs.existsSync(path.join(projectRoot, '.git'))) {
        suggestions.push({
          name: 'suggested_git',
          transport: {
            type: 'stdio',
            command: 'git-mcp-server'
          }
        });
      }

      // Check for database files
      const dbFiles = ['.db', '.sqlite', '.sqlite3'];
      const hasDbFile = fs.readdirSync(projectRoot).some(file =>
        dbFiles.some(ext => file.endsWith(ext))
      );

      if (hasDbFile) {
        suggestions.push({
          name: 'suggested_sqlite',
          transport: {
            type: 'stdio',
            command: 'sqlite-mcp-server'
          }
        });
      }

    } catch (error) {
      // If we can't analyze the project, return empty suggestions
      console.warn('Failed to analyze project for MCP server suggestions:', error);
    }

    return suggestions;
  }

  /**
   * Get monitoring status
   */
  isCurrentlyMonitoring(): boolean {
    return this.isMonitoring;
  }

  /**
   * Get health summary
   */
  getHealthSummary(): {
    total: number;
    healthy: number;
    unhealthy: number;
    unknown: number;
    averageResponseTime: number;
  } {
    const allHealth = this.getAllServerHealth();

    const healthy = allHealth.filter(h => h.status === 'healthy').length;
    const unhealthy = allHealth.filter(h => h.status === 'unhealthy').length;
    const unknown = allHealth.filter(h => h.status === 'unknown').length;

    const responseTimes = allHealth
      .filter(h => h.responseTime !== undefined)
      .map(h => h.responseTime!);

    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    return {
      total: allHealth.length,
      healthy,
      unhealthy,
      unknown,
      averageResponseTime: Math.round(averageResponseTime)
    };
  }
}

// Helper function for path operations (import fs at the top if needed)
import * as fs from 'fs';
import * as path from 'path';