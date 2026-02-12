# WebSocket 协议设计

> 基于 NestJS + Socket.IO，双命名空间（/chat + /device），JWT RS256 认证，Redis 适配器
>
> 权威来源：[reference-architecture-guide.md](./reference-architecture-guide.md) §二、§十一
>
> 旧版已归档至 `_archive/websocket-protocol.md`

---

## 一、协议概览

```
Flutter/RN App   <--WSS-->  Cloud Brain (NestJS)  <--WSS-->  Electron Desktop
  (Mobile)                    ├── /chat namespace              ├── Social UI
  ├── Social UI               │   └── Redis Pub/Sub            ├── /chat client
  ├── /chat client            ├── /device namespace            ├── /device client
  └── /device client          │   └── Redis Pub/Sub            └── OpenClaw Worker
                              └── BroadcastService (@Global)
```

### 设计原则

1. **REST-First Mutations**: 所有数据变更走 REST API，WebSocket 仅用于广播事件
2. **双命名空间**: `/chat` 和 `/device` 隔离，各自独立连接和认证
3. **标准 Envelope**: 所有 payload 使用统一信封格式
4. **Acknowledgement**: 需要确认的操作使用 Socket.IO callback
5. **命名规范**: `resource:action` 格式
6. **JWT RS256**: 非对称密钥认证，access token 短期 + refresh token 长期

---

## 二、连接与认证

### 2.1 连接方式

```typescript
// 客户端连接示例
const chatSocket = io('wss://api.linkingchat.com/chat', {
  auth: {
    token: jwtAccessToken,      // RS256 签名的 JWT
    deviceType: 'mobile',       // 'mobile' | 'desktop' | 'web'
  },
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000,
});

const deviceSocket = io('wss://api.linkingchat.com/device', {
  auth: {
    token: jwtAccessToken,
    deviceId: 'device-cuid',
    deviceType: 'desktop',
  },
  transports: ['websocket'],
});
```

### 2.2 JWT RS256 认证中间件

```typescript
// 认证流程（RS256 非对称密钥）
// 1. 客户端在 handshake.auth.token 中携带 JWT
// 2. 中间件用 RS256 公钥验证签名 + 过期时间
// 3. 从 token payload 提取 userId
// 4. 将用户信息挂载到 socket.data
// 5. 验证失败 → next(new Error('...'))，Socket.IO 自动断开
```

```typescript
// RS256 密钥对：
// - 私钥：签发 token（仅 auth service 持有）
// - 公钥：验证 token（所有服务可持有，包括 WS 中间件）
// - 好处：微服务拆分时 WS 网关无需持有私钥
```

### 2.3 连接后自动加入房间

```typescript
handleConnection(client: TypedSocket) {
  const userId = client.data.userId;
  const deviceId = client.handshake.auth?.deviceId;

  // 个人房间：好友请求、通知等
  client.join(`u-${userId}`);

  // 设备房间（仅 /device 命名空间）
  if (deviceId) {
    client.join(`d-${deviceId}`);
  }
}
```

---

## 三、房间策略

| 房间类型 | 命名格式 | 命名空间 | 用途 |
|---------|---------|---------|------|
| 用户房间 | `u-{userId}` | /chat + /device | 个人事件：好友请求、设备状态、通知 |
| 会话房间 | `{converseId}` | /chat | 消息事件：新消息、撤回、已读、输入中 |
| 群组房间 | `g-{groupId}` | /chat | 群组级事件：成员变更、频道 CRUD |
| 设备房间 | `d-{deviceId}` | /device | 设备命令：command.execute 发送到特定设备 |

> 房间命名学 Tailchat 短格式（`u-`, `g-`），而非旧设计的 `user:`, `conversation:` 长格式。

### 房间生命周期

```
用户连接    → 自动加入 u-{userId}
用户打开会话 → 客户端 emit converse:join → 加入 {converseId}
用户离开会话 → 客户端 emit converse:leave → 离开 {converseId}
用户断开连接 → Socket.IO 自动从所有房间移除
```

