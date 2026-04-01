# OpenClaw + Desktop 封装架构方案

> **创建日期**: 2026-03-31
> **修订日期**: 2026-04-01 (Phase 1 运行时代码完成 + 暂缓打包决策)
>
> **核心原则**: 封装 ≠ 耦合。一个安装包是为用户便利，运行时是两个独立进程。
>
> **硬性要求**:
> - OpenClaw 必须保留，不可移除
> - 用户下载一个安装包，安装完即可使用
> - 运行时 Desktop 和 OpenClaw 是独立进程，通过本地 WebSocket 通信
> - Desktop 没有 OpenClaw 时降级到 child_process，基础功能不受影响

---

## 一、生产拓扑

```
Mobile (手机)                  Cloud Server (NestJS)                 用户电脑

Flutter App ───WSS──→        ┌──────────────┐        ←──WSS─── Desktop App (Electron)
  ├── 发命令                  │  WS Gateway   │                      │
  ├── 看结果                  │  LLM Router   │                      │ 本地 WS
  └── 审批 Draft              │  Device GW    │                      ▼
                              └──────────────┘              OpenClaw Gateway
                                                            (独立后台进程)
                                                              ├── AI Agent 引擎
                                                              ├── 工具调用
                                                              └── ws://127.0.0.1:18789
```

**关键点**:
- Mobile 和 Desktop 都是 **客户端**，主动连接 Cloud Server
- Cloud Server 做消息路由，**不直接管理** OpenClaw
- Desktop 和 OpenClaw 在同一台电脑上，通过 **localhost WebSocket** 通信
- OpenClaw 是后台进程，用户无感知

---

## 二、组件职责划分

| 组件 | 职责 | 不做什么 |
|------|------|---------|
| **Cloud Server** | 消息路由、用户认证、LLM Router、数据持久化 | 不管理 OpenClaw 生命周期 |
| **Desktop App** | 社交 UI、接收命令、管理本地 OpenClaw 进程、结果回传 | 不内嵌 OpenClaw 代码 |
| **OpenClaw Gateway** | AI Agent、意图理解、多步骤编排、工具调用 | 不知道 Desktop 的存在 |
| **Mobile App** | 远程控制入口、社交 UI、审批 Draft | 不直接接触 OpenClaw |

---

## 三、OpenClaw 技术调研结论

| 项目 | 结论 |
|------|------|
| **语言/运行时** | TypeScript (ESM)，Node.js 22+ LTS |
| **npm 包名** | `openclaw`（全局安装: `npm install -g openclaw`） |
| **CLI 入口** | `openclaw gateway run --port 18789 --bind loopback` |
| **原生依赖** | 有 `sharp`（图像处理），提供预编译二进制 |
| **内存占用** | 基础 ~300MB，每个活跃通道 +100MB |
| **许可证** | MIT |
| **独立二进制** | 无。只有 npm 包 和 Docker 镜像 |
| **官方 Windows 方案** | `openclaw-windows-node`（WinUI 3 托盘应用，连接外部 Gateway） |

### 打包方案评估

| 方案 | 可行性 | 风险 | 说明 |
|------|--------|------|------|
| **A. Bundle Node.js + npm 包** | ✅ 推荐 | 低 | 镜像官方安装方式，最稳定 |
| B. `pkg` 编译为单文件 exe | ⚠️ | 高 | OpenClaw 用 jiti 动态加载 TS，pkg 大概率打包失败 |
| C. Node.js SEA (`--build-sea`) | ❌ | 极高 | SEA 不支持动态 `import()` 和 `node_modules` 解析，OpenClaw 使用 jiti 动态加载 TS，完全不兼容 |
| D. 共用 Electron 的 Node.js | ⚠️ | 中 | Electron 35 内置 Node 22.x，版本匹配，但 Electron 的 Node 是定制版本（含 Chromium 集成 patches），ESM 加载路径和 `worker_threads` 行为可能不兼容 OpenClaw 的 jiti 动态加载 |
| E. 首次启动联网安装 | ✅ 备选 | 中 | 依赖网络，首次体验差，但包体积最小 |

**结论: 采用方案 A，方案 E 作为降级备选。**

---

## 四、安装包结构

### 4.1 构建时准备（CI/CD）

