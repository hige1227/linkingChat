# Sprint 3 — Phase 10 禁言封禁 UI（Flutter + Desktop）

> **目标**：为 Flutter Mobile 和 Electron Desktop 添加 Telegram 风格的禁言/封禁管理界面，接通已实现的 Server 端 API
>
> **状态**：✅ 已完成（2026-03-07）
>
> **前置**：Phase 10 后端 API 已全部实现（`ConversesService` 中的 `muteMember`/`banMember` 等方法）
>
> **设计文档**：`docs/plans/2026-03-03-phase10-mute-ban-ui.md`

---

## 当前进度

| 子任务 | 内容 | 平台 | 状态 |
|--------|------|------|------|
| Task 1 | GroupModerationService API 客户端 | Flutter | ✅ 已完成 |
| Task 2 | MuteDurationPicker 时长选择器 | Flutter | ✅ 完成 |
| Task 3 | BanMemberDialog 封禁对话框 | Flutter | ✅ 完成 |
| Task 4 | GroupDetailPage 成员菜单集成 | Flutter | ✅ 完成 |
| Task 5 | ConverseMemberModel 添加 mutedUntil 字段 | Flutter | ✅ 完成 |
| Task 6-9 | Desktop mute/ban UI (inline in GroupPanel) | Desktop | ✅ 完成 |

---

## 架构概览

```
后端（已完成）                          Flutter Mobile（待开发）           Desktop Electron（待开发）
─────────────                          ─────────────────────           ──────────────────────────
PATCH  /groups/:id/members/:id/mute    GroupModerationService  ✅      group-moderation.ts
DELETE /groups/:id/members/:id/mute    MuteDurationPicker              MuteDurationPicker.tsx
POST   /groups/:id/bans/:userId        BanMemberDialog                 BanMemberDialog.tsx
DELETE /groups/:id/bans/:userId        GroupDetailPage 集成             GroupPanel.tsx 集成
GET    /groups/:id/bans                ConverseMemberModel 扩展
```

### 权限矩阵

| 操作者 | 可禁言 | 可封禁 |
|--------|--------|--------|
| OWNER | ADMIN + MEMBER | ADMIN + MEMBER |
| ADMIN | MEMBER | MEMBER |
| MEMBER | 无权限 | 无权限 |

### 禁言时长预设（Telegram 风格）

```
1 分钟 (1)    10 分钟 (10)     1 小时 (60)
1 天 (1440)   1 周 (10080)     30 天 (43200)
+ 自定义分钟数输入
```

---

## 后端 API 参考

### 已实现的端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `PATCH` | `/api/v1/converses/groups/:converseId/members/:memberId/mute` | 禁言成员（body: `{ durationMinutes }`, 范围 1-43200） |
| `DELETE` | `/api/v1/converses/groups/:converseId/members/:memberId/mute` | 解除禁言 |
| `POST` | `/api/v1/converses/groups/:converseId/bans/:targetUserId` | 封禁成员（body: `{ reason? }`, 自动移出群聊） |
| `DELETE` | `/api/v1/converses/groups/:converseId/bans/:targetUserId` | 解除封禁 |
| `GET` | `/api/v1/converses/groups/:converseId/bans` | 获取封禁列表 |

### 数据库模型

```prisma
model ConverseMember {
  mutedUntil  DateTime?  // 禁言到期时间，NULL = 未禁言
  @@index([mutedUntil])
}

model GroupBan {
  id          String   @id @default(cuid())
  converseId  String
  userId      String
  bannedBy    String
  reason      String?
  createdAt   DateTime @default(now())
  @@unique([converseId, userId])
}
```

### WebSocket 广播事件

| 事件 | 推送目标 |
|------|----------|
| `GROUP_MEMBER_MUTED` | 群聊房间 + 被禁言用户 |
| `GROUP_MEMBER_UNMUTED` | 群聊房间 + 被解禁用户 |
| `GROUP_MEMBER_BANNED` | 群聊房间 + 被封禁用户 |
| `GROUP_MEMBER_UNBANNED` | 群聊房间 |

---

## Flutter Mobile 实现

### Task 1（✅ 已完成）：GroupModerationService

**文件**：`apps/mobile/lib/core/services/group_moderation_service.dart`

已创建独立的 API 服务类，包含 `muteMember()`、`unmuteMember()`、`banMember()`、`unbanMember()`、`getGroupBans()` 五个方法，以及 `MuteResult`、`BanResult`、`GroupBan` 三个数据模型。Provider 已注册在 `api_client.dart` 中。

### Task 2：MuteDurationPicker 时长选择器

**新建文件**：`apps/mobile/lib/features/chat/widgets/mute_duration_picker.dart`

| 组件 | 说明 |
|------|------|
| `MuteDurationPicker` | StatefulWidget，Telegram 风格 3×2 网格预设 + 自定义分钟输入 |
| `_PresetButton` | 单个预设按钮，选中态用 `primaryContainer` 背景色 |
| `showMuteDurationPicker()` | 辅助函数，通过 `showModalBottomSheet` 弹出选择器 |

**关键设计**：
- 预设按钮和自定义输入互斥：选中预设时清空自定义输入，输入自定义分钟时取消预设选择
- `_selectedMinutes` getter 根据当前模式返回对应分钟数
- 选择器确认后回调 `onConfirm(int durationMinutes)`

### Task 3：BanMemberDialog 封禁对话框

**新建文件**：`apps/mobile/lib/features/chat/widgets/ban_member_dialog.dart`

