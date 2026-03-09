# Sprint 3 — AI 模块 UI 集成（线 B）

> **目标**：将服务端已完成的 AI 服务（Whisper、Draft & Verify、Predictive Actions）通过 WebSocket 全链路接通到 Flutter 移动端 UI
>
> **完成日期**：2026-03-07
>
> **工作分支**：`review/sprint3-lineB-audit`
>
> **前置**：Sprint 3 线 A（AI 服务端已全部实现，见 `sprint3_implement_mark_byA.md`）
>
> **代码统计**：新增 9 个文件 + 修改 5 个已有文件，约 1,200+ 行代码，10 个新测试用例

---

## 当前进度

| Phase | 内容 | 状态 | 新增测试 |
|-------|------|------|----------|
| Phase 0 | Server ChatGateway AI 事件处理器 | ✅ 完成 | 10 |
| Phase 1 | Whisper 耳语建议 — Flutter 移动端 | ✅ 完成 | — |
| Phase 2 | Draft & Verify 草稿确认 — Flutter 移动端 | ✅ 完成 | — |
| Phase 3 | Predictive Actions 预测执行 — Flutter 移动端 | ✅ 完成 | — |
| Phase 4 | NotificationCard 操作按钮接通 | ✅ 完成 | — |
| Phase 5 | Electron Desktop 端移植 | ✅ 完成 | — |

### 构建验证

```
pnpm build    → 4/4 packages 编译通过（server rebuild 成功）
pnpm test     → 25 suites, 301 tests passed（含 10 个新 AI gateway 测试）
flutter analyze → No issues found!
```

---

## Phase 0：Server ChatGateway AI 事件处理器

### 一句话总结

`ChatGateway` 原本没有任何 AI 相关的 `@SubscribeMessage` 处理器，客户端只能被动接收推送。本 Phase 补上 6 个 C→S 事件处理器，使客户端可以回传操作（approve/reject/accept/execute/dismiss）。

### 架构

```
Flutter 客户端                    NestJS ChatGateway                AI Services
────────────                    ──────────────────                ────────────
ai:whisper:accept    ──────→    handleWhisperAccept()    ──────→  WhisperService.acceptSuggestion()
ai:draft:approve     ──────→    handleDraftApprove()     ──────→  DraftService.approveDraft()
ai:draft:reject      ──────→    handleDraftReject()      ──────→  DraftService.rejectDraft()
ai:draft:edit        ──────→    handleDraftEdit()        ──────→  DraftService.editAndApproveDraft()
ai:predictive:execute ─────→    handlePredictiveExecute() ─────→  PredictiveService.executeAction()
ai:predictive:dismiss ─────→    handlePredictiveDismiss() ─────→  PredictiveService.dismissAction()
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/server/src/gateway/gateway.module.ts` | `imports` 数组新增 `AiModule`，使 AI 服务可注入到 ChatGateway |
| `apps/server/src/gateway/chat.gateway.ts` | 注入 `WhisperService`、`DraftService`、`PredictiveService`；新增 6 个 `@SubscribeMessage` 处理器 |

### 新增文件

| 文件 | 说明 |
|------|------|
| `apps/server/src/gateway/__tests__/chat.gateway.ai.spec.ts` | 10 个单元测试，覆盖全部 6 个处理器的成功和失败路径 |

### 错误处理模式

每个处理器统一返回 `{ success, error?, data? }` 格式：

```typescript
@SubscribeMessage('ai:draft:approve')
async handleDraftApprove(client: TypedSocket, data: DraftApprovePayload) {
  try {
    const content = await this.draftService.approveDraft(userId, data.draftId);
    return { success: true, data: { content } };
  } catch (error) {
    return { success: false, error: { code: 'DRAFT_APPROVE_FAILED', message: error.message } };
  }
}
```

---

## Phase 1：Whisper 耳语建议 — Flutter 移动端

### 一句话总结

