import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CrashReport {
  id: string;
  timestamp: string;
  error: {
    message: string;
    stack?: string;
    type: string;
  };
  context: {
    appVersion: string;
    platform: string;
    nodeVersion: string;
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
    serverId?: string;
  };
  diagnostics: {
    lastLogs: string[];
    networkState?: string;
    diskSpace?: { free: number; total: number };
  };
  userConsent: boolean;
  sent: boolean;
}

export class CrashReporter {
  private reportsDir: string;
  private maxReports: number;
  private appVersion: string;
  private consentGiven: boolean;

  constructor(dataDir: string, appVersion: string, consentGiven: boolean = false) {
    this.reportsDir = path.join(dataDir, 'diagnostics', 'crash-dumps');
    this.maxReports = 20;
    this.appVersion = appVersion;
    this.consentGiven = consentGiven;

    fs.mkdirSync(this.reportsDir, { recursive: true });
  }

  setConsent(consent: boolean): void {
    this.consentGiven = consent;
  }

  captureCrash(error: Error, context: { serverId?: string; lastLogs?: string[] }): CrashReport {
    const report: CrashReport = {
      id: `crash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack,
        type: error.name,
      },
      context: {
        appVersion: this.appVersion,
        platform: process.platform,
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        serverId: context.serverId,
      },
      diagnostics: {
        lastLogs: context.lastLogs || [],
        diskSpace: this.getDiskSpace(),
      },
      userConsent: this.consentGiven,
      sent: false,
    };

    this.saveReport(report);
    return report;
  }

  captureUnhandledRejection(reason: any, promise: Promise<any>): CrashReport {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    return this.captureCrash(error, {
      lastLogs: [`Unhandled rejection: ${error.message}`],
    });
  }

  captureUncaughtException(error: Error): CrashReport {
    return this.captureCrash(error, {
      lastLogs: [`Uncaught exception: ${error.message}`],
    });
  }

  getPendingReports(): CrashReport[] {
    if (!fs.existsSync(this.reportsDir)) return [];

    const reports: CrashReport[] = [];
    for (const file of fs.readdirSync(this.reportsDir)) {
      if (file.endsWith('.json')) {
        try {
          const report = JSON.parse(
            fs.readFileSync(path.join(this.reportsDir, file), 'utf-8')
          ) as CrashReport;
          if (!report.sent && report.userConsent) {
            reports.push(report);
          }
        } catch {}
      }
    }

    return reports.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  markReportSent(reportId: string): void {
    const reportPath = path.join(this.reportsDir, `${reportId}.json`);
    if (fs.existsSync(reportPath)) {
      try {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as CrashReport;
        report.sent = true;
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      } catch {}
    }
  }

  deleteOldReports(): void {
    if (!fs.existsSync(this.reportsDir)) return;

    const files = fs.readdirSync(this.reportsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(this.reportsDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    for (let i = this.maxReports; i < files.length; i++) {
      fs.unlinkSync(path.join(this.reportsDir, files[i].name));
    }
  }

  private saveReport(report: CrashReport): void {
    const reportPath = path.join(this.reportsDir, `${report.id}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.deleteOldReports();
    console.log(`Crash report saved: ${report.id}`);
  }

  private getDiskSpace(): { free: number; total: number } | undefined {
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        const output = execSync('wmic logicaldisk get size,freespace', { encoding: 'utf-8' });
        const lines = output.trim().split('\n').slice(1);
        let total = 0;
        let free = 0;
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2) {
            free += parseInt(parts[0]) || 0;
            total += parseInt(parts[1]) || 0;
          }
        }
        return { free, total };
      }
    } catch {}
    return undefined;
  }
}
