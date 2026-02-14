# Sprint 1 — Phase 2：Desktop（Electron 最小骨架）

> **负责人**：桌面端开发者
>
> **前置条件**：Phase 1 Auth API 已就绪（至少 `POST /api/v1/auth/login` 可用）
>
> **产出**：Electron 桌面客户端 — 登录 → WS 连接 → 接收命令 → Shell 执行 → 结果回报
>
> **参考**：[sprint-1-plan.md](../dev-plan/sprint-1-plan.md) | [websocket-protocol.md](../dev-plan/websocket-protocol.md) | [project-skeleton.md](../dev-plan/project-skeleton.md)

---

## 技术栈

| 技术 | 用途 |
|------|------|
| **Electron** | 桌面应用外壳 |
| **electron-vite** | 构建工具（main / renderer / preload 三端统一） |
| **React + TypeScript** | 渲染进程 UI |
| **socket.io-client** | WebSocket 客户端（与 Cloud Brain 通信） |
| **electron-store** / **safeStorage** | JWT token 安全存储 |
| **@linkingchat/ws-protocol** | 共享 WS 事件类型（来自 Phase 0） |

---

## 任务清单

| # | 任务 | 文件 | 依赖 |
|---|------|------|------|
| 2.1 | Electron 项目结构 | `apps/desktop/` 整体骨架 | Sprint 0 monorepo |
| 2.2 | 登录界面 | `src/renderer/pages/Login.tsx` + `src/main/services/auth-store.service.ts` | Phase 1 Auth API |
| 2.3 | WebSocket 客户端 | `src/main/services/ws-client.service.ts` | 2.2 |
| 2.4 | 设备注册 | ws-client.service.ts 内 `device:register` 逻辑 | 2.3 |
| 2.5 | 命令接收 + Shell 执行 | `src/main/services/command-executor.service.ts` | 2.3 |
| 2.6 | 黑名单检查（客户端侧） | `src/main/utils/command-blacklist.ts` | 2.5（可选） |
| 2.7 | 结果回报 | ws-client.service.ts 内 `device:result:complete` 逻辑 | 2.5 |
| 2.8 | 最小 UI | `src/renderer/` 页面组件 | 2.1 |

---

## 2.1 Electron 项目结构

使用 `electron-vite` 初始化，三进程分离：Main / Renderer / Preload。

```
apps/desktop/
├── src/
│   ├── main/                              # Electron 主进程
│   │   ├── index.ts                       # app 入口：创建窗口、注册 IPC
│   │   ├── window.ts                      # BrowserWindow 管理
│   │   ├── ipc/                           # IPC handler 注册
│   │   │   ├── auth.ipc.ts                # 登录 / 登出 IPC
│   │   │   └── device.ipc.ts              # 设备状态 / 命令日志 IPC
│   │   ├── services/
│   │   │   ├── ws-client.service.ts       # Socket.IO 客户端（核心）
│   │   │   ├── command-executor.service.ts# Shell 命令执行器
│   │   │   └── auth-store.service.ts      # JWT token 本地安全存储
│   │   └── utils/
│   │       ├── platform.ts                # os.hostname(), os.platform()
│   │       └── command-blacklist.ts       # 客户端侧危险命令检查
│   │
│   ├── renderer/                          # Electron 渲染进程 (React + Vite)
│   │   ├── index.html
│   │   ├── main.tsx                       # React 入口
│   │   ├── App.tsx                        # 路由：Login / Dashboard
│   │   ├── pages/
│   │   │   ├── Login.tsx                  # 登录表单
│   │   │   └── Dashboard.tsx              # 主界面：连接状态 + 命令日志
│   │   ├── components/
│   │   │   ├── ConnectionStatus.tsx       # 连接状态指示器
│   │   │   └── CommandLog.tsx             # 命令日志列表
│   │   └── styles/
│   │       └── global.css
│   │
│   └── preload/
│       └── index.ts                       # contextBridge 暴露 API
│
├── electron.vite.config.ts                # electron-vite 配置
├── electron-builder.yaml                  # 打包配置
├── package.json                           # "@linkingchat/desktop"
└── tsconfig.json
```

### electron-builder.yaml

