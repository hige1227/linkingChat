# 02 — Whisper 触发方式重新设计

> 创建日期：2026-03-10
> 状态：已完成 (2026-03-10)

---

## 1. 问题背景

01 方案（发送时拦截 `@ai`）存在两个 UX 缺陷：

| # | 问题 | 场景 |
|---|------|------|
| 1 | **打字错误风险** | 用户输入 `@aii`、`@a i`、`@aifaew` → 正则不匹配 → 消息直接发送给对方 |
| 2 | **心智模型冲突** | 用户按了"发送"，输入框清空，但聊天里没有消息出现 → 困惑："发了吗？失败了？" |

**根本原因**：用发送按钮来执行一个非发送的操作。

---

## 2. 决策：`@` vs `/`

### 对比

| 维度 | `@` 前缀 | `/` 前缀 |
|------|---------|---------|
| 语义 | 提及/召唤某个对象 | 执行一个命令 |
| 先例 | 微信/Telegram `@人名` | Discord/Slack `/command` |
| AI 定位 | AI 是群里的虚拟成员 | AI 是一个工具 |
| 未来扩展 | `@bot名`、`@全体成员` | `/setting`、`/help` |
| 与提及功能冲突 | 无冲突，`@ai` 就是提及 AI | 无冲突 |
| 用户学习成本 | 低，社交 App 通用 | 低，但偏技术 |

### 决定

**选择 `@` 前缀**。理由：
1. LinkChat 定位为 **AI-native 社交应用**，AI 是聊天中的虚拟成员，不是外部工具
2. 未来 `@bot名` 提及其他 Bot 是同一套逻辑，架构统一
3. `/` 留给系统命令（`/help`、`/setting` 等），职责分离清晰

### 未来 `@mention` 体系预留

```
@ai          → 触发 Whisper 建议（当前实现）
@bot名       → 提及特定 Bot，触发该 Bot 的能力（v2）
@用户名      → 提及某人，对方收到通知（v2）
@全体成员    → 群公告，仅管理员可用（v2）
```

所有 `@mention` 共用一套输入检测逻辑，只是触发的后续行为不同。本次只实现 `@ai`，但架构上为扩展预留空间。

---

## 3. 新方案设计

### 3.1 双触发机制

| 触发方式 | 类型 | 目标用户 | 实现 |
|---------|------|---------|------|
| ✨ AI 按钮 | 主触发 | 所有用户 | 输入框旁新增图标按钮 |
| `@ai` 实时检测 | 辅助触发 | 高级用户 | onChange 检测 + 提示条 |

01 方案的"发送时拦截"**保留但做语义升级**：仅当提示条可见（`showAiHint === true`）时才拦截发送，用状态变量代替重复正则判断。用户已看到提示条，拦截符合预期。

### 3.2 AI 按钮（主触发）

#### 位置

Desktop 和 Mobile 布局一致：

```
┌──────────────────────────────────────────────────┐
│ [📎]  [输入框 .........................]  [✨] [➤] │
└──────────────────────────────────────────────────┘
  附件    文本输入                          AI  发送
```

- AI 按钮 `✨` 在发送按钮左侧
- 输入框为空时：`[📎] [输入框] [✨] [🎤]`（语音替代发送）
- 输入框有文字时：`[📎] [输入框] [✨] [➤]`（发送按钮）
- AI 按钮**始终可见**，不随输入状态切换

#### 行为

1. 点击 AI 按钮
2. 发送 `ai:whisper:request` WebSocket 事件（带 `converseId`）
3. 按钮变为加载状态（旋转动画，1-2 秒）
4. 服务端推送建议 → WhisperBar 出现
5. 按钮恢复正常状态

#### Loading 状态重置机制

**Desktop**：MessageInput 新增订阅 `useAiStore((s) => s.whisper[converseId])`。
- 点击 AI 按钮 → `setAiLoading(true)`
- `useEffect` 监听 whisper 状态：当 whisper 变为非 null → `setAiLoading(false)`
- 超时兜底：5 秒后若仍在 loading → `setAiLoading(false)`