---

## 四、标准 Payload 格式

### 4.1 请求信封

```typescript
interface WsEnvelope<T> {
  requestId: string;       // cuid, 关联请求和响应
  timestamp: string;       // ISO 8601
  data: T;                 // 业务数据
}
```

### 4.2 响应信封

```typescript
interface WsResponse<T> {
  requestId?: string;      // 关联的请求 ID
  success: boolean;
  data?: T;                // 成功时的数据
  error?: WsError;         // 失败时的错误
  timestamp: string;
}

interface WsError {
  code: string;            // 机器可读: AUTH_EXPIRED, DEVICE_OFFLINE, COMMAND_TIMEOUT
  message: string;         // 人类可读
}
```

---

## 五、/chat 命名空间 — 事件清单

### 5.1 客户端 → 服务端 (12 事件)

| 事件名 | Payload | ACK | 说明 |
|--------|---------|-----|------|
| `converse:join` | `{ converseId }` | - | 加入会话房间 |
| `converse:leave` | `{ converseId }` | - | 离开会话房间 |
| `message:typing` | `{ converseId, isTyping }` | - | 输入状态 |
| `message:read` | `{ converseId, lastSeenMessageId }` | - | 标记已读 (游标) |
| `presence:update` | `{ status }` | - | 在线状态变更 |
| `ai:draft:approve` | `{ draftId }` | `WsResponse` | 批准 AI 草稿 |
| `ai:draft:reject` | `{ draftId, reason? }` | - | 拒绝草稿 |
| `ai:draft:edit` | `{ draftId, editedContent }` | `WsResponse` | 编辑后批准 |
| `ai:predictive:execute` | `{ suggestionId, actionIndex }` | `WsResponse` | 执行预测动作 |
| `ai:predictive:dismiss` | `{ suggestionId }` | - | 忽略预测 |
| `ai:whisper:select` | `{ suggestionId, selectedIndex }` | - | 选择耳语建议 |
| `user:ping` | `{}` | - | 保活心跳 |

> **注意**: `message:send`, `message:recall` 等变更操作通过 REST API 完成。REST handler 内部调用 BroadcastService 推送事件。

### 5.2 服务端 → 客户端 (24 事件)

| 事件名 | Payload | Target | 触发条件 |
|--------|---------|--------|---------|
| **消息** | | | |
| `message:new` | `MessageResponse` | `{converseId}` | REST: POST /messages |
| `message:updated` | `MessageResponse` | `{converseId}` | REST: PATCH /messages/:id |
| `message:deleted` | `{ messageId, converseId }` | `{converseId}` | REST: DELETE /messages/:id (软删除) |
| `message:typing` | `{ converseId, userId, isTyping }` | `{converseId}` | WS: message:typing |
| `message:read` | `{ converseId, userId, lastSeenMessageId }` | `{converseId}` | WS: message:read |
| **会话** | | | |
| `converse:new` | `ConverseResponse` | `u-{userId}` (各成员) | REST: 创建 DM/群组 |
| `converse:updated` | `ConverseResponse` | `u-{userId}` (各成员) | REST: 更新会话 |
| **好友** | | | |
| `friend:request` | `FriendRequestPayload` | `u-{receiverId}` | REST: POST /friends/request |
| `friend:accepted` | `FriendPayload` | `u-{userId}` (双方) | REST: POST /friends/accept |
| `friend:removed` | `{ userId }` | `u-{userId}` (双方) | REST: DELETE /friends/:id |
| **群组** | | | |
| `group:new` | `GroupResponse` | `u-{userId}` | 被邀请加入群组 |
| `group:updated` | `GroupResponse` | `g-{groupId}` | REST: PATCH /groups/:id |
| `group:deleted` | `{ groupId }` | `g-{groupId}` | REST: DELETE /groups/:id |
| `group:member:joined` | `MemberPayload` | `g-{groupId}` | 新成员加入 |
| `group:member:left` | `{ userId, groupId }` | `g-{groupId}` | 成员离开 |
| `channel:new` | `ChannelResponse` | `g-{groupId}` | REST: POST /groups/:id/channels |
| `channel:updated` | `ChannelResponse` | `g-{groupId}` | REST: PATCH /channels/:id |
| `channel:deleted` | `{ channelId }` | `g-{groupId}` | REST: DELETE /channels/:id |
| **在线状态** | | | |
| `presence:changed` | `{ userId, status, lastSeenAt? }` | 好友 + 共同群成员 | WS: presence:update / disconnect |
| **通知** | | | |
| `notification:new` | `NotificationPayload` | `u-{userId}` | 不在会话房间的成员 |
| **AI (Sprint 2+)** | | | |
| `ai:whisper:suggestions` | `WhisperPayload` | `u-{userId}` | 收到消息后 <800ms |
| `ai:draft:created` | `DraftPayload` | `u-{userId}` | AI 生成草稿 |
| `ai:draft:expired` | `{ draftId }` | `u-{userId}` | 草稿超时 (5min) |
| `ai:predictive:action` | `PredictivePayload` | `u-{userId}` | AI 推送动作卡片 |

