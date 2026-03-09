# Sprint 3 — Desktop AI 模块 UI 移植

> **目标**：将 Flutter 移动端已完成的 AI UI（Whisper 耳语建议、Draft & Verify 草稿确认、Predictive Actions 预测执行）移植到 Electron Desktop 端
>
> **状态**：✅ 已完成（2026-03-07）
>
> **前置**：
> - Phase 0 Server ChatGateway AI 事件处理器 ✅（`chat.gateway.ts` 中 6 个 `@SubscribeMessage` 处理器）
> - Flutter Mobile AI UI ✅（Whisper/Draft/Predictive 三套 Provider + Widget，见 `sprint3_phase_ai_ui.md`）
>
> **技术栈**：React 19 + TypeScript + Zustand v5 + Socket.IO + CSS（暗色主题）

---

## 当前进度

| 子任务 | 内容 | 状态 |
|--------|------|------|
| Task 1 | aiStore.ts — Zustand AI 状态管理 | ✅ 完成 |
| Task 2 | useChatSocket.ts — AI 事件监听 + emit 方法 | ✅ 完成 |
| Task 3 | WhisperBar.tsx — 耳语建议条组件 | ✅ 完成 |
| Task 4 | DraftCard.tsx — 草稿确认卡片组件 | ✅ 完成 |
| Task 5 | PredictiveActionCard.tsx — 预测操作卡片组件 | ✅ 完成 |
| Task 6 | ConfirmDialog.tsx — 危险操作确认对话框 | ✅ 完成 |
| Task 7 | MessageInput.tsx — prefillText 支持 | ✅ 完成 |
| Task 8 | ChatPage/ChatThread 集成 | ✅ 完成 |
| Task 9 | chat.css — AI 组件样式 | ✅ 完成 |
| Task 10 | NotificationCard.tsx 操作按钮接通 | ✅ 完成 |

---

## 架构概览

```
Server (已完成)                              Desktop Electron (已完成)
─────────────────                           ──────────────────────────
ChatGateway                                  useChatSocket.ts
  @SubscribeMessage('ai:whisper:accept')       ├── 监听 ai:whisper:suggestions
  @SubscribeMessage('ai:draft:approve')        ├── 监听 ai:draft:created / expired
  @SubscribeMessage('ai:draft:reject')         ├── 监听 ai:predictive:action
  @SubscribeMessage('ai:draft:edit')           ├── emitWhisperAccept()
  @SubscribeMessage('ai:predictive:execute')   ├── emitDraftApprove/Reject/Edit()
  @SubscribeMessage('ai:predictive:dismiss')   └── emitPredictiveExecute/Dismiss()

                                             aiStore.ts (Zustand)
                                               ├── whisper: WhisperState
                                               ├── drafts: DraftState
                                               └── predictive: PredictiveState

                                             组件层
                                               ├── WhisperBar.tsx    → MessageInput 上方
                                               ├── DraftCard.tsx     → ChatThread 消息列表下方
                                               ├── PredictiveActionCard.tsx → ChatThread 消息列表下方
                                               └── ConfirmDialog.tsx → warning/dangerous 弹出
```

### 对照表：Flutter → Desktop 映射

| Flutter (已完成) | Desktop (待开发) |
|------------------|------------------|
| `whisper_provider.dart` (Riverpod) | `aiStore.ts` whisper 切片 (Zustand) |
| `draft_provider.dart` (Riverpod) | `aiStore.ts` drafts 切片 (Zustand) |
| `predictive_provider.dart` (Riverpod) | `aiStore.ts` predictive 切片 (Zustand) |
| `chat_socket_service.dart` emit helpers | `useChatSocket.ts` emit methods |
| `whisper_suggestions.dart` Widget | `WhisperBar.tsx` Component |
| `draft_card.dart` Widget | `DraftCard.tsx` Component |
| `predictive_action_card.dart` Widget | `PredictiveActionCard.tsx` Component |
| `danger_confirm_dialog.dart` Widget | `ConfirmDialog.tsx` Component |
| `message_input.dart` prefillText() | `MessageInput.tsx` prefillText prop |