```yaml
appId: com.linkingchat.desktop
productName: LinkingChat
directories:
  buildResources: build
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.*'
  - '!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml}'
  - '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
win:
  target: nsis
mac:
  target: dmg
linux:
  target: AppImage
```

### package.json 关键字段

```json
{
  "name": "@linkingchat/desktop",
  "version": "0.1.0",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "pack": "electron-builder --dir",
    "dist": "electron-builder"
  },
  "dependencies": {
    "socket.io-client": "^4.7.0",
    "electron-store": "^8.2.0",
    "@linkingchat/ws-protocol": "workspace:*"
  },
  "devDependencies": {
    "electron": "^30.0.0",
    "electron-vite": "^2.0.0",
    "electron-builder": "^24.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.4.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

---

## 2.2 登录界面

简单的邮箱 + 密码登录表单。调用 `POST /api/v1/auth/login`，成功后将 JWT token 对安全存储到本地。

### auth-store.service.ts（主进程）

```typescript
// apps/desktop/src/main/services/auth-store.service.ts

import Store from 'electron-store';
import { safeStorage } from 'electron';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const store = new Store<{ encryptedTokens?: string }>({
  name: 'linkingchat-auth',
});

export class AuthStore {
  static save(tokens: TokenPair): void {
    const json = JSON.stringify(tokens);
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(json);
      store.set('encryptedTokens', encrypted.toString('base64'));
    } else {
      // fallback: 仅开发环境使用
      store.set('encryptedTokens', json);
    }
  }

  static load(): TokenPair | null {
    const raw = store.get('encryptedTokens');
    if (!raw) return null;

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(Buffer.from(raw, 'base64'));
        return JSON.parse(decrypted);
      }
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static clear(): void {
    store.delete('encryptedTokens');
  }
}
```

### auth.ipc.ts（IPC handler）

```typescript
// apps/desktop/src/main/ipc/auth.ipc.ts

import { ipcMain } from 'electron';
import { AuthStore } from '../services/auth-store.service';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3008';

export function registerAuthIpc(): void {
  ipcMain.handle('auth:login', async (_event, email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || 'Login failed' };
    }

    const data = await res.json();
    AuthStore.save({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });

    return { success: true, user: data.user };
  });

  ipcMain.handle('auth:logout', async () => {
    AuthStore.clear();
    return { success: true };
  });

  ipcMain.handle('auth:get-token', async () => {
    const tokens = AuthStore.load();
    return tokens?.accessToken ?? null;
  });
}
```

### preload/index.ts（contextBridge）

```typescript
// apps/desktop/src/preload/index.ts

import { contextBridge, ipcRenderer } from 'electron';