---

## 六、/device 命名空间 — 事件清单

### 6.1 客户端 → 服务端

| 事件名 | 发送方 | Payload | ACK | 说明 |
|--------|--------|---------|-----|------|
| `device:register` | Desktop | `{ deviceId, name, platform, capabilities }` | `WsResponse` | 设备上线 |
| `device:heartbeat` | Desktop | `{ deviceId, cpuUsage?, memoryUsage? }` | - | 心跳 (30s) |
| `device:command:send` | Mobile | `WsEnvelope<DeviceCommandPayload>` | `{ commandId, status }` | 发送命令 |
| `device:command:cancel` | Mobile | `{ commandId }` | `WsResponse` | 取消命令 |
| `device:result:complete` | Desktop | `WsEnvelope<DeviceResultPayload>` | - | 执行完成 |
| `device:result:progress` | Desktop | `{ commandId, progress, output? }` | - | 进度更新 |

### 6.2 服务端 → 客户端

| 事件名 | 目标 | Payload | 说明 |
|--------|------|---------|------|
| `device:command:execute` | `d-{deviceId}` | `DeviceCommandPayload` | 指示执行命令 |
| `device:command:ack` | `u-{userId}` | `{ commandId, status }` | 命令已分发确认 |
| `device:result:delivered` | `u-{userId}` | `DeviceResultPayload` | 结果推送到手机 |
| `device:result:progress` | `u-{userId}` | `{ commandId, progress, output? }` | 进度转发 |
| `device:status:changed` | `u-{userId}` | `DeviceStatusPayload` | 设备上/下线 |

### 6.3 Payload 类型定义

```typescript
interface DeviceCommandPayload {
  commandId: string;              // cuid
  targetDeviceId: string;
  type: 'shell' | 'file' | 'automation';
  action: string;                 // e.g. "ls -la /tmp"
  args?: Record<string, unknown>;
  timeout?: number;               // ms, 默认 30000
}

interface DeviceResultPayload {
  commandId: string;
  status: 'success' | 'error' | 'partial' | 'cancelled';
  data?: {
    output?: string;
    exitCode?: number;
  };
  error?: WsError;
  executionTimeMs: number;
}

interface DeviceStatusPayload {
  deviceId: string;
  name: string;
  platform: 'darwin' | 'win32' | 'linux';
  online: boolean;
  lastSeenAt: string;
}
```

---

## 七、AI 事件 Payload (Sprint 2+)