---

## WS Protocol 事件参考

已定义在 `packages/ws-protocol/src/events.ts` 的 `AI_EVENTS`：

### Server → Client 事件

| 事件名 | Payload | 说明 |
|--------|---------|------|
| `ai:whisper:suggestions` | `{ suggestionId, converseId, primary, alternatives[] }` | Whisper 建议推送 |
| `ai:draft:created` | `{ draftId, converseId, botId, botName, draftType, draftContent, expiresAt }` | 草稿创建推送 |
| `ai:draft:expired` | `{ draftId }` | 草稿过期推送 |
| `ai:predictive:action` | `{ suggestionId, converseId, trigger, actions[] }` | 预测操作推送 |

### Client → Server 事件

| 事件名 | Payload | 说明 |
|--------|---------|------|
| `ai:whisper:accept` | `{ suggestionId, selectedIndex }` | 接受 Whisper 建议 |
| `ai:draft:approve` | `{ draftId }` | 批准草稿 |
| `ai:draft:reject` | `{ draftId, reason? }` | 拒绝草稿 |
| `ai:draft:edit` | `{ draftId, editedContent }` | 编辑并批准草稿 |
| `ai:predictive:execute` | `{ suggestionId, actionIndex }` | 执行预测操作 |
| `ai:predictive:dismiss` | `{ suggestionId }` | 忽略预测操作 |

---

## 实现细节

### Task 1：aiStore.ts — Zustand AI 状态管理

**新建文件**：`apps/desktop/src/renderer/stores/aiStore.ts`

遵循现有 `chatStore.ts` 模式（单一 Zustand store + 选择器访问）。将三个 AI 功能的状态统一放入一个 store，避免 import 碎片化。

```typescript
interface AiState {
  // ── Whisper ──
  whisper: Record<string, WhisperSuggestion | null>;  // converseId → 当前建议
  setWhisper: (converseId: string, suggestion: WhisperSuggestion | null) => void;
  toggleWhisperAlternatives: (converseId: string) => void;

  // ── Draft ──
  drafts: Record<string, DraftItem[]>;  // converseId → 草稿列表
  addDraft: (converseId: string, draft: DraftItem) => void;
  updateDraftStatus: (converseId: string, draftId: string, status: DraftStatus) => void;

  // ── Predictive ──
  predictions: Record<string, PredictiveSuggestion[]>;  // converseId → 建议列表
  addPrediction: (converseId: string, suggestion: PredictiveSuggestion) => void;
  dismissPrediction: (converseId: string, suggestionId: string) => void;
}
```

**类型定义**：

```typescript
interface WhisperSuggestion {
  suggestionId: string;
  primary: string;
  alternatives: string[];
  showAlternatives: boolean;
}

type DraftStatus = 'pending' | 'approved' | 'rejected' | 'expired';

interface DraftItem {
  draftId: string;
  converseId: string;
  botId?: string;
  botName: string;
  draftType: 'message' | 'command';
  draftContent: Record<string, unknown>;
  expiresAt: string;    // ISO 8601
  createdAt: string;
  status: DraftStatus;
}

interface PredictiveAction {
  type: 'shell' | 'message' | 'file';
  action: string;
  description: string;
  dangerLevel: 'safe' | 'warning' | 'dangerous';
}

interface PredictiveSuggestion {
  suggestionId: string;
  trigger: string;
  actions: PredictiveAction[];
  dismissed: boolean;
}
```

**设计要点**：
- 按 `converseId` 隔离状态（与 Flutter 的 `.family` provider 对齐）
- 使用 `Record<string, T>` 存储，切换会话时直接查对应 key
- Store 内只保存数据，不含 socket 逻辑（socket 逻辑在 `useChatSocket` 中）

### Task 2：useChatSocket.ts — AI 事件监听 + emit 方法

**修改文件**：`apps/desktop/src/renderer/hooks/useChatSocket.ts`

#### 新增 S→C 事件监听

在现有的 `socket.on(...)` 注册块中（约第 48-125 行）追加 4 个 AI 事件监听：

