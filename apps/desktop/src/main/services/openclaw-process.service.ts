import { spawn, type ChildProcess } from 'child_process';
import { createConnection } from 'net';
import { randomBytes } from 'crypto';
import { app } from 'electron';
import { join } from 'path';
import { createWriteStream, mkdirSync, readdirSync, unlinkSync, type WriteStream } from 'fs';

// ── Types ──

export type OpenClawMode = 'local' | 'docker' | 'external';

export interface ProcessStatus {
  mode: OpenClawMode;
  running: boolean;
  pid?: number;
  restartCount: number;
  lastError?: string;
}

// ── Constants ──

const PORT = 18789;
const BIND_HOST = '127.0.0.1';
const HEALTH_POLL_INTERVAL = 500;
const HEALTH_POLL_TIMEOUT = 10_000;
const GRACEFUL_SHUTDOWN_MS = 3_000;
const MAX_RESTART_ATTEMPTS = 3;
const LOG_RETENTION_DAYS = 7;
const HEARTBEAT_INTERVAL = 30_000;

// ── Service ──

export class OpenClawProcessService {
  private process: ChildProcess | null = null;
  private token: string | null = null;
  private mode: OpenClawMode = 'docker';
  private restartCount = 0;
  private lastError: string | undefined;
  private logStream: WriteStream | null = null;
  private stopping = false;

  /**
   * Resolve the OpenClaw mode based on environment variables.
   * - OPENCLAW_MODE env override
   * - Otherwise: dev (ELECTRON_RENDERER_URL exists) → docker, production → local
   */
  resolveMode(): OpenClawMode {
    const envMode = process.env.OPENCLAW_MODE as OpenClawMode | undefined;
    if (envMode && ['local', 'docker', 'external'].includes(envMode)) {
      return envMode;
    }
    // Dev = docker (Server API), production = local sidecar
    return process.env.ELECTRON_RENDERER_URL ? 'docker' : 'local';
  }

  /**
   * Start the OpenClaw process (local mode) or return config for external mode.
   * For docker mode, returns null — caller should use Server API.
   */
  async start(): Promise<{ url: string; token: string } | null> {
    this.mode = this.resolveMode();
    console.log(`[OpenClaw:Process] Mode resolved: ${this.mode}`);

    if (this.mode === 'docker') {
      return null; // Caller should use Server API
    }

    if (this.mode === 'external') {
      const url = process.env.OPENCLAW_URL;
      const token = process.env.OPENCLAW_TOKEN;
      if (!url || !token) {
        this.lastError = 'OPENCLAW_URL and OPENCLAW_TOKEN must be set for external mode';
        console.error(`[OpenClaw:Process] ${this.lastError}`);
        return null;
      }
      return { url, token };
    }

    // local mode — spawn sidecar
    return this.spawnProcess();
  }

  /**
   * Stop the OpenClaw process gracefully.
   */
  async stop(): Promise<void> {
    if (!this.process || this.stopping) return;
    this.stopping = true;

    const pid = this.process.pid;
    console.log(`[OpenClaw:Process] Stopping PID=${pid}`);

    try {
      await this.gracefulShutdown();
    } catch (err) {
      console.warn(`[OpenClaw:Process] Graceful shutdown failed, force killing PID=${pid}`);
      this.forceKill();
    }

    this.cleanup();
    this.stopping = false;
    console.log(`[OpenClaw:Process] Stopped`);
  }

  getStatus(): ProcessStatus {
    return {
      mode: this.mode,
      running: this.isProcessRunning(),
      pid: this.process?.pid,
      restartCount: this.restartCount,
      lastError: this.lastError,
    };
  }

  getConnectionConfig(): { url: string; token: string } | null {
    if (this.mode === 'external') {
      const url = process.env.OPENCLAW_URL;
      const token = process.env.OPENCLAW_TOKEN;
      if (url && token) return { url, token };
      return null;
    }
    if (this.mode === 'local' && this.token && this.isProcessRunning()) {
      return { url: `http://${BIND_HOST}:${PORT}`, token: this.token };
    }
    return null;
  }