```bash
scripts/prepare-openclaw-sidecar.sh

# 对每个目标平台 (win-x64, mac-x64, mac-arm64):
# 1. 下载 Node.js 22 LTS 二进制
# 2. npm install openclaw@<pinned-version> --prefix ./sidecar/<platform>/
# 3. 产出结构:

sidecar/
├── win-x64/
│   ├── node.exe                    # Node.js 22 LTS (~70MB)
│   └── node_modules/
│       └── openclaw/               # OpenClaw 及其依赖 (~80-150MB)
│           └── bin/openclaw.mjs    # CLI 入口
├── mac-x64/
│   ├── node
│   └── node_modules/openclaw/
└── mac-arm64/
    ├── node
    └── node_modules/openclaw/
```

### 4.2 electron-builder 配置

> 注: 项目实际使用 YAML 格式 (`electron-builder.yaml`)，以下为等效 YAML 配置。

```yaml
# electron-builder.yaml — 追加 extraResources 部分
extraResources:
  - from: "sidecar/${platform}/"
    to: "openclaw-sidecar/"
    filter:
      - "**/*"
```

### 4.3 安装后目录结构（Windows）

```
C:\Users\<user>\AppData\Local\Programs\LinkingChat\
├── LinkingChat.exe                          # Electron 主程序
├── resources/
│   ├── app.asar                             # Electron 应用代码
│   └── openclaw-sidecar/                    # OpenClaw 运行时
│       ├── node.exe                         # 独立的 Node.js 22
│       └── node_modules/
│           └── openclaw/
│               └── bin/openclaw.mjs         # Gateway CLI
└── ...
```

> **路径解析注意**: 打包后代码中应使用 `path.join(process.resourcesPath, 'openclaw-sidecar')` 获取 sidecar 路径，**不要**使用 `__dirname` 相关路径（asar 内部和 extraResources 的路径解析方式不同）。

### 4.4 预估安装包体积

| 组件 | 体积 |
|------|------|
| Electron 框架 | ~150MB |
| 应用代码 (asar) | ~5MB |
| Node.js 22 二进制 | ~70MB |
| OpenClaw + 依赖 | ~80-150MB |
| **安装包总计** | **~300-400MB** |

> 参考: Discord 安装包 ~120MB，VS Code ~100MB，Docker Desktop ~500MB。
> 我们偏大但可接受，主要是多了一个完整的 Node.js 运行时。

---

## 五、运行时架构

### 5.1 进程模型

```
用户双击 LinkingChat.exe
        │
        ▼
┌── Electron Main Process (进程 1) ──────────────────────────────┐
│   ① 检查端口 18789 是否已被占用                                  │
│   ② 没占用 → spawn OpenClaw 进程                                │
│   ③ 等待健康检查通过                                             │
│   ④ openclaw-node 客户端连接 ws://127.0.0.1:18789              │
│   ⑤ socket.io 连接 wss://api.linkingchat.com                   │
│   ⑥ 正常工作                                                    │
└─────────┬───────────────────────────────────────────────────────┘
          │ spawn (detached: false)
          ▼
┌── OpenClaw Gateway (进程 2) ───────────────────────────────────┐
│   node.exe openclaw.mjs gateway run --port 18789 --bind loopback│
│                                                                 │
│   ├── WebSocket Server on 127.0.0.1:18789                      │
│   ├── AI Agent 引擎                                             │
│   ├── 工具: system.run, system.which, file.read, file.write    │
│   └── 仅接受匹配 Token 的连接                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 生命周期管理

```
Desktop 启动
    │
    ├── 端口 18789 已被占用？
    │   ├── 是 → 健康检查 + 版本验证（见 §6.3）
    │   │        ├── 通过 → 直接连接（可能是用户自己装的 OpenClaw）
    │   │        └── 失败 → 端口被其他程序占用，记录警告，降级到 child_process
    │   │
    │   └── 否 → spawn OpenClaw 进程
    │            ├── 环境变量: OPENCLAW_GATEWAY_PORT=18789
    │            │             OPENCLAW_GATEWAY_TOKEN=<随机生成>
    │            ├── stdout/stderr 写入日志文件
    │            └── 监听 exit 事件 → 异常退出则自动重启（最多 3 次）
    │
    ├── 健康检查循环（最多等 10 秒）
    │   └── GET http://127.0.0.1:18789/health → 200 → 就绪
    │
    ├── openclaw-node 连接 ws://127.0.0.1:18789
    │
    └── 正常运行...

