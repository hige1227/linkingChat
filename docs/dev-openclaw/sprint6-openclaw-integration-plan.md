# Sprint 6: OpenClaw 真实集成 + 架构链路打通

> **创建日期**: 2026-03-18 | **最后更新**: 2026-03-19
>
> **背景**: 架构审计（`docs/realtest/2026-03-18.md`）发现 8 个集成点中 5 个"有实现无集成"。
> 本 Sprint 以 OpenClaw 真实集成为核心，顺序打通所有断裂链路。
>
> **安全策略**: 完整安全先行——先加固再集成。
>
> **部署方案**: Docker 容器部署（OpenClaw 运行在 Docker 容器中，端口映射到宿主机 loopback）。
> 个人开发机安全隔离，生产环境可迁移至独立服务器/K8s。
>
> **当前进度**: Phase 0 ✅ → Phase 1 ✅ → Phase 2 ✅ → **Phase 3 (端到端)** 🔧 Task 3.2 ✅, Tasks 3.1/3.3-3.5 待手动验证
>
> **战略优先级**: P0 (安全) > A (OpenClaw) > B/D (Predictive) > C (CodingBot) > F (跨 Bot) > G (杂项)

---

## 现状总结

| 集成点 | 服务端代码 | 客户端代码 | 生产链路 | 核心缺失 |
|--------|-----------|-----------|---------|---------|
| A: OpenClaw Gateway | ✅ 完整 | ✅ 完整 | ❌ | 二进制不存在 + 状态 API 假阳性 |
| B: Predictive 触发 | ✅ `analyzeTrigger()` | — | ❌ | 无人调用 `analyzeTrigger()`，缺 converseId |
| C: @CodingBot | ❌ 无 Agent | — | ❌ | 无 `CodingBotAgent` 类、未注册 |
| D: Predictive 执行 | ✅ `executeAction()` | — | ❌ | 仅 DB 标记，不下发命令 |
| F: 跨 Bot 通信 | ✅ 完整 | ❌ 未监听 | ❌ | 无生产触发入口 + 客户端不处理 WS |
| G: BatchTrigger | ✅ debounce | — | 🟡 | 无 max-wait 上限 |

---

## Phase 0: 安全加固（先于一切集成工作）

### 0.1 CVE-2026-25253 防护 ✅

