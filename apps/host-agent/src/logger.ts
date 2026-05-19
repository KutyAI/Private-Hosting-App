import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  module: string;
  data?: Record<string, unknown>;
}

interface LoggerConfig {
  logDir: string;
  maxFileSize: number;
  maxFiles: number;
  minLevel: LogLevel;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private config: LoggerConfig;
  private currentFile: string;
  private currentSize: number = 0;
  private fileIndex: number = 0;

  constructor(config: LoggerConfig) {
    this.config = config;
    fs.mkdirSync(config.logDir, { recursive: true });
    this.currentFile = this.getLogFilePath();
    this.currentSize = fs.existsSync(this.currentFile) ? fs.statSync(this.currentFile).size : 0;
  }

  debug(module: string, message: string, data?: Record<string, unknown>): void {
    this.log('debug', module, message, data);
  }

  info(module: string, message: string, data?: Record<string, unknown>): void {
    this.log('info', module, message, data);
  }

  warn(module: string, message: string, data?: Record<string, unknown>): void {
    this.log('warn', module, message, data);
  }

  error(module: string, message: string, data?: Record<string, unknown>): void {
    this.log('error', module, message, data);
  }

  private log(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.config.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      module,
      data,
    };

    const line = JSON.stringify(entry) + '\n';

    console.log(`[${level.toUpperCase()}] [${module}] ${message}`);

    this.writeToFile(line);
  }

  private writeToFile(line: string): void {
    try {
      if (this.currentSize + line.length > this.config.maxFileSize) {
        this.rotateFile();
      }

      fs.appendFileSync(this.currentFile, line);
      this.currentSize += line.length;
    } catch (err) {
      console.error('Failed to write log:', err);
    }
  }

  private rotateFile(): void {
    try {
      if (fs.existsSync(this.currentFile)) {
        const rotatedPath = this.getRotatedFilePath(this.fileIndex);
        fs.renameSync(this.currentFile, rotatedPath);
        this.fileIndex++;
      }

      this.currentFile = this.getLogFilePath();
      this.currentSize = 0;

      this.cleanupOldFiles();
    } catch (err) {
      console.error('Failed to rotate log file:', err);
    }
  }

  private cleanupOldFiles(): void {
    try {
      const files = fs.readdirSync(this.config.logDir)
        .filter(f => f.startsWith('agent-') && f.endsWith('.log'))
        .sort()
        .reverse();

      for (let i = this.config.maxFiles; i < files.length; i++) {
        fs.unlinkSync(path.join(this.config.logDir, files[i]));
      }
    } catch (err) {
      console.error('Failed to cleanup old logs:', err);
    }
  }

  private getLogFilePath(): string {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.config.logDir, `agent-${date}.log`);
  }

  private getRotatedFilePath(index: number): string {
    const base = this.getLogFilePath().replace('.log', '');
    return `${base}.${index}.log`;
  }
}