export const electronAPI = {
  // Auth
  login: (email: string, password: string) =>
    ipcRenderer.invoke('auth:login', email, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getToken: () => ipcRenderer.invoke('auth:get-token'),

  // Device / WS status
  getConnectionStatus: () => ipcRenderer.invoke('device:get-status'),
  getDeviceInfo: () => ipcRenderer.invoke('device:get-info'),
  getCommandLog: () => ipcRenderer.invoke('device:get-command-log'),

  // Event listeners (main → renderer)
  onConnectionStatusChanged: (callback: (status: string) => void) => {
    ipcRenderer.on('device:status-changed', (_event, status) => callback(status));
  },
  onCommandReceived: (callback: (entry: unknown) => void) => {
    ipcRenderer.on('device:command-received', (_event, entry) => callback(entry));
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
```

### Login.tsx（渲染进程）

```tsx
// apps/desktop/src/renderer/pages/Login.tsx

import { useState, type FormEvent } from 'react';

interface LoginResult {
  success: boolean;
  error?: string;
  user?: { id: string; username: string; displayName: string };
}

interface LoginProps {
  onLoginSuccess: () => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result: LoginResult = await window.electronAPI.login(email, password);

    if (result.success) {
      onLoginSuccess();
    } else {
      setError(result.error || '登录失败');
    }
    setLoading(false);
  };

  return (
    <div className="login-container">
      <h1>LinkingChat</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email">邮箱</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="password">密码</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </div>
  );
}
```

---

## 2.3 WebSocket 客户端

主进程中创建 Socket.IO 客户端，连接 Cloud Brain `/device` 命名空间。JWT 通过 `auth.token` 传递。自动重连。

### ws-client.service.ts（核心服务）

```typescript
// apps/desktop/src/main/services/ws-client.service.ts

import { io, type Socket } from 'socket.io-client';
import { BrowserWindow } from 'electron';
import os from 'os';
import { AuthStore } from './auth-store.service';
import { CommandExecutor } from './command-executor.service';
import { isDangerousCommand } from '../utils/command-blacklist';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  DeviceCommandPayload,
  DeviceResultPayload,
  WsEnvelope,
} from '@linkingchat/ws-protocol';

type DeviceSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface CommandLogEntry {
  commandId: string;
  action: string;
  type: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'blocked';
  output?: string;
  exitCode?: number;
  executionTimeMs?: number;
  receivedAt: string;
  completedAt?: string;
}

export class WsClientService {
  private socket: DeviceSocket | null = null;
  private mainWindow: BrowserWindow | null = null;
  private commandLog: CommandLogEntry[] = [];
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private executor = new CommandExecutor();

  // 稳定设备 ID：使用 hostname + platform 的 hash，或持久化存储
  private deviceId: string;
  private deviceName: string;
  private platform: 'darwin' | 'win32' | 'linux';

  constructor() {
    this.deviceName = os.hostname();
    this.platform = os.platform() as 'darwin' | 'win32' | 'linux';
    // Sprint 1 简化方案：用 hostname 作为 deviceId
    // 正式版应使用 machine-id 或持久化 cuid
    this.deviceId = `device-${this.deviceName}-${this.platform}`;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  getStatus(): string {
    return this.connectionStatus;
  }

  getDeviceInfo() {
    return {
      deviceId: this.deviceId,
      name: this.deviceName,
      platform: this.platform,
    };
  }

  getCommandLog(): CommandLogEntry[] {
    return this.commandLog;
  }

  /**
   * 连接到 Cloud Brain /device 命名空间
   */
  connect(): void {
    const tokens = AuthStore.load();
    if (!tokens) {
      console.error('[WS] No JWT token found, cannot connect');
      return;
    }

    const WS_URL = process.env.WS_URL || 'http://localhost:3008';

    this.updateStatus('connecting');

    this.socket = io(`${WS_URL}/device`, {
      auth: {
        token: tokens.accessToken,
        deviceId: this.deviceId,
        deviceType: 'desktop',
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
    });

    this.setupEventListeners();
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.updateStatus('disconnected');
  }

  // ─────────────────────────────────────────────
  // 事件监听
  // ─────────────────────────────────────────────

  private setupEventListeners(): void {
    if (!this.socket) return;

    // 连接成功
    this.socket.on('connect', () => {
      console.log('[WS] Connected to Cloud Brain');
      this.updateStatus('connected');
      this.registerDevice();
    });

    // 连接断开
    this.socket.on('disconnect', (reason) => {
      console.log('[WS] Disconnected:', reason);
      this.updateStatus('disconnected');
    });

    // 连接错误
    this.socket.on('connect_error', (err) => {
      console.error('[WS] Connection error:', err.message);
      this.updateStatus('disconnected');
    });

    // 接收命令执行指令（核心流程）
    this.socket.on('device:command:execute', (data: DeviceCommandPayload) => {
      this.handleCommandExecute(data);
    });

    // 系统错误
    this.socket.on('system:error', (err) => {
      console.error('[WS] System error:', err.code, err.message);
    });
  }

  // ─────────────────────────────────────────────
  // 2.4 设备注册
  // ─────────────────────────────────────────────

  private registerDevice(): void {
    if (!this.socket) return;

    this.socket.emit(
      'device:register',
      {
        deviceId: this.deviceId,
        name: this.deviceName,
        platform: this.platform,
      },
      (response) => {
        if (response.success) {
          console.log('[WS] Device registered successfully');
        } else {
          console.error('[WS] Device registration failed:', response.error);
        }
      },
    );
  }

  // ─────────────────────────────────────────────
  // 2.5 命令接收 + Shell 执行
  // ─────────────────────────────────────────────

  private async handleCommandExecute(data: DeviceCommandPayload): Promise<void> {
    const logEntry: CommandLogEntry = {
      commandId: data.commandId,
      action: data.action,
      type: data.type,
      status: 'pending',
      receivedAt: new Date().toISOString(),
    };

    // 2.6 客户端侧黑名单检查（defense-in-depth，服务端已有一层）
    if (isDangerousCommand(data.action)) {
      logEntry.status = 'blocked';
      logEntry.output = '[BLOCKED] 危险命令被客户端拦截';
      this.addCommandLog(logEntry);

      this.emitResult({
        commandId: data.commandId,
        status: 'error',
        error: { code: 'COMMAND_BLOCKED', message: '客户端拦截: 危险命令' },
        executionTimeMs: 0,
      });
      return;
    }

    // Sprint 1 仅处理 shell 类型
    if (data.type !== 'shell') {
      logEntry.status = 'error';
      logEntry.output = `[ERROR] 不支持的命令类型: ${data.type}`;
      this.addCommandLog(logEntry);

      this.emitResult({
        commandId: data.commandId,
        status: 'error',
        error: { code: 'UNSUPPORTED_TYPE', message: `Sprint 1 仅支持 shell 类型` },
        executionTimeMs: 0,
      });
      return;
    }

    // 执行命令
    logEntry.status = 'running';
    this.addCommandLog(logEntry);

    const result = await this.executor.execute(data.action, data.timeout);

    // 更新日志
    logEntry.status = result.status === 'success' ? 'success' : 'error';
    logEntry.output = result.data?.output;
    logEntry.exitCode = result.data?.exitCode;
    logEntry.executionTimeMs = result.executionTimeMs;
    logEntry.completedAt = new Date().toISOString();
    this.updateLastCommandLog(logEntry);

    // 2.7 回报结果
    this.emitResult({
      commandId: data.commandId,
      status: result.status,
      data: result.data,
      error: result.error,
      executionTimeMs: result.executionTimeMs,
    });
  }

  // ─────────────────────────────────────────────
  // 2.7 结果回报
  // ─────────────────────────────────────────────

  private emitResult(result: DeviceResultPayload): void {
    if (!this.socket) return;

    const envelope: WsEnvelope<DeviceResultPayload> = {
      requestId: result.commandId, // 复用 commandId 作为 requestId
      timestamp: new Date().toISOString(),
      data: result,
    };

    this.socket.emit('device:result:complete', envelope);
    console.log(`[WS] Result sent for command ${result.commandId}: ${result.status}`);
  }

  // ─────────────────────────────────────────────
  // IPC 通知渲染进程
  // ─────────────────────────────────────────────

  private updateStatus(status: 'disconnected' | 'connecting' | 'connected'): void {
    this.connectionStatus = status;
    this.mainWindow?.webContents.send('device:status-changed', status);
  }

  private addCommandLog(entry: CommandLogEntry): void {
    this.commandLog.unshift(entry);
    // 只保留最近 100 条
    if (this.commandLog.length > 100) {
      this.commandLog = this.commandLog.slice(0, 100);
    }
    this.mainWindow?.webContents.send('device:command-received', entry);
  }

  private updateLastCommandLog(entry: CommandLogEntry): void {
    const idx = this.commandLog.findIndex((e) => e.commandId === entry.commandId);
    if (idx !== -1) {
      this.commandLog[idx] = entry;
    }
    this.mainWindow?.webContents.send('device:command-received', entry);
  }
}
```

---

## 2.4 设备注册

在 WS 连接成功后自动触发。使用 `os.hostname()` 和 `os.platform()` 获取设备信息。

设备注册逻辑已集成在上面的 `ws-client.service.ts` 中的 `registerDevice()` 方法。

关于 **deviceId 生成策略**：

| 方案 | 说明 | Sprint 1 |
|------|------|---------|
| `os.hostname()` 拼接 | 简单但不够稳定（用户可改主机名） | 使用此方案 |
| `machine-id` 包 | 读取操作系统机器 ID，跨重启稳定 | Sprint 2 迁移 |
| 持久化 cuid | 首次生成后存入 electron-store | Sprint 2 迁移 |

> Sprint 1 先用简单拼接方案。Sprint 2 再切换到 `machine-id` 或持久化 cuid。

---

## 2.5 命令接收 + Shell 执行

监听 `device:command:execute` 事件，使用 `child_process.exec()` 执行 Shell 命令。

### command-executor.service.ts

```typescript
// apps/desktop/src/main/services/command-executor.service.ts

import { exec } from 'child_process';

export interface CommandResult {
  status: 'success' | 'error';
  data?: {
    output?: string;
    exitCode?: number;
  };
  error?: {
    code: string;
    message: string;
  };
  executionTimeMs: number;
}

export class CommandExecutor {
  private static readonly DEFAULT_TIMEOUT = 30_000;  // 30 秒
  private static readonly MAX_OUTPUT_SIZE = 1024 * 512; // 512 KB

  /**
   * 执行 Shell 命令
   *
   * @param command - 要执行的命令字符串
   * @param timeout - 超时时间（ms），默认 30 秒
   * @returns 执行结果
   */
  async execute(
    command: string,
    timeout = CommandExecutor.DEFAULT_TIMEOUT,
  ): Promise<CommandResult> {
    const startTime = Date.now();

    return new Promise<CommandResult>((resolve) => {
      exec(
        command,
        {
          timeout,
          maxBuffer: CommandExecutor.MAX_OUTPUT_SIZE,
          // 在 Windows 上使用 cmd.exe，在 macOS/Linux 上使用 /bin/sh
          shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
        },
        (error, stdout, stderr) => {
          const executionTimeMs = Date.now() - startTime;

          if (error) {
            // 超时
            if (error.killed) {
              resolve({
                status: 'error',
                error: {
                  code: 'COMMAND_TIMEOUT',
                  message: `命令执行超时 (${timeout}ms)`,
                },
                data: {
                  output: stdout || stderr || undefined,
                  exitCode: error.code ?? 1,
                },
                executionTimeMs,
              });
              return;
            }

            // 命令执行失败（非零退出码）
            resolve({
              status: 'error',
              data: {
                output: stderr || stdout || error.message,
                exitCode: error.code ?? 1,
              },
              error: {
                code: 'EXEC_ERROR',
                message: error.message,
              },
              executionTimeMs,
            });
            return;
          }

          // 成功
          resolve({
            status: 'success',
            data: {
              output: stdout || '(no output)',
              exitCode: 0,
            },
            executionTimeMs,
          });
        },
      );
    });
  }
}
```

### 关键设计说明

- **超时控制**：默认 30 秒，由服务端 `DeviceCommandPayload.timeout` 字段传入，最大 300 秒。
- **输出截断**：`maxBuffer` 限制 512 KB，避免大输出撑爆内存。
- **跨平台 Shell**：Windows 用 `cmd.exe`，macOS/Linux 用 `/bin/sh`。
- **Sprint 1 限制**：仅支持 `type: 'shell'`。`file` 和 `automation` 类型在 Sprint 2 对接 OpenClaw 后实现。

---

## 2.6 黑名单检查（客户端侧）

作为 **defense-in-depth（纵深防御）** 的第二层检查。服务端的 Device Gateway 已有一层黑名单拦截（见 sprint-1-plan.md §4.4），客户端再加一层。

```typescript
// apps/desktop/src/main/utils/command-blacklist.ts

/**
 * 客户端侧危险命令黑名单
 *
 * 注意：服务端 Device Gateway 已有一层检查（权威源）。
 * 客户端检查仅作为 defense-in-depth，防止服务端遗漏。
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  // 文件系统破坏
  /^rm\s+(-rf?|--recursive)\s+\//,
  /^rm\s+-rf?\s+~/,
  /^format\s/i,
  /^mkfs\./,
  /^dd\s+if=/,

  // Fork bomb
  /^:\(\)\{.*\|.*&\s*\}\s*;/,

  // 系统关机/重启
  /shutdown|reboot|halt|poweroff/i,

  // 危险权限变更
  /^chmod\s+(-R\s+)?777\s+\//,
  /^chown\s+(-R\s+)?.*\s+\//,

  // Windows 特有
  /^del\s+\/s\s+\/q\s+[a-z]:\\/i,
  /^rd\s+\/s\s+\/q\s+[a-z]:\\/i,
];

export function isDangerousCommand(action: string): boolean {
  const trimmed = action.trim();
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(trimmed));
}
```

> 此任务为 **可选**。如果时间紧张，可跳过。服务端检查是必须的，客户端检查是锦上添花。

---

## 2.7 结果回报

命令执行完成后，通过 `device:result:complete` 事件将结果发回 Cloud Brain。Cloud Brain 负责：

1. 更新 `commands` 表中的 `status` 和 `result`
2. 通过 `device:result:delivered` 转发给手机端

结果回报逻辑已集成在 `ws-client.service.ts` 中的 `emitResult()` 方法。

### 回报数据格式

```typescript
// 使用 WsEnvelope 包裹 DeviceResultPayload
const envelope: WsEnvelope<DeviceResultPayload> = {
  requestId: commandId,
  timestamp: new Date().toISOString(),
  data: {
    commandId: 'cmd_xxx',
    status: 'success',       // 'success' | 'error' | 'partial' | 'cancelled'
    data: {
      output: 'total 48\ndrwxr-xr-x  12 user  staff  384 Feb 14 10:30 .\n...',
      exitCode: 0,
    },
    executionTimeMs: 127,
  },
};
```

---

## 2.8 最小 UI

主窗口显示三个区域：连接状态、设备信息、命令日志。

### device.ipc.ts（IPC handler）

```typescript
// apps/desktop/src/main/ipc/device.ipc.ts

import { ipcMain } from 'electron';
import type { WsClientService } from '../services/ws-client.service';

export function registerDeviceIpc(wsClient: WsClientService): void {
  ipcMain.handle('device:get-status', () => {
    return wsClient.getStatus();
  });

  ipcMain.handle('device:get-info', () => {
    return wsClient.getDeviceInfo();
  });

  ipcMain.handle('device:get-command-log', () => {
    return wsClient.getCommandLog();
  });
}
```

### main/index.ts（主进程入口）

```typescript
// apps/desktop/src/main/index.ts

import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { registerAuthIpc } from './ipc/auth.ipc';
import { registerDeviceIpc } from './ipc/device.ipc';
import { WsClientService } from './services/ws-client.service';
import { AuthStore } from './services/auth-store.service';

let mainWindow: BrowserWindow | null = null;
const wsClient = new WsClientService();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    title: 'LinkingChat',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  wsClient.setMainWindow(mainWindow);

  // electron-vite: 开发模式用 dev server，生产模式用打包文件
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // 注册 IPC handlers
  registerAuthIpc();
  registerDeviceIpc(wsClient);

  createWindow();

  // 如果已有存储的 token，自动连接
  const tokens = AuthStore.load();
  if (tokens) {
    wsClient.connect();
  }
});

app.on('window-all-closed', () => {
  wsClient.disconnect();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

### App.tsx（渲染进程路由）

```tsx
// apps/desktop/src/renderer/App.tsx

import { useState, useEffect } from 'react';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';

export function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // 检查是否已有 token（自动登录）
    window.electronAPI.getToken().then((token: string | null) => {
      if (token) setIsLoggedIn(true);
    });
  }, []);

  if (!isLoggedIn) {
    return <Login onLoginSuccess={() => setIsLoggedIn(true)} />;
  }

  return <Dashboard onLogout={() => setIsLoggedIn(false)} />;
}
```

### Dashboard.tsx（主界面）

```tsx
// apps/desktop/src/renderer/pages/Dashboard.tsx

import { useState, useEffect } from 'react';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { CommandLog } from '../components/CommandLog';

interface DeviceInfo {
  deviceId: string;
  name: string;
  platform: string;
}

interface CommandLogEntry {
  commandId: string;
  action: string;
  type: string;
  status: string;
  output?: string;
  exitCode?: number;
  executionTimeMs?: number;
  receivedAt: string;
  completedAt?: string;
}

interface DashboardProps {
  onLogout: () => void;
}

export function Dashboard({ onLogout }: DashboardProps) {
  const [status, setStatus] = useState<string>('disconnected');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [commandLog, setCommandLog] = useState<CommandLogEntry[]>([]);

  useEffect(() => {
    // 初始化：获取当前状态
    window.electronAPI.getConnectionStatus().then(setStatus);
    window.electronAPI.getDeviceInfo().then(setDeviceInfo);
    window.electronAPI.getCommandLog().then(setCommandLog);

    // 监听状态变化
    window.electronAPI.onConnectionStatusChanged((newStatus: string) => {
      setStatus(newStatus);
    });

    // 监听新命令
    window.electronAPI.onCommandReceived((entry: unknown) => {
      setCommandLog((prev) => {
        const typedEntry = entry as CommandLogEntry;
        const existingIdx = prev.findIndex(
          (e) => e.commandId === typedEntry.commandId,
        );
        if (existingIdx !== -1) {
          // 更新已有记录
          const updated = [...prev];
          updated[existingIdx] = typedEntry;
          return updated;
        }
        // 新记录插入到顶部
        return [typedEntry, ...prev];
      });
    });
  }, []);

  const handleLogout = async () => {
    await window.electronAPI.logout();
    onLogout();
  };

  return (
    <div className="dashboard">
      {/* 顶栏 */}
      <header className="dashboard-header">
        <h1>LinkingChat Desktop</h1>
        <button onClick={handleLogout}>登出</button>
      </header>

      {/* 连接状态 + 设备信息 */}
      <ConnectionStatus status={status} deviceInfo={deviceInfo} />

      {/* 命令日志 */}
      <CommandLog entries={commandLog} />
    </div>
  );
}
```

### ConnectionStatus.tsx

```tsx
// apps/desktop/src/renderer/components/ConnectionStatus.tsx

