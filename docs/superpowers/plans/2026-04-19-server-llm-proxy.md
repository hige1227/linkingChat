# 服务端 LLM 代理 — 实现任务清单

> 日期: 2026-04-19
> 目标: Desktop/Mobile Bot 对话通过 Server 代理调 LLM，用户零配置
> 架构文档: 见本文末尾

---

## 背景

当前 Bot 对话流程：Desktop → 本地 OpenClaw → 直调 LLM API（用户需配置 API Key）
目标流程：Desktop → Server AI Gateway → LLM API（用户零配置，Server 控成本）

关键约束：**保留本地工具执行能力**（shell/文件操作），OpenClaw 仍然运行在本地，只是 LLM 调用走 Server 代理。

---

## 任务总览

```
Phase 1: Server 端 (核心，必须先完成)
  Task 1 → Task 2 → Task 3

Phase 2: Desktop 端 (依赖 Phase 1)
  Task 4 → Task 5 → Task 6

Phase 3: 集成测试 + 打包
  Task 7 → Task 8
```

---

## Phase 1: Server 端

### Task 1: AI Gateway Module — 临时 Token 签发

**负责人:** ________  **预估:** 0.5 天

**目标:** 用户登录后可获取一个临时 LLM Token，用于后续 LLM 代理请求的鉴权。

**新增文件:**
```
apps/server/src/ai/
├── ai-gateway.module.ts           # 新 Module
├── ai-gateway.controller.ts       # 新 Controller
├── ai-gateway.service.ts          # 新 Service
└── __tests__/
    └── ai-gateway.service.spec.ts # 单元测试
```

**接口定义:**

```
POST /api/v1/ai/llm-token
Headers: Authorization: Bearer <JWT>
Response: { token: string, expiresIn: number }
```

**实现要点:**

1. Token 格式: JWT，包含 `{ userId, type: 'llm-proxy', iat, exp }`
2. 有效期: 建议 24 小时（可配置）
3. 签名密钥: 复用 `JWT_PRIVATE_KEY`（已有的 RS256 密钥）
4. 每个用户同一时间只有一个有效 Token（新签发自动作废旧 Token）
5. 不需要存数据库，JWT 自包含即可

**鉴权 Guard:**
```typescript
// 新建 AiGatewayGuard
// 验证 JWT 中 type === 'llm-proxy'
// 从 token 解出 userId
```

**修改文件:**
- `apps/server/src/ai/ai.module.ts` — 导入 AiGatewayModule

**测试:**
- 签发 Token 返回正确格式
- Token 过期后请求被拒绝
- 无效 Token 返回 401
- 非 JWT 用户无法获取 Token

---

### Task 2: AI Gateway — LLM 代理 (SSE Streaming)

**负责人:** ________  **预估:** 1 天

**目标:** 提供 SSE 流式代理接口，接收客户端请求 → 转发到 LLM API → 流式返回结果。

**接口定义:**

```
POST /api/v1/ai/llm-proxy
Headers:
  Authorization: Bearer <llm-token>   (Task 1 签发的临时 Token)
  Content-Type: application/json
Body: {
  model: string,           // 可选，默认走 LlmRouter 选择
  messages: Array<{        // OpenAI 兼容格式
    role: 'system' | 'user' | 'assistant',
    content: string
  }>,
  stream?: boolean,        // 默认 true
  temperature?: number,
  max_tokens?: number,
}
Response: SSE stream
  data: {"type":"text","content":"你"}
  data: {"type":"text","content":"好"}
  data: {"type":"done","usage":{"prompt_tokens":10,"completion_tokens":20}}
  或
  data: {"type":"error","message":"Rate limit exceeded"}
```

**实现要点:**

1. 鉴权: 用 Task 1 的 `AiGatewayGuard`，验证 LLM Token
2. 模型路由:
   - 如果请求指定了 `model`，直接用
   - 如果没指定，复用 `LlmRouterService` 自动选择（简单任务 → DeepSeek，复杂任务 → Kimi）
3. 流式转发:
   - 调 LLM API 时用 `stream: true`
   - 解析 SSE 流，转换成统一格式返回给客户端
   - 使用 `Observable` 或直接 pipe response
4. 用量记录:
   - 每次请求记录 `{ userId, model, promptTokens, completionTokens, cost }` 到 PostgreSQL
   - 新建 `AiUsage` Prisma model（见下方 schema）
5. 频率限制:
   - 用 Redis 实现：每用户每分钟最多 20 次，每天最多 200 次（可配置）
   - 超限返回 `data: {"type":"error","message":"Rate limit exceeded"}`