用户发送含 `@ai` 的消息后，服务端自动生成 1 个主推荐 + 2 个备选，通过 WS 推送到客户端。输入框上方出现建议条，点击即预填文本到输入框，用户正常发送即可。

### UX 流程

```
用户发送 "@ai 帮我回复"
        ↓
服务端 WhisperService.handleWhisperTrigger()
        ↓ <2 秒
推送 ai:whisper:suggestions 到 u-{userId}
        ↓
Flutter WhisperProvider 收到事件
        ↓
输入框上方显示建议条：
  ┌──────────────────────────────────────────┐
  │ @ai │ [方案看起来不错]  ...  ×          │
  │     │ ↑点击预填输入框   ↑展开备选       │
  └──────────────────────────────────────────┘
        ↓ 展开后
  ┌──────────────────────────────────────────┐
  │      │ [时间上有点紧] [需要再讨论一下]   │
  └──────────────────────────────────────────┘
```

**关键设计**：如果用户正在输入（输入框非空），不替换文本，只展示建议条。

### 新增文件

| 文件 | 说明 |
|------|------|
| `apps/mobile/lib/core/constants/ai_events.dart` | AI WS 事件名常量，镜像 `@linkingchat/ws-protocol` 的 `AI_EVENTS` |
| `apps/mobile/lib/features/chat/providers/whisper_provider.dart` | `StateNotifierProvider.family<WhisperNotifier, WhisperState, String>` 按 converseId 隔离 |
| `apps/mobile/lib/features/chat/widgets/whisper_suggestions.dart` | 建议条组件：主推荐 chip + `···` 展开 + `×` 关闭 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/mobile/lib/core/network/chat_socket_service.dart` | ① `chatEvents` 列表添加 4 个 S→C AI 事件；② 新增 6 个 emit helper 方法 |
| `apps/mobile/lib/features/chat/widgets/message_input.dart` | State 类改为 public `MessageInputState`，新增 `prefillText()` 方法 |
| `apps/mobile/lib/features/chat/pages/chat_thread_page.dart` | watch `whisperProvider`，渲染 `WhisperSuggestions` 到 TypingIndicator 和 MessageInput 之间 |

### WhisperState 结构

```dart
class WhisperState {
  final String? suggestionId;   // 建议 ID（用于 accept 回传）
  final String? primary;        // 主推荐文本
  final List<String> alternatives; // 2 个备选
  final bool showAlternatives;  // 是否展开备选
}
```

---

## Phase 2：Draft & Verify 草稿确认 — Flutter 移动端

### 一句话总结

Bot 生成草稿后，通过 WS 推送 `ai:draft:created` 到客户端，在消息列表上方出现草稿卡片，包含倒计时（5 分钟 TTL）、3 个操作按钮（批准/编辑/拒绝），支持 inline 编辑后保存。

### UX 流程

```
Bot 生成草稿
    ↓
推送 ai:draft:created
    ↓
消息列表上方弹出 DraftCard：
  ┌──────────────────────────────────────┐
  │ 🤖 Draft from Coding Bot     04:32  │
  │ ┌──────────────────────────────────┐ │
  │ │ echo "hello world"               │ │  ← 命令用 monospace 深色背景
  │ └──────────────────────────────────┘ │
  │        [✕ Reject] [✎ Edit] [✓ Approve] │
  └──────────────────────────────────────┘
```

**状态流转**：PENDING → APPROVED / REJECTED / EXPIRED

### 新增文件

| 文件 | 说明 |
|------|------|
| `apps/mobile/lib/features/chat/providers/draft_provider.dart` | `DraftNotifier` 含 `Timer.periodic` 每秒检查过期，approve/reject/editAndApprove 方法 |
| `apps/mobile/lib/features/chat/widgets/draft_card.dart` | 草稿卡片：倒计时显示、inline 编辑器、3 种操作按钮，已操作/过期状态灰显 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/mobile/lib/features/chat/pages/chat_thread_page.dart` | watch `draftProvider`，渲染 `DraftCard` 到消息列表和 TypingIndicator 之间 |

