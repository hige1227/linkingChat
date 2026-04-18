import { spawn, type ChildProcess } from 'child_process';
import { app } from 'electron';
import { join } from 'path';
import { createWriteStream, mkdirSync, readdirSync, unlinkSync, accessSync, type WriteStream } from 'fs';
import { HERMES_CONFIG } from '../openclaw/openclaw.config';

export interface HermesStatus {
  running: boolean;
  pid?: number;
  restartCount: number;
  lastError?: string;
}

const PORT = HERMES_CONFIG.port;
const HEALTH_POLL_INTERVAL = 500;
const HEALTH_POLL_TIMEOUT = 30_000;
const GRACEFUL_SHUTDOWN_MS = 3_000;
const MAX_RESTART_ATTEMPTS = 3;
const LOG_RETENTION_DAYS = 7;

export class HermesProcessService {
  private process: ChildProcess | null = null;
  private restartCount = 0;
  private lastError: string | undefined;
  private logStream: WriteStream | null = null;
  private stopping = false;

  resolveBinaryPath(): string | null {
    const resourcesPath = (process as any).resourcesPath || join(app.getAppPath(), '..', '..', 'resources');
    const isWin = process.platform === 'win32';
    const subdir = isWin ? 'Scripts' : 'bin';
    const binaryName = isWin ? 'hermes.exe' : 'hermes';

    // 1. Try bundled venv binary first (production: resources/hermes-env/lib/Scripts/hermes.exe)
    const venvCandidate = join(resourcesPath, 'hermes-env', 'lib', subdir, binaryName);
    try {
      accessSync(venvCandidate);
      return venvCandidate;
    } catch { /* not bundled, try next */ }

    // 2. Try system PATH hermes (Windows native Python pip install)
    // On Windows the hermes.exe is in Python's Scripts directory
    if (isWin) {
      const systemCandidate = join(
        process.env.LOCALAPPDATA ?? '',
        'Programs', 'Python', 'Python313', 'Scripts', 'hermes.exe',
      );
      try {
        accessSync(systemCandidate);
        return systemCandidate;
      } catch { /* not found */ }
    }

    this.lastError = `Hermes binary not found (tried: ${venvCandidate}, system PATH)`;
    return null;
  }

  async start(): Promise<boolean> {
    if (this.isProcessRunning()) return true;

    // Windows dev mode (unpackaged): probe for running gateway.
    // Hermes runs natively on Windows Python, but devs may start it manually.
    if (process.platform === 'win32' && !app.isPackaged) {
      const healthy = await this.checkHealth();
      if (healthy) {
        console.log(`[Hermes:Process] Gateway detected on port ${PORT} (external)`);
        return true;
      }
      // Try to find and spawn system hermes
      const binaryPath = this.resolveBinaryPath();
      if (!binaryPath) {
        console.warn(`[Hermes:Process] No gateway on port ${PORT} and no hermes binary found.`);
        console.warn(`[Hermes:Process] Install: pip install -e ".[web,pty]" then run: hermes gateway run`);
        return false;
      }
      // Fall through to spawn logic below
      return this.spawnGateway(binaryPath);
    }

    // macOS / Linux / Windows production: spawn local binary
    const binaryPath = this.resolveBinaryPath();
    if (!binaryPath) {
      console.error(`[Hermes:Process] ${this.lastError}`);
      return false;
    }

    return this.spawnGateway(binaryPath);
  }

  private async spawnGateway(binaryPath: string): Promise<boolean> {

    this.setupLogStream();

    try {
      this.process = spawn(binaryPath, ['gateway', 'start', '--port', String(PORT)], {
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
        windowsHide: true,
      });

      if (this.logStream) {
        this.process.stdout?.on('data', (data: Buffer) => this.logStream?.write(`[stdout] ${data}`));
        this.process.stderr?.on('data', (data: Buffer) => this.logStream?.write(`[stderr] ${data}`));
      }

      this.process.on('exit', (code, signal) => {
        console.log(`[Hermes:Process] Exited code=${code} signal=${signal}`);
        if (!this.stopping && this.restartCount < MAX_RESTART_ATTEMPTS) {
          this.restartCount++;
          this.process = null;
          setTimeout(() => {
            if (!this.stopping) this.start().catch(console.error);
          }, 2000 * this.restartCount);
        } else if (!this.stopping) {
          this.lastError = `Process crashed ${MAX_RESTART_ATTEMPTS} times, giving up`;
        }
      });

      await this.waitForHealth();
      console.log(`[Hermes:Process] Started on port ${PORT}`);
      return true;
    } catch (error: unknown) {
      this.lastError = (error as Error).message;
      return false;
    }
  }

  async stop(): Promise<void> {
    if (!this.process || this.stopping) return;
    this.stopping = true;

    try {
      this.process.kill('SIGTERM');
      await new Promise<void>((resolve) => setTimeout(resolve, GRACEFUL_SHUTDOWN_MS));
    } finally {
      if (this.isProcessRunning()) this.process!.kill('SIGKILL');
      this.process = null;
      this.logStream?.end();
      this.logStream = null;
      this.stopping = false;
    }
  }

  getStatus(): HermesStatus {
    return {
      running: this.isProcessRunning(),
      pid: this.process?.pid,
      restartCount: this.restartCount,
      lastError: this.lastError,
    };
  }

  isProcessRunning(): boolean {
    if (!this.process || this.process.killed) return false;
    try {
      process.kill(this.process.pid!, 0);
      return true;
    } catch {
      return false;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  private async waitForHealth(): Promise<void> {
    const deadline = Date.now() + HEALTH_POLL_TIMEOUT;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${HERMES_CONFIG.baseUrl}${HERMES_CONFIG.api.health}`);
        if (res.ok) return;
      } catch { /* not ready yet */ }
      await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL));
    }
    throw new Error(`Hermes did not become healthy within ${HEALTH_POLL_TIMEOUT}ms`);
  }

  private setupLogStream(): void {
    try {
      const logDir = join(app.getPath('logs'), 'hermes');
      mkdirSync(logDir, { recursive: true });

      const now = Date.now();
      for (const file of readdirSync(logDir)) {
        const filePath = join(logDir, file);
        try {
          const stat = require('fs').statSync(filePath);
          if (now - stat.mtimeMs > LOG_RETENTION_DAYS * 86400 * 1000) unlinkSync(filePath);
        } catch { /* skip */ }
      }

      const logFile = join(logDir, `hermes-${Date.now()}.log`);
      this.logStream = createWriteStream(logFile, { flags: 'a' });
    } catch (err) {
      console.warn('[Hermes:Process] Failed to setup log stream:', err);
    }
  }
}

export const hermesProcessService = new HermesProcessService();