```typescript
// Whisper 耳语建议
interface WhisperPayload {
  suggestionId: string;
  converseId: string;
  triggerMessageId: string;
  suggestions: Array<{
    text: string;
    confidence: number;           // 0-1
  }>;
  latencyMs: number;              // >1000ms 客户端应忽略
  provider: string;
}

// Draft & Verify 草稿
interface DraftPayload {
  draftId: string;
  converseId?: string;
  deviceId?: string;
  type: 'message' | 'command';
  originalIntent: string;
  draftContent: string;
  expiresAt: string;              // ISO 8601, 默认 5 分钟后
}

// Predictive Actions 预测动作
interface PredictivePayload {
  suggestionId: string;
  converseId: string;
  actions: Array<{
    type: 'shell' | 'file' | 'app';
    action: string;
    description: string;
    dangerLevel: 'safe' | 'warning' | 'dangerous';
    confidence: number;
  }>;
}
```

### Whisper 建议流程

```
User B 发消息给 User A
       │
Cloud Brain 收到 message:new 事件
       │
       ├── 并行：广播 message:new → {converseId} 房间
       │
       └── 异步：调用 LLM (DeepSeek, 低延迟)
             │
             ├── <800ms → WS: ai:whisper:suggestions → u-{userId}
             │            客户端展示建议气泡
             │
             └── >1000ms → 放弃，不推送
```

---

## 八、事件流程示例

### 发送消息

```
Mobile                    Cloud Brain                 Desktop
  │                           │                          │
  ├── POST /api/v1/messages ─>│                          │
  │   { converseId,           │                          │
  │     type: "TEXT",         │                          │
  │     content: "Hello" }    │                          │
  │                           ├── DB: INSERT message     │
  │                           ├── DB: UPDATE converse    │
  │                           │     member lastMessageId │
  │<── 201 { message } ──────│                          │
  │                           │                          │
  │                           ├── WS: message:new ──────>│ ({converseId} room)
  │<── WS: message:new ──────│                          │ ({converseId} room)
  │                           │                          │
  │                           ├── WS: notification:new ─>│ (u-{userId}, 不在 room 的)
```

### 已读回执

```
Desktop                   Cloud Brain                 Mobile
  │                           │                          │
  ├── WS: message:read ──────>│                          │
  │   { converseId,           │                          │
  │     lastSeenMessageId }   ├── DB: UPDATE             │
  │                           │   converse_members       │
  │                           │   .lastSeenMessageId     │
  │                           │                          │
  │                           ├── WS: message:read ─────>│ ({converseId} room)
  │<── WS: message:read ─────│                          │
```

### 命令执行

```
Mobile                    Cloud Brain                   Desktop (Electron)
  │                           │                              │
  ├── WS: device:command:send │                              │
  │   { targetDeviceId,       │                              │
  │     type: "shell",        │                              │
  │     action: "ls -la" }    │                              │
  │                           │                              │
  │   ACK: { commandId,       │                              │
  │<──  status: dispatched }──│                              │
  │                           ├── DB: INSERT commands        │
  │                           │     status = 'PENDING'       │
  │                           │                              │
  │                           ├── WS: device:command:execute │
  │                           │   → d-{deviceId} room ──────>│
  │                           │                              │
  │                           │                              ├── exec / OpenClaw
  │                           │                              │
  │                           │  WS: device:result:complete  │
  │                           │<─────────────────────────────│
  │                           ├── DB: UPDATE commands        │
  │                           │     status = 'COMPLETED'     │
  │                           │                              │
  │ WS: device:result:delivered                              │
  │<──────────────────────────│                              │
```

---

## 九、Socket.IO 服务端配置

### 9.1 Gateway 配置

```typescript
@WebSocketGateway({
  namespace: '/chat',  // 或 '/device'
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6, // 1MB
})
```

### 9.2 Redis 适配器

```typescript
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';

const pubClient = new Redis(process.env.REDIS_URL);
const subClient = pubClient.duplicate();
server.adapter(createAdapter(pubClient, subClient));
```

### 9.3 Nginx 代理

```nginx
location /socket.io/ {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 120s;    # > pingInterval + pingTimeout (85s)
    proxy_send_timeout 120s;
}
```

---

## 十、TypeScript 类型安全

### 10.1 共享接口 (packages/ws-protocol)