---

## Phase 3：Predictive Actions 预测执行 — Flutter 移动端

### 一句话总结

设备命令执行出错后，服务端分析错误上下文，LLM 生成修复操作卡片，按危险等级标色。safe 一键执行，warning/dangerous 弹出确认对话框。

### UX 流程

```
设备命令执行失败（如 npm install 报错）
    ↓
PredictiveService.analyzeTrigger()
    ↓
推送 ai:predictive:action
    ↓
消息区域弹出 PredictiveActionCard：
  ┌──────────────────────────────────────┐
  │ ✨ Suggested Actions            ×   │
  │    npm install failed                │
  │                                      │
  │  🟢 ▸ npm install          [Run]   │  ← safe: 直接执行
  │  🟡 ▸ rm -rf node_modules  [Run]   │  ← warning: 弹确认框
  │  🔴 ▸ sudo rm -rf /tmp     [Run]   │  ← dangerous: 弹确认框 + 警告文案
  └──────────────────────────────────────┘
```

### 新增文件

| 文件 | 说明 |
|------|------|
| `apps/mobile/lib/features/chat/providers/predictive_provider.dart` | `PredictiveNotifier`，executeAction/dismiss 方法 |
| `apps/mobile/lib/features/chat/widgets/predictive_action_card.dart` | 操作卡片：触发描述 + 按危险等级标色的 action 行 |
| `apps/mobile/lib/features/chat/widgets/danger_confirm_dialog.dart` | AlertDialog，warning 黄色 / dangerous 红色 + 不可撤销警告 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/mobile/lib/features/chat/pages/chat_thread_page.dart` | watch `predictiveProvider`，渲染 `PredictiveActionCard` |

---

## Phase 4：NotificationCard 操作按钮接通

### 一句话总结

Sprint 2 的 `NotificationCard` 的操作按钮只有 `debugPrint` 桩函数，本 Phase 接入实际导航逻辑。

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/mobile/lib/features/chat/widgets/notification_card.dart` | `_ActionButton` 新增 `_handleAction()` 方法，处理 3 种 actionType |

### Action 路由映射

| actionType | 行为 |
|------------|------|
| `view_result` | `context.push('/chat/$converseId')` — 跳转到相关会话 |
| `retry` | `context.push('/command/$deviceId')` — 跳转到命令执行页 |
| `navigate` | `context.push(route)` — 通用路由跳转（payload 中指定路径） |

---

## 文件变更汇总

### 新增文件（9 个）

```
apps/server/src/gateway/__tests__/chat.gateway.ai.spec.ts    # 10 个单测
apps/mobile/lib/core/constants/ai_events.dart                 # AI 事件常量
apps/mobile/lib/features/chat/providers/whisper_provider.dart  # Whisper 状态管理
apps/mobile/lib/features/chat/providers/draft_provider.dart    # Draft 状态管理
apps/mobile/lib/features/chat/providers/predictive_provider.dart # Predictive 状态管理
apps/mobile/lib/features/chat/widgets/whisper_suggestions.dart # 建议条组件
apps/mobile/lib/features/chat/widgets/draft_card.dart          # 草稿卡片组件
apps/mobile/lib/features/chat/widgets/predictive_action_card.dart # 预测操作卡片
apps/mobile/lib/features/chat/widgets/danger_confirm_dialog.dart  # 危险确认对话框
```

### 修改文件（5 个）

```
apps/server/src/gateway/gateway.module.ts          # +1 行 import
apps/server/src/gateway/chat.gateway.ts            # +3 注入 +6 处理器（~130 行）
apps/mobile/lib/core/network/chat_socket_service.dart  # +4 事件 +6 emit helper
apps/mobile/lib/features/chat/widgets/message_input.dart  # State 公开 + prefillText()
apps/mobile/lib/features/chat/widgets/notification_card.dart  # 操作按钮接通
apps/mobile/lib/features/chat/pages/chat_thread_page.dart  # 集成 Whisper/Draft/Predictive
```