interface DeviceInfo {
  deviceId: string;
  name: string;
  platform: string;
}

interface ConnectionStatusProps {
  status: string;
  deviceInfo: DeviceInfo | null;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  connected: { label: '已连接', color: '#4caf50' },
  connecting: { label: '连接中...', color: '#ff9800' },
  disconnected: { label: '未连接', color: '#f44336' },
};

export function ConnectionStatus({ status, deviceInfo }: ConnectionStatusProps) {
  const { label, color } = STATUS_MAP[status] || STATUS_MAP.disconnected;

  return (
    <section className="connection-status">
      <div className="status-indicator">
        <span
          className="status-dot"
          style={{ backgroundColor: color }}
        />
        <span className="status-label">{label}</span>
      </div>

      {deviceInfo && (
        <div className="device-info">
          <p><strong>设备名称：</strong>{deviceInfo.name}</p>
          <p><strong>平台：</strong>{deviceInfo.platform}</p>
          <p><strong>设备 ID：</strong><code>{deviceInfo.deviceId}</code></p>
        </div>
      )}
    </section>
  );
}
```

### CommandLog.tsx

```tsx
// apps/desktop/src/renderer/components/CommandLog.tsx

interface CommandLogEntry {
  commandId: string;
  action: string;
  type: string;
  status: string;
  output?: string;
  exitCode?: number;
  executionTimeMs?: number;
  receivedAt: string;
  completedAt?: string;
}