**Prisma Schema 新增:**
```prisma
model AiUsage {
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id])
  model            String   // e.g. "deepseek-chat"
  promptTokens     Int      @default(0)
  completionTokens Int      @default(0)
  cost             Float    @default(0)  // 估算成本 (元)
  createdAt        DateTime @default(now())

  @@index([userId, createdAt])
  @@map("ai_usage")
}
```

**修改文件:**
- `apps/server/prisma/schema.prisma` — 新增 AiUsage model
- `apps/server/src/ai/ai-gateway.service.ts` — LLM 代理逻辑
- `apps/server/src/ai/ai-gateway.controller.ts` — SSE endpoint

**LLM Provider 适配:**
- DeepSeek API: `https://api.deepseek.com/v1/chat/completions` (OpenAI 兼容)
- MiniMax API: `https://api.minimax.chat/v1/text/chatcompletion_v2`
- Kimi API: `https://api.moonshot.cn/v1/chat/completions` (OpenAI 兼容)
- 三者都支持 SSE streaming，格式基本相同

**关键代码参考 (NestJS SSE):**
```typescript
@Sse('llm-proxy')
@UseGuards(AiGatewayGuard)
async llmProxy(@Req() req, @Body() body: LlmProxyDto): Observable<MessageEvent> {
  const userId = req.user.userId;
  // 1. 检查频率限制 (Redis)
  // 2. 选择模型 (LlmRouterService)
  // 3. 调 LLM API (streaming fetch)
  // 4. 转发 SSE chunks
  // 5. 记录用量
}
```

**测试:**
- 正常流式请求返回完整响应
- Token 过期返回 401
- 频率超限返回 error event
- 用量正确记录到数据库
- DeepSeek / MiniMax / Kimi 三种 provider 都能代理

---

### Task 3: OpenClaw 自定义 Base URL 支持

**负责人:** ________  **预估:** 0.5 天

**目标:** 确认 OpenClaw Gateway 支持配置自定义 LLM API base URL，验证能指向我们的 Server 代理。

**调查内容:**

1. 查阅 OpenClaw v2026.4.2 文档/配置，确认:
   - `~/.openclaw/openclaw.json` 是否支持自定义 `baseUrl`
   - 是否支持在启动时通过 CLI 参数覆盖 base URL
   - 是否支持自定义 auth header

2. 如果 OpenClaw 原生不支持自定义 base URL:
   - 方案 A: 修改 OpenClaw 配置文件 `openclaw.json`，把 API endpoint 指向 Server
   - 方案 B: Desktop 启动 OpenClaw 前动态生成 `openclaw.json` 配置
   - 方案 C: 本地起一个 mini-proxy（localhost），OpenClaw 指向 localhost，proxy 转发到 Server

3. 验证 auth header 传递:
   - OpenClaw 发请求时是否带上我们签发的 LLM Token
   - 如果 OpenClaw 只支持 API Key 格式，Server 代理需要同时支持 `Authorization: Bearer <llm-token>` 和 `x-api-key` 两种格式

**验证步骤:**
```bash
# 手动配置 OpenClaw 指向 Server
# 1. 启动 Server
pnpm dev:server

# 2. 获取 LLM Token
curl -X POST http://localhost:3008/api/v1/ai/llm-token \
  -H "Authorization: Bearer <user-jwt>"

# 3. 配置 OpenClaw base URL 指向 localhost:3008
# 编辑 ~/.openclaw/openclaw.json

# 4. 启动 OpenClaw Gateway 并测试
npx openclaw gateway run --port 18789 --auth none

# 5. 发送测试消息，确认流量经过 Server
```

**产出:** 一份配置方法文档，说明如何让 OpenClaw 的 LLM 调用走 Server 代理。

---

## Phase 2: Desktop 端

### Task 4: Desktop — 登录后获取 LLM Token

**负责人:** ________  **预估:** 0.5 天

**目标:** Desktop 登录成功后自动获取 LLM Token，存到 electron-store。

**新增/修改文件:**
```
apps/desktop/src/main/
├── services/
│   └── ai-gateway.service.ts      # 新 Service
├── ipc/
│   └── ai-gateway.ipc.ts          # 新 IPC handlers
```

**实现要点:**

1. `AiGatewayService`:
   ```typescript
   class AiGatewayService {
     private llmToken: string | null = null;

     async fetchLlmToken(userJwt: string): Promise<string>
     getToken(): string | null
     clearToken(): void
   }
   ```