---

## 验证方法

### 1. 服务端测试

```bash
# 仅 AI Gateway 测试
cd apps/server && npx jest chat.gateway.ai --no-coverage

# 全量测试（确认无回归）
pnpm test
```

### 2. Flutter 静态分析

```bash
cd apps/mobile && flutter analyze
```

### 3. 全量构建

```bash
pnpm build
```

### 4. Whisper 端到端验证

1. 启动服务端：`pnpm dev:server`
2. 启动移动端：`cd apps/mobile && flutter run`
3. 发送一条包含 `@ai 帮我回复` 的消息
4. 观察输入框上方是否 <2 秒内出现建议条
5. 点击建议 → 确认文本预填到输入框
6. 点击 `×` → 确认建议条消失

### 5. Draft & Verify 端到端验证

1. 使用测试端点触发草稿：`POST /api/v1/ai/test/draft`
2. 观察 DraftCard 是否出现（含倒计时）
3. 点击 [Approve] → 确认卡片变绿 + "Approved" 标签
4. 再次触发 → 点击 [Reject] → 确认卡片灰显
5. 再次触发 → 点击 [Edit] → 修改文本 → [Save & Approve]
6. 等待 5 分钟 → 确认卡片自动变为 "Expired"

### 6. Predictive Actions 端到端验证

1. 使用测试端点：`POST /api/v1/ai/test/predictive`
2. 观察 PredictiveActionCard 是否出现
3. 点击 safe 操作的 [Run] → 应直接执行
4. 点击 warning/dangerous 操作的 [Run] → 应弹出确认对话框
5. 点击 `×` → 确认卡片消失

### 7. 回归验证

```bash
pnpm build && pnpm test
```

---

## Phase 5：Electron Desktop 移植 ✅

### 一句话总结

将 Flutter 移动端已完成的 AI UI（Whisper、Draft & Verify、Predictive Actions）移植到 Electron Desktop 端。使用 Zustand 单一 store 管理 AI 状态，复用同一套 Server 处理器。

### 新增文件（5 个）

| 文件 | 说明 |
|------|------|
| `apps/desktop/src/renderer/stores/aiStore.ts` | Zustand AI 状态管理（Whisper/Draft/Predictive 三切片） |
| `apps/desktop/src/renderer/components/chat/WhisperBar.tsx` | 耳语建议条组件 |
| `apps/desktop/src/renderer/components/chat/DraftCard.tsx` | 草稿确认卡片（含倒计时 + inline 编辑） |
| `apps/desktop/src/renderer/components/chat/PredictiveActionCard.tsx` | 预测操作卡片（danger level 颜色编码） |
| `apps/desktop/src/renderer/components/chat/ConfirmDialog.tsx` | 危险操作确认对话框（warning/dangerous） |

### 修改文件（5 个）

| 文件 | 变更 |
|------|------|
| `apps/desktop/src/renderer/hooks/useChatSocket.ts` | +4 S→C AI 事件监听 + 6 C→S emit 方法 |
| `apps/desktop/src/renderer/components/chat/MessageInput.tsx` | `prefillText` + `onPrefillConsumed` props |
| `apps/desktop/src/renderer/pages/ChatPage.tsx` | 集成 WhisperBar / DraftCard / PredictiveActionCard |
| `apps/desktop/src/renderer/styles/chat.css` | AI 组件样式（Whisper/Draft/Predictive/ConfirmDialog） |
| `apps/desktop/src/renderer/components/NotificationCard.tsx` | 操作按钮路由接通（view_result / retry / navigate） |

### 构建验证

```
pnpm build    → 4/4 packages 编译通过
pnpm test     → 25 suites, 301 tests passed
```

---

## 遗留项

- **Flutter Widget 测试**：当前 Flutter 端无自动化测试，可在后续 Sprint 补充 Widget Test