interface CommandLogProps {
  entries: CommandLogEntry[];
}

const STATUS_STYLE: Record<string, { emoji: string; className: string }> = {
  pending:  { emoji: '[ ]', className: 'status-pending' },
  running:  { emoji: '[~]', className: 'status-running' },
  success:  { emoji: '[v]', className: 'status-success' },
  error:    { emoji: '[x]', className: 'status-error' },
  blocked:  { emoji: '[!]', className: 'status-blocked' },
};

export function CommandLog({ entries }: CommandLogProps) {
  if (entries.length === 0) {
    return (
      <section className="command-log">
        <h2>命令日志</h2>
        <p className="empty-state">暂无命令记录。等待手机端发送命令...</p>
      </section>
    );
  }

  return (
    <section className="command-log">
      <h2>命令日志 ({entries.length})</h2>
      <div className="log-list">
        {entries.map((entry) => {
          const style = STATUS_STYLE[entry.status] || STATUS_STYLE.pending;
          return (
            <div key={entry.commandId} className={`log-entry ${style.className}`}>
              <div className="log-header">
                <span className="log-status">{style.emoji}</span>
                <code className="log-action">{entry.action}</code>
                {entry.executionTimeMs != null && (
                  <span className="log-time">{entry.executionTimeMs}ms</span>
                )}
              </div>
              {entry.output && (
                <pre className="log-output">{entry.output}</pre>
              )}
              <div className="log-meta">
                <span>ID: {entry.commandId.slice(0, 8)}...</span>
                <span>
                  {new Date(entry.receivedAt).toLocaleTimeString()}
                </span>
                {entry.exitCode != null && (
                  <span>Exit: {entry.exitCode}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

---

## IPC 通信模式总览

主进程和渲染进程通过 `contextBridge` + `ipcMain/ipcRenderer` 安全通信。渲染进程无法直接访问 Node.js API。

```
渲染进程 (React)                     preload (contextBridge)              主进程 (Node.js)
  │                                       │                                   │
  ├── window.electronAPI.login() ────────>│── ipcRenderer.invoke ────────────>│ auth.ipc.ts
  │                                       │                                   │   └── fetch POST /auth/login
  │                                       │                                   │   └── AuthStore.save()
  │<── Promise<LoginResult> ─────────────│<── return ────────────────────────│
  │                                       │                                   │
  │                                       │                                   │ (WS event received)
  │                                       │                                   │   └── handleCommandExecute()
  │                                       │                                   │   └── CommandExecutor.execute()
  │<── onCommandReceived(callback) ──────│<── ipcRenderer.on ───────────────│   └── mainWindow.webContents.send()
```

**原则**：

1. 所有网络请求（HTTP、WebSocket）在**主进程**中进行
2. 渲染进程通过 `ipcRenderer.invoke()` 请求数据（请求-响应）
3. 主进程通过 `webContents.send()` 推送事件到渲染进程（单向推送）
4. `preload/index.ts` 作为桥梁，只暴露白名单 API

---

## TypeScript 类型声明

为 `window.electronAPI` 添加类型，让渲染进程有完整的类型补全。

```typescript
// apps/desktop/src/renderer/env.d.ts

interface ElectronAPI {
  // Auth
  login: (email: string, password: string) => Promise<{
    success: boolean;
    error?: string;
    user?: { id: string; username: string; displayName: string };
  }>;
  logout: () => Promise<{ success: boolean }>;
  getToken: () => Promise<string | null>;

  // Device
  getConnectionStatus: () => Promise<string>;
  getDeviceInfo: () => Promise<{
    deviceId: string;
    name: string;
    platform: string;
  }>;
  getCommandLog: () => Promise<Array<{
    commandId: string;
    action: string;
    type: string;
    status: string;
    output?: string;
    exitCode?: number;
    executionTimeMs?: number;
    receivedAt: string;
    completedAt?: string;
  }>>;

  // Events (main → renderer)
  onConnectionStatusChanged: (callback: (status: string) => void) => void;
  onCommandReceived: (callback: (entry: unknown) => void) => void;
}

interface Window {
  electronAPI: ElectronAPI;
}
```

---

## 完成标准

- [ ] Electron 窗口正常启动，显示登录表单
- [ ] 输入邮箱/密码，调用 `POST /api/v1/auth/login`，登录成功
- [ ] JWT token 通过 `electron-store` + `safeStorage` 安全存储
- [ ] 登录后自动连接 WebSocket `/device` 命名空间
- [ ] 连接成功后自动 emit `device:register`，携带 deviceId / name / platform
- [ ] 收到 `device:command:execute` 事件后，使用 `child_process.exec()` 执行 shell 命令
- [ ] 执行完成后 emit `device:result:complete`，携带 output / exitCode / executionTimeMs
- [ ] UI 实时显示连接状态（已连接 / 连接中 / 未连接）
- [ ] UI 显示设备信息（主机名、平台）
- [ ] UI 显示命令日志（可滚动列表，包含命令内容、状态、输出、耗时）
- [ ] 窗口关闭时正确断开 WebSocket 连接