**Mobile**：MessageInput 是 `State` 无法 watch provider，改为 prop 驱动：
- Parent (ChatThreadPage) 管理 `_aiLoading` 状态
- 点击 AI 按钮 → parent 回调设 `_aiLoading = true`
- Parent watch `whisperProvider`：`hasSuggestion` 变 true → `_aiLoading = false`
- 超时兜底：5 秒 Timer
- 通过 `aiLoading` prop 传给 MessageInput

#### 样式

- **图标**：sparkles ✨（SVG，与现有图标风格统一）
- **尺寸**：与发送按钮相同（Desktop 36×36，Mobile 40×40）
- **颜色**：默认 `#607b96`（灰色），hover `#4361ee`（蓝色）
- **加载态**：图标替换为小型 spinner
- **禁用态**：GROUP 会话中不显示此按钮（Whisper 仅限 DIRECT/BOT）

### 3.3 `@ai` 实时检测 + 提示条（辅助触发）

#### 检测逻辑

在输入框的 `onChange`（Desktop）/ `onChanged`（Mobile）中：

```typescript
// Desktop - 在现有 handleChange 中追加
const hasAiMention = /(?<!\w)@ai\b/i.test(e.target.value);
setShowAiHint(hasAiMention);
```

```dart
// Mobile - 在现有 _handleTextChanged 中追加
final hasAiMention = RegExp(r'(?<!\w)@ai\b', caseSensitive: false)
    .hasMatch(text);
if (hasAiMention != _showAiHint) {
  setState(() => _showAiHint = hasAiMention);
}
```

- 仅做布尔判断，无网络请求，性能开销可忽略
- 检测到 `@ai` → 显示提示条
- `@ai` 被删除 → 提示条消失

#### 提示条 UI

出现在输入框上方，WhisperBar 下方：

```
┌──────────────────────────────────────────────────┐
│ 💡 输入包含 @ai — 发送后将获取 AI 建议，消息不会发出  │
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│ [📎]  [@ai 帮我回复 ..................]  [✨] [➤] │
└──────────────────────────────────────────────────┘
```

- 背景色：`#1a2744`（深蓝，与输入区域协调）/ Mobile 跟随 Material 主题
- 文字色：`#94a3b8`（柔和灰）
- 高度：单行，约 32px
- 动画：slideDown 进入，slideUp 退出（150ms ease）

#### 发送行为（保留拦截，仅当提示条可见）

当用户在提示条可见的情况下按发送：
1. 用 `showAiHint` 状态判断（不重复正则），拦截消息
2. 发送 `ai:whisper:request`
3. 清空输入框
4. 提示条消失

> **已实现**：`@ai 帮我回复` 中 `@ai` 之外的文字会提取为 `prompt` 参数传给 LLM，生成的建议会结合用户请求和聊天上下文。WS 协议 `WhisperRequestPayload` 已扩展 `prompt?: string` 字段。

**与 01 方案的区别**：用户已经看到提示条，知道按发送不会发消息。心智模型一致。

---

## 4. 实现清单

### 4.1 Desktop 改动

#### 文件 1：`apps/desktop/src/renderer/components/chat/MessageInput.tsx`

**改动点：**

1. **新增 prop**：`isGroup?: boolean`（从 ChatPage 传入，控制 AI 按钮显隐）
2. **新增 import**：`useAiStore`（订阅 whisper 状态重置 loading）
3. **新增状态**：`showAiHint: boolean`、`aiLoading: boolean`
4. **修改 `handleChange`**：追加 `@ai` 实时检测，设置 `showAiHint`
5. **新增 AI 按钮 JSX**：在发送按钮/语音按钮左侧
6. **新增提示条 JSX**：message-input-wrapper 上方条件渲染
7. **修改 `handleSend`**：用 `showAiHint` 状态代替正则重复判断
8. **新增 `useEffect`**：监听 `whisper[converseId]` 重置 `aiLoading`
9. **新增 5s 超时兜底**：防止服务端无响应时 loading 卡死