**漏洞概要**:
- **CVE**: CVE-2026-25253 | **CVSS**: 8.8 (高危) | **CWE**: CWE-669
- **类型**: 跨站 WebSocket 劫持 → Token 窃取 → 远程代码执行 (RCE)
- **攻击方式**: 受害者访问恶意网页 → 浏览器向 OpenClaw Gateway 发起 WS 连接 → 窃取认证 Token → 利用 `operator.admin` 权限执行任意命令
- **修复版本**: **v2026.1.29**（2026-01-30 发布，加入 TOFU 策略 + Origin 验证）
- **参考**: [TheHackerNews](https://thehackernews.com/2026/02/openclaw-bug-enables-one-click-remote.html) | [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-25253)

**措施**:
- [x] 安装 OpenClaw 时确保版本 >= 2026.1.29 → **实际版本: 2026.3.13**
- [x] 安装后验证: `openclaw --version` 输出 >= 2026.1.29
- [x] Token 通过 `OPENCLAW_GATEWAY_TOKEN` 环境变量注入（不使用自动生成的随机 Token）

### 0.2 Docker 网络隔离 ✅

**问题**: 旧代码使用 `spawn()` + `--bind lan` (0.0.0.0)，Gateway 端口直接暴露在宿主机。

**方案**: OpenClaw 运行在 Docker 容器中，端口仅绑定宿主机 loopback：
- docker-compose 端口映射: `127.0.0.1:18790:18789`（仅本机可访问）
- 容器内 Gateway 监听 `ws://127.0.0.1:18789`（默认端口，loopback 模式）
- NestJS（宿主机）通过 `ws://127.0.0.1:18790` 连接 Gateway

> **实际发现**: OpenClaw Gateway 默认监听端口是 **18789**（不是 3000）。
> 日志: `[gateway] listening on ws://127.0.0.1:18789, ws://[::1]:18789`

```yaml
openclaw:
  ports:
    - "127.0.0.1:18790:18789"  # 仅 loopback，非 0.0.0.0
```

**验收**:
- [x] `netstat -an | grep 18790` 显示 `127.0.0.1:18790`（已验证 TCP LISTENING）
- [ ] 从另一台机器无法连接 Gateway 端口
- [x] `docker ps` 显示 openclaw 容器运行中且 healthy

### 0.3 防火墙规则（defense-in-depth）

**Docker 已提供网络隔离，防火墙作为第二层兜底**:

```bash
# Windows Defender Firewall（开发环境）
# 兜底：即使 Docker 端口映射配置错误，也阻止外部访问
netsh advfirewall firewall add rule name="Block OpenClaw Ports Inbound" dir=in action=block protocol=tcp localport=18790-18889
```

**验收**:
- [ ] 防火墙规则已配置
- [ ] 从外部 telnet 18790 失败

### 0.4 最小权限原则（Docker 容器级）✅ (部分)

**容器安全加固（已实施）**:
- 容器镜像默认以 `node` 用户运行（uid 1000，非 root）
- `security_opt: [no-new-privileges:true]` — 禁止提权
- Token scope 使用最小权限（不授予 `operator.admin`）

**不兼容项（已验证，暂不启用）**:
- ~~`read_only: true`~~ — OpenClaw 需写入 `/home/node/.openclaw/`（config + canvas）和 `/tmp/openclaw/`（日志），设置只读会导致启动失败
- ~~`user: "1000:1000"`~~ — 镜像已默认 node 用户，显式设置反而导致 Docker named volume 权限冲突（EACCES）
- ~~`cap_drop: [ALL]`~~ — 需进一步测试哪些 capabilities 可安全移除
- ~~volume 挂载~~ — Docker named volume 创建时 owner 为 root，与容器内 node 用户冲突，去掉后容器正常运行（数据不持久化，dev 环境可接受）

**当前 docker-compose.yaml 配置**:
```yaml
openclaw:
  security_opt:
    - no-new-privileges:true
  # 不设置 read_only、user、cap_drop、volume（见上方不兼容说明）
```

**验收**:
- [x] `docker exec linkingchat-openclaw whoami` → `node`（非 root，镜像默认）
- [ ] OpenClaw 只能使用 `system.run` 和 `system.which`（待配置）
- [ ] Gateway Token 不含 `operator.admin` scope（待验证 scope 机制）
- [x] 容器以非 root 运行（uid 1000 node）

### 0.5 危险命令拦截链确认

**现有双层防护 + OpenClaw 第三层**:
1. **Layer 1**: Server 端 15 个正则（`device.gateway.ts`）— 在命令到达 OpenClaw 之前拦截
2. **Layer 2**: Desktop 端 11 个正则（`command-blacklist.ts`）— defense-in-depth
3. **Layer 3 (新增)**: OpenClaw `exec-approvals` 配置 → `ask` 模式 → 对应 Draft & Verify

**验收**:
- [ ] `rm -rf /` 在三层中任一层被拦截
- [ ] Server 拦截发生在 OpenClaw 执行之前（命令不应到达 Gateway）

### 0.6 Token 安全

**当前实现**: `lc_gw_<base64url(userId:jti:iat:signature)>` + HMAC-SHA256

**检查**:
- [ ] Token 有 TTL（过期时间）—— 确认 `iat` 后多久失效
- [ ] Token 传输通过 WSS（非明文 WS）—— 开发阶段可用 WS，但生产前必须切 WSS
- [ ] Token 绑定 userId，不可跨用户使用

---

## Phase 1: Docker 部署 OpenClaw + Strategy 重构 ✅

**前置条件**: Phase 0 安全加固方案已确认。

### 任务 1.1: 添加 OpenClaw 到 docker-compose.yaml ✅

**文件**: `docker-compose.yaml`

**实际可用配置**（经过多轮调试验证）:
```yaml
  openclaw:
    image: ghcr.io/openclaw/openclaw:latest
    container_name: linkingchat-openclaw
    security_opt:
      - no-new-privileges:true
    environment:
      - OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN:-lc_dev_token_change_me}
    ports:
      - "127.0.0.1:18790:18789"    # 仅 loopback；容器内端口是 18789
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:18789/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 15s
    restart: unless-stopped
```

> **调试记录**:
> - 容器内部端口是 **18789**（不是 3000），通过 `docker logs` 发现
> - 环境变量名是 **`OPENCLAW_GATEWAY_TOKEN`**（不是 `OPENCLAW_TOKEN`），通过 `openclaw gateway --help` 发现
> - `read_only: true` + `user: "1000:1000"` + `cap_drop: ALL` + volume 挂载均因权限问题导致启动失败，逐一排除后去掉
> - 镜像来自 `ghcr.io`，从国内拉取不稳定，需多次重试或手动 pull

**验收**:
- [x] `docker ps` 显示 `linkingchat-openclaw` 状态 healthy
- [x] 版本 2026.3.13 (>= 2026.1.29)
- [x] `netstat -an | grep 18790` 显示 `127.0.0.1:18790 LISTENING`

### 任务 1.2: 配置环境变量 ✅

**文件**: `apps/server/.env`

```bash
# OpenClaw Gateway (Docker 容器 — single 模式)
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18790    # WebSocket URL（注意是 ws:// 不是 http://）
OPENCLAW_GATEWAY_TOKEN=lc_dev_token_change_me # 与 docker-compose 中的值一致
OPENCLAW_MODE=single                          # single | per-user | pool（见 Strategy Pattern）
```

**不再需要的旧变量**:
- ~~`OPENCLAW_PATH`~~ — 不再 spawn 子进程
- ~~`OPENCLAW_BIND_MODE`~~ — Docker 端口映射处理
- ~~`OPENCLAW_BASE_PORT`~~ / ~~`OPENCLAW_MAX_PORTS`~~ — single 模式不需要
- ~~`GATEWAY_HOST`~~ / ~~`OPENCLAW_WORKSPACES_PATH`~~ — single 模式不需要

### 任务 1.3: 重构 GatewayManagerService（Strategy Pattern）✅

**架构变更**: 从 child_process spawn 改为 **Strategy 模式**，解耦部署方式和业务逻辑。

**新增文件**:
```
apps/server/src/openclaw/strategies/
├── gateway-strategy.interface.ts   ← 扩展接口 + 如何添加新模式的注释
├── single-container.strategy.ts    ← single 模式实现
└── index.ts                        ← 导出
```

**GatewayStrategy 接口**:
```typescript
interface GatewayStrategy {
  acquire(userId: string): Promise<{ url: string; token: string }>;
  release(userId: string): Promise<void>;
  health(userId: string): Promise<boolean>;
  destroy(): Promise<void>;
}
```

**部署模式 (OPENCLAW_MODE)**:
| Mode | 类 | 状态 | 说明 |
|------|---|------|------|
| `single` | `SingleContainerStrategy` | ✅ 已实现 | 所有用户共享一个 Docker 容器 |
| `per-user` | `PerUserContainerStrategy` | TODO | 每用户一个 Docker 容器，动态端口 |
| `pool` | `PoolStrategy` | TODO | N 容器 : M 用户，一致性哈希 |

> **扩展指引**: 添加新模式只需 3 步：
> 1. 在 `strategies/` 下创建实现类
> 2. 在 `gateway-manager.service.ts` 的 `createStrategy()` switch 中注册
> 3. 更新 `OPENCLAW_MODE` 文档

**GatewayManagerService 公共 API（策略无关）**:
- `acquire(userId)` → `{ url, token }` — 获取连接信息
- `release(userId)` — 释放资源（single 模式为 no-op）
- `health(userId)` → `boolean` — 健康检查

**测试**: 8 tests passing（移除 JWT 相关后的测试数，见 Phase 2 优化）（初始化 3 + acquire 2 + release 1 + health 1 + JWT 3 + destroy 1）

**验收**:
- [x] 容器未启动时: `health()` → `false`
- [x] 容器运行中: `acquire()` → `{ url: "ws://127.0.0.1:18790", token: "..." }`
- [x] 不再有 spawn ENOENT 错误
- [x] 不再有超时假阳性
- [x] 未知 mode → 自动降级到 single + 警告日志

### 任务 1.4: Token 配置

**开发环境**: 使用固定 token `lc_dev_token_change_me`（docker-compose 和 .env 一致）。

**生产环境**:
```bash
# 生成随机 Token
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
# 更新 docker-compose.yaml 的 OPENCLAW_GATEWAY_TOKEN 和 apps/server/.env
```

**验收**:
- [ ] 生产部署前替换为随机 token
- [x] 开发环境 docker-compose 和 server .env token 一致

---

## Phase 2: OpenClaw Gateway 联调 ✅

> **详细实施记录**: `docs/dev-openclaw/sprint6-openclaw-integration-plan-phase2.md`

**目标**: Server API 返回真实 Gateway 状态 → Desktop 自动连接 → 命令执行响应正确解析

### 任务 2.1: Server 联调 ✅
- [x] 更新 `.env.example` 和 `.env`（OPENCLAW_MODE/URL/TOKEN）
- [x] 修复 `SingleContainerStrategy.health()` — 任何 TCP 响应视为存活
- [x] 8 tests passing

### 任务 2.2: Desktop 连接验证 & 优化 ✅
- [x] 修复双重 JWT 验证：Controller 直接使用 `req.user.sub` + `acquire()`
- [x] 移除 `getGatewayConnectionInfo()`、`JwtService` 依赖
- [x] 移除 `OpenclawModule` 的 `JwtModule` import
- [x] 连接链路代码审查通过

### 任务 2.3: 修复命令执行响应解析 ✅
- [x] 重写 `executeViaOpenClaw()` 使用流式 `chat()` API
- [x] 区分 `tool_result`（命令输出）/ `text`（Agent 解释）/ `error`
- [x] 新增 `inferExitCode()` 辅助方法
- [x] 移除不再使用的 `createTimeoutPromise()`

---

## Phase 3: 端到端命令执行

> **详细实施记录**: `docs/dev-openclaw/sprint6-openclaw-integration-plan-phase3.md`

**目标**: Mobile → Server → OpenClaw Gateway → Desktop Agent → 结果回传。

### 任务 3.1: 端到端链路验证 (手动)
- [ ] OpenClaw 模式: `echo test` 成功执行，`source: 'openclaw'`
- [ ] child_process 降级: Gateway 停止后命令仍可执行，`source: 'child_process'`
- [ ] 端到端延迟 < 3 秒

### 任务 3.2: 补全 source 字段传回 Server ✅
- [x] ws-protocol `DeviceResultPayload` 添加 `source?` 字段
- [x] Desktop `handleCommandExecute()` 传递 `source` 到 `emitResult()`
- [x] Server `handleResultComplete()` 将 `source` 存入 Command.result JSON
- [x] 类型检查通过，370 tests passing

### 任务 3.3: 危险命令三层拦截验证 (手动)
- [ ] Server 层拦截（命令不到达 Gateway）
- [ ] 拦截行为与 child_process 模式一致

### 任务 3.4: 延迟测量 (手动)
- [ ] child_process < 1s, OpenClaw < 3s

### 任务 3.5: 边界场景测试 (手动)
- [ ] 断连重连、多设备路由、离线超时、大输出截断、JWT 刷新

---

## Phase 4: Predictive 链路打通 (B + D)

### 任务 4.1: 接入 Predictive 自动触发 (B)

**文件**: `apps/server/src/gateway/device.gateway.ts`
- 注入 `PredictiveService`
- `handleResultComplete()` 中，对 `status === 'error'` 的结果调用 `analyzeTrigger()`
- converseId 从 Supervisor Bot DM 会话获取

**验收**:
- [ ] 命令失败 → Supervisor 会话自动收到预测操作卡片
- [ ] 危险操作标记 `dangerLevel: 'dangerous'`

### 任务 4.2: 实现 Predictive 真实执行 (D)

**文件**: `apps/server/src/ai/services/predictive.service.ts`
- `executeAction()` 注入 `BroadcastService`、`CommandsService`、`DevicesService`
- 安全命令 → 创建 Command + 向设备发射 `device:command:execute`
- 危险命令 → 拒绝执行，提示需 Draft & Verify

**验收**:
- [ ] 安全命令: 点击执行 → 设备真正执行 → 结果返回
- [ ] 危险命令: 被拦截，提示需 Draft & Verify

---

## Phase 5: CodingBot Agent (C)

### 任务 5.1: 创建 CodingBotAgent

**新建**: `apps/server/src/agents/impl/coding.agent.ts`
- 继承 `BaseAgent`
- 处理 `@CodingBot` 提及消息
- LLM 驱动的命令分析/错误诊断

### 任务 5.2: 注册 Agent

**文件**: `apps/server/src/agents/agents.module.ts`
- 导入并注册 `CodingBotAgent`

### 任务 5.3: 确认用户注册时 CodingBot 自动创建

检查 `AuthService.register()` 事务中是否已创建 Coding Bot（应该已有，需确认）。

**验收**:
- [ ] `@CodingBot` 提及不再被丢弃
- [ ] CodingBot 能通过 LLM 生成回复

---

## Phase 6: 跨 Bot 通信 + 客户端 WS 补全 (F)

### 任务 6.1: 添加生产触发路径

- CodingBot 完成任务 → `sendBotMessage()` → Supervisor
- Supervisor 路由 → `routeViaSupervisor()` → CodingBot

### 任务 6.2: 客户端 WS 事件监听

- Desktop: `useChatSocket.ts` 添加 `bot:notification` + `bot:cross:notify`
- Mobile: `chat_socket_service.dart` 同上

**验收**:
- [ ] Bot 通知实时推送到客户端，无需刷新

---

## Phase 7: 杂项修复

### 任务 7.1: BatchTrigger max-wait (G)

**文件**: `apps/server/src/agents/events/batch-trigger.service.ts`

添加 `MAX_WAIT_MS = 30_000`，首次事件设置绝对截止时间，超时强制 flush。

### 任务 7.2: LLM Router stream() 降级（低优先级）

`stream()` 添加 try/catch + fallback，同 `complete()` 模式。

---

## 测试矩阵

### 安全测试（Phase 0）

| # | 场景 | 操作 | 期望 | 状态 |
|---|------|------|------|------|
| S1 | 版本验证 | `docker exec linkingchat-openclaw openclaw --version` | >= 2026.1.29 | ✅ 2026.3.13 |
| S2 | 端口绑定 | `netstat -an \| grep 18790` | `127.0.0.1:18790` | ✅ |
| S3 | 外部连接 | 从另一台机器 telnet 18790 | 连接失败 | 待测 |
| S4 | 防火墙 | 检查规则 | 18790-18889 入站阻止 | 待配 |
| S5 | 非 root | `docker exec linkingchat-openclaw whoami` | `node`（uid 1000） | ✅ |
| S6 | ~~只读文件系统~~ | ~~`touch /test`~~ | ~~Permission denied~~ | ❌ 不兼容，已移除 |
| S7 | 工具限制 | 尝试使用未允许的 tool | 被拒绝 | 待配 |
| S8 | 危险命令 | OpenClaw 模式发 `rm -rf /` | Server 层拦截 | 待测 |

### 集成测试（Phase 1-7）

| # | 场景 | Phase | 期望 | 状态 |
|---|------|-------|------|------|
| T1 | Docker 容器运行 | P1-2 | `docker ps` healthy, `acquire()` 返回 url+token | ✅ |
| T2 | 容器未启动 | P1 | `health()` → false | ✅ (单元测试) |
| T3 | Desktop 连接 Gateway | P2 | DevTools 日志确认连接 | ✅ 代码就绪，待端到端验证 |
| T4 | OpenClaw 命令执行 | P3 | `source: openclaw` |
| T5 | 降级 child_process | P3 | `source: child_process` |
| T6 | 危险命令（OpenClaw 模式） | P3 | `COMMAND_DANGEROUS` |
| T7 | Predictive 自动分析 | P4 | 失败命令 → 预测卡片 |
| T8 | Predictive 执行（安全） | P4 | 真实执行 |
| T9 | Predictive 执行（危险） | P4 | 拦截 + Draft & Verify |
| T10 | @CodingBot 提及 | P5 | LLM 回复 |
| T11 | 跨 Bot 通知 | P6 | 实时推送 |
| T12 | BatchTrigger max-wait | P7 | 30s 强制通知 |

### 回归测试

| # | 场景 | 期望 |
|---|------|------|
| R1 | child_process 命令（无 Gateway） | 正常执行 |
| R2 | Whisper 建议 | 3 条建议正常 |
| R3 | Draft 草稿 | 生成正常 |
| R4 | 邮件验证 | 流程不受影响 |
| R5 | 设备换账号归属 | Bug #1 修复有效 |

---

## 开发顺序与依赖关系

```
Phase 0 (安全加固)           ✅ 完成（版本验证 + loopback + no-new-privileges）
  ↓
Phase 1 (Docker + Strategy)  ✅ 完成（容器 healthy + Strategy Pattern + 11 tests）
  ↓
Phase 2 (Gateway 联调)       ✅ 完成（Server 联调 + Desktop 优化 + 流式响应解析）
  ↓
Phase 3 (端到端命令执行)     🔧 Task 3.2 ✅ (source 字段), 3.1/3.3-3.5 待手动验证
  ↓
Phase 4 (Predictive B+D)     ← 依赖命令执行链路
  ↓
Phase 5 (CodingBot Agent)    ← 可与 Phase 4 并行
  ↓
Phase 6 (跨 Bot + 客户端)    ← 依赖 CodingBot
  ↓
Phase 7 (杂项)               ← 独立
```

**关键路径**: ~~Phase 0 → 1 → 2~~ → **3**（端到端命令执行）

---

## 关键文件清单

### 已修改（Phase 1）✅

| 文件 | Phase | 改动 | 状态 |
|------|-------|------|------|
| `docker-compose.yaml` | P1 | 添加 openclaw 服务（端口 18789，OPENCLAW_GATEWAY_TOKEN） | ✅ |
| `apps/server/src/openclaw/gateway-manager.service.ts` | P1 | Strategy Pattern 重构，委托给 GatewayStrategy | ✅ |
| `apps/server/src/openclaw/openclaw.controller.ts` | P1 | 适配新接口（acquire/release/health） | ✅ |
| `apps/server/src/openclaw/gateway-manager.service.spec.ts` | P1 | 11 个测试全部重写 | ✅ |

### 已新建（Phase 1）✅

| 文件 | Phase | 说明 |
|------|-------|------|
| `apps/server/src/openclaw/strategies/gateway-strategy.interface.ts` | P1 | 扩展接口 + 添加新模式指引 |
| `apps/server/src/openclaw/strategies/single-container.strategy.ts` | P1 | single 模式实现 |
| `apps/server/src/openclaw/strategies/index.ts` | P1 | 导出 |

### 已修改（Phase 2）✅

| 文件 | 改动 |
|------|------|
| `apps/server/.env.example` | 替换旧变量为 OPENCLAW_MODE/URL/TOKEN |
| `apps/server/.env` | 添加 3 个新变量 |
| `apps/server/src/openclaw/strategies/single-container.strategy.ts` | 修复 health() 方法 |
| `apps/server/src/openclaw/openclaw.controller.ts` | 简化 getConnectInfo() 使用 req.user.sub |
| `apps/server/src/openclaw/gateway-manager.service.ts` | 移除 getGatewayConnectionInfo() 和 JwtService |
| `apps/server/src/openclaw/openclaw.module.ts` | 移除 JwtModule import |
| `apps/server/src/openclaw/gateway-manager.service.spec.ts` | 简化测试 (11→8 tests) |
| `apps/desktop/src/main/services/command-executor.service.ts` | 重写 executeViaOpenClaw() 使用流式 chat() |

### 已修改（Phase 3）✅

| 文件 | 改动 |
|------|------|
| `packages/ws-protocol/src/payloads/device.payloads.ts` | 添加 `source?` 字段到 `DeviceResultPayload` |
| `apps/desktop/src/main/services/ws-client.service.ts` | `handleCommandExecute()` 传递 `source` |
| `apps/server/src/gateway/device.gateway.ts` | `handleResultComplete()` 将 `source` 存入 Command.result |

### 待修改（Phase 4-7）

| 文件 | Phase | 改动 |
|------|-------|------|
| `apps/server/src/gateway/device.gateway.ts` | P4 | 注入 PredictiveService |
| `apps/server/src/ai/services/predictive.service.ts` | P4 | executeAction 真实下发 |
| `apps/server/src/agents/agents.module.ts` | P5 | 注册 CodingBotAgent |
| `apps/desktop/src/renderer/hooks/useChatSocket.ts` | P6 | WS 事件监听 |
| `apps/mobile/lib/core/network/chat_socket_service.dart` | P6 | WS 事件监听 |
| `apps/server/src/agents/events/batch-trigger.service.ts` | P7 | max-wait |

### 待新建

| 文件 | Phase |
|------|-------|
| `apps/server/src/agents/impl/coding.agent.ts` | P5 |

### 环境变量配置

| 变量 | 值 | 说明 |
|------|-----|------|
| `OPENCLAW_GATEWAY_URL` | `ws://127.0.0.1:18790` | WebSocket URL（ws:// 协议） |
| `OPENCLAW_GATEWAY_TOKEN` | `lc_dev_token_change_me` | Gateway 认证 Token（生产环境替换） |
| `OPENCLAW_MODE` | `single` | 部署模式: `single` / `per-user` / `pool` |

---

## 安全参考资料

- [CVE-2026-25253 — NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-25253)
- [OpenClaw Security Docs](https://docs.openclaw.ai/gateway/security)
- [OpenClaw Security Hardening Guide — ClawTrust](https://clawtrust.ai/blog/openclaw-security-hardening-guide)
- [OpenClaw Security Architecture — Nebius](https://nebius.com/blog/posts/openclaw-security)
- [OpenClaw RCE Analysis — RunZero](https://www.runzero.com/blog/openclaw/)

---

## 风险与注意事项

1. ~~**CVE-2026-25253**~~: ✅ 已验证版本 2026.3.13 >> 2026.1.29
2. **Docker Desktop 依赖**: Windows 开发机需要 Docker Desktop 运行（WSL2 backend）
3. ~~**端口冲突**~~: ✅ 18790 已绑定 loopback，无冲突
4. **Docker 镜像拉取**: `ghcr.io` 从国内拉取极不稳定（多次超时），需多次重试或手动 pull。Docker Hub (`registry-1.docker.io`) 无代理时完全不可达
5. **converseId 路由**: Predictive 触发需从 Command → Supervisor Converse 反查
6. **历史用户补建**: 已注册用户如缺 CodingBot，需数据迁移脚本
7. **ClawHub 恶意 Skills**: 不安装第三方 Skills，仅使用内置 tools
8. **容器内命令执行**: Docker 容器是隔离环境，OpenClaw 在容器内执行命令不会影响宿主机。Desktop 端通过 `openclaw-node` WebSocket 客户端连接 Gateway，由 Desktop 本地执行。
9. **容器数据不持久化**: 当前 dev 环境未挂载 volume（因权限冲突），容器重建后 config/日志丢失。Token 通过环境变量注入所以不受影响。生产环境需解决 volume 权限问题。
10. **read_only 不兼容**: OpenClaw 需写入 `~/.openclaw/` 和 `/tmp/openclaw/`，无法启用 `read_only: true`。安全补偿：loopback 绑定 + no-new-privileges + 非 root。