  isProcessRunning(): boolean {
    if (!this.process || this.process.killed) return false;
    try {
      // Sending signal 0 checks if process exists without killing it
      process.kill(this.process.pid!, 0);
      return true;
    } catch {
      return false;
    }
  }

  getMode(): OpenClawMode {
    return this.mode;
  }

  // ── Private: Spawn ──

  private async spawnProcess(): Promise<{ url: string; token: string } | null> {
    // Check if port is already in use
    const portInUse = await this.isPortInUse(PORT);
    if (portInUse) {
      // Verify it's actually an OpenClaw instance
      const isOpenClaw = await this.checkHealth();
      if (isOpenClaw) {
        console.log(`[OpenClaw:Process] Existing OpenClaw found on port ${PORT}`);
        // We don't know the token, so we can't connect. Need a fresh start.
        this.lastError = `Port ${PORT} already in use by another OpenClaw instance. Cannot obtain token.`;
        console.error(`[OpenClaw:Process] ${this.lastError}`);
        return null;
      }
      this.lastError = `Port ${PORT} is occupied by a non-OpenClaw process`;
      console.error(`[OpenClaw:Process] ${this.lastError}`);
      return null;
    }

    // Generate token
    this.token = randomBytes(32).toString('hex');

    // Resolve binary paths
    const { nodePath, cliPath } = this.resolvePaths();
    if (!nodePath || !cliPath) {
      this.lastError = 'Could not resolve OpenClaw sidecar paths';
      console.error(`[OpenClaw:Process] ${this.lastError}`);
      return null;
    }

    // Set up log stream
    this.setupLogStream();

    console.log(`[OpenClaw:Process] Spawning: ${nodePath} ${cliPath} gateway run --port ${PORT} --bind loopback`);

    try {
      this.process = spawn(
        nodePath,
        [cliPath, 'gateway', 'run', '--port', String(PORT), '--bind', 'loopback'],
        {
          env: {
            ...process.env,
            OPENCLAW_GATEWAY_TOKEN: this.token,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: false,
          windowsHide: true,
        },
      );

      // Pipe stdout/stderr to log file
      if (this.logStream) {
        this.process.stdout?.on('data', (data: Buffer) => {
          const line = data.toString();
          this.logStream?.write(`[stdout] ${line}`);
        });
        this.process.stderr?.on('data', (data: Buffer) => {
          const line = data.toString();
          this.logStream?.write(`[stderr] ${line}`);
        });
      }

      // Handle unexpected exit → auto-restart
      this.process.on('exit', (code, signal) => {
        console.log(`[OpenClaw:Process] Exited with code=${code} signal=${signal}`);
        if (!this.stopping && this.restartCount < MAX_RESTART_ATTEMPTS) {
          this.restartCount++;
          console.log(`[OpenClaw:Process] Auto-restarting (attempt ${this.restartCount}/${MAX_RESTART_ATTEMPTS})`);
          this.process = null;
          // Re-spawn after a brief delay
          setTimeout(() => {
            if (!this.stopping) {
              this.spawnProcess().catch((err) => {
                console.error('[OpenClaw:Process] Restart failed:', err);
              });
            }
          }, 1000);
        } else if (!this.stopping) {
          this.lastError = `Process crashed ${MAX_RESTART_ATTEMPTS} times, giving up`;
          console.error(`[OpenClaw:Process] ${this.lastError}`);
        }
      });

      this.process.on('error', (err) => {
        this.lastError = `Spawn error: ${err.message}`;
        console.error(`[OpenClaw:Process] ${this.lastError}`);
      });

      console.log(`[OpenClaw:Process] Spawned PID=${this.process.pid}`);

      // Wait for healthy
      const healthy = await this.waitForHealth();
      if (!healthy) {
        this.lastError = 'Process started but health check timed out';
        console.error(`[OpenClaw:Process] ${this.lastError}`);
        await this.stop();
        return null;
      }

      this.restartCount = 0;
      const config = { url: `http://${BIND_HOST}:${PORT}`, token: this.token };
      console.log(`[OpenClaw:Process] Ready at ${config.url}`);
      return config;
    } catch (err) {
      this.lastError = `Failed to spawn: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[OpenClaw:Process] ${this.lastError}`);
      return null;
    }
  }