2. 登录成功后自动调用 `fetchLlmToken`
   - 修改 `auth.ipc.ts`，在登录成功回调中获取 LLM Token
   - Token 存到内存 + electron-store（持久化，下次启动免获取）

3. IPC handlers:
   ```
   ai-gateway:get-token  → 返回当前 LLM Token
   ai-gateway:refresh-token → 重新获取
   ```

**修改文件:**
- `apps/desktop/src/main/ipc/auth.ipc.ts` — 登录成功后获取 LLM Token
- `apps/desktop/src/main/index.ts` — 注册 AiGatewayService

---

### Task 5: Desktop — OpenClaw 动态配置

**负责人:** ________  **预估:** 1 天

**目标:** Desktop 启动 OpenClaw sidecar 时，自动配置 base URL 和 auth token，用户无需手动配置 `~/.openclaw/`。

**修改文件:**
```
apps/desktop/src/main/
├── services/openclaw-process.service.ts   # 修改: 启动前配置 OpenClaw
├── openclaw/openclaw.config.ts            # 修改: 增加 Server 代理配置
```

**实现要点:**

1. 启动 OpenClaw 前，生成/更新 `~/.openclaw/openclaw.json`:
   ```json
   {
     "models": {
       "default": "deepseek-chat"
     },
     "providers": {
       "deepseek": {
         "baseUrl": "https://linkchat-api.matrix-ai.com.cn/api/v1/ai/llm-proxy",
         "apiKey": "<llm-token>"
       }
     }
   }
   ```
   （具体格式取决于 Task 3 的调查结果）

2. 判断逻辑:
   ```
   if (app.isPackaged) {
     // 生产模式: 配置 OpenClaw 走 Server 代理
     configureOpenClawProxy(llmToken);
   } else {
     // 开发模式: 用本地 ~/.openclaw/ 配置（直调 LLM）
     // 不做任何修改
   }
   ```

3. Token 刷新:
   - LLM Token 过期时（24h），OpenClaw 请求会返回 401
   - Desktop 检测到 401 → 刷新 Token → 更新 OpenClaw 配置

**注意:**
- 不要覆盖用户的 `~/.openclaw/` 开发配置
- 生产环境使用独立路径，如 `~/.openclaw-linkchat/`，或在启动时覆盖配置
- 开发模式完全不动本地配置

---

### Task 6: Desktop — Server Agent Adapter（可选，Phase 2 后期）

**负责人:** ________  **预估:** 1 天

**目标:** 新增 `server` 模式作为 Agent 类型之一，让 Desktop 可以不依赖本地 OpenClaw 直接通过 Server 获取 AI 回复。

**适用场景:** 不需要本地工具执行的轻量部署。

**新增文件:**
```
apps/desktop/src/main/agents/
└── server-agent.adapter.ts    # 新 Adapter
```

**实现要点:**

1. 实现 `AgentProvider` 接口:
   ```typescript
   class ServerAgentAdapter implements AgentProvider {
     readonly name = 'server';

     async isReady(): Promise<boolean> {
       // 检查 LLM Token 是否存在
     }

     async *chat(params: AgentChatParams): AsyncGenerator<ChatChunk> {
       // fetch SSE to /api/v1/ai/llm-proxy
       // yield ChatChunk (text, done, error)
     }

     cancelStream(requestId: string): void { ... }
   }
   ```

2. Agent 模式自动选择:
   ```typescript
   // agent-provider.factory.ts
   static autoSelect(): AgentType {
     if (!app.isPackaged) return 'openclaw';  // dev 模式
     if (hasLocalOpenClaw()) return 'openclaw';  // toB 有 sidecar
     return 'server';  // toC 轻量版
   }
   ```

3. 打包配置分离:
   ```yaml
   # electron-builder.yaml 新增 toC 构建配置
   # toC 标准版: 不包含 sidecar (~70MB)
   # toB 完整版: 包含 sidecar (~250MB)
   ```

**注意:** 此 Task 依赖 Task 2（Server SSE endpoint）。如果 OpenClaw 代理方案（Task 5）已足够好用，此 Task 优先级可降低。

---

## Phase 3: Hermes 适配

### Task 7: Hermes — 走 Server 代理

**负责人:** ________  **预估:** 0.5 天

**目标:** HermesAdapter 也支持通过 Server AI Gateway 获取 AI 回复，不再需要用户配置 LLM API Key。

