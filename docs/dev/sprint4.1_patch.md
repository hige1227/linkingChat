# Sprint 4.1 — 补丁迭代：断裂修复 + 客户端 UI 补全

> **状态**：✅ 已完成
>
> **开始日期**：2026-03-07
> **完成日期**：2026-03-07
>
> **前置条件**：Sprint 4 服务端全部完成（28 suites, 357 tests, all pass）
>
> **策略**：先修断裂 → 再做新 UI | 双端同步（Mobile + Desktop 同步交付）
>
> **参考**：[sprint4_implement_mark.md](sprint4_implement_mark.md) 待实施清单 + [缺口分析记录](#缺口来源追溯)

---

## 背景

Sprint 4 采用"先后端后前端"策略，服务端已 100% 完成。但经过端到端测试和深度代码审查发现：

1. **7 个断裂问题** — 标记为"已完成"但实际存在断裂的功能
2. **4 个客户端 UI 缺口** — 服务端完成但客户端 UI 未实施（计划内推后）
3. **3 个从未计划的基础功能** — 设计遗漏（移至 Sprint 5）

本补丁迭代处理前两类（断裂 + 客户端 UI），第三类归入 Sprint 5。

---

## Phase A：断裂修复（7 项）

> **目标**：让所有标记为"已完成"的功能真正端到端可用

### A.1 Mobile 已读回执修复

**问题**：`ChatSocketService.markRead()` 方法存在但 Mobile 端从未被调用。Mobile 用户打开会话时，服务器和其他客户端永远不知道消息已被阅读。（注：Desktop 端 `useChatSocket.ts` 已在 `activeConverseId` 变化时正确调用 `message:read`，此问题仅影响 Mobile。）

**来源**：Sprint 2 Phase 4 task 4.1 — 计划并标记完成，但 Mobile 客户端调用被遗漏。

| 文件 | 变更 |
|------|------|
| `apps/mobile/lib/features/chat/pages/chat_thread_page.dart` | 在 `initState` / 会话打开时调用 `chatSocket.markRead(converseId, lastMessageId)` |
| `apps/mobile/lib/features/chat/providers/chat_provider.dart` | 新消息到达且会话已打开时，自动调用 `markRead` |

### A.2 已读回执 UI（双勾 ✓✓）

**问题**：服务端已广播 `message:read` 事件，但两端都没有渲染已读标记。

**来源**：Sprint 2 Phase 4 task 4.4 — 验收标准写了"双勾 ✓✓ 已读 vs 单勾 ✓ 已送达"，但从未实现。

| 文件 | 变更 |
|------|------|
| `apps/mobile/lib/features/chat/widgets/message_bubble.dart` | 自己发的消息底部添加已读/已送达图标（✓ / ✓✓） |
| `apps/mobile/lib/features/chat/providers/chat_provider.dart` | 监听 `message:read` 事件，更新消息已读状态 |
| `apps/desktop/src/renderer/components/chat/ChatThread.tsx` | 同上 — 消息底部渲染已读状态 |
| `apps/desktop/src/renderer/hooks/useChatSocket.ts` | 监听 `message:read` 事件，更新 store 中消息状态 |

### A.3 Socket 断线 Token 刷新

**问题**：两端 Socket.IO 自动重连使用初始 Token，15 分钟 access token 过期后重连永远失败。

**来源**：从未计划。Socket 重连和 JWT 过期策略分别在不同 Sprint 设计，没有考虑交叉场景。

| 文件 | 变更 |
|------|------|
| `apps/mobile/lib/core/network/chat_socket_service.dart` | `onReconnectAttempt` 回调中检查 token 过期 → 调用 `AuthRepository.refreshAccessToken()` → 更新 socket auth |
| `apps/desktop/src/renderer/hooks/useChatSocket.ts` | `reconnect_attempt` 事件中检查 token → 调用 refresh endpoint → 更新 socket.auth |
| `apps/desktop/src/main/services/ws-client.service.ts` | Device namespace socket 同样处理 token 刷新 |

### A.4 Prometheus 指标接入

**问题**：`MetricsService` 定义 9 个指标，只有 2 个（`http_request_duration_seconds` 和 `http_requests_total`，由 LoggingInterceptor 递增）实际工作。其余 7 个永远返回 0。

**来源**：Sprint 4 Phase 9 task 9.9 — `MetricsService` 创建完毕，但修改计划中的"在各 Service 中递增计数器"没有执行。

| 文件 | 变更 |
|------|------|
| `apps/server/src/messages/messages.service.ts` | `create()` 中递增 `messagesSentTotal`；`softDelete()` 中递增 `messagesRecalledTotal` |
| `apps/server/src/gateway/chat.gateway.ts` | `handleConnection` 递增 `wsConnectionsActive`；`handleDisconnect` 递减；消息事件递增 `wsMessagesTotal` |
| `apps/server/src/ai/services/llm-router.service.ts` | `complete()` 中递增 `llmRequestsTotal`（按 provider/model/status），记录 `llmLatencySeconds` |
| `apps/server/src/upload/upload.service.ts` | `confirmUpload()` 中递增 `uploadsTotal`（按 type/status） |

### A.5 i18n 服务端接入

**问题**：`I18nService` 完整实现（`t()` + `detectLocale()` + 中英文翻译文件），但没有任何 Service 调用它。所有错误消息仍为硬编码英文。

**来源**：Sprint 4 Phase 4 标记为"✅ 服务端完成"，但只做了基础设施，没有替换实际错误消息。

| 文件 | 变更 |
|------|------|
| `apps/server/src/auth/auth.service.ts` | 注入 `I18nService`，替换 `"Email already registered"` → `this.i18n.t('auth.emailExists', locale)` 等 |
| `apps/server/src/friends/friends.service.ts` | 同上 — 替换好友相关错误消息 |
| `apps/server/src/messages/messages.service.ts` | 同上 — 替换消息相关错误消息 |
| `apps/server/src/converses/converses.service.ts` | 同上 — 替换会话/群组相关错误消息 |
| `apps/server/src/upload/upload.service.ts` | 同上 — 替换上传相关错误消息 |

> **注意**：需要在请求上下文中传递 locale。可通过 `@Req() req` 获取 `req['lang']`（由 I18nMiddleware 设置），或注入 `REQUEST` scope 的 locale provider。

### A.6 Desktop NotificationCard 渲染接入

**问题**：`NotificationCard.tsx` 组件（位于 `apps/desktop/src/renderer/components/NotificationCard.tsx`）在 Sprint 2 Phase 7 已创建，但 `ChatThread.tsx` 渲染消息时没有按消息类型分发 — Bot 通知消息显示为原始文本。

**来源**：Sprint 2 Phase 7 计划了组件创建和渲染集成，组件创建了但渲染集成遗漏。

| 文件 | 变更 |
|------|------|
| `apps/desktop/src/renderer/components/chat/ChatThread.tsx` | 消息渲染逻辑添加类型判断：`message.type === 'BOT_NOTIFICATION'` → 渲染 `<NotificationCard>` 而非纯文本 |

### A.7 CORS 生产加固

**问题**：`main.ts` 中 CORS 配置 `origin: process.env.CORS_ORIGINS?.split(',') || true`，`|| true` 回退在生产环境允许所有域名。同样的问题存在于 `redis-io.adapter.ts` 的 WebSocket CORS 配置（`|| '*'`）。

**来源**：Sprint 4 Phase 9 task 9.7 标记完成（Nginx 层已配置），但 NestJS 应用层和 Socket.IO 适配器的回退都不安全。

| 文件 | 变更 |
|------|------|
| `apps/server/src/main.ts` | 生产环境：`CORS_ORIGINS` 未设置时抛出错误或默认为空数组；开发环境：保留 `true` |
| `apps/server/src/gateway/adapters/redis-io.adapter.ts` | 同上 — `origin: process.env.CORS_ORIGINS?.split(',') || '*'` 改为与 `main.ts` 一致的安全策略 |

---

## Phase B：富媒体消息客户端 UI

> **服务端状态**：✅ 预签名上传 + 上传确认 + 附件消息创建/查询 — 全部完成
>
> **本 Phase 范围**：图片 + 文件（语音延后）| 双端同步

### B.1 Flutter Mobile

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| B.1.1 | 上传服务 | `apps/mobile/lib/core/services/upload_service.dart`（新建） | 封装 presign → PUT 上传 → confirm 三步流程 |
| B.1.2 | 图片选择器 | `apps/mobile/lib/features/chat/widgets/media_picker.dart`（新建） | `image_picker` 插件 — 相册/相机选择 |
| B.1.3 | 文件选择器 | 同上整合 | `file_picker` 插件 — 任意文件 |
| B.1.4 | 消息输入栏改造 | `apps/mobile/lib/features/chat/widgets/message_input.dart` | 添加 📎 附件按钮 + 📷 相机按钮 |
| B.1.5 | 图片消息气泡 | `apps/mobile/lib/features/chat/widgets/image_message.dart`（新建） | 缩略图展示 + 点击全屏预览 |
| B.1.6 | 文件消息气泡 | `apps/mobile/lib/features/chat/widgets/file_message.dart`（新建） | 文件图标 + 文件名 + 大小 + 下载按钮 |
| B.1.7 | 图片预览页 | `apps/mobile/lib/features/chat/pages/image_preview_page.dart`（新建） | 全屏 + 缩放 + 保存（`photo_view` 插件） |
| B.1.8 | 消息气泡类型分发 | `apps/mobile/lib/features/chat/widgets/message_bubble.dart` | 根据 `message.attachments` 类型渲染不同气泡 |
| B.1.9 | 上传进度 UI | message_input.dart / 新组件 | 上传中显示进度条/缩略图 overlay |

### B.2 Desktop

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| B.2.1 | 上传服务 | `apps/desktop/src/renderer/services/uploadService.ts`（新建） | 同 Mobile — presign → PUT → confirm |
| B.2.2 | 消息输入栏改造 | `apps/desktop/src/renderer/components/chat/MessageInput.tsx` | 添加 📎 按钮 + 拖拽上传（onDragOver/onDrop） |
| B.2.3 | 图片消息组件 | `apps/desktop/src/renderer/components/chat/ImageMessage.tsx`（新建） | 缩略图 + 点击 lightbox 预览 |
| B.2.4 | 文件消息组件 | `apps/desktop/src/renderer/components/chat/FileMessage.tsx`（新建） | 文件信息 + 下载 |
| B.2.5 | 消息渲染分发 | `apps/desktop/src/renderer/components/chat/ChatThread.tsx` | 根据附件类型渲染不同组件 |
| B.2.6 | 拖拽上传 overlay | `apps/desktop/src/renderer/components/chat/DropZone.tsx`（新建） | 拖拽文件时的视觉反馈 |

### B.3 服务端补充

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| B.3.1 | 缩略图生成 | `apps/server/src/upload/upload.service.ts` | `sharp` 库集成 — 图片上传后自动生成 256px 缩略图 |

### 新增依赖

| 平台 | 包名 | 用途 |
|------|------|------|
| Flutter | `image_picker` | 相册/相机选择 |
| Flutter | `file_picker` | 文件选择 |
| Flutter | `photo_view` | 图片全屏预览 + 缩放 |
| Server | `sharp` | 缩略图生成 |

### 验收标准

- [x] 图片选择 → 上传 → 对方收到缩略图 → 点击查看大图
- [x] 文件选择 → 上传 → 对方收到文件卡片 → 点击下载
- [x] Desktop 拖拽文件到聊天区域 → 上传
- [x] 上传过程显示进度
- [x] 大文件被限制（图片 10MB / 文件 50MB）
- [x] 双端表现一致
- [x] `pnpm build && pnpm test` 通过

---

## Phase C：消息撤回客户端 UI

> **服务端状态**：✅ 2 分钟限制 + OWNER/ADMIN 无限制 + S3 附件清理 — 全部完成
>
> **重要**：服务端广播的是 `message:deleted` 事件（不存在 `message:recalled` 事件），撤回消息通过 `recalledBy` 字段区分。Desktop 现有 `message:deleted` 处理器调用 `removeMessage()` 直接移除消息——需要迁移为就地标记，显示 "[已撤回]" 占位而非删除。

### C.1 Flutter Mobile

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| C.1.1 | 长按菜单 | `apps/mobile/lib/features/chat/widgets/message_bubble.dart` | 包裹 `GestureDetector(onLongPress)` → 弹出底部菜单 |
| C.1.2 | 菜单选项 | 同上 | 菜单项：复制、撤回（仅自己的消息 + 2 分钟内，或管理员）、回复（预留） |
| C.1.3 | 撤回 API 调用 | `apps/mobile/lib/features/chat/providers/chat_provider.dart` | `recallMessage(messageId)` → `DELETE /api/v1/messages/:id` |
| C.1.4 | "[已撤回]" 占位 | `apps/mobile/lib/features/chat/widgets/message_bubble.dart` | `deletedAt != null` → 渲染灰色斜体 "[已撤回的消息]" |
| C.1.5 | WS 撤回广播处理 | `apps/mobile/lib/features/chat/providers/chat_provider.dart` | 监听 `message:deleted` 事件（含 `recalledBy` 字段）→ 就地标记消息为已撤回（而非移除） |

### C.2 Desktop

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| C.2.1 | 右键菜单 | `apps/desktop/src/renderer/components/chat/ChatThread.tsx` | 消息 `onContextMenu` → 弹出 ContextMenu |
| C.2.2 | 菜单选项 | 同上或新组件 `MessageContextMenu.tsx` | 复制、撤回（条件同上）、回复（预留） |
| C.2.3 | 撤回 API 调用 | `apps/desktop/src/renderer/stores/chatStore.ts` | `recallMessage(messageId)` |
| C.2.4 | "[已撤回]" 占位 | `apps/desktop/src/renderer/components/chat/ChatThread.tsx` | `deletedAt` → 灰色 italic "[Message recalled]" |
| C.2.5 | WS 撤回广播处理 | `apps/desktop/src/renderer/hooks/useChatSocket.ts` | 修改现有 `message:deleted` 处理器：从 `removeMessage()` 改为就地标记 `deletedAt` + `recalledBy`（显示"[已撤回]"占位而非移除消息） |

### 验收标准

- [x] 长按（Mobile）/ 右键（Desktop）弹出菜单
- [x] 2 分钟内可撤回自己的消息
- [x] 超时后撤回选项不显示或点击提示"超时"
- [x] 管理员可撤回他人消息（无时间限制）
- [x] 撤回后双方都显示 "[已撤回]" 占位
- [x] 带附件的消息撤回后 S3 文件被清理
- [x] `pnpm build && pnpm test` 通过

---

## Phase D：消息搜索客户端 UI

> **服务端状态**：✅ PostgreSQL tsvector + GIN 索引 + ILIKE 中文 fallback — 全部完成

### D.1 Flutter Mobile

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| D.1.1 | 搜索页面 | `apps/mobile/lib/features/chat/pages/search_page.dart`（新建） | 搜索框 + 结果列表 + 关键词高亮 |
| D.1.2 | 搜索 Provider | `apps/mobile/lib/features/chat/providers/search_provider.dart`（新建） | 调用 `GET /messages/search` + 防抖 |
| D.1.3 | 搜索入口 | `apps/mobile/lib/features/chat/pages/chat_thread_page.dart` | AppBar 添加搜索图标 → 导航到搜索页 |
| D.1.4 | 全局搜索入口 | `apps/mobile/lib/features/chat/pages/converses_list_page.dart` | 顶部搜索栏 → 跨会话搜索 |
| D.1.5 | 跳转到消息 | search_page.dart | 点击搜索结果 → 打开对应会话并滚动到该消息 |

### D.2 Desktop

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| D.2.1 | 搜索面板 | `apps/desktop/src/renderer/components/chat/SearchPanel.tsx`（新建） | Ctrl+F 打开 → 搜索框 + 结果列表 |
| D.2.2 | 搜索 Store | `apps/desktop/src/renderer/stores/chatStore.ts` | 添加 search state + action |
| D.2.3 | 快捷键绑定 | `apps/desktop/src/renderer/pages/ChatPage.tsx` | `useEffect` 监听 Ctrl+F → 打开 SearchPanel |
| D.2.4 | 跳转到消息 | SearchPanel.tsx | 点击结果 → 滚动 ChatThread 到对应消息 |

### 验收标准

- [x] 英文搜索返回结果，关键词高亮
- [x] 中文搜索通过 ILIKE fallback 正常工作
- [x] 搜索结果限定在当前会话（会话内搜索）
- [x] 支持跨会话搜索（全局搜索入口）
- [x] 点击搜索结果跳转到消息位置
- [x] Desktop 支持 Ctrl+F 快捷键
- [x] 搜索输入有防抖（300ms）
- [x] `pnpm build && pnpm test` 通过

---

## Phase E：头像上传

| # | 任务 | 文件 | 说明 |
|---|------|------|------|
| E.1 | Flutter 头像选择 | `apps/mobile/lib/features/profile/pages/profile_page.dart` | 替换 TODO 桩代码 → `image_picker` 选择 → presign → upload → confirm → `PATCH /profile/avatar` |
| E.2 | Desktop 头像上传 | `apps/desktop/src/renderer/pages/profile/ProfilePage.tsx` | 添加头像点击 → 文件选择 → 上传流程 |

### 验收标准

- [x] Mobile 可从相册/相机选择头像
- [x] Desktop 可点击头像选择文件上传
- [x] 头像上传后立即在个人资料和聊天列表更新
- [x] 其他用户能看到更新后的头像

---

## 新增文件汇总

```
# Flutter Mobile
apps/mobile/lib/core/services/upload_service.dart              # 文件上传服务
apps/mobile/lib/features/chat/widgets/media_picker.dart         # 图片/文件选择器
apps/mobile/lib/features/chat/widgets/image_message.dart        # 图片消息气泡
apps/mobile/lib/features/chat/widgets/file_message.dart         # 文件消息气泡
apps/mobile/lib/features/chat/pages/image_preview_page.dart     # 图片全屏预览
apps/mobile/lib/features/chat/pages/search_page.dart            # 消息搜索页
apps/mobile/lib/features/chat/providers/search_provider.dart    # 搜索状态管理

# Desktop
apps/desktop/src/renderer/services/uploadService.ts             # 文件上传服务
apps/desktop/src/renderer/components/chat/ImageMessage.tsx       # 图片消息组件
apps/desktop/src/renderer/components/chat/FileMessage.tsx        # 文件消息组件
apps/desktop/src/renderer/components/chat/DropZone.tsx           # 拖拽上传 overlay
apps/desktop/src/renderer/components/chat/SearchPanel.tsx        # 搜索面板
apps/desktop/src/renderer/components/chat/MessageContextMenu.tsx # 右键菜单
```

---

## 修改文件汇总

| 文件 | Phase | 变更 |
|------|-------|------|
| `apps/server/src/main.ts` | A.7 | CORS 生产加固 |
| `apps/server/src/messages/messages.service.ts` | A.4, A.5 | 指标递增 + i18n 错误消息 |
| `apps/server/src/gateway/chat.gateway.ts` | A.4 | WS 连接指标递增/递减 |
| `apps/server/src/ai/services/llm-router.service.ts` | A.4 | LLM 指标递增 |
| `apps/server/src/upload/upload.service.ts` | A.4, A.5, B.3 | 上传指标 + i18n + 缩略图 |
| `apps/server/src/auth/auth.service.ts` | A.5 | i18n 错误消息替换 |
| `apps/server/src/friends/friends.service.ts` | A.5 | i18n 错误消息替换 |
| `apps/server/src/converses/converses.service.ts` | A.5 | i18n 错误消息替换 |
| `apps/mobile/.../chat_thread_page.dart` | A.1, C, D | 已读回执 + 搜索入口 |
| `apps/mobile/.../message_bubble.dart` | A.2, C | 已读标记 + 长按菜单 + 已撤回占位 |
| `apps/mobile/.../message_input.dart` | B | 附件按钮 |
| `apps/mobile/.../chat_provider.dart` | A.1, A.2, C | markRead + 已读监听 + 撤回 |
| `apps/mobile/.../chat_socket_service.dart` | A.3 | Token 刷新重连 |
| `apps/server/src/gateway/adapters/redis-io.adapter.ts` | A.7 | WebSocket CORS 生产加固 |
| `apps/mobile/.../profile_page.dart` | E | 头像上传替换 TODO |
| `apps/mobile/.../converses_list_page.dart` | D | 全局搜索入口 |
| `apps/desktop/.../ChatThread.tsx` | A.2, A.6, B, C | 已读标记 + NotificationCard 渲染 + 附件消息 + 右键菜单 + 已撤回占位 |
| `apps/desktop/.../MessageInput.tsx` | B | 附件按钮 + 拖拽 |
| `apps/desktop/.../useChatSocket.ts` | A.2, A.3, C | 已读监听 + Token 刷新 + 撤回监听 |
| `apps/desktop/.../ChatPage.tsx` | D | Ctrl+F 搜索 |
| `apps/desktop/.../chatStore.ts` | C, D | 撤回 + 搜索 state |
| `apps/desktop/.../ProfilePage.tsx` | E | 头像上传 |
| `apps/desktop/src/main/services/ws-client.service.ts` | A.3 | Device socket Token 刷新 |

---

## 预估工作量

| Phase | 内容 | 预估 | 优先级 |
|-------|------|------|--------|
| A | 断裂修复（7 项） | 2-3 天 | P0 |
| B | 富媒体消息 UI（双端） | 4-5 天 | P1 |
| C | 消息撤回 UI（双端） | 2 天 | P1 |
| D | 消息搜索 UI（双端） | 2-3 天 | P2 |
| E | 头像上传（双端） | 1 天 | P2 |
| **合计** | | **11-14 天** | |

---

## 缺口来源追溯

| 缺口 | 分类 | 首次出现 | 原始 Sprint | 说明 |
|------|------|---------|------------|------|
| Mobile 已读回执未调用 | 做了但断裂 | Sprint 2 Phase 4 task 4.1 | Sprint 2 | `markRead()` 写了从未被调用，后续 Sprint 未追踪 |
| 已读 UI 双勾 ✓✓ | 做了但断裂 | Sprint 2 Phase 4 task 4.4 | Sprint 2 | 验收标准要求但未实现，后续 Sprint 未追踪 |
| Socket Token 刷新重连 | 从未计划 | — | — | 重连和 JWT 过期分别设计，交叉场景遗漏 |
| Prometheus 指标死代码（7/9） | 做了但断裂 | Sprint 4 Phase 9 task 9.9 | Sprint 4 | MetricsService 定义 9 个指标，仅 2 个有数据，7 个永远为 0 |
| i18n 零调用 | 做了但断裂 | Sprint 4 Phase 4 | Sprint 4 | I18nService 完整实现但无消费者 |
| Desktop NotificationCard 未渲染 | 做了但断裂 | Sprint 2 Phase 7 task 7.4 | Sprint 2 | 组件创建了但 ChatThread 未按类型分发 |
| CORS || true 回退 | 做了但断裂 | Sprint 4 Phase 9 task 9.7 | Sprint 4 | Nginx 做了但 NestJS 应用层回退不安全 |
| 富媒体客户端 UI | 计划了没做 | Sprint 2 "不做的事" | Sprint 4 Phase 0 | 有意推迟到 Sprint 4，服务端已完成 |
| 消息撤回客户端 UI | 计划了没做 | Sprint 2 Phase 2 | Sprint 4 Phase 1 | 有意推迟，服务端已完成 |
| 消息搜索客户端 UI | 计划了没做 | Sprint 2 "不做的事" | Sprint 4 Phase 2 | 有意推迟，服务端已完成 |
| 头像上传客户端 | 计划了没做 | Sprint 3/4 Phase 0 | Sprint 4 Phase 0 | 捆绑在富媒体中推迟 |
