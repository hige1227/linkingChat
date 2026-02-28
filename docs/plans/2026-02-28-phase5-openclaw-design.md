# Phase 5: OpenClaw Node 集成设计文档

> 创建日期: 2026-02-28
> 状态: 已确认
> 作者: CTO (Claude)

## 1. 背景

Sprint 3 Phase 5 需要将现有的 `child_process.exec()` 命令执行方式替换为 OpenClaw Node SDK，实现更安全、更可控的远程命令执行能力。

### 1.1 核心原则

- **零门槛**: 用户只需安装 + 授权，无需任何技术配置
- **安全优先**: 默认询问策略，危险命令需确认
- **智能汇报**: 执行结果经过 Agent 处理后再返回用户

## 2. 架构设计

### 2.1 数据流

```
用户手机 App 发送命令
        ↓
Cloud Brain (NestJS) 处理 + 转发
        ↓
Desktop (Electron) 接收
        ↓
内置 OpenClaw Node 执行 shell 命令
        ↓
结果返回 → Cloud Gateway Agent
        ↓
Agent 分析 + 智能处理 + 汇报
        ↓
推送到用户手机端
```

### 2.2 组件架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         Cloud Brain                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ WS Gateway   │ ←→ │ OpenClaw     │ ←→ │ Agent Service    │   │
│  │ (现有)       │    │ Gateway SDK  │    │ (智能处理)       │   │
│  └──────────────┘    └──────────────┘    └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↑↓ WebSocket
┌─────────────────────────────────────────────────────────────────┐
│                       Desktop (Electron)                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ WS Client    │ ←→ │ OpenClaw     │ ←→ │ Command Executor │   │
│  │ (现有)       │    │ Node SDK     │    │ (shell执行)      │   │
│  └──────────────┘    └──────────────┘    └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 3. 核心组件

### 3.1 Cloud Brain 组件

| 组件 | 职责 | 技术 |
|------|------|------|
| **OpenClaw Gateway SDK** | 命令路由、状态管理、Agent 调度 | @openclaw/gateway (npm) |
| **Agent Service** | 结果分析、智能汇报、上下文处理 | NestJS Service |

### 3.2 Desktop 组件

| 组件 | 职责 | 技术 |
|------|------|------|
| **OpenClaw Node SDK** | 命令执行、能力上报、安全策略 | @openclaw/node (npm) |
| **Command Executor** | Shell 命令执行 | 替换现有 child_process |

## 4. 安全模型

### 4.1 exec-approvals 策略

复用 OpenClaw 的安全模型，支持四种模式：

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `deny` | 拒绝所有执行 | 高安全模式 |
| `allowlist` | 只执行白名单命令 | 生产环境默认 |
| `ask` | 首次执行询问用户 | 新用户默认 |
| `full` | 允许所有执行 | 开发调试 |

### 4.2 默认策略流程

```
用户首次执行命令
        ↓
Desktop 弹窗确认："允许执行 'ls -la' ?"
        ↓
用户选择: [允许] [拒绝] [总是允许]
        ↓
选择"总是允许" → 命令加入 allowlist
        ↓
后续自动执行
```

### 4.3 危险命令检测

以下命令模式自动标记为危险，强制弹窗确认：

- `rm -rf /`
- `sudo` 开头的命令
- `chmod 777`
- `dd` 命令
- 格式化命令 (`format`, `mkfs`)

## 5. 能力上报

Desktop 启动时自动上报支持的能力：

```typescript
{
  deviceId: "device-uuid",
  capabilities: [
    "system.run",      // Shell 命令执行
    "system.notify",   // 系统通知
    // 未来扩展:
    // "camera.snap",
    // "screen.record",
    // "location.get"
  ],
  platform: "darwin" | "win32",
  version: "1.0.0"
}
```

## 6. 降级策略

当 OpenClaw SDK 不可用时，自动降级到现有 `child_process.exec()`：

```typescript
async executeCommand(command: string): Promise<CommandResult> {
  try {
    // 优先使用 OpenClaw Node SDK
    return await this.openClawNode.execute(command);
  } catch (error) {
    // 降级到 child_process
    this.logger.warn('OpenClaw unavailable, falling back to child_process');
    return await this.legacyExecutor.execute(command);
  }
}
```

## 7. 开发任务

| # | 任务 | 预估 | 依赖 |
|---|------|------|------|
| 1 | 添加 OpenClaw SDK 依赖 (Cloud + Desktop) | 0.5天 | - |
| 2 | Desktop 集成 OpenClaw Node SDK | 1天 | #1 |
| 3 | Cloud Brain 集成 OpenClaw Gateway SDK | 1天 | #1 |
| 4 | Agent Service 结果处理逻辑 | 1天 | #3 |
| 5 | 安全策略 + 弹窗确认 UI | 1天 | #2 |
| 6 | 端到端测试 | 0.5天 | 全部 |

**总计: 约 5 天**

## 8. 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| OpenClaw SDK 不稳定 | 中 | 降级策略 + 版本锁定 |
| 跨平台兼容性 | 中 | Windows/macOS 双平台测试 |
| 安全漏洞 | 高 | 默认 ask 策略 + 危险命令检测 |

## 9. 决策记录

### 2026-02-28 架构决策

- **选择方案 C**: Desktop 内置 OpenClaw Node SDK
- **原因**: 零门槛用户体验，复用现有 WebSocket 通道
- **确认人**: CEO

### 关键澄清

- 执行结果必须经过 Cloud Gateway Agent 处理后再返回用户
- Agent 负责结果分析、智能处理、上下文添加