**背景:** Hermes 是 Python 轻量 Agent，当前直调 DeepSeek API（需要用户配 API Key）。改为走 Server 代理后，Hermes 只需一个 Server 签发的 Token 即可。

**两种实现路径（取决于 Hermes 自身架构）:**

**路径 A: Hermes 支持自定义 base URL（推荐）**
```
修改 Hermes 配置:
  base_url: https://linkchat-api.matrix-ai.com.cn/api/v1/ai/llm-proxy
  api_key: <llm-token>  (Server 签发的临时 Token)
```
- 修改 `apps/desktop/src/main/agents/hermes.adapter.ts`
- 在 `HermesAdapter.chat()` 中，检查 `app.isPackaged`：
  - 生产模式：请求发到 Server 代理 URL，带 LLM Token
  - 开发模式：直调本地 Hermes Gateway（现有行为不变）

**路径 B: Hermes 不支持自定义 URL**
- Desktop 的 `HermesAdapter` 不再调本地 Hermes Gateway
- 改为直接调 Server `/ai/llm-proxy`（SSE）
- 本地 Hermes 进程仅用于工具执行（如果需要）
- 本质上变成 `ServerAgentAdapter` 的变体

**修改文件:**
```
apps/desktop/src/main/agents/hermes.adapter.ts    # 核心修改
apps/desktop/src/main/services/hermes-process.service.ts  # 如需调整启动参数
```

**测试:**
- 切换到 Hermes 模式 → 给 Bot 发消息 → 流式回复正常
- 开发模式下仍用本地 Hermes（不破坏现有功能）
- 内网/离线场景：无 Server 时 graceful fallback 提示

---

## Phase 4: Mobile 端

### Task 8: Mobile — Bot 对话接入 Server AI Gateway

**负责人:** ________  **预估:** 1 天

**目标:** Mobile 端给 Bot 发消息时，通过 Server API 获取流式 AI 回复，而非仅依赖 Server 端 Agent 事件。

**当前 Mobile Bot 流程:**
```
用户发消息 → POST /messages → Server 存消息
                                   → Server AgentOrchestrator → 回复存入 DB
                                                              → Socket push 到客户端
```
问题：Mobile 端无法看到 Bot 的**流式回复**（逐字显示），只能等 Agent 处理完后一次性收到。

**目标流程:**
```
用户发消息 → POST /messages (持久化)
          → GET /api/v1/ai/llm-proxy (SSE stream, 带 LLM Token)
          → 逐字显示 Bot 回复
          → 流结束后 POST /bots/:botId/reply (持久化)
```

**新增/修改文件:**
```
apps/mobile/lib/
├── core/
│   └── ai/
│       └── ai_chat_service.dart     # 新 Service: 调 Server SSE
├── features/
│   └── chat/
│       └── bot_chat_widget.dart     # 修改: 流式气泡 UI
```

**实现要点:**

1. **AI Chat Service:**
   ```dart
   class AiChatService {
     // 获取 LLM Token (登录时获取并缓存)
     Future<String> getLlmToken();

     // SSE 流式请求
     Stream<String> chatStream({
       required String converseId,
       required String message,
       required String botId,
     });
   }
   ```

2. **LLM Token 管理:**
   - 登录成功后调 `/api/v1/ai/llm-token` 获取
   - 存到 `SharedPreferences` 或 `flutter_secure_storage`
   - 24h 过期后自动刷新

3. **流式 UI:**
   - Bot 消息气泡支持逐字显示（打字机效果）
   - 流结束后替换为正式消息

4. **SSE 解析 (Dart):**
   - 使用 `http` 包 + SSE 解析
   - 或使用 `dart:io` HttpClient 手动解析 SSE

**注意:**
- Mobile 不需要 sidecar，不需要 OpenClaw/Hermes
- 所有 AI 通过 Server 代理
- 这是 Mobile 端第一个流式 Bot 回复功能，用户体验提升很大

---

## Phase 5: Mac 支持

### Task 9: Mac — Sidecar + 打包适配

**负责人:** ________  **预估:** 1.5 天

**目标:** Desktop 应用支持 macOS，包括 Mac 版 sidecar 和 DMG 打包。

**前置条件:** 需要一台 Mac 开发机（或 GitHub Actions macOS runner）。

**9.1 Mac Sidecar 准备:**

```bash
# 创建 Mac sidecar 目录
mkdir -p apps/desktop/sidecar/darwin-arm64
cd apps/desktop/sidecar/darwin-arm64

# 安装 OpenClaw
npm init -y
npm install openclaw@2026.4.2 --omit=dev --no-save

# 下载 macOS ARM64 Node.js 独立二进制
curl -o node https://nodejs.org/dist/v22.22.2/darwin-arm64/bin/node
chmod +x node
```