```typescript
import { useAiStore } from '../stores/aiStore';

// ── AI 事件监听 ──

socket.on('ai:whisper:suggestions', (data) => {
  const { converseId, suggestionId, primary, alternatives } = data;
  useAiStore.getState().setWhisper(converseId, {
    suggestionId, primary, alternatives, showAlternatives: false,
  });
});

socket.on('ai:draft:created', (data) => {
  const { converseId, ...rest } = data;
  useAiStore.getState().addDraft(converseId, {
    ...rest, converseId, status: 'pending',
  });
});

socket.on('ai:draft:expired', (data) => {
  // 搜索所有 converseId 更新对应 draftId
  const { draftId } = data;
  // 遍历 drafts 或直接通过 store action 处理
  useAiStore.getState().expireDraft(draftId);
});

socket.on('ai:predictive:action', (data) => {
  const { converseId, suggestionId, trigger, actions } = data;
  useAiStore.getState().addPrediction(converseId, {
    suggestionId, trigger, actions, dismissed: false,
  });
});
```

#### 新增 C→S emit 方法

在 `return { ... }` 中（约第 177-202 行）追加 6 个 emit 方法：

```typescript
return {
  // ... 现有方法 (joinRoom, leaveRoom, emitTyping, markRead) ...

  // ── AI emit helpers ──
  emitWhisperAccept: (suggestionId: string, selectedIndex: number) => {
    socketRef.current?.emit('ai:whisper:accept', { suggestionId, selectedIndex });
  },
  emitDraftApprove: (draftId: string) => {
    socketRef.current?.emit('ai:draft:approve', { draftId });
  },
  emitDraftReject: (draftId: string, reason?: string) => {
    socketRef.current?.emit('ai:draft:reject', { draftId, reason });
  },
  emitDraftEdit: (draftId: string, editedContent: Record<string, unknown>) => {
    socketRef.current?.emit('ai:draft:edit', { draftId, editedContent });
  },
  emitPredictiveExecute: (suggestionId: string, actionIndex: number) => {
    socketRef.current?.emit('ai:predictive:execute', { suggestionId, actionIndex });
  },
  emitPredictiveDismiss: (suggestionId: string) => {
    socketRef.current?.emit('ai:predictive:dismiss', { suggestionId });
  },
};
```

### Task 3：WhisperBar.tsx — 耳语建议条组件

**新建文件**：`apps/desktop/src/renderer/components/chat/WhisperBar.tsx`

| 属性 | 类型 | 说明 |
|------|------|------|
| `converseId` | `string` | 当前会话 ID |
| `onAccept` | `(text: string) => void` | 接受建议后的回调（预填输入框） |

**UI 结构**：

```
┌──────────────────────────────────────────────────────┐
│ @ai │ [方案看起来不错]  ···  ×                        │
│     │ 点击 → onAccept(primary)                       │
└──────────────────────────────────────────────────────┘
↓ 展开后
┌──────────────────────────────────────────────────────┐
│      │ [时间上有点紧]    [需要再讨论一下]               │
└──────────────────────────────────────────────────────┘
```

**关键逻辑**：
- 从 `useAiStore` 读取 `whisper[converseId]`
- 无建议时返回 `null`（不渲染）
- 主建议用 chip 样式（`#4361ee` 主色），点击触发 `emitWhisperAccept(id, 0)` + `onAccept(primary)`
- `···` 按钮切换 `showAlternatives`
- `×` 按钮调用 `setWhisper(converseId, null)`
- 备选项用较淡的 chip 样式，点击触发 `emitWhisperAccept(id, index+1)` + `onAccept(text)`

### Task 4：DraftCard.tsx — 草稿确认卡片组件

**新建文件**：`apps/desktop/src/renderer/components/chat/DraftCard.tsx`

| 属性 | 类型 | 说明 |
|------|------|------|
| `draft` | `DraftItem` | 草稿数据 |
| `converseId` | `string` | 当前会话 ID |

**UI 结构**：

```
┌──────────────────────────────────────┐
│ 🤖 Draft from Coding Bot     04:32  │
│ ┌──────────────────────────────────┐ │
│ │ echo "hello world"               │ │  ← command 类型用 monospace 深色背景
│ └──────────────────────────────────┘ │
│        [✕ Reject] [✎ Edit] [✓ Approve] │
└──────────────────────────────────────┘
```

