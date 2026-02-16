# ZeroClaw 评估报告

> 评估日期：2026-02-16
> 评估时机：Sprint 2 Phase 9（客户端 UI 集成阶段）
> 项目地址：https://github.com/zeroclaw-labs/zeroclaw

---

## 一、ZeroClaw 是什么

ZeroClaw 是一个 2026-02-13 发布的 **Rust 编写的轻量级 AI Agent 基础设施**，定位为 OpenClaw 的替代方案。

| 属性 | 值 |
|------|-----|
| 版本 | v0.1.0 (首发) |
| 语言 | Rust (100%) |
| 二进制大小 | ~3.4MB |
| 内存占用 | <5MB RAM |
| 启动时间 | <10ms |
| Stars | 4k (发布 3 天) |
| License | MIT |
| 通信协议 | HTTP REST (`/webhook` POST) |
| AI Providers | 22+ (OpenRouter, Anthropic, OpenAI, Ollama, DeepSeek 等) |
| Channel | 8 个 (CLI, Telegram, Discord, Slack, WhatsApp, iMessage, Matrix, Webhook) |
| 内置 Tools | 13 个 (shell, file_read, file_write, screenshot, browser, memory 等) |
| 安全模型 | workspace sandbox, command allowlist, forbidden paths, rate limiting |
| 身份系统 | 支持 OpenClaw 格式 (markdown) + AIEOS v1.1 (JSON) |

---

## 二、与 OpenClaw 对比

| 维度 | ZeroClaw | OpenClaw |
|------|----------|----------|
| **语言** | Rust (编译型) | TypeScript (Node.js 22+) |
| **部署** | 单个 3.4MB 二进制 | npm 依赖 >100MB + Node.js 运行时 |
| **内存** | <5MB | >1GB |
| **通信协议** | HTTP REST (无 WebSocket) | WebSocket JSON-RPC (双向实时) |
| **架构** | 单机 daemon/gateway | Gateway(云) + Node(本地) 分离 |
| **远程控制** | 需额外配 cloudflare/tailscale/ngrok | SSH 反向隧道内置 |
| **Windows** | ✅ 原生编译 (ARM/x86/RISC-V) | ⚠️ 推荐 WSL2，原生支持不成熟 |
| **成熟度** | v0.1.0，极新 | 100k+ stars，多次迭代，社区成熟 |

### 2.1 架构匹配度分析

**linkingChat 架构**：Cloud Brain (NestJS) + Local Hands (Electron Desktop)

```
Mobile ←WSS→ Cloud Brain ←WSS→ Desktop Client
                                  └── 命令执行引擎 (当前: child_process.exec)
```

- **OpenClaw 优势**：Gateway + Node 分离天然匹配 "Cloud Brain + Local Hands"，WebSocket JSON-RPC 与项目通信模式一致
- **ZeroClaw 优势**：单二进制部署简单、Windows 原生支持、资源占用极低
- **ZeroClaw 劣势**：无 WebSocket，需要在 Desktop Client 内部做 HTTP→WS 桥接

### 2.2 安全模型对比

| | ZeroClaw | OpenClaw | linkingChat 需求 |
|---|---------|----------|-----------------|
| 执行审批 | autonomy levels (readonly/supervised/full) | exec-approvals (deny/allowlist/ask/full) | Draft & Verify → `ask` 模式 |
| 命令白名单 | ✅ `allowed_commands` | ✅ allowlist 模式 | ✅ 黑名单制 (Q8 决策) |
| 路径保护 | ✅ `forbidden_paths` + workspace scoping | ✅ 类似 | ✅ 需要 |
| sandbox | ✅ 编译级别安全 | ⚠️ Node.js 级别 | 越强越好 |

两者安全模型均满足需求，ZeroClaw 的 Rust 级 sandbox 理论上更安全。

---

## 三、当前项目集成状态

### 3.1 OpenClaw 在代码中的存在

**结论：零集成。**

- 源码中（ts/tsx/dart）无任何 OpenClaw 引用
- 当前桌面端使用 `child_process.exec()` 直接执行 shell 命令
- OpenClaw 集成原在 Sprint 2 Phase 8，已标记为 ⏭ Delayed

### 3.2 当前执行层架构

```
apps/desktop/src/main/services/
├── ws-client.service.ts          # WebSocket 客户端，接收命令
│   └── handleCommandExecute()    # 命令处理入口
│       ├── isDangerousCommand()  # 黑名单检查
│       └── executor.execute()    # 调用执行器 ← 唯一触点
├── command-executor.service.ts   # 命令执行器 (81 行)
│   └── CommandExecutor.execute() # child_process.exec() 封装
└── command-blacklist.ts          # 危险命令黑名单
```

