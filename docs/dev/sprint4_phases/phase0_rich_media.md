# Sprint 4 — Phase 0: 文件/图片/语音消息

> **状态**：🔧 后端完成（预签名上传 + 确认 + 附件消息 + DTO + 测试）
>
> **优先级**：P1（第 1 个工作包）
>
> **预估工作量**：5-7 天
>
> **前置条件**：Sprint 3 全部完成；MinIO 已在 docker-compose.yaml 中配置（端口 9008）
>
> **参考**：[sprint4_implement.md](../sprint4_implement.md) Phase 0

---

## 目标

支持富媒体消息类型 — 图片、文件、语音。使用 S3 兼容存储（开发用 MinIO，生产用腾讯云 COS / AWS S3）。客户端直传 S3，服务端仅负责签名和确认。

---

## 任务清单

| # | 任务 | 产出 | 依赖 | 状态 |
|---|------|------|------|------|
| 0.1 | 配置 S3 存储服务 | `storage.service.ts` | — | 🔜 |
| 0.2 | 预签名上传 URL | GET `/api/v1/upload/presign` | 0.1 | 🔜 |
| 0.3 | 上传完成回调 | POST `/api/v1/upload/confirm` | 0.1 | 🔜 |
| 0.4 | 图片消息 | MessageType.IMAGE + 缩略图生成 | 0.3 | 🔜 |
| 0.5 | 文件消息 | MessageType.FILE | 0.3 | 🔜 |
| 0.6 | 语音消息 | MessageType.VOICE | 0.3 | 🔜 |
| 0.7 | 头像上传 | PATCH `/api/v1/users/avatar` | 0.1 | 🔜 |
| 0.8 | 群组头像上传 | PATCH `/api/v1/converses/groups/:converseId/icon` | 0.1 | 🔜 |
| 0.9 | 文件大小限制 | MAX_FILE_SIZE 常量 | 0.1 | 🔜 |
| 0.10 | Flutter 图片/文件选择器 | image_picker + file_picker | 0.2, 0.3 | 🔜 |
| 0.11 | Flutter 语音录制 | record 插件 | 0.6 | 🔜 |
| 0.12 | Flutter 图片预览 | photo_view 全屏查看 | 0.10 | 🔜 |
| 0.13 | Desktop 文件拖拽上传 | Electron drag & drop | 0.2, 0.3 | 🔜 |
| 0.14 | Desktop 语音录制 | Web Audio API | 0.6 | 🔜 |

---

## 架构设计

### 上传流程（客户端直传 S3）

```
客户端                         Cloud Brain                    MinIO / S3
  │                               │                              │
  ├── GET /upload/presign ────────>│                              │
  │   { filename, mimeType }      │                              │
  │                               ├── 生成预签名 URL ──────────────>│
  │<── { uploadUrl, fileKey } ────│                              │
  │                               │                              │
  ├── PUT uploadUrl ──────────────────────────────────────────────>│ (直传 S3)
  │                               │                              │
  ├── POST /upload/confirm ──────>│                              │
  │   { fileKey, messageData }    │                              │
  │                               ├── 验证文件存在                  │
  │                               ├── 生成缩略图 (图片)             │
  │                               ├── INSERT attachment            │
  │                               ├── INSERT message               │
  │                               ├── WS: message:new ───────────>│
  │<── 201 { message } ──────────│                              │
```

### 文件大小限制

| 类型 | 限制 | MIME 类型 |
|------|------|-----------|
| 图片 | 10 MB | image/jpeg, image/png, image/gif, image/webp |
| 文件 | 50 MB | 任意 |
| 语音 | 5 MB | audio/webm, audio/aac, audio/mp4 |
| 头像 | 5 MB | image/jpeg, image/png |

---

## 后端实现

### 新增文件

```
apps/server/src/storage/
  ├── storage.module.ts           # S3 客户端模块
  ├── storage.service.ts          # presign / confirm / delete
  ├── storage.controller.ts       # REST 端点
  └── processors/
      └── image.processor.ts      # sharp 缩略图 + 头像裁剪

packages/shared/src/constants/
  └── limits.ts                   # MAX_IMAGE_SIZE, MAX_FILE_SIZE, MAX_VOICE_SIZE
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/server/src/messages/messages.service.ts` | 支持 IMAGE / FILE / VOICE 类型消息创建，关联 Attachment |
| `apps/server/src/messages/dto/create-message.dto.ts` | 新增 `type`、`attachmentKeys` 字段 |
| `apps/server/src/app.module.ts` | 导入 StorageModule |
| `packages/ws-protocol/src/responses.ts` | MessageResponse 增加 `attachments` 字段 |