**关键逻辑**：
- 状态流转：`pending` → `approved` / `rejected` / `expired`
- 倒计时：`useEffect` + `setInterval(1000ms)` 每秒计算 `expiresAt - now`
- 到期自动标记为 `expired`（调用 `updateDraftStatus`）
- 编辑模式：`useState` 控制内联编辑器（`<textarea>`），Save 触发 `emitDraftEdit`
- 已操作/过期状态：降低不透明度 + 显示状态标签（Approved / Rejected / Expired）
- `draftType === 'command'` 时内容用 `monospace` 字体 + 深色背景块

### Task 5：PredictiveActionCard.tsx — 预测操作卡片组件

**新建文件**：`apps/desktop/src/renderer/components/chat/PredictiveActionCard.tsx`

| 属性 | 类型 | 说明 |
|------|------|------|
| `suggestion` | `PredictiveSuggestion` | 预测建议数据 |
| `converseId` | `string` | 当前会话 ID |

**UI 结构**：

```
┌──────────────────────────────────────┐
│ ✨ Suggested Actions            ×   │
│    npm install failed                │
│                                      │
│  🟢 ▸ npm install          [Run]   │  ← safe: 直接执行
│  🟡 ▸ rm -rf node_modules  [Run]   │  ← warning: 弹确认框
│  🔴 ▸ sudo rm -rf /tmp     [Run]   │  ← dangerous: 弹确认框 + 警告
└──────────────────────────────────────┘
```

**危险等级颜色映射**：

| dangerLevel | 颜色 | 点击行为 |
|-------------|------|----------|
| `safe` | `#4caf50` 绿色 | 直接执行 `emitPredictiveExecute` |
| `warning` | `#f59e0b` 黄色 | 弹出 `ConfirmDialog`，确认后执行 |
| `dangerous` | `#f44336` 红色 | 弹出 `ConfirmDialog` + 不可撤销警告，确认后执行 |

**关键逻辑**：
- `dismissed` 的建议不渲染
- shell 类型的 action 命令用 `monospace` 字体 + 深色代码块
- 右上角 `×` 调用 `emitPredictiveDismiss` + `dismissPrediction`

### Task 6：ConfirmDialog.tsx — 危险操作确认对话框

**新建文件**：`apps/desktop/src/renderer/components/chat/ConfirmDialog.tsx`

| 属性 | 类型 | 说明 |
|------|------|------|
| `open` | `boolean` | 显示状态 |
| `onOpenChange` | `(open: boolean) => void` | 开关回调 |
| `title` | `string` | 对话框标题 |
| `description` | `string` | 操作描述 |
| `dangerLevel` | `'warning' \| 'dangerous'` | 危险等级 |
| `onConfirm` | `() => void` | 确认回调 |

**样式**：
- `warning`：黄色边框 + 黄色标题
- `dangerous`：红色边框 + 红色标题 + "This action is irreversible" 警告横幅

使用现有 `.dialog-overlay` / `.dialog-content` CSS 类，追加 `.confirm-dialog-warning` / `.confirm-dialog-dangerous` 修饰类。

### Task 7：MessageInput.tsx — prefillText 支持

**修改文件**：`apps/desktop/src/renderer/components/chat/MessageInput.tsx`

新增 `prefillText` 属性或通过 `useImperativeHandle` + `forwardRef` 暴露方法：

**方案 A（推荐）—— prop 回调**：

```typescript
interface MessageInputProps {
  converseId: string;
  externalText?: string;           // 外部设置的预填文本
  onExternalTextConsumed?: () => void;  // 预填文本被消费后的清除回调
}
```

**方案 B —— ref 暴露**：

```typescript
export interface MessageInputHandle {
  prefillText: (text: string) => void;
}

export const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(...)
```

**关键逻辑**：
- 仅当输入框为空时预填（与 Flutter 行为一致）
- 预填后自动聚焦输入框
- 设置光标到文本末尾

