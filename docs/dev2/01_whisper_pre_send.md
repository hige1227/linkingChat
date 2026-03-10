# Whisper 发送前触发方案

> 将 Whisper 从"发消息后触发"改为"发送前触发"，`@ai` 不再作为消息发出

## 现状问题

当前流程：
```
用户输入 "@ai 帮我想个回复" → 按发送 → 对方看到这条消息 → 服务端调LLM → 建议回来
```

问题：
1. `@ai xxx` 作为真实消息发送，对方会看到
2. 建议是给"下一条"消息的，但用户的意图是"帮我回复当前对话"
3. 体验不自然——要先发一条无意义的消息才能获得建议

## 目标流程

```
用户在输入框打 "@ai" → 客户端检测到 → WS 请求建议（不发消息）
→ 建议条出现 → 用户点选 → 文字填入输入框 → 用户手动按发送
```

**核心原则：AI 不替用户发送任何消息，只是预填输入框。**

---

## 改动清单

### 1. 协议层：`messageId` 改为可选

**文件**：`packages/ws-protocol/src/payloads/ai.payloads.ts`

```diff
 export interface WhisperSuggestionsPayload {
   suggestionId: string;
   converseId: string;
-  messageId: string;
+  messageId?: string;    // 发送前触发时无关联消息
   primary: string;
   alternatives: string[];
   createdAt: string;
 }
```

**文件**：`packages/ws-protocol/src/validators.ts`

```diff
 export const WhisperSuggestionsSchema = z.object({
   suggestionId: z.string(),
   converseId: z.string(),
-  messageId: z.string(),
+  messageId: z.string().optional(),
   primary: z.string(),
   alternatives: z.array(z.string()),
   createdAt: z.string(),
 });
```

### 2. 服务端：新增 `ai:whisper:request` handler

**文件**：`apps/server/src/gateway/chat.gateway.ts`

在现有 `handleWhisperAccept` 之前新增（含群聊拦截）：

```typescript
@SubscribeMessage('ai:whisper:request')
async handleWhisperRequest(
  @ConnectedSocket() client: TypedSocket,
  @MessageBody() data: WhisperRequestPayload,
) {
  const userId = client.data.userId;
  try {
    await this.conversesService.verifyMembership(data.converseId, userId);

    // 群聊不支持 whisper，静默忽略
    const converse = await this.prisma.converse.findUnique({
      where: { id: data.converseId },
      select: { type: true },
    });
    if (converse?.type === 'GROUP') {
      return { success: true };
    }

    // 异步生成建议（fire-and-forget，结果通过 ai:whisper:suggestions 推送）
    this.whisperService
      .handleWhisperRequest(userId, data.converseId)
      .catch((err) =>
        this.logger.error(`Whisper request failed: ${err.message}`, err.stack),
      );

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: { code: 'WHISPER_REQUEST_FAILED', message: (error as Error).message },
    };
  }
}
```

### 3. 服务端：WhisperService 新增方法

**文件**：`apps/server/src/ai/services/whisper.service.ts`

新增 `handleWhisperRequest` 方法（与现有 `handleWhisperTrigger` 类似，但不需要 messageId）：

