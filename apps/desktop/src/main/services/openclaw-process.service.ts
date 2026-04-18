import { spawn, execSync, type ChildProcess } from 'child_process';
import { createConnection } from 'net';
import { randomBytes } from 'crypto';
import { app } from 'electron';
import { join } from 'path';
import * as fs from 'fs';
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
const HEALTH_POLL_TIMEOUT = 30_000;
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
    // Default to local mode — spawn OpenClaw as sidecar process
    // Use OPENCLAW_MODE=docker to explicitly use Server API (Docker container)
    return 'local';
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

    // local mode — reuse running process or spawn new
    if (this.isProcessRunning()) {
      console.log(`[OpenClaw:Process] Reusing existing process PID=${this.process?.pid}`);
      return { url: `ws://${BIND_HOST}:${PORT}`, token: this.token! };
    }
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
    if (this.mode === 'local' && this.token !== null && this.isProcessRunning()) {
      return { url: `ws://${BIND_HOST}:${PORT}`, token: this.token };
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
        console.log(`[OpenClaw:Process] Reusing existing OpenClaw Gateway on port ${PORT}`);
        this.token = '';
        return { url: `ws://${BIND_HOST}:${PORT}`, token: this.token };
      }
      this.lastError = `Port ${PORT} is occupied by a non-OpenClaw process`;
      console.error(`[OpenClaw:Process] ${this.lastError}`);
      return null;
    }

    // No token needed — local loopback is not externally reachable
    this.token = '';

    // Keep device identity across restarts — the Ed25519 keypair is stable.
    // Signing uses the current token + nonce each time, so old keys work fine.
    // Deleting identity forces a new deviceId → slow first-pairing path every launch.

    // Resolve binary paths
    const { nodePath, cliPath } = this.resolvePaths();
    if (!nodePath || !cliPath) {
      this.lastError = 'Could not resolve OpenClaw sidecar paths';
      console.error(`[OpenClaw:Process] ${this.lastError}`);
      return null;
    }

    // Set up log stream
    this.setupLogStream();

    const spawnArgs = [
      ...(cliPath ? [cliPath] : []),
      'gateway', 'run', '--allow-unconfigured', '--dev', '--port', String(PORT), '--bind', 'loopback', '--auth', 'none',
    ];
    console.log(`[OpenClaw:Process] Spawning: ${nodePath} ${spawnArgs.join(' ')}`);

    try {
      this.process = spawn(
        nodePath,
        spawnArgs,
        {
          env: {
            ...process.env,
            // Encourage UTF-8 output from child processes on Windows
            PYTHONUTF8: '1',
            PYTHONIOENCODING: 'utf-8',
            LANG: 'en_US.UTF-8',
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

      // Wait for healthy (HTTP health endpoint)
      const healthy = await this.waitForHealth();
      if (!healthy) {
        this.lastError = 'Process started but health check timed out';
        console.error(`[OpenClaw:Process] ${this.lastError}`);
        await this.stop();
        return null;
      }
      // Wait for WS to be ready (health HTTP may be up before WS accepts connections)
      await this.waitForWsReady();

      this.restartCount = 0;
      const config = { url: `ws://${BIND_HOST}:${PORT}`, token: this.token };
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
      // Fallback: resolve openclaw.mjs from node_modules (local or global)
      const candidates: string[] = [];
      // 1. Local node_modules
      try {
        const localDir = require.resolve('openclaw').replace(/dist[/\\]index\.js$/, '');
        candidates.push(join(localDir, 'openclaw.mjs'));
      } catch { /* not installed locally */ }
      // 2. Global npm node_modules
      try {
        const { execSync } = require('child_process');
        const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
        candidates.push(join(globalRoot, 'openclaw', 'openclaw.mjs'));
      } catch { /* npm not available */ }
      // 3. Check which candidate exists
      for (const candidate of candidates) {
        try {
          require('fs').accessSync(candidate);
          console.log(`[OpenClaw:Process] Resolved openclaw.mjs at: ${candidate}`);
          return { nodePath: 'node', cliPath: candidate };
        } catch { /* not found, try next */ }
      }
      console.error('[OpenClaw:Process] Could not find openclaw.mjs in any location:', candidates);
      return { nodePath: null, cliPath: null };
    }

    // Production: bundled sidecar, or fall back to globally installed openclaw
    const resourcesPath = (process as any).resourcesPath || join(app.getAppPath(), '..', '..', 'resources');
    const sidecarPath = join(resourcesPath, 'openclaw-sidecar', 'cli.js');

    // Check bundled sidecar first
    try {
      fs.accessSync(sidecarPath);
      console.log(`[OpenClaw:Process] Using bundled sidecar: ${sidecarPath}`);
      return { nodePath: 'node', cliPath: sidecarPath };
    } catch { /* bundled sidecar not found */ }

    // Fallback: globally installed openclaw (npm install -g openclaw)
    console.log('[OpenClaw:Process] No bundled sidecar, searching for global openclaw...');
    const candidates: string[] = [];
    // 1. Try npm root -g
    try {
      const globalRoot = execSync('npm root -g', { encoding: 'utf8', timeout: 5000 }).trim();
      candidates.push(join(globalRoot, 'openclaw', 'openclaw.mjs'));
    } catch { /* npm not available in this context */ }
    // 2. Windows: %APPDATA%\npm\node_modules
    try {
      const appDataPath = process.env.APPDATA || app.getPath('appData');
      if (appDataPath) {
        candidates.push(join(appDataPath, 'npm', 'node_modules', 'openclaw', 'openclaw.mjs'));
      }
    } catch { /* app.getPath not available */ }
    // 3. Windows: USERPROFILE fallback
    try {
      const home = process.env.USERPROFILE || process.env.HOME;
      if (home) {
        candidates.push(join(home, 'AppData', 'Roaming', 'npm', 'node_modules', 'openclaw', 'openclaw.mjs'));
      }
    } catch { /* no home */ }
    // 4. macOS/Linux standard paths
    candidates.push('/usr/local/lib/node_modules/openclaw/openclaw.mjs');
    candidates.push('/usr/lib/node_modules/openclaw/openclaw.mjs');

    console.log('[OpenClaw:Process] Candidates:', candidates);
    // Use original-fs to bypass Electron's ASAR interception of fs calls
    let realFs: typeof fs;
    try {
      realFs = require('original-fs') as typeof fs;
    } catch {
      realFs = fs;
    }
    for (const candidate of candidates) {
      try {
        realFs.accessSync(candidate);
        console.log(`[OpenClaw:Process] Using global openclaw: ${candidate}`);
        return { nodePath: 'node', cliPath: candidate };
      } catch { /* not found */ }
    }
    console.error('[OpenClaw:Process] No global openclaw found among candidates');
    return { nodePath: null, cliPath: null };
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

  /** Probe WS port with a raw TCP connect to confirm the WS server is accepting connections */
  private async waitForWsReady(): Promise<void> {
    const maxWait = 10_000;
    const interval = 500;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const ok = await new Promise<boolean>((resolve) => {
        const ws = new (require('ws') as { new(url: string): import('ws').WebSocket })(`ws://${BIND_HOST}:${PORT}`);
        const timer = setTimeout(() => { ws.close(); resolve(false); }, 2000);
        ws.on('open', () => { clearTimeout(timer); ws.close(); resolve(true); });
        ws.on('error', () => { clearTimeout(timer); resolve(false); });
      });
      if (ok) {
        console.log('[OpenClaw:Process] WS server ready');
        return;
      }
      await new Promise((r) => setTimeout(r, interval));
    }
    console.warn('[OpenClaw:Process] WS ready check timed out, proceeding anyway');
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

  /**
   * Synchronous kill — called from process.on('exit') to prevent orphan Gateway.
   * Windows does not auto-kill child processes when parent exits.
   */
  killSync(): void {
    if (!this.process?.pid) return;
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${this.process.pid} /F /T`, { stdio: 'ignore', windowsHide: true });
      } else {
        this.process.kill('SIGKILL');
      }
    } catch { /* process may already be dead */ }
    this.process = null;
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