### Task 8：ChatPage/ChatThread 集成

**修改文件**：
- `apps/desktop/src/renderer/pages/ChatPage.tsx`
- `apps/desktop/src/renderer/components/chat/ChatThread.tsx`

#### ChatPage.tsx 变更

```tsx
import { useAiStore } from '../stores/aiStore';
import { WhisperBar } from '../components/chat/WhisperBar';

// 在 MessageInput 上方渲染 WhisperBar
{converseId && (
  <>
    <ChatThread converseId={converseId} ... />
    <WhisperBar
      converseId={converseId}
      onAccept={(text) => {
        // 预填到 MessageInput
        // 通过 state 或 ref 传递
      }}
    />
    <MessageInput converseId={converseId} />
  </>
)}
```

#### ChatThread.tsx 变更

```tsx
import { useAiStore } from '../../stores/aiStore';
import { DraftCard } from './DraftCard';
import { PredictiveActionCard } from './PredictiveActionCard';

// 在消息列表和 TypingIndicator 之间渲染 AI 卡片
// 先渲染 DraftCards（活跃草稿）
// 再渲染 PredictiveActionCards（活跃预测）
```

**渲染位置**：

```
ChatThread
  ├── chat-thread-header（标题栏）
  ├── chat-thread-messages（消息列表，可滚动）
  │   ├── [Load More]
  │   ├── Message...
  │   ├── DraftCard（活跃草稿，固定在消息列表底部）
  │   ├── PredictiveActionCard（活跃预测）
  │   ├── TypingIndicator
  │   └── [bottomRef]
  └── /
WhisperBar（输入框上方）
MessageInput（底部输入框）
```

### Task 9：chat.css — AI 组件样式

**修改文件**：`apps/desktop/src/renderer/styles/chat.css`

在文件末尾追加 AI 组件样式，遵循现有暗色主题配色：

```css
/* ── AI Whisper Bar ── */
.whisper-bar { ... }
.whisper-chip { ... }
.whisper-chip:hover { ... }
.whisper-alternatives { ... }

/* ── AI Draft Card ── */
.draft-card { ... }
.draft-card-header { ... }
.draft-card-content { ... }
.draft-card-code { font-family: monospace; background: #0d1b2a; ... }
.draft-card-actions { ... }
.draft-card--approved { opacity: 0.6; border-color: #4caf50; }
.draft-card--rejected { opacity: 0.5; filter: grayscale(0.5); }
.draft-card--expired { opacity: 0.5; filter: grayscale(0.8); }

/* ── AI Predictive Card ── */
.predictive-card { ... }
.predictive-action-row { ... }
.predictive-action-row--safe { border-left: 3px solid #4caf50; }
.predictive-action-row--warning { border-left: 3px solid #f59e0b; }
.predictive-action-row--dangerous { border-left: 3px solid #f44336; }
.predictive-cmd { font-family: monospace; background: #0d1b2a; ... }

/* ── AI Confirm Dialog ── */
.confirm-dialog-warning { border-color: #f59e0b; }
.confirm-dialog-dangerous { border-color: #f44336; }
.confirm-dialog-warning-banner { background: rgba(244, 67, 54, 0.15); ... }
```

**颜色使用规范**（与现有 `chat.css` 一致）：

| 用途 | 色值 |
|------|------|
| 主色 / 强调 | `#4361ee` |
| 成功 / safe | `#4caf50` |
| 警告 / warning | `#f59e0b` |
| 错误 / dangerous | `#f44336` |
| 深色背景 | `#0d1b2a` |
| 卡片背景 | `#1e2d3d` |
| 文字主色 | `#e0e0e0` |
| 文字次色 | `#607b96` |

### Task 10：NotificationCard.tsx 操作按钮接通

**修改文件**：`apps/desktop/src/renderer/components/NotificationCard.tsx`

与 Flutter 端 `notification_card.dart` 的 Phase 4 逻辑对齐：

| actionType | 行为 |
|------------|------|
| `view_result` | `navigate('/chat/' + payload.converseId)` |
| `retry` | `navigate('/dashboard')` + 触发重试（或跳转到命令页） |
| `navigate` | `navigate(payload.route)` |