Desktop 退出（跨平台处理）
    │
    ├── Windows: 通过 IPC channel 发送 shutdown 消息 → 等待 3 秒 → taskkill /PID /F
    ├── macOS/Linux: SIGTERM → 等待 3 秒优雅关闭 → 超时则 SIGKILL
    │
    └── 备选: 若 OpenClaw 支持 POST /shutdown 端点，优先使用 HTTP 关闭
```

> **Windows 注意**: Windows 不支持 POSIX signals。`process.kill(pid, 'SIGTERM')` 在 Windows 上等同于立即终止进程，没有优雅关闭的机会。因此 Windows 下必须使用其他方式通知子进程退出（IPC channel / stdin 关闭 / HTTP 端点）。

### 5.3 降级策略

```
收到命令
    │
    ├── OpenClaw 连接正常？
    │   ├── 是 → chat() 流式执行 → 返回 {source: 'openclaw'}
    │   └── 否 → child_process.exec() → 返回 {source: 'child_process'}
    │
    └── 结果回传 Server → Mobile
```

> **已有代码完全支持此降级**，`command-executor.service.ts` 的 `execute()` 方法已实现 OpenClaw → child_process fallback。

---

## 六、Token 与安全

### 6.1 本地 Token 方案

```
Desktop 启动时:
  ① 生成随机 Token: crypto.randomBytes(32).toString('hex')
  ② 保存在内存变量中（不持久化到磁盘）
  ③ 通过环境变量传给 OpenClaw 进程: OPENCLAW_GATEWAY_TOKEN=<token>
  ④ openclaw-node 连接时使用同一 Token

Token 生命周期 = OpenClaw 进程生命周期（每次重启重新生成）
```

**为什么不持久化 Token**:
- Desktop 管理 OpenClaw 的生命周期，每次启动重新生成更安全
- 内存变量随进程退出自动清除，即使 Desktop crash 也不会残留到磁盘
- 不需要共享配置文件，减少攻击面
- 如果用户自己安装了 OpenClaw（端口已占用），则使用用户自己配置的 Token

### 6.2 安全保障

| 措施 | 说明 |
|------|------|
| **loopback 绑定** | `--bind loopback` → 仅 127.0.0.1 可访问 |
| **随机 Token** | 每次启动随机生成，防止跨应用窃取 |
| **进程隔离** | OpenClaw 是独立进程，crash 不影响 Desktop UI |
| **危险命令拦截** | Layer 1 (Server) + Layer 2 (Desktop) 在命令到达 OpenClaw 前拦截 |
| **无外部端口** | 18789 不暴露到外网 |
| **端口占用验证** | 非 Desktop spawn 的进程需验证 OpenClaw 版本签名后才连接（见 §6.3） |

### 6.3 端口已占用时的安全验证

当 Desktop 检测到 18789 端口已被占用时，不能盲目连接 — 恶意程序可能模拟 `/health` 端点。

**验证流程**:
```
端口已占用
    │
    ├── GET http://127.0.0.1:18789/health
    │   ├── 响应不是 200 → 降级到 child_process
    │   └── 200 → 检查响应体
    │            ├── 包含 OpenClaw 版本签名字段 → 可信，连接
    │            └── 不包含或格式不匹配 → 视为不可信，降级到 child_process
    │
    └── 可选: 弹窗提示用户 "检测到已运行的 OpenClaw 实例，是否连接？"