```tsx
// handleSend 改造 — 用状态而非重复正则
if (showAiHint) {
  emitWhisperRequest(converseId);
  setText('');
  setShowAiHint(false);
  if (textareaRef.current) textareaRef.current.style.height = 'auto';
  return;
}
```

#### 文件 2：`apps/desktop/src/renderer/styles/chat.css`

**新增样式：**
- `.message-ai-btn` — AI 按钮样式（36×36，颜色、hover、disabled）
- `.message-ai-btn .spin` — spinner 旋转动画
- `.ai-hint-bar` — 提示条样式（背景、文字、slideDown 动画）

#### 文件 3：`apps/desktop/src/renderer/pages/ChatPage.tsx`

**改动点：**
- 传递 `isGroup={isGroup}` 给 MessageInput

#### 文件 4：`apps/desktop/src/renderer/hooks/useChatSocket.ts`

**无改动** — `emitWhisperRequest` 已存在。

### 4.2 Mobile 改动

#### 文件 5：`apps/mobile/lib/features/chat/widgets/message_input.dart`

**改动点：**

1. **新增参数**：`bool showAiButton`（默认 true）、`bool aiLoading`（默认 false）、`VoidCallback? onAiButtonPressed`
2. **新增状态**：`_showAiHint: bool`
3. **修改 `_handleTextChanged`**：追加 `@ai` 检测
4. **新增 AI 按钮**：Row 中发送按钮左侧
5. **新增提示条 Widget**：Column 包裹，输入 Row 上方
6. **修改 `_handleSend`**：用 `_showAiHint` 状态代替正则重复判断

#### 文件 6：`apps/mobile/lib/features/chat/pages/chat_thread_page.dart`

**改动点：**
- 新增 `_aiLoading` 状态 + 5s 超时 Timer
- `onAiButtonPressed` 回调：设 loading + 调用 whisperProvider
- `ref.listen(whisperProvider)` 监听建议到达 → 重置 loading
- 传递 `showAiButton: converse?.type != 'GROUP'`、`aiLoading: _aiLoading`、`onAiButtonPressed` 给 MessageInput

### 4.3 共享层 / 服务端（Prompt 传递）

为支持用户输入上下文传递给 LLM，扩展了以下文件：

#### 文件 7：`packages/ws-protocol/src/payloads/ai.payloads.ts`
- `WhisperRequestPayload` 新增 `prompt?: string` 字段

#### 文件 8：`apps/server/src/gateway/chat.gateway.ts`
- `handleWhisperRequest` 传递 `data.prompt` 给 whisperService

#### 文件 9：`apps/server/src/ai/services/whisper.service.ts`
- `handleWhisperRequest` 接受 `prompt?: string` 参数
- `generateSuggestions` 接受 `prompt?: string`，有 prompt 时 LLM prompt 包含"用户的请求"上下文

#### 文件 10：`apps/mobile/lib/core/network/chat_socket_service.dart`
- `emitWhisperRequest` 新增 `{String? prompt}` 命名参数

#### 文件 11：`apps/mobile/lib/features/chat/providers/whisper_provider.dart`
- `requestSuggestions` 新增 `{String? prompt}` 命名参数

#### 文件 12：`apps/desktop/src/renderer/hooks/useChatSocket.ts`
- `emitWhisperRequest` 新增 `prompt?: string` 参数

---

## 5. 文件改动总览