  // ── Private: Path resolution ──

  private resolvePaths(): { nodePath: string | null; cliPath: string | null } {
    // Dev mode: use env or system PATH
    if (process.env.ELECTRON_RENDERER_URL || process.env.OPENCLAW_SIDECAR_PATH) {
      const sidecarPath = process.env.OPENCLAW_SIDECAR_PATH;
      if (sidecarPath) {
        return { nodePath: process.execPath.includes('electron') ? 'node' : process.execPath, cliPath: sidecarPath };
      }
      // Fallback: assume openclaw is in PATH as a node module
      return { nodePath: 'node', cliPath: 'node_modules/.bin/openclaw' };
    }

    // Production: bundled sidecar
    const resourcesPath = (process as any).resourcesPath || join(app.getAppPath(), '..', '..', 'resources');
    const cliPath = join(resourcesPath, 'openclaw-sidecar', 'cli.js');
    const nodePath = process.execPath; // Electron executable can also run Node scripts in some setups

    // In production Electron, we need a real Node.js binary
    // Check if a bundled node exists, otherwise fall back to system node
    const isElectron = process.versions['electron'] != null;
    if (isElectron) {
      return { nodePath: 'node', cliPath };
    }

    return { nodePath, cliPath };
  }

  // ── Private: Port & Health ──

  private isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const conn = createConnection({ host: BIND_HOST, port });
      conn.on('connect', () => {
        conn.destroy();
        resolve(true);
      });
      conn.on('error', () => {
        resolve(false);
      });
    });
  }

  private async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`http://${BIND_HOST}:${PORT}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async waitForHealth(): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < HEALTH_POLL_TIMEOUT) {
      if (await this.checkHealth()) return true;
      await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL));
    }
    return false;
  }

  // ── Private: Shutdown ──

  private gracefulShutdown(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Graceful shutdown timed out'));
      }, GRACEFUL_SHUTDOWN_MS);

      this.process.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      if (process.platform === 'win32') {
        // Windows: close stdin, then force kill if needed
        this.process.stdin?.end();
      } else {
        // Unix: send SIGTERM
        this.process.kill('SIGTERM');
      }
    });
  }

  private forceKill(): void {
    if (!this.process?.pid) return;

    try {
      if (process.platform === 'win32') {
        // taskkill /PID /F /T kills process tree on Windows
        spawn('taskkill', ['/PID', String(this.process.pid), '/F', '/T'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } else {
        this.process.kill('SIGKILL');
      }
    } catch (err) {
      console.error('[OpenClaw:Process] Force kill error:', err);
    }
  }

  private cleanup(): void {
    this.process = null;
    this.logStream?.end();
    this.logStream = null;
  }

  // ── Private: Logging ──

  private setupLogStream(): void {
    try {
      const logDir = join(app.getPath('logs'), 'openclaw');
      mkdirSync(logDir, { recursive: true });

      // Rotate old logs
      this.rotateLogs(logDir);

      const date = new Date().toISOString().slice(0, 10);
      const logPath = join(logDir, `openclaw-${date}.log`);
      this.logStream = createWriteStream(logPath, { flags: 'a' });
      this.logStream.write(`\n--- OpenClaw started at ${new Date().toISOString()} ---\n`);
    } catch (err) {
      console.warn('[OpenClaw:Process] Failed to set up log stream:', err);
    }
  }

  private rotateLogs(logDir: string): void {
    try {
      const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      const files = readdirSync(logDir).filter((f) => f.startsWith('openclaw-') && f.endsWith('.log'));
      for (const file of files) {
        const match = file.match(/openclaw-(\d{4}-\d{2}-\d{2})\.log/);
        if (match) {
          const fileDate = new Date(match[1]).getTime();
          if (fileDate < cutoff) {
            unlinkSync(join(logDir, file));
            console.log(`[OpenClaw:Process] Rotated old log: ${file}`);
          }
        }
      }
    } catch {
      // Non-critical
    }
  }
}

// Singleton
export const openClawProcessService = new OpenClawProcessService();