```

> 如果 OpenClaw `/health` 端点不返回版本信息，可在 Phase B 实施时调研其实际响应格式，选择合适的验证方式。

---

## 七、Server 端变更

### 7.1 需要移除的

| 文件 | 变更 | 原因 |
|------|------|------|
| `openclaw.controller.ts` | 移除 `GET /gateway/connect` | Desktop 不再从 Server 获取连接信息 |
| `gateway-manager.service.ts` | 移除或大幅简化 | Server 不再管理 OpenClaw 实例 |
| `openclaw.module.ts` | 简化 imports | 不再需要 ConfigModule 读取 OPENCLAW_* 变量 |
| `strategies/` | 保留代码，暂不使用 | 未来云端 OpenClaw 场景可复用 |
| `__tests__/gateway-manager.service.spec.ts` | 同步更新或移除 | 测试需匹配简化后的实现 |

### 7.2 需要保留的

| 功能 | 说明 |
|------|------|
| 设备心跳中的 OpenClaw 状态 | Desktop 在心跳中上报 `openclawConnected: true/false` |
| `source` 字段持久化 | `device.gateway.ts` 已实现，保留 |
| 危险命令拦截 (Layer 1) | 和 OpenClaw 无关，保留 |

> **注意**: 当前 Desktop WebSocket 客户端**尚未实现**心跳发送。Server 的 `device:heartbeat` handler 已就绪，但 Desktop 从未发送该事件。需要在实施时补充。

### 7.3 docker-compose.prod.yaml

```yaml
# 生产环境不再包含 openclaw 容器
# OpenClaw 运行在用户电脑上，不在服务器上
services:
  server:    # NestJS
  postgres:  # 数据库
  redis:     # 缓存/PubSub
  nginx:     # 反向代理 + SSL
  # openclaw: ← 移除
```

### 7.4 docker-compose.yaml（开发环境）

```yaml
# 开发环境保留 openclaw 容器，方便开发调试
# 开发时 Desktop 可以连本地 Docker 容器或本地 sidecar 进程
openclaw:
  image: ghcr.io/openclaw/openclaw:latest
  # ... 保持不变
```

---

## 八、Desktop 端变更

### 8.1 新增: OpenClaw 进程管理器

```
新建: apps/desktop/src/main/services/openclaw-process.service.ts

职责:
  - spawn / stop / restart OpenClaw 进程
  - 健康检查 (HTTP /health) + 版本验证
  - Token 生成与传递（内存变量）
  - 日志收集 (stdout/stderr → app.getPath('logs')/openclaw/)
  - 崩溃自动重启 (max 3 次)
  - 跨平台进程关闭 (Windows: IPC/taskkill, macOS/Linux: SIGTERM/SIGKILL)

日志管理:
  - 日志文件位置: app.getPath('logs') + '/openclaw/'
  - 按日期轮转 (openclaw-2026-04-01.log)
  - 保留最近 7 天日志，自动清理旧文件
  - UI 中提供 "导出日志" 功能（用于 bug 报告）
```

### 8.2 修改: OpenClaw 客户端连接

```
修改: apps/desktop/src/main/services/openclaw-client.service.ts

之前: 从 Server API 获取 url + token
之后: 从本地 openclaw-process.service 获取 url + token
       url 固定为 ws://127.0.0.1:18789
       token 由进程管理器提供
```

### 8.3 修改: 命令执行器

```
修改: apps/desktop/src/main/services/command-executor.service.ts

无需大改，已有 OpenClaw → child_process 降级逻辑。
仅需确保 isClientConnected() 检测正确。
```

### 8.4 新增: 构建脚本

```
新建: scripts/prepare-openclaw-sidecar.sh (Linux/Mac CI)
新建: scripts/prepare-openclaw-sidecar.ps1 (Windows CI)

职责:
  - 下载 Node.js 22 LTS 二进制 (per platform)
  - npm install openclaw@<version> --prefix sidecar/<platform>/
  - 验证 openclaw gateway --version 可执行
```

### 8.5 补充: Desktop 心跳发送

```
修改: apps/desktop/src/main/services/ws-client.service.ts

当前缺失: Desktop 从未发送 device:heartbeat 事件。
需要补充定时心跳 (每 30s)，payload 包含:
  - deviceId
  - openclawConnected: boolean