对于 Intel Mac:
```bash
mkdir -p apps/desktop/sidecar/darwin-x64
# 同上，但下载 darwin-x64 版本的 node
```

**9.2 electron-builder Mac 配置:**

`electron-builder.yaml` 已有 Mac 配置基础:
```yaml
mac:
  target: dmg
  icon: build/icon.icns
```

需要修改:
```yaml
extraResources:
  # 已有 Windows sidecar
  - from: sidecar/${os}-${arch}
    to: openclaw-sidecar
    filter:
      - '**/*'
      # ... (同 Windows 的 filter)

  # Mac 需要额外处理:
  # ${os}-${arch} 在 Mac 上解析为 darwin-arm64 或 darwin-x64
  # node 二进制需要 chmod +x 权限
```

**9.3 代码适配:**

**`openclaw-process.service.ts` — Mac 路径处理:**
- Mac 安装路径不同于 Windows
- `process.resourcesPath` 在 Mac DMG 中的位置: `<app>/Contents/Resources/`
- node 二进制需要可执行权限: `fs.chmodSync(nodePath, 0o755)`

**`openclaw.config.ts`:**
```typescript
// Mac node 二进制名称是 'node' (无 .exe)
nodeExePath: process.platform === 'win32'
  ? 'openclaw-sidecar/node.exe'
  : 'openclaw-sidecar/node',
```

**`hermes-process.service.ts` — Mac Python 路径:**
- macOS 系统自带 Python 3，路径通常是 `/usr/bin/python3` 或 `brew` 安装的
- 需要 `which python3` 探测

**9.4 Mac 打包命令:**
```bash
cd apps/desktop
VITE_API_URL=https://linkchat-api.matrix-ai.com.cn \
VITE_WS_URL=https://linkchat-api.matrix-ai.com.cn \
pnpm build

# Mac ARM (M1/M2/M3)
pnpm dist --mac --arm64

# Mac Intel
pnpm dist --mac --x64

# 通用二进制 (同时支持 ARM + Intel)
pnpm dist --mac --universal
```

输出: `dist/LinkingChat-0.0.1-arm64.dmg` / `dist/LinkingChat-0.0.1-x64.dmg`

**9.5 Mac 特有问题:**
- macOS Gatekeeper: 未签名 app 会被阻止，用户需要"右键 → 打开"
- 代码签名: 需要 Apple Developer 账号 ($99/年) + `codesign`
- Notarization: 公证，不做的活用户会看到更严重的警告
- 沙盒: Mac App Store 要求沙盒，直接分发不需要

**新增/修改文件:**
```
apps/desktop/
├── sidecar/
│   ├── win-x64/          # 已有
│   ├── darwin-arm64/     # 新增
│   └── darwin-x64/       # 新增 (可选)
├── build/
│   ├── icon.ico          # 已有 (Windows)
│   └── icon.icns         # 需准备 (Mac)
└── electron-builder.yaml # 修改: Mac extraResources
```

**关键代码修改文件:**
- `apps/desktop/src/main/openclaw/openclaw.config.ts` — Mac node 路径
- `apps/desktop/src/main/services/openclaw-process.service.ts` — Mac chmod + 路径
- `apps/desktop/src/main/services/hermes-process.service.ts` — Mac Python 路径
- `apps/desktop/electron-builder.yaml` — Mac 打包配置

---

## Phase 6: 集成测试 + 打包

### Task 10: 端到端集成测试

**负责人:** ________  **预估:** 1 天

**测试清单:**

| # | 测试场景 | 步骤 | 预期结果 |
|---|---------|------|---------|
| 1 | 登录获取 Token | 登录 Desktop | LLM Token 自动获取并存储 |
| 2 | Bot 对话流式回复 | 给 Bot 发消息 | 流式回复正常显示 |
| 3 | Token 自动刷新 | 等待 Token 过期后发消息 | 自动刷新，对话不中断 |
| 4 | 用量记录 | 发多条消息 | `ai_usage` 表有记录 |
| 5 | 频率限制 | 短时间发大量消息 | 超限后返回错误提示 |
| 6 | 本地工具执行 | 让 Bot 执行 shell 命令 | 命令在本地执行并返回结果 |
| 7 | 远程控制 | Mobile 发命令到 Desktop | 命令执行正常 |
| 8 | 断网恢复 | 断网后恢复 | 自动重连，对话恢复 |
| 9 | 多模型路由 | 简单/复杂问题 | Server 自动选模型 |
| 10 | 全新机器测试 | 在无 Node.js 的新机器安装 | 全程零配置可用 |

