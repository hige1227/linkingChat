# OpenClaw 工具调用可见性方案

> **日期**: 2026-04-07
> **状态**: 实施中
> **前置**: Bot DM 流式回复已通 (`docs/realtest/2026-04-07.md`)

---

## 一、问题

OpenClaw Agent 执行工具调用（shell 命令、文件操作等）时，用户只看到最终的文字回复，中间过程完全不可见：

- 跑了什么命令？
- 读/写了什么文件？
- 调了几个工具？每个的输出是什么？

**不透明 = 不可信**。尤其是危险操作场景，用户需要看到 Agent 实际做了什么。

### 当前数据流

```
OpenClaw Gateway
  → stream chunks: text / tool_use / tool_result / done
  → IPC 转发到 renderer
  → store 只积累 text，tool_use 仅做临时显示（🔧 闪一下就没了）
  → 持久化只存 text（POST /bots/:botId/reply）
  → 刷新后工具信息完全丢失
```

### 已知 Bug

`tool_result` 的 chunk.text 格式为 `"toolName: output"`，但 `toolCalls.filter(t => t !== chunk.text)` 拿它和纯工具名 `"toolName"` 比较 — 永远匹配不上，工具永远不会从活跃列表中移除。本方案一并修复。

---

## 二、目标

聊天气泡内展示**可折叠的工具调用块**，保留完整的操作记录：

```
Supervisor 15:54

┌ 🔧 system.run ─────────────────────────┐
│ $ dir /b C:\Users\yehui\Desktop         │   ← 默认折叠，只显示工具名
│                                         │      点击展开看完整输出
│ game                                    │
│ game2                                   │
│ openclaw                                │
│ temp                                    │
│ report.xlsx                             │
└─────────────────────────────────────────┘

桌面上一共有挺多东西的，给你列一下主要的：
• 文件夹：game / game2 / openclaw / temp
• 文件：report.xlsx
```

### 设计原则

1. **默认折叠** — 不打断阅读节奏，点击展开看细节
2. **流式阶段可见** — 工具执行中显示 spinner + 工具名，完成后折叠
3. **持久化保留** — 刷新页面后仍可查看工具调用记录
4. **多工具支持** — 一次回复可能调多个工具，每个独立展示

---

## 三、数据结构

### 3.1 ToolRecord

```typescript
interface ToolRecord {
  id: string;           // 唯一标识，用于精确配对 tool_use → tool_result
  tool: string;         // 工具名，如 "system.run"
  input?: string;       // 输入/命令，如 "dir /b C:\Users\...\Desktop"
  output?: string;      // 工具输出（持久化时截断至 10KB）
  status: 'running' | 'done' | 'error';
  startedAt: string;    // ISO timestamp
  completedAt?: string;
}
```

> **配对策略**: 用自增 ID（`tr-{timestamp}-{seq}`）标识每条记录。`tool_result` 匹配最后一条 `status === 'running'` 且 `tool` 名相同的记录。即使同一工具连续调用两次也能正确配对。

### 3.2 StreamingMessage 扩展

```typescript
// 现有
interface StreamingMessage {
  requestId: string;
  converseId: string;
  text: string;
  toolCalls: string[];   // ← 当前仅追踪活跃工具名
  status: 'streaming' | 'done' | 'error';
}

// 改为
interface StreamingMessage {
  requestId: string;
  converseId: string;
  text: string;
  toolCalls: string[];        // 保留：活跃工具名（用于 spinner）
  toolRecords: ToolRecord[];  // 新增：完整工具调用历史
  status: 'streaming' | 'done' | 'error';
}
```

### 3.3 ChatChunk 扩展

```typescript
// 现有
interface ChatChunk {
  type: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error';
  text: string;
}

// 改为
interface ChatChunk {
  type: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error';
  text: string;
  tool?: string;    // 工具名（tool_use / tool_result 时）
  input?: string;   // 工具输入（tool_use 时，如命令文本）
  output?: string;  // 工具输出（tool_result 时）
}
```

### 3.4 消息持久化

`POST /bots/:botId/reply` 的 body 扩展：

```json
{
  "converseId": "xxx",
  "content": "桌面上一共有挺多东西的...",
  "metadata": {
    "toolRecords": [
      {
        "tool": "system.run",
        "input": "dir /b C:\\Users\\...\\Desktop",
        "output": "game\ngame2\nopenclaw\ntemp\nreport.xlsx",
        "status": "done"
      }
    ]
  }
}
```

> **输出截断**: 持久化前每条 ToolRecord.output 超过 10KB 时截断并追加 `\n[...truncated]`，防止 JSONB 列膨胀。流式阶段 UI 显示完整输出不截断。

> **DB 现状**: `Message.metadata Json?` 字段**已存在**于 Prisma schema，`MessageResponse.metadata` 也已定义在 ws-protocol 中，`messages.service.ts` 已透传 metadata。无需数据库迁移。

---

## 四、改动清单

### 4.1 WS Client — 丰富 chunk 数据

**文件**: `apps/desktop/src/main/services/openclaw-ws-client.ts`

修改 `onAgentEvent` 中 `stream === 'tool'` 的处理，发出结构化数据：

- `phase === 'start'`: `{ type: 'tool_use', text: data.tool, tool: data.tool, input: extractInput(data) }`
- `phase === 'end'`: `{ type: 'tool_result', text: data.tool, tool: data.tool, output: stringifyOutput(data.output) }`

注意 `text` 字段统一为工具名（修复旧的 `"toolName: output"` 格式），保持 IPC 层兼容。

### 4.2 Store — 积累工具记录 + 修复 Bug

**文件**: `apps/desktop/src/renderer/stores/chatStore.ts`