| # | 文件 | 操作 | 改动内容 |
|---|------|------|---------|
| 1 | Desktop `MessageInput.tsx` | 修改 | AI 按钮 + 提示条 + 实时检测 + loading + prompt 提取 |
| 2 | Desktop `chat.css` | 修改 | AI 按钮 + 提示条样式 |
| 3 | Desktop `ChatPage.tsx` | 修改 | 传 `isGroup` prop |
| 4 | Mobile `message_input.dart` | 修改 | AI 按钮 + 提示条 + 实时检测 + prompt 提取 |
| 5 | Mobile `chat_thread_page.dart` | 修改 | loading 状态管理 + 传 props + prompt 传递 |
| 6 | `ws-protocol` `ai.payloads.ts` | 修改 | `WhisperRequestPayload` 新增 `prompt` 字段 |
| 7 | Server `chat.gateway.ts` | 修改 | 传递 `data.prompt` 给 whisperService |
| 8 | Server `whisper.service.ts` | 修改 | `generateSuggestions` 使用 prompt 上下文 |
| 9 | Mobile `chat_socket_service.dart` | 修改 | `emitWhisperRequest` 接受 prompt |
| 10 | Mobile `whisper_provider.dart` | 修改 | `requestSuggestions` 接受 prompt |
| 11 | Desktop `useChatSocket.ts` | 修改 | `emitWhisperRequest` 接受 prompt |
| 12 | Server `whisper.service.spec.ts` | 修改 | 新增 prompt 传递测试用例 |

**共 12 个文件修改，0 个新增文件。**

---

## 6. Review 修复记录

| # | 问题 | 修复 |
|---|------|------|
| 1 | 第 3.1 节"移除拦截"与第 6 节"保留拦截"矛盾 | 统一为"保留拦截，仅当 `showAiHint` 为 true 时生效"。第 3.1 节已重写 |
| 2 | `aiLoading` 重置机制缺失 | 新增第 3.2 节"Loading 状态重置机制"，Desktop 订阅 aiStore，Mobile 通过 prop |
| 3 | Mobile `State` 无法 watch provider | 改为 parent 管理 loading 并通过 prop 传递 |
| 4 | 额外上下文传递是范围蔓延 | 已实现：用户文字提取为 prompt 传递给 LLM（修改 12 个文件，扩展 WS 协议） |
| 5 | `handleSend` 重复正则 | 改为用 `showAiHint` 状态判断，不重复正则 |
| 6 | ChatPage loading 联动描述模糊 | Desktop 改为 MessageInput 自行订阅 aiStore；ChatPage 只传 `isGroup` |

---

## 7. 验收标准

### 功能验收

- [ ] Desktop：AI 按钮可见（DIRECT 会话），点击后 1-2 秒出现 Whisper 建议
- [ ] Desktop：GROUP 会话不显示 AI 按钮
- [ ] Desktop：输入 `@ai` 时提示条实时出现，删除后消失
- [ ] Desktop：提示条可见时按发送，消息不发出，触发 Whisper
- [ ] Desktop：打字错误如 `@aii` 不匹配，提示条不出现，发送正常发出
- [ ] Mobile：以上所有行为一致
- [ ] AI 按钮 loading 状态正确（点击→spinner→建议到达→恢复）
- [ ] 5 秒超时兜底：服务端无响应时 loading 自动恢复

### 兼容性

- [ ] 语音录制按钮不受影响（输入为空时显示）
- [ ] 附件按钮不受影响
- [ ] WhisperBar 建议显示不受影响
- [x] 现有 386 个测试全部通过（新增 1 个 prompt 传递测试）

---

## 8. 未来扩展

本次设计为未来 `@mention` 体系奠定基础：

1. **输入检测框架**：`onChange` 中的正则检测可扩展为通用 `@mention` 检测器
2. **提示条可复用**：未来 `@用户名` 可显示用户卡片预览，`@bot名` 可显示 Bot 能力提示
3. **AI 按钮可演进**：未来可展开为 AI 功能菜单（Whisper、Draft、Predictive 的快捷入口）
4. **`/` 命令体系**：与 `@mention` 独立，用于系统命令，不在本方案范围内
5. ~~**上下文传递**~~：已实现 — `@ai` 之外的文字作为 prompt 传递给 LLM