| 组件 | 说明 |
|------|------|
| `BanMemberDialog` | StatefulWidget，AlertDialog 样式，包含警告文案 + 可选原因输入框 |
| `showBanMemberDialog()` | 辅助函数，通过 `showDialog` 弹出 |

**关键设计**：
- 红色 `Icons.block` 图标 + "Ban & Remove Member" 标题
- 提示文案：移出群聊 + 禁止重新加入
- 原因输入框：`maxLines: 3`，`maxLength: 500`
- 提交时显示 loading 状态（`CircularProgressIndicator`）

### Task 4：GroupDetailPage 成员菜单集成

**修改文件**：`apps/mobile/lib/features/chat/pages/group_detail_page.dart`

| 变更位置 | 内容 |
|----------|------|
| `_buildMemberTile` 角色标签后 | 新增禁言图标（🔇 `Icons.volume_off`），当 `mutedUntil` 有效时显示 |
| `PopupMenuButton.itemBuilder` | 新增 3 个菜单项：Mute / Unmute / Ban（权限检查 `_canManage`） |
| `_handleMemberAction` switch | 新增 `'mute'`、`'unmute'`、`'ban'` 三个 case |

**Mute 处理流程**：
```
用户点击 "Mute" → showMuteDurationPicker() → 用户选择时长 →
PATCH /mute 端点 → fetchConverses() 刷新列表 → SnackBar 提示
```

**Ban 处理流程**：
```
用户点击 "Ban" → showBanMemberDialog() → 用户输入原因 →
POST /bans 端点 → fetchConverses() 刷新列表 → SnackBar 提示
```

### Task 5：ConverseMemberModel 扩展

**修改文件**：`apps/mobile/lib/core/models/converse_member.dart`

新增 `mutedUntil` 字段：

```dart
final DateTime? mutedUntil;

// fromJson 中:
mutedUntil: json['mutedUntil'] != null
    ? DateTime.parse(json['mutedUntil'])
    : null,
```

---

## Desktop Electron 实现

### Tasks 6-9（合并实现）：GroupPanel.tsx 内联 mute/ban

**设计决策**：Desktop 端未单独创建 service 文件和独立组件文件，而是遵循 `GroupPanel.tsx` 现有的内联 `fetch` + `window.electronAPI.getToken()` 模式，将 mute/ban UI 直接集成到 GroupPanel 中。

**修改文件**：`apps/desktop/src/renderer/components/chat/GroupPanel.tsx`

| 变更位置 | 内容 |
|----------|------|
| 组件 state | 新增 `muteTarget`、`banTarget`、`mutePreset`、`muteCustom`、`banReason` |
| `MUTE_PRESETS` 常量 | 6 个预设（1m/10m/1h/1d/1w/30d），与 Flutter 一致 |
| `group-member-actions` 区域 | 新增 Mute(🔇) / Unmute(🔊) / Ban(🚫) 操作按钮（SVG 图标，hover 显示） |
| 成员名称旁 | 🔇 禁言图标（当 `mutedUntil` 有效时显示） |
| 组件底部 JSX | 两个内联对话框：Mute Duration Picker（3×2 grid + 自定义分钟）、Ban Member Dialog（textarea 原因输入） |

**Handler 逻辑**：
- `handleMute()` → `PATCH /groups/:id/members/:id/mute` + 刷新
- `handleUnmute()` → `DELETE /groups/:id/members/:id/mute` + 刷新
- `handleBan()` → `POST /groups/:id/bans/:userId` + 刷新

---

## 文件变更汇总

### 新建文件（2 个）

```
apps/mobile/lib/features/chat/widgets/mute_duration_picker.dart    # Telegram 风格时长选择器
apps/mobile/lib/features/chat/widgets/ban_member_dialog.dart        # 封禁确认对话框
```

### 修改文件（3 个）

```
apps/mobile/lib/core/models/converse_member.dart                   # 新增 mutedUntil 字段
apps/mobile/lib/features/chat/pages/group_detail_page.dart         # 成员菜单 + Mute/Ban 操作
apps/desktop/src/renderer/components/chat/GroupPanel.tsx            # 成员菜单 + Mute/Ban 操作（内联实现）
```

### 已完成文件（1 个）

```
apps/mobile/lib/core/services/group_moderation_service.dart        # ✅ Flutter API 客户端
```

---

## 验证方法

### 1. 静态分析

```bash
# Flutter
cd apps/mobile && flutter analyze

# Desktop
pnpm --filter "@linkingchat/desktop" type-check
```

### 2. 全量构建 + 测试

```bash
pnpm build && pnpm test
```

### 3. Flutter 端到端验证

1. 启动服务端：`pnpm dev:server`
2. 启动移动端：`cd apps/mobile && flutter run`
3. 打开群聊 → 进入群组详情页
4. 长按成员 → 弹出菜单 → 验证出现 Mute / Ban 选项
5. 点击 Mute → 选择 10 分钟 → 确认 → 验证成员旁出现 🔇 图标
6. 被禁言成员发送消息 → 应收到 403 错误
7. 点击 Unmute → 验证图标消失
8. 点击 Ban → 输入原因 → 确认 → 验证成员被移出群聊
9. 被封禁成员尝试重新加入 → 应被拒绝

### 3.5 构建验证结果

```
pnpm build    → 4/4 packages 编译通过
pnpm test     → 25 suites, 301 tests passed
flutter analyze → No issues found!（针对 mute/ban 相关文件）
```

### 4. Desktop 端到端验证

1. 启动桌面端：`pnpm dev:desktop`
2. 打开群聊 → 展开群组面板（右侧）
3. 鼠标悬停成员 → 验证出现 Mute / Ban 操作按钮
4. 同上流程验证禁言和封禁功能
