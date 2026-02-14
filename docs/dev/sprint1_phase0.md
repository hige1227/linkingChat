# Sprint 1 — Phase 0：共享类型定义

> **负责人**：后端开发者
>
> **前置条件**：Sprint 0 已完成，packages/shared 和 packages/ws-protocol 骨架已初始化
>
> **产出**：所有三端（Server / Desktop / Mobile）共享的类型定义

---

## 任务清单

| # | 任务 | 文件 | 依赖 |
|---|------|------|------|
| 0.1 | 定义 WS 基础类型 | `packages/ws-protocol/src/envelope.ts` | - |
| 0.2 | 定义设备控制事件名常量 | `packages/ws-protocol/src/events.ts` | - |
| 0.3 | 定义设备控制 Payload 类型 | `packages/ws-protocol/src/payloads/device.payloads.ts` | 0.1 |
| 0.4 | 定义 TypedSocket 接口 | `packages/ws-protocol/src/typed-socket.ts` | 0.2, 0.3 |
| 0.5 | 定义 Zod schemas | `packages/shared/src/schemas/` | - |
| 0.6 | 导出 + 编译验证 | index.ts + `pnpm build` | 全部 |

---

## 0.1 WS 基础类型

```typescript
// packages/ws-protocol/src/envelope.ts

export interface WsEnvelope<T> {
  requestId: string;       // cuid
  timestamp: string;       // ISO 8601
  data: T;
}

export interface WsResponse<T = unknown> {
  requestId?: string;
  success: boolean;
  data?: T;
  error?: WsError;
  timestamp: string;
}

export interface WsError {
  code: string;            // AUTH_EXPIRED, DEVICE_OFFLINE, COMMAND_TIMEOUT, etc.
  message: string;
}
```

## 0.2 事件名常量

```typescript
// packages/ws-protocol/src/events.ts

export const DEVICE_EVENTS = {
  // Client → Server
  REGISTER:        'device:register',
  HEARTBEAT:       'device:heartbeat',
  COMMAND_SEND:    'device:command:send',
  COMMAND_CANCEL:  'device:command:cancel',
  RESULT_COMPLETE: 'device:result:complete',
  RESULT_PROGRESS: 'device:result:progress',

  // Server → Client
  COMMAND_EXECUTE:  'device:command:execute',
  COMMAND_ACK:      'device:command:ack',
  RESULT_DELIVERED: 'device:result:delivered',
  RESULT_PROGRESS_FWD: 'device:result:progress',  // 与 Client→Server 同名，Socket.IO 按方向区分
  STATUS_CHANGED:   'device:status:changed',
} as const;
```

## 0.3 设备控制 Payload 类型

```typescript
// packages/ws-protocol/src/payloads/device.payloads.ts

export interface DeviceRegisterPayload {
  deviceId: string;
  name: string;
  platform: 'darwin' | 'win32' | 'linux';
  capabilities?: string[];
}

export interface DeviceHeartbeatPayload {
  deviceId: string;
  cpuUsage?: number;
  memoryUsage?: number;
}

export interface DeviceCommandPayload {
  commandId: string;
  targetDeviceId: string;
  type: 'shell' | 'file' | 'automation';
  action: string;                 // e.g. "ls -la /tmp"
  args?: Record<string, unknown>;
  timeout?: number;               // ms, default 30000
}

export interface DeviceResultPayload {
  commandId: string;
  status: 'success' | 'error' | 'partial' | 'cancelled';
  data?: {
    output?: string;
    exitCode?: number;
  };
  error?: { code: string; message: string };
  executionTimeMs: number;
}

export interface DeviceStatusPayload {
  deviceId: string;
  name: string;
  platform: 'darwin' | 'win32' | 'linux';
  online: boolean;
  lastSeenAt: string;
}
```

## 0.4 TypedSocket 接口

```typescript
// packages/ws-protocol/src/typed-socket.ts

import type { Server, Socket } from 'socket.io';
import type { WsResponse, WsEnvelope } from './envelope';
import type {
  DeviceRegisterPayload,
  DeviceHeartbeatPayload,
  DeviceCommandPayload,
  DeviceResultPayload,
  DeviceStatusPayload,
} from './payloads/device.payloads';

export interface SocketData {
  userId: string;
  username: string;
  deviceId?: string;
  deviceType: 'mobile' | 'desktop' | 'web';
}

export interface ClientToServerEvents {
  'device:register':        (data: DeviceRegisterPayload, ack: (res: WsResponse) => void) => void;
  'device:heartbeat':       (data: DeviceHeartbeatPayload) => void;  // fire-and-forget，无 ack
  'device:command:send':    (data: WsEnvelope<DeviceCommandPayload>, ack: (res: WsResponse) => void) => void;
  'device:command:cancel':  (data: { commandId: string }, ack: (res: WsResponse) => void) => void;
  'device:result:complete': (data: WsEnvelope<DeviceResultPayload>) => void;  // fire-and-forget，无 ack
  'device:result:progress': (data: { commandId: string; progress: number; output?: string }) => void;
}

export interface ServerToClientEvents {
  'device:command:execute':  (data: DeviceCommandPayload) => void;
  'device:command:ack':      (data: { commandId: string; status: string }) => void;
  'device:result:delivered': (data: DeviceResultPayload) => void;
  'device:result:progress':  (data: { commandId: string; progress: number; output?: string }) => void;
  'device:status:changed':   (data: DeviceStatusPayload) => void;
  'system:error':            (data: { code: string; message: string }) => void;
}

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;
export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;
```

## 0.5 Zod Schemas

```typescript
// packages/shared/src/schemas/user.schema.ts
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(100),
  displayName: z.string().min(1).max(50),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// packages/shared/src/schemas/device.schema.ts
export const deviceCommandSchema = z.object({
  targetDeviceId: z.string(),
  type: z.enum(['shell', 'file', 'automation']),
  action: z.string().min(1).max(10000),
  timeout: z.number().min(1000).max(300000).optional(),
});
```

## 0.6 导出 + 编译验证

确保 `packages/ws-protocol/src/index.ts` 和 `packages/shared/src/index.ts` 导出所有内容。

```bash
cd <project-root>
pnpm build
# ✅ packages/shared 和 packages/ws-protocol 编译无错误
```

---

## 完成标准

- [ ] `pnpm build` 全部通过
- [ ] Server 项目可以 `import { DEVICE_EVENTS } from '@linkingchat/ws-protocol'`
- [ ] TypedSocket 类型在 IDE 中有完整的事件名和 payload 补全