```

---

## 九、升级策略

| 场景 | 策略 |
|------|------|
| **Desktop 升级** | electron-updater 自动更新，新版本可能包含新版 OpenClaw sidecar |
| **OpenClaw 升级** | 跟随 Desktop 版本发布。Desktop v1.2 绑定 OpenClaw v2026.3.x |
| **紧急安全补丁** | 仅更新 sidecar 目录中的 OpenClaw（不需要重装 Desktop） |
| **用户自装 OpenClaw** | Desktop 检测到端口已占用 → 验证后使用用户自己的版本（尊重用户选择） |

---

## 十、开发计划与进度

> 实施顺序：先做运行时验证可行性，再做构建打包。
> **Phase 2-4 暂缓**，原因见 §十二。

### Phase 1: 运行时集成 ✅ (2026-04-01)

| # | 任务 | 产出 | 状态 |
|---|------|------|------|
| 1.1 | 实现 `openclaw-process.service.ts` | 进程管理器 (spawn/stop/restart, 健康检查, token, 日志, 崩溃恢复) | ✅ |
| 1.2 | 改造 `openclaw.ipc.ts` 为模式分发 | local/docker 双模式, openclaw:restart handler, 状态广播 | ✅ |
| 1.3 | 补充 Desktop 心跳发送 | ws-client 30s 心跳 + openclawConnected 字段 | ✅ |
| 1.4 | UI 状态指示 + 启动/关闭集成 | sidebar AI 状态点, login/register 后自动连, before-quit 清理 | ✅ |

**实施决策记录**:
- 原计划有 `external` 模式 (用户自定义 URL+Token)，**已删除** — 没有明确用户场景，简化为 `local` + `docker` 两模式
- `openclaw-client.service.ts` **未改动** — 其 `connect({ url, token })` 接口已通用，改造在 IPC 层完成
- `resolvePaths()` 中的路径解析目前匹配 §4.3 的目录结构，但 **local 模式还无法运行**（缺少构建脚本和 extraResources 配置）
- 当前开发环境 **默认走 docker 模式**，行为与改造前完全一致

**代码变更清单**:

| 文件 | 操作 |
|------|------|
| `apps/desktop/src/main/services/openclaw-process.service.ts` | 新建 |
| `apps/desktop/src/main/ipc/openclaw.ipc.ts` | 重写 |
| `apps/desktop/src/main/services/ws-client.service.ts` | 增加心跳 |
| `apps/desktop/src/main/index.ts` | before-quit + mode 日志 |
| `apps/desktop/src/main/ipc/auth.ipc.ts` | login/register/logout 集成 OpenClaw |
| `apps/desktop/src/preload/index.ts` | 新增 IPC bridge |
| `apps/desktop/src/renderer/env.d.ts` | 新增类型 |
| `apps/desktop/src/renderer/layouts/MainLayout.tsx` | AI 状态点 |
| `packages/ws-protocol/src/payloads/device.payloads.ts` | 增加字段 |
| `apps/server/src/gateway/device.gateway.ts` | heartbeat 类型 |

### Phase 2: 构建管线 ⏸️ 暂缓

| # | 任务 | 产出 | 前置依赖 |
|---|------|------|---------|
| 2.1 | 编写 `prepare-openclaw-sidecar` 脚本 | 构建脚本 (bash + ps1) | 确认 OpenClaw 定制需求 |
| 2.2 | 配置 electron-builder extraResources | electron-builder.yaml 更新 | 2.1 |
| 2.3 | 验证打包后 OpenClaw 可启动 | 手动测试 | 1.1, 2.2 |

### Phase 3: Server 瘦身 ⏸️ 暂缓

| # | 任务 | 产出 | 前置依赖 |
|---|------|------|---------|
| 3.1 | 移除 `GET /openclaw/gateway/connect` | Controller 简化 | Phase 2 完成后 |
| 3.2 | 简化 `GatewayManagerService` | 保留接口，去掉实现 | 3.1 |
| 3.3 | 更新/移除 `gateway-manager.service.spec.ts` | 测试同步 | 3.2 |
| 3.4 | 心跳上报 OpenClaw 状态 | 设备状态增强 | ✅ 已在 Phase 1 完成 |

### Phase 4: CI/CD + 签名 ⏸️ 暂缓

| # | 任务 | 产出 | 前置依赖 |
|---|------|------|---------|
| 4.1 | GitHub Actions 添加 sidecar 构建步骤 | CI 更新 | 2.1 |
| 4.2 | 多平台构建 (win-x64, mac-x64, mac-arm64) | 安装包 | 4.1 |
| 4.3 | Windows Authenticode 代码签名 | 防杀毒误报 | 4.2 |
| 4.4 | macOS Hardened Runtime + Notarization | Gatekeeper 放行 | 4.2 |
| 4.5 | 自动更新测试 (electron-updater) | 更新流程验证 | 4.2 |

---

## 十一、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| OpenClaw 升级破坏兼容性 | 命令执行失败 | 锁定版本号，升级前回归测试 |
| `sharp` 原生依赖平台问题 | 安装失败 | CI 多平台构建验证；OpenClaw 核心不强依赖 sharp |
| 安装包过大 (~400MB) | 下载慢 | 增量更新 (electron-updater delta)；方案 E 作备选 |
| 杀毒软件误报 node.exe | 用户恐慌 | 代码签名 (Windows Authenticode) |
| 18789 端口被占用 | OpenClaw 启动失败 | 自动选择备用端口 (18790-18799)；或检测已有 OpenClaw |
| **端口被恶意程序占用** | **命令泄露/劫持** | **健康检查 + 版本签名验证（§6.3），不盲目连接** |
| OpenClaw 进程 crash | AI 功能不可用 | 自动重启 (max 3)；降级到 child_process |
| 用户已全局安装 openclaw | 版本冲突 | 检测端口占用 → 验证后用户版本优先 |
| **Windows 进程关闭** | **OpenClaw 无法优雅退出** | **IPC channel / HTTP shutdown 端点替代 SIGTERM（§5.2）** |
| **macOS Gatekeeper 拦截** | **spawn node 被阻止** | **Hardened Runtime + Notarization；bundled node 也需签名** |
| **OpenClaw 日志膨胀** | **磁盘空间** | **按日期轮转，保留 7 天，自动清理（§8.1）** |
| **Node.js ABI 版本不匹配** | **原生模块 (sharp) 加载失败** | **锁定 Node.js 大版本，CI 验证原生模块加载（§十二.2）** |

---

## 十二、暂缓决策与待定事项 (2026-04-01)

### 12.1 Phase 2-4 暂缓原因

Phase 1 运行时代码已完成，但 **构建打包 (Phase 2-4) 暂不实施**，原因：

1. **OpenClaw 定制需求未明确** — 是否需要 fork OpenClaw 直接影响构建流程：
   - 不 fork → `npm install openclaw@x.x.x`
   - fork → `npm install @linkingchat/openclaw@x.x.x` 或 git URL
   - 放进 monorepo → `npm install ../../packages/openclaw`

   在实际使用中确认定制需求后再决定。

2. **当前 docker 模式完全可用** — 开发阶段继续使用 Server 管理的 Docker 容器，不影响功能开发。

3. **避免过早优化** — 构建脚本 + CI + 代码签名是一次性投入大但收益延后的工作，适合在接近发布时做。

**恢复条件**: 满足以下任一条件时启动 Phase 2：
- 确认了 OpenClaw 的定制方案（fork / 插件 / 原版）
- 需要给外部用户分发安装包
- 需要在没有 Docker 的环境中运行

### 12.2 Node.js 版本兼容性分析

**结论: 目前无兼容问题，但需要关注 Node.js 大版本锁定。**

#### 当前版本矩阵

| 组件 | Node.js 版本 | 说明 |
|------|-------------|------|
| OpenClaw (v2026.3.13) | 要求 ≥22 | 使用 ESM, jiti, worker_threads |
| Electron 35 内置 Node | 22.15.0 | 仅供 Electron 自身使用，不用于 sidecar |
| 计划捆绑的独立 Node | 22 LTS | 用于运行 sidecar 的 OpenClaw 进程 |
| NestJS Server | ≥20 | 独立于 Desktop，不受影响 |

#### 潜在风险场景

| 场景 | 风险 | 缓解 |
|------|------|------|
| OpenClaw 未来要求 Node 24+ | 需更新捆绑的 Node 二进制 | 构建脚本改 `NODE_VERSION` 即可，低成本 |
| `sharp` 原生模块 ABI 不匹配 | 加载 .node 文件失败 | sharp 提供按平台+Node大版本的预编译二进制 (通过 `@img/sharp-*` 可选依赖自动匹配)，只要 Node 大版本对齐就没问题 |
| Node.js 22 LTS 到期 (2027-04) | 不再有安全更新 | 届时升级到 Node 24 LTS 或更新版本 |
| OpenClaw 使用了 Node.js 实验性 API | 大版本升级后 API 变更 | 锁定 OpenClaw + Node.js 版本对，升级前回归测试 |

#### 不存在的问题

- **Electron 内置 Node 与 sidecar Node 冲突** — 不冲突。两个是完全独立的进程，各用各的 Node 运行时
- **Node.js 小版本差异** — Node LTS 的小版本升级 (22.15 → 22.16) 保持 ABI 兼容，原生模块无需重编译
- **跨平台 Node.js 行为差异** — Node.js 官方保证跨平台行为一致（文件路径分隔符除外），OpenClaw 自身已处理
