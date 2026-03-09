# Sprint 4 — Phase 1: 消息撤回增强

> **状态**：✅ 后端完成（2分钟限制 + 管理员权限 + S3清理 + 测试）
>
> **优先级**：P2（第 2 个工作包）
>
> **预估工作量**：1-2 天
>
> **前置条件**：Phase 0（富媒体消息）完成 — 撤回需要清理 S3 附件
>
> **参考**：[sprint4_implement.md](../sprint4_implement.md) Phase 1

---

## 目标

在 Sprint 2 的软删除基础上，增加撤回时间限制（2 分钟）和管理员撤回权限，并在撤回时异步清理 S3 附件文件。

---

## 任务清单

| # | 任务 | 产出 | 依赖 | 状态 |
|---|------|------|------|------|
| 1.1 | 撤回时间限制 | 普通用户 2 分钟内可撤回 | — | 🔜 |
| 1.2 | 管理员撤回 | OWNER/ADMIN 可撤回任何人的消息 | — | 🔜 |
| 1.3 | 撤回 UI 反馈 | 客户端显示 "XX 撤回了一条消息" | 1.1 | 🔜 |
| 1.4 | 撤回附件清理 | 撤回时异步删除 S3 文件 | Phase 0 | 🔜 |

---

## 后端实现

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/server/src/messages/messages.service.ts` | `softDelete()` 增加 2 分钟限制 + 管理员豁免 + S3 清理 |
| `apps/server/src/messages/messages.controller.ts` | 返回 403 + 错误消息 when 超时 |

### 撤回逻辑

```typescript
// 在现有 softDelete() 方法基础上增强（当前代码在 messages.service.ts:309）
async softDelete(userId: string, messageId: string) {
  const message = await this.prisma.message.findUnique({
    where: { id: messageId },
    include: { converse: { include: { members: true } }, attachments: true },
  });

  if (!message) throw new NotFoundException('Message not found');
  if (message.deletedAt) throw new NotFoundException('Message already deleted');

  // 1. 权限检查：消息作者 OR 群管理员
  const isAuthor = message.authorId === userId;
  const member = message.converse.members.find(m => m.userId === userId);
  const isAdmin = member?.role === 'OWNER' || member?.role === 'ADMIN';

  if (!isAuthor && !isAdmin) throw new ForbiddenException('No permission');

  // 2. 时间限制：普通用户 2 分钟，管理员无限制
  if (isAuthor && !isAdmin) {
    const elapsed = Date.now() - new Date(message.createdAt).getTime();
    if (elapsed > 2 * 60 * 1000) {
      throw new ForbiddenException('Message recall expired (2 min limit)');
    }
  }

  // 3. 软删除
  const deleted = await this.prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });

  // 4. 异步清理 S3 附件（不阻塞撤回响应）
  if (message.attachments.length > 0) {
    setImmediate(async () => {
      for (const att of message.attachments) {
        await this.storageService.deleteFile(att.url).catch(e =>
          this.logger.error(`Failed to delete attachment ${att.id}: ${e.message}`)
        );
        if (att.thumbnailUrl) {
          await this.storageService.deleteFile(att.thumbnailUrl).catch(() => {});
        }
      }
    });
  }

  // 5. WS 广播 message:deleted（保持与现有代码 payload 结构一致，新增 recalledBy）
  this.broadcastService.toRoom(message.converseId, 'message:deleted', {
    id: deleted.id,
    converseId: deleted.converseId,
    deletedAt: deleted.deletedAt!.toISOString(),
    recalledBy: userId,  // 新增：标识撤回者（用于客户端显示 "XX 撤回了一条消息"）
  });

  return { id: deleted.id, deleted: true };
}
```

---

## 客户端实现

### Flutter

| 文件 | 变更 |
|------|------|
| `chat_thread_page.dart` | 消息长按菜单增加 "撤回" 选项（2 分钟内 OR 管理员） |
| message 渲染逻辑 | `deletedAt != null` → 显示 "[已撤回]" 灰色占位文字 |

### Desktop

| 文件 | 变更 |
|------|------|
| `ChatThread.tsx` | 消息右键菜单增加 "Recall" 选项 |
| message 渲染逻辑 | `deletedAt` 非空 → 渲染灰色 "[Message recalled]" |

---

## 验收标准

- [ ] 2 分钟内撤回成功，对方看到 "[已撤回]" 占位
- [ ] 超过 2 分钟撤回失败（403 + 提示语）
- [ ] 管理员（OWNER/ADMIN）可撤回任何消息（无时间限制）
- [ ] S3 上的附件文件在撤回后异步删除
- [ ] 撤回自己的消息显示 "你撤回了一条消息"
- [ ] 管理员撤回他人消息显示 "管理员撤回了一条消息"
- [ ] `pnpm build && pnpm test` 通过
