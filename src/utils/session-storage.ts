import * as fs from 'fs';
import * as path from 'path';
import { ChatEntry } from '../agent/minimax-agent.js';
import { ToolResult } from '../types/index.js';

export interface CommandLogEntry {
  timestamp: Date;
  command: string;
  result: ToolResult;
  sessionId: string;
  workingDirectory: string;
}

export interface SessionInfo {
  sessionId: string;
  startTime: Date;
  workingDirectory: string;
  agentVersion: string;
  modelUsed: string;
  totalCommands: number;
  totalTokens: number;
}

export class SessionStorage {
  private sessionDir: string;
  private sessionId: string;
  private sessionInfo: SessionInfo;

  constructor(projectDir: string, modelUsed: string = 'unknown') {
    this.sessionDir = path.join(projectDir, '.agent_history');
    this.sessionId = this.generateSessionId();
    this.sessionInfo = {
      sessionId: this.sessionId,
      startTime: new Date(),
      workingDirectory: projectDir,
      agentVersion: this.getPackageVersion(),
      modelUsed,
      totalCommands: 0,
      totalTokens: 0
    };

    this.ensureSessionDir();
    this.saveSessionInfo();
  }

  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}_${random}`;
  }

  private getPackageVersion(): string {
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      return packageJson.version || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private ensureSessionDir(): void {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true, mode: 0o755 });
    }
  }

  private saveSessionInfo(): void {
    const infoPath = path.join(this.sessionDir, `${this.sessionId}_info.json`);
    fs.writeFileSync(infoPath, JSON.stringify(this.sessionInfo, null, 2));
  }

  updateTokenCount(tokens: number): void {
    this.sessionInfo.totalTokens += tokens;
    this.saveSessionInfo();
  }

  saveChatHistory(entries: ChatEntry[]): void {
    const chatPath = path.join(this.sessionDir, `${this.sessionId}_chat.json`);
    const historyData = {
      sessionId: this.sessionId,
      timestamp: new Date(),
      entries: entries
    };
    fs.writeFileSync(chatPath, JSON.stringify(historyData, null, 2));
  }

  loadChatHistory(): ChatEntry[] {
    const chatFiles = fs.readdirSync(this.sessionDir)
      .filter(f => f.endsWith('_chat.json'))
      .sort()
      .reverse(); // Most recent first

    if (chatFiles.length === 0) return [];

    try {
      const latestChatFile = path.join(this.sessionDir, chatFiles[0]);
      const data = JSON.parse(fs.readFileSync(latestChatFile, 'utf-8'));
      return data.entries || [];
    } catch (error) {
      console.warn('Failed to load chat history:', error);
      return [];
    }
  }

  logCommand(command: string, result: ToolResult, workingDirectory: string): void {
    const logEntry: CommandLogEntry = {
      timestamp: new Date(),
      command,
      result,
      sessionId: this.sessionId,
      workingDirectory
    };

    const logFile = path.join(this.sessionDir, 'command_log.jsonl');
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

    this.sessionInfo.totalCommands++;
    this.saveSessionInfo();
  }

  getRecentCommandLogs(limit: number = 50): CommandLogEntry[] {
    const logFile = path.join(this.sessionDir, 'command_log.jsonl');

    if (!fs.existsSync(logFile)) return [];

    try {
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      return lines
        .slice(-limit) // Get last N entries
        .map(line => JSON.parse(line))
        .reverse(); // Most recent first
    } catch (error) {
      console.warn('Failed to load command logs:', error);
      return [];
    }
  }

  getSessionStats(): SessionInfo {
    return { ...this.sessionInfo };
  }

  cleanupOldSessions(maxAgeDays: number = 30): void {
    const files = fs.readdirSync(this.sessionDir);
    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

    for (const file of files) {
      const filePath = path.join(this.sessionDir, file);
      const stats = fs.statSync(filePath);

      if (stats.mtime.getTime() < cutoffTime) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          console.warn(`Failed to cleanup old session file: ${file}`, error);
        }
      }
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  // Static method to list all sessions for a project
  static listSessions(projectDir: string): SessionInfo[] {
    const sessionDir = path.join(projectDir, '.agent_history');

    if (!fs.existsSync(sessionDir)) return [];

    const infoFiles = fs.readdirSync(sessionDir)
      .filter(f => f.endsWith('_info.json'))
      .sort()
      .reverse();

    return infoFiles.map(file => {
      try {
        const filePath = path.join(sessionDir, file);
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        return null;
      }
    }).filter((info): info is SessionInfo => info !== null);
  }
}