```typescript
/**
 * 处理客户端主动请求建议（发送前触发）
 * 与 handleWhisperTrigger 的区别：不需要 messageId，不依赖已发送的消息
 */
async handleWhisperRequest(
  userId: string,
  converseId: string,
): Promise<void> {
  try {
    const context = await this.extractContext(converseId);
    const suggestions = await this.generateSuggestions(context);
    if (!suggestions) {
      this.logger.warn(`Whisper request timed out for converse ${converseId}`);
      return;
    }

    const record = await this.prisma.aiSuggestion.create({
      data: {
        type: 'WHISPER',
        userId,
        converseId,
        // messageId 省略（Prisma schema 中为 String?，默认 null）
        suggestions: {
          primary: suggestions.primary,
          alternatives: suggestions.alternatives,
        },
      },
    });

    const payload: WhisperSuggestionsPayload = {
      suggestionId: record.id,
      converseId,
      // messageId 省略，发送前触发无关联消息
      primary: suggestions.primary,
      alternatives: suggestions.alternatives,
      createdAt: record.createdAt.toISOString(),
    };

    this.broadcastService.toRoom(
      `u-${userId}`,
      'ai:whisper:suggestions',
      payload,
    );

    this.logger.log(`Whisper suggestions (pre-send) sent to user ${userId}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    this.logger.error(`Whisper request failed: ${msg}`);
  }
}
```

### 4. Desktop：useChatSocket 新增 emit 方法

**文件**：`apps/desktop/src/renderer/hooks/useChatSocket.ts`

在返回对象中新增：

```typescript
emitWhisperRequest: (converseId: string) => {
  sharedSocket?.emit('ai:whisper:request', { converseId }, (res: any) => {
    if (!res?.success) {
      console.error('Whisper request failed:', res?.error);
    }
  });
},
```

### 5. Desktop：输入框拦截 `@ai`

**文件**：`apps/desktop/src/renderer/components/chat/MessageInput.tsx`

> 注意：`useChatSocket()` 是 React Hook，必须在组件顶层调用，不能在事件处理函数内部调用。

在组件顶层解构 `emitWhisperRequest`，然后在 `handleSend` 中使用：

```typescript
// 组件顶层（与其他 hooks 并列）
const { emitWhisperRequest } = useChatSocket();