使用 `react-router-dom` 的 `useNavigate()` 实现路由跳转。

---

## 文件变更汇总

### 新建文件（7 个）

```
apps/desktop/src/renderer/stores/aiStore.ts                              # Zustand AI 状态管理
apps/desktop/src/renderer/components/chat/WhisperBar.tsx                  # 耳语建议条
apps/desktop/src/renderer/components/chat/DraftCard.tsx                   # 草稿确认卡片
apps/desktop/src/renderer/components/chat/PredictiveActionCard.tsx        # 预测操作卡片
apps/desktop/src/renderer/components/chat/ConfirmDialog.tsx               # 危险确认对话框
```

### 修改文件（5 个）

```
apps/desktop/src/renderer/hooks/useChatSocket.ts          # +4 S→C 监听 + 6 C→S emit 方法
apps/desktop/src/renderer/components/chat/MessageInput.tsx # prefillText 支持
apps/desktop/src/renderer/components/chat/ChatThread.tsx   # 集成 DraftCard + PredictiveActionCard
apps/desktop/src/renderer/pages/ChatPage.tsx               # 集成 WhisperBar
apps/desktop/src/renderer/styles/chat.css                  # AI 组件样式
apps/desktop/src/renderer/components/NotificationCard.tsx  # 操作按钮路由接通
```

---

## 设计决策

1. **单一 Zustand store（`aiStore.ts`）**：将 Whisper / Draft / Predictive 三个 AI 功能的状态合并到一个 store，避免 import 碎片化。Flutter 用 `.family` provider 按 converseId 隔离，Desktop 用 `Record<converseId, State>` 达到相同效果。

2. **Socket 逻辑在 hook 中，不在 store 中**：`useChatSocket.ts` 负责事件监听和 emit，通过 `useAiStore.getState()` 更新 store。这与现有 `chatStore` 的数据流模式一致。

3. **MessageInput prefillText 方案**：推荐使用 prop 模式（`externalText` + `onExternalTextConsumed`），比 ref 模式更符合 React 数据流惯例，且与现有 `MessageInput` 的受控组件模式兼容。

4. **CSS-in-CSS 而非 CSS-in-JS**：与现有 `chat.css` 保持一致，不引入额外的样式方案。

5. **共用 Server 处理器**：Desktop 和 Flutter 使用完全相同的 6 个 `@SubscribeMessage` 处理器（Phase 0 已实现），无需任何 Server 端改动。

---

## 验证方法

### 1. 类型检查 + 构建

```bash
pnpm type-check
pnpm build
```

### 2. Whisper 端到端验证

1. 启动服务端 + 桌面端
2. 在聊天中发送 `@ai 帮我回复`
3. 观察输入框上方是否 <2 秒内出现建议条
4. 点击建议 → 确认文本预填到输入框
5. 点击 `×` → 确认建议条消失
6. 点击 `···` → 确认备选项展开

### 3. Draft & Verify 端到端验证

1. 使用测试端点触发草稿：`POST /api/v1/ai/test/draft`
2. 观察 DraftCard 是否出现（含倒计时）
3. 点击 [Approve] → 确认卡片变绿 + "Approved" 标签
4. 再次触发 → 点击 [Reject] → 确认卡片灰显
5. 再次触发 → 点击 [Edit] → 修改文本 → [Save & Approve]
6. 等待 5 分钟 → 确认卡片自动变为 "Expired"

### 4. Predictive Actions 端到端验证

1. 使用测试端点：`POST /api/v1/ai/test/predictive`
2. 观察 PredictiveActionCard 是否出现
3. 点击 safe 操作的 [Run] → 应直接执行
4. 点击 warning/dangerous 操作的 [Run] → 应弹出确认对话框
5. 确认后执行 → 验证卡片消失
6. 点击 `×` → 确认卡片消失

### 5. 回归测试

```bash
pnpm build && pnpm test
```

### 构建验证结果（2026-03-07）

```
pnpm build    → 4/4 packages 编译通过
pnpm test     → 25 suites, 301 tests passed
```