- `addStreamingMessage`: 初始化 `toolRecords: []`
- `appendStreamChunk` chunk 类型扩展为 `{ type: string; text: string; tool?: string; input?: string; output?: string }`
- `tool_use` → push 新 ToolRecord（status: running，id 自增）
- `tool_result` → 查找最后一条 `tool` 名匹配 + `status === 'running'` 的 ToolRecord，更新为 done + 填入 output
- **Bug 修复**: `tool_result` 从 toolCalls 中移除时，使用 `chunk.tool ?? chunk.text.split(':')[0]` 正确匹配

### 4.3 持久化 — 携带 metadata

**文件**: `apps/desktop/src/renderer/hooks/useOpenClawChat.ts`

`sendMessage` step 4 持久化时，把 `finalState.toolRecords` 写入 `metadata.toolRecords`：

```typescript
const MAX_OUTPUT_SIZE = 10 * 1024; // 10KB

const toolRecords = finalState.toolRecords?.map(r => ({
  tool: r.tool,
  input: r.input,
  output: r.output && r.output.length > MAX_OUTPUT_SIZE
    ? r.output.slice(0, MAX_OUTPUT_SIZE) + '\n[...truncated]'
    : r.output,
  status: r.status,
}));

body: JSON.stringify({
  converseId,
  content: finalState.text,
  ...(toolRecords?.length ? { metadata: { toolRecords } } : {}),
})
```

### 4.4 Server — saveBotReply 支持 metadata

**文件**: `apps/server/src/bots/bots.service.ts`

`saveBotReply` 方法的 DTO 新增可选 `metadata` 字段，透传到 `prisma.message.create`。

> `Message.metadata Json?` 已存在于 schema，`messagesService` 已处理 metadata 透传和广播。此处仅需 bots.service 接受并传入即可。

### 4.5 UI 渲染 — 可折叠工具块

**新文件**: `apps/desktop/src/renderer/components/chat/ToolCallBlock.tsx`

独立组件，避免 ChatThread.tsx 膨胀：

```tsx
function ToolCallBlock({ record }: { record: ToolRecord }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="tool-call-block" onClick={() => setExpanded(!expanded)}>
      <div className="tool-call-header">
        {record.status === 'running' ? <Spinner /> : '🔧'} {record.tool}
        {record.input && <span className="tool-input">$ {record.input}</span>}
        <span className="tool-expand">{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && record.output && (
        <pre className="tool-call-output">{record.output}</pre>
      )}
    </div>
  );
}
```

**ChatThread.tsx 集成**:
- **流式气泡**: `streamingMessages` 的 `toolRecords` 渲染在文本前
- **持久化消息**: 从 `message.metadata?.toolRecords` 读取并渲染
- 移除旧的 `.tool-call-indicator` 显示

### 4.6 CSS 样式

**文件**: `apps/desktop/src/renderer/styles/chat.css`

使用与现有样式一致的颜色方案（参考 `.streaming-message`、`.chat-message-bubble` 的配色）：

```css
.tool-call-block {
  background: rgba(255, 255, 255, 0.05);
  border-left: 3px solid #4FC3F7;
  border-radius: 4px;
  padding: 6px 10px;
  margin-bottom: 8px;
  cursor: pointer;
  font-size: 0.82rem;
}
.tool-call-header {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #8ab4f8;
}
.tool-input {
  color: #a0a0a0;
  font-family: monospace;
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}
.tool-expand {
  margin-left: auto;
  font-size: 0.7rem;
  color: #666;
}
.tool-call-output {
  margin-top: 6px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  font-size: 0.8rem;
  color: #ccc;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
.tool-call-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #4FC3F7;
  border-radius: 50%;
  animation: tool-spin 0.8s linear infinite;
}
@keyframes tool-spin {
  to { transform: rotate(360deg); }
}
```

---

## 五、文件影响汇总

| 文件 | 改动 |
|------|------|
| `apps/desktop/src/main/services/openclaw-ws-client.ts` | ChatChunk 扩展 + onAgentEvent 结构化 |
| `apps/desktop/src/renderer/stores/chatStore.ts` | ToolRecord 接口 + StreamingMessage 扩展 + appendStreamChunk 修复 |
| `apps/desktop/src/renderer/hooks/useOpenClawChat.ts` | 持久化时携带 metadata.toolRecords（含 10KB 截断） |
| `apps/desktop/src/renderer/components/chat/ToolCallBlock.tsx` | **新增** — 可折叠工具块独立组件 |
| `apps/desktop/src/renderer/components/chat/ChatThread.tsx` | 集成 ToolCallBlock + 移除旧 tool-call-indicator |
| `apps/desktop/src/renderer/styles/chat.css` | 工具块样式 + spinner 动画 |
| `apps/server/src/bots/bots.service.ts` | saveBotReply 支持 metadata 透传 |

---

## 六、不做什么

- **不做独立日志面板** — 工具记录内嵌在聊天气泡中，足够满足透明性需求
- **不做 Gateway 原始日志展示** — 那是调试工具，不是用户功能
- **不做数据库迁移** — `Message.metadata Json?` 已存在
- **UI 不截断输出** — 用 max-height + scroll 处理长输出；持久化层做 10KB 截断防 DB 膨胀
- **崩溃恢复不做** — 如果 app 在工具执行中崩溃，该条流式消息不会被持久化（status 还是 streaming），重启后自然消失。不会出现永久 "running" 状态的持久化记录

---

## 七、后续可扩展

1. **工具调用统计** — 某段时间内 Agent 调了多少次工具、耗时分布
2. **操作回放** — 点击工具记录重新执行同一命令
3. **审计导出** — 企业场景导出操作日志为 CSV/JSON
4. **危险操作高亮** — toolRecord 带 dangerLevel 字段，高危操作红色边框