// handleSend 开头加入拦截
const handleSend = async () => {
  const content = text.trim();
  if (!content || sending) return;

  // @ai 拦截：不发送消息，改为请求建议
  if (/(?<!\w)@ai\b/i.test(content)) {
    emitWhisperRequest(converseId);
    setText('');
    return;
  }

  // 原有发送逻辑...
};
```

### 6. Mobile：ChatSocketService 新增 emit 方法

**文件**：`apps/mobile/lib/core/network/chat_socket_service.dart`

> `ChatSocketService` 没有通用 `emit()` 方法，需新增命名方法（与现有 `emitWhisperAccept` 模式一致）。

```dart
void emitWhisperRequest(String converseId) {
  _socket?.emitWithAck(AiEvents.whisperRequest, {
    'converseId': converseId,
  }, ack: (response) {
    debugPrint('[ChatSocket] whisperRequest ack: $response');
  });
}
```

同时需要在 `apps/mobile/lib/core/constants/ai_events.dart` 中确认或新增：

```dart
static const whisperRequest = 'ai:whisper:request';
```

### 7. Mobile：输入框拦截 `@ai`（回调方式）

**文件**：`apps/mobile/lib/features/chat/widgets/message_input.dart`

> `MessageInputState` 继承的是 `State` 而不是 `ConsumerState`，无法访问 `ref`。
> 同时 `MessageInput` 组件没有 `converseId` 参数。
> 采用回调方式：新增 `onWhisperRequest` 回调，由持有 `ref` 的父组件提供。

widget 接口新增回调：

```dart
class MessageInput extends StatefulWidget {
  final Function(String) onSend;
  final VoidCallback? onWhisperRequest;  // 新增
  // ... 其他现有字段
}
```

`_handleSend` 中拦截：

```dart
void _handleSend() {
  final content = _controller.text.trim();
  if (content.isEmpty) return;

  // @ai 拦截
  final aiPattern = RegExp(r'(?<!\w)@ai\b', caseSensitive: false);
  if (aiPattern.hasMatch(content)) {
    widget.onWhisperRequest?.call();
    _controller.clear();
    return;
  }

  widget.onSend(content);
  _controller.clear();
}
```

**文件**：`apps/mobile/lib/features/chat/pages/chat_thread_page.dart`（父组件）

在构造 `MessageInput` 时传入回调：

```dart
MessageInput(
  onSend: _sendMessage,
  onWhisperRequest: () {
    ref.read(whisperProvider(converseId).notifier).requestSuggestions();
  },
  // ... 其他参数
)
```

### 8. Mobile：WhisperProvider 新增请求方法

**文件**：`apps/mobile/lib/features/chat/providers/whisper_provider.dart`

```dart
void requestSuggestions() {
  _chatSocket.emitWhisperRequest(converseId);
}
```

### 9. 原有消息触发逻辑：保留作为兜底

**文件**：`apps/server/src/messages/messages.service.ts`

暂不删除原有 `isWhisperTrigger` + `handleWhisperTrigger` 逻辑，等双端发送前触发验证稳定后再移除。加 TODO 注释标记。

---

## 改动文件汇总

| # | 文件 | 操作 | 改动量 |
|---|------|------|--------|
| 1 | `packages/ws-protocol/src/payloads/ai.payloads.ts` | messageId 改 optional | ~2 行 |
| 2 | `packages/ws-protocol/src/validators.ts` | Zod schema 加 .optional() | ~2 行 |
| 3 | `apps/server/src/gateway/chat.gateway.ts` | 新增 handler（含 GROUP 拦截） | ~25 行 |
| 4 | `apps/server/src/ai/services/whisper.service.ts` | 新增 handleWhisperRequest | ~35 行 |
| 5 | `apps/desktop/src/renderer/hooks/useChatSocket.ts` | 新增 emitWhisperRequest | ~5 行 |
| 6 | `apps/desktop/src/renderer/components/chat/MessageInput.tsx` | 顶层解构 hook + 拦截逻辑 | ~8 行 |
| 7 | `apps/mobile/lib/core/network/chat_socket_service.dart` | 新增 emitWhisperRequest | ~6 行 |
| 8 | `apps/mobile/lib/core/constants/ai_events.dart` | 新增常量 | ~1 行 |
| 9 | `apps/mobile/lib/features/chat/widgets/message_input.dart` | 新增回调 + 拦截 | ~10 行 |
| 10 | `apps/mobile/lib/features/chat/pages/chat_thread_page.dart` | 传入回调 | ~3 行 |
| 11 | `apps/mobile/lib/features/chat/providers/whisper_provider.dart` | 新增 requestSuggestions | ~3 行 |
| 12 | `apps/server/src/messages/messages.service.ts` | 加 TODO 注释 | ~2 行 |

**总计：~102 行改动，12 个文件**

---

## 边界情况处理

| 场景 | 处理方式 |
|------|---------|
| 群聊中输入 `@ai` | 客户端不拦截，正常发送走 @mention 逻辑；服务端 handler 也有 GROUP 拦截兜底 |
| LLM 超时/失败 | 建议条不出现，用户可以正常手动打字发送 |
| 快速连续输入 `@ai` | 后一次覆盖前一次建议（aiStore 按 converseId 存储，新值覆盖旧值） |
| 用户点选建议后又修改了文字 | 正常——文字只是预填到输入框，用户完全可以编辑后再发 |
| 输入 `@aide` / `email@ai.com` | 不触发——正则 `(?<!\w)@ai\b` 只匹配独立的 `@ai` |

## Review 修复记录

| # | 问题 | 修复 |
|---|------|------|
| 1 | React Hooks 违规：`useChatSocket()` 在 `handleSend` 内调用 | 改为组件顶层解构 |
| 2 | `messageId` 类型不兼容：接口和 Zod 都要求必填 | 改为 optional |
| 3 | Mobile `MessageInputState` 无 `ref`，无 `converseId` | 改用 `onWhisperRequest` 回调 |
| 4 | `ChatSocketService` 无通用 `emit()` | 新增 `emitWhisperRequest` 命名方法 |
| 5 | 服务端 handler 缺 GROUP 拦截 | 新增 `converse.type === 'GROUP'` 判断 |

## 测试验证

- [ ] Desktop 私聊输入 `@ai 帮我回复` 按发送 → 消息不发出，1-2s 后建议条出现
- [ ] 点选建议 → 文字填入输入框，手动按发送 → 对方收到正常消息
- [ ] 对方全程看不到 `@ai` 相关文字
- [ ] 群聊中输入 `@ai` → 正常作为消息发送（不拦截）
- [ ] Mobile 同上流程验证
- [ ] LLM 超时 → 无建议出现，不影响正常聊天