---

### Task 10: 端到端集成测试

**负责人:** ________  **预估:** 1 天

**测试清单:**

| # | 测试场景 | 平台 | 步骤 | 预期结果 |
|---|---------|------|------|---------|
| 1 | 登录获取 Token | Desktop Win/Mac | 登录 | LLM Token 自动获取并存储 |
| 2 | Bot 对话流式回复 | Desktop Win/Mac | 给 Bot 发消息 | 流式回复正常显示 |
| 3 | Hermes Bot 对话 | Desktop Win/Mac | 切换到 Hermes 模式，发消息 | 流式回复正常 |
| 4 | Mobile Bot 对话 | Mobile Android | 给 Bot 发消息 | 流式回复正常（新增功能） |
| 5 | Token 自动刷新 | 全平台 | 等待 Token 过期后发消息 | 自动刷新，对话不中断 |
| 6 | 用量记录 | Server | 发多条消息 | `ai_usage` 表有记录 |
| 7 | 频率限制 | Server | 短时间发大量消息 | 超限后返回错误提示 |
| 8 | 本地工具执行 | Desktop Win/Mac | 让 Bot 执行 shell 命令 | 命令在本地执行并返回结果 |
| 9 | 远程控制 | Mobile→Desktop | Mobile 发命令到 Desktop | 命令执行正常 |
| 10 | Mac sidecar | Desktop Mac | 全新 Mac 安装测试 | OpenClaw 启动正常 |
| 11 | 断网恢复 | 全平台 | 断网后恢复 | 自动重连，对话恢复 |
| 12 | 多模型路由 | Server | 简单/复杂问题 | Server 自动选模型 |
| 13 | 全新机器 (Win) | Desktop Win | 无 Node.js 的新电脑 | 全程零配置可用 |
| 14 | 全新机器 (Mac) | Desktop Mac | 全新 Mac | 全程零配置可用 |

---

### Task 11: 多平台打包 + 部署

**负责人:** ________  **预估:** 0.5 天

**构建步骤:**

```bash
# ──── Windows (在 Windows 开发机上) ────
cd apps/desktop
VITE_API_URL=https://linkchat-api.matrix-ai.com.cn \
VITE_WS_URL=https://linkchat-api.matrix-ai.com.cn \
pnpm build && pnpm dist --win
# 输出: dist/LinkingChat Setup x.x.x.exe (~250MB 含 sidecar)

# ──── macOS (在 Mac 开发机上) ────
cd apps/desktop
VITE_API_URL=https://linkchat-api.matrix-ai.com.cn \
VITE_WS_URL=https://linkchat-api.matrix-ai.com.cn \
pnpm build && pnpm dist --mac
# 输出: dist/LinkingChat-0.0.1.dmg

# ──── Mobile Android ────
cd apps/mobile
# 修改 api_endpoints.dart → baseUrl = 'https://linkchat-api.matrix-ai.com.cn'
flutter build apk --release
# 输出: build/app/outputs/flutter-apk/app-release.apk
```

**Server 部署:**
```bash
# 更新 Server 代码到生产环境
ssh ubuntu@49.235.109.94
cd /opt/linkchat
# 拉取最新代码 → 重建镜像 → 重启
docker compose -f docker-compose.prod.yaml up -d --build server
# 运行 Prisma migration (新增 AiUsage 表)
docker compose -f docker-compose.prod.yaml exec server npx prisma migrate deploy
```

**生产环境配置:**
```bash
# /opt/linkchat/.env.production 新增:
LLM_PROXY_ENABLED=true
LLM_RATE_LIMIT_PER_MINUTE=20
LLM_RATE_LIMIT_PER_DAY=200
LLM_TOKEN_EXPIRY_HOURS=24
```

---

## 架构总览