**接口定义**（已稳定）:
```typescript
interface CommandResult {
  status: 'success' | 'error';
  data?: { output?: string; exitCode?: number };
  error?: { code: string; message: string };
  executionTimeMs: number;
}

class CommandExecutor {
  execute(command: string, timeout?: number): Promise<CommandResult>
}
```

---

## 四、切换难度评估

### 结论：极低

| 维度 | 评估 |
|------|------|
| 需要改的文件 | **1 个** (`command-executor.service.ts`, 81 行) |
| 接口变更 | **无**，`CommandResult` 保持不变 |
| 上游影响 (ws-client) | **零** |
| 服务端影响 (Cloud Brain) | **零** |
| Mobile 影响 | **零** |

### 切换所需额外工作

1. **进程管理**：新增 `zeroclaw-manager.service.ts`，负责在 Electron 启动时 spawn `zeroclaw daemon`，退出时 kill
2. **Pairing**：Electron 启动时自动 POST `/pair` 获取 bearer token
3. **执行器替换**：将 `child_process.exec()` 改为 `fetch('http://127.0.0.1:8080/webhook', ...)`
4. **结果解析**：将 ZeroClaw 响应转换为 `CommandResult` 格式

### 如果切换 OpenClaw

1. **进程管理**：spawn `openclaw node run` 进程
2. **WebSocket 连接**：建立到 OpenClaw Node 的 WebSocket JSON-RPC 连接
3. **执行器替换**：将 `child_process.exec()` 改为 WebSocket JSON-RPC 调用
4. **结果解析**：将 OpenClaw 响应转换为 `CommandResult` 格式

两种切换的工作量相当，均为 1-2 个文件的改动。

---

## 五、决策

### 当前决策：不切换，保持观察

**理由**：
1. ZeroClaw v0.1.0 太新（发布仅 3 天），可能有大量 breaking changes
2. OpenClaw Gateway+Node 架构更匹配 "Cloud Brain + Local Hands"
3. 当前 `child_process.exec()` 覆盖 MVP 命令执行需求
4. 执行层已天然解耦，未来切换成本极低，不需要预防性重构

### 观察指标

| 指标 | 关注点 |
|------|--------|
| ZeroClaw 版本 | 等待 v0.3+ 或 v0.5+ 稳定版 |
| WebSocket 支持 | 是否添加 WebSocket channel (trait 系统支持扩展) |
| Windows 验证 | 实际在 Windows 上的兼容性测试结果 |
| 社区反馈 | 生产环境使用案例 |
| OpenClaw Windows | OpenClaw 是否改善原生 Windows 支持 |

### 建议时间线

| 时间 | 行动 |
|------|------|
| **Sprint 2 (当前)** | 继续用 `child_process.exec()`，完成 Phase 9 UI |
| **Sprint 3 开始前** | 重新评估 ZeroClaw 版本和生态 |
| **Sprint 3/4 (AI + 远程控制)** | 设计 `AgentExecutor` 抽象接口，支持多后端 |

### 远期架构建议

在 Sprint 3/4 集成 AI 能力时，建议引入 `AgentExecutor` 接口：

```typescript
interface AgentExecutor {
  initialize(): Promise<void>;
  execute(command: string, options?: ExecuteOptions): Promise<CommandResult>;
  shutdown(): Promise<void>;
}

// 三种实现
class NativeExecutor implements AgentExecutor { /* child_process.exec */ }
class OpenClawExecutor implements AgentExecutor { /* WebSocket JSON-RPC */ }
class ZeroClawExecutor implements AgentExecutor { /* HTTP REST /webhook */ }
```

这样可以通过配置切换执行后端，不影响上层业务逻辑。

---

## 六、ZeroClaw 亮点（持续关注）

即便不切换，以下方面值得借鉴：

1. **AIEOS v1.1 身份标准**：可标准化 Bot 配置格式（identity, psychology, linguistics, capabilities）
2. **单二进制分发**：如果选择 ZeroClaw，Electron 打包时不需要捆绑 Node.js 运行时
3. **FTS5 + vector 混合搜索**：Bot 长期记忆方案比外部向量数据库轻量得多
4. **Trait-based 插件系统**：如果后续写 Rust 高性能组件，是好的架构参考

---

> **关联文档**：
> - `docs/decisions/tech-decisions-v2.md` §2 — OpenClaw 原始技术调研
> - `docs/dev/sprint2_implement.md` — Sprint 2 Phase 8 (OpenClaw 集成) delay 说明
> - `apps/desktop/src/main/services/command-executor.service.ts` — 当前执行层实现