### S3 配置

```typescript
// storage.service.ts 关键接口
export class StorageService {
  // 生成预签名上传 URL（5 分钟有效）
  presignUpload(filename: string, mimeType: string, maxSize: number): Promise<{ uploadUrl: string; fileKey: string }>;

  // 确认上传完成，验证文件存在
  confirmUpload(fileKey: string): Promise<{ url: string; size: number }>;

  // 生成缩略图（图片专用）
  generateThumbnail(fileKey: string, maxWidth: number): Promise<string>;

  // 裁剪头像（256x256）
  processAvatar(fileKey: string): Promise<string>;

  // 删除文件（撤回消息时使用）
  deleteFile(fileKey: string): Promise<void>;
}
```

### Attachment 表（已在 Prisma Schema 中定义）

```prisma
model Attachment {
  id           String  @id @default(cuid())
  messageId    String
  url          String          // S3 URL
  filename     String
  mimeType     String
  size         Int?            // bytes
  width        Int?            // 图片宽度
  height       Int?            // 图片高度
  duration     Int?            // 语音时长 (秒)
  thumbnailUrl String?         // 缩略图 URL
  message      Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  @@map("attachments")
}
```

---

## Flutter 实现

### 新增文件

```
apps/mobile/lib/core/services/upload_service.dart        # presign + confirm API
apps/mobile/lib/features/chat/widgets/image_message.dart  # 图片消息气泡 + 点击预览
apps/mobile/lib/features/chat/widgets/file_message.dart   # 文件消息卡片 + 下载
apps/mobile/lib/features/chat/widgets/voice_message.dart  # 语音消息条 + 播放
apps/mobile/lib/features/chat/widgets/media_picker.dart   # 底部弹出：拍照/相册/文件/语音
apps/mobile/lib/features/chat/widgets/image_preview.dart  # 全屏图片查看（photo_view）
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `message_input.dart` | 新增 `+` 按钮弹出 MediaPicker |
| `chat_thread_page.dart` | 根据 message.type 渲染不同气泡组件 |

### Flutter 依赖

```yaml
# pubspec.yaml 新增
dependencies:
  image_picker: ^1.0.0
  file_picker: ^6.0.0
  record: ^5.0.0
  photo_view: ^0.15.0
  audioplayers: ^6.0.0
  path_provider: ^2.0.0
  mime: ^1.0.0
```

---

## Desktop 实现

### 新增文件

```
apps/desktop/src/renderer/components/chat/ImageMessage.tsx    # 图片消息 + 预览
apps/desktop/src/renderer/components/chat/FileMessage.tsx     # 文件消息 + 下载
apps/desktop/src/renderer/components/chat/VoiceMessage.tsx    # 语音消息 + 播放
apps/desktop/src/renderer/components/chat/MediaUploader.tsx   # 上传进度 + 拖拽
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `MessageInput.tsx` | 新增附件按钮 + 拖拽区域 |
| `ChatThread.tsx` | 根据 message.type 渲染不同组件 |
| `chat.css` | 图片/文件/语音消息样式 |

---

## 新增 API 端点

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/v1/upload/presign` | 获取预签名上传 URL |
| POST | `/api/v1/upload/confirm` | 确认上传完成 + 创建消息 |
| PATCH | `/api/v1/users/avatar` | 上传用户头像 |
| PATCH | `/api/v1/converses/groups/:converseId/icon` | 上传群组头像 |

---

## 验收标准

- [ ] 图片消息：选择图片 → 上传 → 聊天中显示缩略图 → 点击查看大图
- [ ] 文件消息：选择文件 → 上传 → 聊天中显示文件卡片 → 点击下载
- [ ] 语音消息：按住录制 → 松开发送 → 对方可播放 + 显示时长
- [ ] 头像上传后正确裁剪为 256x256
- [ ] 超过大小限制的文件被拒绝（返回 413）
- [ ] Desktop 拖拽文件到聊天框可触发上传
- [ ] MinIO 中能看到上传的文件
- [ ] `pnpm build && pnpm test` 通过
- [ ] `flutter analyze` 无 issue