```typescript
interface ClientToServerEvents {
  // Chat
  'converse:join':  (data: { converseId: string }) => void;
  'converse:leave': (data: { converseId: string }) => void;
  'message:typing': (data: { converseId: string; isTyping: boolean }) => void;
  'message:read':   (data: { converseId: string; lastSeenMessageId: string }) => void;
  'presence:update': (data: { status: UserStatus }) => void;

  // AI (Sprint 2+)
  'ai:draft:approve':       (data: { draftId: string }, ack: (res: WsResponse) => void) => void;
  'ai:draft:reject':        (data: { draftId: string; reason?: string }) => void;
  'ai:draft:edit':          (data: { draftId: string; editedContent: string }, ack: (res: WsResponse) => void) => void;
  'ai:predictive:execute':  (data: { suggestionId: string; actionIndex: number }, ack: (res: WsResponse) => void) => void;
  'ai:predictive:dismiss':  (data: { suggestionId: string }) => void;
  'ai:whisper:select':      (data: { suggestionId: string; selectedIndex: number }) => void;

  // Device
  'device:register':        (data: DeviceRegisterPayload, ack: (res: WsResponse) => void) => void;
  'device:heartbeat':       (data: DeviceHeartbeatPayload) => void;
  'device:command:send':    (data: WsEnvelope<DeviceCommandPayload>, ack: (res: WsResponse) => void) => void;
  'device:command:cancel':  (data: { commandId: string }, ack: (res: WsResponse) => void) => void;
  'device:result:complete': (data: WsEnvelope<DeviceResultPayload>) => void;
  'device:result:progress': (data: { commandId: string; progress: number; output?: string }) => void;
}

interface ServerToClientEvents {
  // Messages
  'message:new':      (data: MessageResponse) => void;
  'message:updated':  (data: MessageResponse) => void;
  'message:deleted':  (data: { messageId: string; converseId: string }) => void;
  'message:typing':   (data: { converseId: string; userId: string; isTyping: boolean }) => void;
  'message:read':     (data: { converseId: string; userId: string; lastSeenMessageId: string }) => void;

  // Converses
  'converse:new':     (data: ConverseResponse) => void;
  'converse:updated': (data: ConverseResponse) => void;

  // Friends
  'friend:request':   (data: FriendRequestPayload) => void;
  'friend:accepted':  (data: FriendPayload) => void;
  'friend:removed':   (data: { userId: string }) => void;

  // Groups
  'group:new':            (data: GroupResponse) => void;
  'group:updated':        (data: GroupResponse) => void;
  'group:deleted':        (data: { groupId: string }) => void;
  'group:member:joined':  (data: MemberPayload) => void;
  'group:member:left':    (data: { userId: string; groupId: string }) => void;
  'channel:new':          (data: ChannelResponse) => void;
  'channel:updated':      (data: ChannelResponse) => void;
  'channel:deleted':      (data: { channelId: string }) => void;

  // Presence
  'presence:changed': (data: { userId: string; status: UserStatus; lastSeenAt?: string }) => void;

  // Notifications
  'notification:new': (data: NotificationPayload) => void;

  // AI
  'ai:whisper:suggestions': (data: WhisperPayload) => void;
  'ai:draft:created':       (data: DraftPayload) => void;
  'ai:draft:expired':       (data: { draftId: string }) => void;
  'ai:predictive:action':   (data: PredictivePayload) => void;

  // Device
  'device:command:execute':  (data: DeviceCommandPayload) => void;
  'device:command:ack':      (data: { commandId: string; status: string }) => void;
  'device:result:delivered': (data: DeviceResultPayload) => void;
  'device:result:progress':  (data: { commandId: string; progress: number; output?: string }) => void;
  'device:status:changed':   (data: DeviceStatusPayload) => void;

  // System
  'system:error': (data: WsError) => void;
}
```

### 10.2 服务端使用

```typescript
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

interface SocketData {
  userId: string;
  username: string;
  deviceId?: string;
  deviceType: 'mobile' | 'desktop' | 'web';
}
```

IDE 自动补全事件名和 payload 类型，编译时捕获错误。