```
┌──────────────────────────────────────────────────────────┐
│                     用户手机 (Mobile)                      │
│  Flutter App                                              │
│  ├─ 聊天 / @ai ────── HTTPS ─────────────┐               │
│  ├─ Bot 对话 (SSE) ── HTTPS ────────────┐│               │
│  └─ 远程控制 ─────────── WSS ──────────┐││               │
└─────────────────────────────────────────│││───────────────┘
                                          │││
┌─────────────────────────────────────────│││───────────────┐
│                Cloud Server (NestJS)     │││               │
│                                         │││               │
│  REST API ─────────── WS Gateway ───────┘││               │
│       │                                  ││               │
│       ▼                                  ││               │
│  ┌──────────────────────────────────┐    ││               │
│  │   AI Gateway (新增)               │    ││               │
│  │                                   │    ││               │
│  │  /ai/llm-token  → 签发临时 Token  │    ││               │
│  │  /ai/llm-proxy  → LLM 流式代理    │──┐ ││               │
│  │  用量记录 + 频率限制              │  │ ││               │
│  └──────────────────────────────────┘  │ ││               │
│                                         │ ││               │
│  PostgreSQL (ai_usage)  Redis (限流)     │ ││               │
└─────────────────────────────────────────│─││───────────────┘
                                          │ ││
                                    API Key│ ││
                                    在这里 │ ││
                                          ▼ ││
                                   ┌─────────┐│
                                   │ DeepSeek ││
                                   │ MiniMax  ││
                                   │ Kimi     ││
                                   └─────────┘│
                                              ││
┌──────────────────────────────────────────────││──────────┐
│           用户电脑 Windows (Desktop)           ││          │
│  Electron App                                ││          │
│  ├─ 聊天 ─────────── HTTPS ──────── Server    ││          │
│  ├─ Bot 对话 ────── OpenClaw ──── Server ────┘│          │
│  ├─ 工具执行 ←───── OpenClaw 本地 shell       │          │
│  ├─ 远程控制 ←───── WS /device ←── Server ───────────┐   │
│  └─ Agent: openclaw / hermes / server               │   │
│                                                      │   │
│  ┌───────────────────────────────────┐               │   │
│  │ OpenClaw Sidecar (win-x64/)       │               │   │
│  │ ├─ node.exe + openclaw@2026.4.2   │               │   │
│  │ └─ LLM → Server AI Gateway       │               │   │
│  └───────────────────────────────────┘               │   │
└──────────────────────────────────────────────────────┘   │
                                                            │
┌────────────────────────────────────────────────────────────│
│           用户电脑 macOS (Desktop)                           │
│  Electron App (同 Windows，代码共用)                         │
│  │                                                          │
│  ├─ Bot 对话 ── OpenClaw ── Server AI Gateway ─────────────┘
│  ├─ 工具执行 ←── OpenClaw 本地 (macOS shell)
│  │
│  ┌───────────────────────────────────┐
│  │ OpenClaw Sidecar (darwin-arm64/)  │
│  │ ├─ node (unix) + openclaw@2026.4.2│
│  │ └─ LLM → Server AI Gateway       │
│  └───────────────────────────────────┘
│
│  ┌───────────────────────────────────┐
│  │ Hermes (可选, Python)              │
│  │ └─ LLM → Server AI Gateway       │
│  └───────────────────────────────────┘
└──────────────────────────────────────────────────────────┘
```

---

## 任务依赖关系

```
Phase 1 (Server 核心):
  Task 1 (Token) ──→ Task 2 (LLM Proxy)
       │
       └──→ Task 3 (OpenClaw 调查) ── 独立，可先行

Phase 2 (Desktop):
  Task 4 (Desktop Token) ──→ Task 5 (OpenClaw 动态配置)
  Task 6 (Server Adapter) ── 独立，可并行，优先级低

Phase 3 (Hermes):
  Task 7 (Hermes 适配) ──→ 依赖 Task 2 + Task 3

Phase 4 (Mobile):
  Task 8 (Mobile Bot SSE) ──→ 依赖 Task 1 + Task 2

Phase 5 (Mac):
  Task 9 (Mac 适配) ──→ 依赖 Task 5 验证通过

Phase 6 (收尾):
  Task 10 (集成测试) ──→ 依赖全部完成
  Task 11 (打包部署)
```

## 总工作量

| Phase | 内容 | 预估 |
|-------|------|------|
| 1 Server | Task 1-3 | 2 天 |
| 2 Desktop | Task 4-6 | 2 天 |
| 3 Hermes | Task 7 | 0.5 天 |
| 4 Mobile | Task 8 | 1 天 |
| 5 Mac | Task 9 | 1.5 天 |
| 6 收尾 | Task 10-11 | 1.5 天 |
| **总计** | **11 个 Task** | **~8.5 天** |

## 可并行分配建议

**2 人团队:**

| 工作日 | 人员 A (Server/后端) | 人员 B (Desktop/前端) |
|--------|---------------------|----------------------|
| Day 1 | Task 1 (Token) + Task 2 (LLM Proxy) | Task 3 (OpenClaw 调查) |
| Day 2 | Task 2 继续 + 联调 | Task 4 (Desktop Token) |
| Day 3 | Task 7 (Hermes 适配) | Task 5 (OpenClaw 动态配置) |
| Day 4 | Task 8 (Mobile Bot SSE) | Task 6 (Server Adapter) |
| Day 5 | Task 10 集成测试 (Server 侧) | Task 9 (Mac 适配) ← 需要 Mac |
| Day 6 | Task 11 部署 | Task 10 集成测试 (Desktop 侧) |

**3 人团队:**

| 工作日 | 人员 A (Server) | 人员 B (Desktop) | 人员 C (Mobile/Mac) |
|--------|-----------------|------------------|---------------------|
| Day 1-2 | Task 1 + 2 | Task 3 + 4 | Task 8 (Mobile) |
| Day 3 | Task 7 (Hermes) | Task 5 + 6 | Task 9 (Mac) |
| Day 4 | Task 10 测试 | Task 10 测试 | Task 11 打包 |
| **总计 ~4 天** | | | |

---

## 风险点

| 风险 | 影响 | 应对 |
|------|------|------|
| OpenClaw 不支持自定义 base URL | Task 5 方案需调整 | Task 3 先调查，不行用本地 mini-proxy 方案 |
| Hermes 不支持自定义 URL | Task 7 走路径 B | Desktop 直接调 Server，绕过 Hermes |
| LLM API 延迟增加（多一跳） | Bot 回复变慢 | Server 和 LLM API 都在云端，延迟可忽略 |
| Server 成为单点 | Server 宕机则 Bot 不可用 | 已有 Redis + Nginx 高可用，后续加健康检查 |
| API 成本失控 | 运营亏损 | Task 2 已含频率限制，后续加计费系统 |
| Mac 开发机不可用 | Task 9 阻塞 | 可用 GitHub Actions macOS runner 替代 |
| iOS 支持 | 用户可能要 iOS 版 | Mobile 用 Flutter 已支持，打包需 Apple Developer ($99/年) + Mac |

---

## 关键代码参考位置

### Server 端

| 模块 | 路径 |
|------|------|
| LLM Router | `apps/server/src/ai/services/llm-router.service.ts` |
| LLM Providers | `apps/server/src/ai/providers/` |
| Auth Guard | `apps/server/src/auth/guards/` |
| Prisma Schema | `apps/server/prisma/schema.prisma` |
| WebSocket Gateway | `apps/server/src/gateway/` |

### Desktop 端

| 模块 | 路径 |
|------|------|
| Agent Factory | `apps/desktop/src/main/agents/agent-provider.factory.ts` |
| Agent Interface | `apps/desktop/src/main/agents/agent-provider.interface.ts` |
| OpenClaw Adapter | `apps/desktop/src/main/agents/openclaw.adapter.ts` |
| Hermes Adapter | `apps/desktop/src/main/agents/hermes.adapter.ts` |
| OpenClaw Config | `apps/desktop/src/main/openclaw/openclaw.config.ts` |
| OpenClaw Process | `apps/desktop/src/main/services/openclaw-process.service.ts` |
| Hermes Process | `apps/desktop/src/main/services/hermes-process.service.ts` |
| IPC Auth | `apps/desktop/src/main/ipc/auth.ipc.ts` |
| IPC OpenClaw | `apps/desktop/src/main/ipc/openclaw.ipc.ts` |
| Renderer Chat Hook | `apps/desktop/src/renderer/hooks/useOpenClawChat.ts` |
| Renderer Config | `apps/desktop/src/renderer/config.ts` |
| electron-builder | `apps/desktop/electron-builder.yaml` |

### Mobile 端

| 模块 | 路径 |
|------|------|
| API Endpoints | `apps/mobile/lib/core/constants/api_endpoints.dart` |
| API Client | `apps/mobile/lib/core/api/api_client.dart` |
| Chat UI | `apps/mobile/lib/features/chat/` |
| Socket Service | `apps/mobile/lib/core/socket/` |

### Sidecar 目录

| 平台 | 路径 | 内容 |
|------|------|------|
| Windows x64 | `apps/desktop/sidecar/win-x64/` | node.exe + openclaw |
| macOS ARM | `apps/desktop/sidecar/darwin-arm64/` | node + openclaw (需新建) |
| macOS Intel | `apps/desktop/sidecar/darwin-x64/` | node + openclaw (需新建) |
