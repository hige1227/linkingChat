# Sprint 2 — Phase 9: Flutter + Desktop 客户端 UI 集成

> **负责人**：全端（移动端 + 桌面端）
>
> **产出**：Flutter 和 Desktop 客户端的完整聊天 UI — 会话列表页、消息线程页、群组详情页、Socket.IO 实时连接、状态管理
>
> **参考**：[sprint2_implement.md](./sprint2_implement.md) | [websocket-protocol.md](../dev-plan/websocket-protocol.md) | Phase 7 已有组件（BotBadge, NotificationCard, ConverseTile, MessageBubble）

---

## 子阶段划分

Phase 9 体量较大，拆分为 3 个子阶段以解除阻塞、支持并行开发：

| 子阶段 | 内容 | 前置条件 | 可并行 |
|--------|------|----------|--------|
| **9A** | Socket.IO 连接 + 状态管理 + 数据模型 | Phase 2（DM 消息系统） | 与 Phase 8 并行 |
| **9B** | 核心聊天 UI（会话列表 + 消息线程 + 路由） | Phase 9A | 与 Phase 8 并行 |
| **9C** | 群组 UI + 好友 UI | Phase 8 + Phase 9B | Phase 8 完成后 |

> **关键**：9A 和 9B 仅依赖 Phase 2 的 DM 消息系统，**不依赖 Phase 8 群组功能**。这意味着 Phase 8（后端群组）和 Phase 9A+9B（前端聊天核心）可以同步开发。

---

## 当前客户端 UI 状态

### Flutter（apps/mobile）

已有组件（Phase 7 创建，尚未集成到页面中）：

```
lib/features/
├── auth/
│   ├── pages/login_page.dart          # 登录页 ✅
│   └── providers/auth_provider.dart   # 认证状态 ✅
├── device/
│   ├── pages/device_list_page.dart    # 设备列表 ✅
│   ├── pages/command_page.dart        # 命令执行 ✅
│   └── providers/device_provider.dart # 设备状态 ✅
├── chat/widgets/                      # Phase 7 创建的 UI 组件
│   ├── converse_tile.dart             # 会话列表 tile ✅
│   ├── message_bubble.dart            # 消息气泡 ✅
│   ├── notification_card.dart         # 通知卡片 ✅
│   └── bot_badge.dart                 # Bot 角标 ✅
```

**缺失**：无聊天页面（ConversesListPage、ChatThreadPage、GroupDetailPage），无 Socket.IO 连接，无聊天状态管理，无 Dart 数据模型类。

### Desktop（apps/desktop）

已有组件：

```
src/renderer/
├── pages/
│   ├── Login.tsx                      # 登录页 ✅
│   └── Dashboard.tsx                  # 设备管理面板 ✅
├── components/
│   ├── ConnectionStatus.tsx           # 连接状态 ✅
│   ├── CommandLog.tsx                 # 命令日志 ✅
│   ├── NotificationCard.tsx           # 通知卡片 ✅ (Phase 7)
│   └── BotBadge.tsx                   # Bot 角标 ✅ (Phase 7)
```

**缺失**：无聊天页面（ChatPage、ConversationList、ChatThread），无 Socket.IO /chat 连接。当前状态管理为组件内部 state + IPC。

---

# Phase 9A：Socket.IO 连接 + 状态管理基础

> **前置条件**：Phase 2（DM 消息系统）完成
>
> **可与 Phase 8 并行开发**

## 任务清单

| # | 任务 | 文件 / 目录 | 依赖 |
|---|------|------------|------|
| **Flutter** | | | |
| 9A.1 | Dart 数据模型类 | `lib/core/models/` | — |
| 9A.2 | Socket.IO 服务（/chat 命名空间） | `lib/core/services/chat_socket_service.dart` | 9A.1 |
| 9A.3 | 聊天状态管理 Provider | `lib/features/chat/providers/chat_provider.dart` | 9A.1, 9A.2 |
| **Desktop** | | | |
| 9A.4 | Socket.IO Hook（/chat 命名空间） | `src/renderer/hooks/useChatSocket.ts` | — |
| 9A.5 | 聊天状态管理 Store | `src/renderer/stores/chatStore.ts` | 9A.4 |

---

### 9A.1 Dart 数据模型类

使用 `freezed` + `json_serializable` 生成不可变数据类，取代 `Map<String, dynamic>`。

**新增文件**：

```
lib/core/models/
├── converse.dart          # Converse 数据模型
├── message.dart           # Message 数据模型
├── user_brief.dart        # UserBrief（头像+名字）
└── models.dart            # barrel export
```

```dart
// lib/core/models/converse.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'converse.freezed.dart';
part 'converse.g.dart';

@freezed
class Converse with _$Converse {
  const factory Converse({
    required String id,
    required String type,  // 'DM' | 'GROUP'
    String? name,
    String? description,
    String? avatarUrl,
    int? memberCount,
    required List<ConverseMember> members,
    MessagePreview? lastMessage,
    @Default(0) int unreadCount,
    @Default(false) bool isBot,
    @Default(false) bool isPinned,
    BotInfo? botInfo,
    required DateTime createdAt,
    required DateTime updatedAt,
  }) = _Converse;

  factory Converse.fromJson(Map<String, dynamic> json) => _$ConverseFromJson(json);
}

@freezed
class ConverseMember with _$ConverseMember {
  const factory ConverseMember({
    required String userId,
    required String username,
    required String displayName,
    String? avatarUrl,
    String? status,   // UserStatus
    String? role,     // GroupRole (null for DM)
  }) = _ConverseMember;

  factory ConverseMember.fromJson(Map<String, dynamic> json) => _$ConverseMemberFromJson(json);
}

@freezed
class BotInfo with _$BotInfo {
  const factory BotInfo({
    required String id,
    required String name,
    required String type,
  }) = _BotInfo;

  factory BotInfo.fromJson(Map<String, dynamic> json) => _$BotInfoFromJson(json);
}
```

```dart
// lib/core/models/message.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'message.freezed.dart';
part 'message.g.dart';

@freezed
class Message with _$Message {
  const factory Message({
    required String id,
    required String content,
    required String type,       // MessageType
    required String converseId,
    required String authorId,
    required MessageAuthor author,
    Map<String, dynamic>? metadata,
    String? replyToId,
    required DateTime createdAt,
    DateTime? updatedAt,
    DateTime? deletedAt,
    @Default(SendStatus.sent) SendStatus sendStatus,  // 本地发送状态
  }) = _Message;

  factory Message.fromJson(Map<String, dynamic> json) => _$MessageFromJson(json);
}

@freezed
class MessageAuthor with _$MessageAuthor {
  const factory MessageAuthor({
    required String id,
    required String username,
    required String displayName,
    String? avatarUrl,
  }) = _MessageAuthor;

  factory MessageAuthor.fromJson(Map<String, dynamic> json) => _$MessageAuthorFromJson(json);
}

/// 本地消息发送状态（不来自服务器）
enum SendStatus { sending, sent, failed }
```

**依赖**：
```yaml
# pubspec.yaml
dependencies:
  freezed_annotation: ^2.4.1
  json_annotation: ^4.9.0

dev_dependencies:
  freezed: ^2.5.2
  json_serializable: ^6.8.0
  build_runner: ^2.4.9
```

---

### 9A.2 Flutter Socket.IO 服务

使用 `socket_io_client` Dart 包连接 `/chat` 命名空间。增强版本包含连接状态管理、token 刷新重连、错误处理。

**新增文件**：`lib/core/services/chat_socket_service.dart`

```dart
import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;

/// Socket 连接状态
enum SocketConnectionState {
  disconnected,
  connecting,
  connected,
  reconnecting,
}

/// 管理 /chat 命名空间的 Socket.IO 连接
///
/// 功能：
/// - JWT 认证连接
/// - 连接状态暴露给 UI 层（顶栏"连接中..."指示）
/// - Token 过期后自动使用新 token 重连
/// - 自动重连（socket.io-client 内置 + 手动 token 更新）
/// - 事件分发到回调
/// - converse:join/leave 房间管理
class ChatSocketService {
  io.Socket? _socket;
  final String baseUrl;
  String? _token;

  /// 连接状态流 — UI 层监听此流显示连接状态
  final _connectionStateController = StreamController<SocketConnectionState>.broadcast();
  Stream<SocketConnectionState> get connectionState => _connectionStateController.stream;
  SocketConnectionState _currentState = SocketConnectionState.disconnected;

  // 事件回调
  Function(Map<String, dynamic>)? onMessageNew;
  Function(Map<String, dynamic>)? onMessageUpdated;
  Function(Map<String, dynamic>)? onMessageDeleted;
  Function(Map<String, dynamic>)? onNotificationNew;
  Function(Map<String, dynamic>)? onPresenceChanged;
  Function(Map<String, dynamic>)? onMessageRead;
  Function(Map<String, dynamic>)? onGroupCreated;
  Function(Map<String, dynamic>)? onGroupUpdated;
  Function(Map<String, dynamic>)? onGroupDeleted;
  Function(Map<String, dynamic>)? onGroupMemberAdded;
  Function(Map<String, dynamic>)? onGroupMemberRemoved;

  /// 连接错误回调 — 用于 token 过期等场景
  Function(dynamic)? onConnectError;

  /// 重连成功回调 — 触发重新拉取数据
  Function()? onReconnected;

  ChatSocketService({required this.baseUrl});

  bool get isConnected => _currentState == SocketConnectionState.connected;

  /// 使用 JWT token 连接
  void connect(String token) {
    _token = token;
    _updateState(SocketConnectionState.connecting);

    _socket = io.io('$baseUrl/chat', <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': true,
      'auth': {'token': token},
      'reconnection': true,
      'reconnectionAttempts': 10,
      'reconnectionDelay': 1000,
      'reconnectionDelayMax': 30000,
    });

    _registerLifecycleListeners();
    _registerEventListeners();
  }

  /// Token 刷新后调用 — 断开旧连接，使用新 token 重连
  void reconnectWithToken(String newToken) {
    _socket?.disconnect();
    _socket?.dispose();
    connect(newToken);
  }

  /// 加入会话房间
  void joinConverse(String converseId) {
    _socket?.emit('converse:join', {'converseId': converseId});
  }

  /// 离开会话房间
  void leaveConverse(String converseId) {
    _socket?.emit('converse:leave', {'converseId': converseId});
  }

  /// 发送已读回执
  void sendReadReceipt(String converseId, String lastSeenMessageId) {
    _socket?.emit('message:read', {
      'converseId': converseId,
      'lastSeenMessageId': lastSeenMessageId,
    });
  }

  /// 发送输入状态
  void sendTyping(String converseId, bool isTyping) {
    _socket?.emit('message:typing', {
      'converseId': converseId,
      'isTyping': isTyping,
    });
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _updateState(SocketConnectionState.disconnected);
    // 不关闭 controller — 允许后续重连
  }

  void dispose() {
    disconnect();
    _connectionStateController.close();
  }

  void _updateState(SocketConnectionState state) {
    _currentState = state;
    _connectionStateController.add(state);
  }

  void _registerLifecycleListeners() {
    _socket?.onConnect((_) {
      _updateState(SocketConnectionState.connected);
    });

    _socket?.onDisconnect((_) {
      _updateState(SocketConnectionState.disconnected);
    });

    _socket?.onReconnecting((_) {
      _updateState(SocketConnectionState.reconnecting);
    });

    _socket?.onReconnect((_) {
      _updateState(SocketConnectionState.connected);
      onReconnected?.call();
    });

    _socket?.onConnectError((error) {
      _updateState(SocketConnectionState.disconnected);
      onConnectError?.call(error);
    });

    _socket?.onError((error) {
      onConnectError?.call(error);
    });
  }

  void _registerEventListeners() {
    _socket?.on('message:new', (data) => onMessageNew?.call(data));
    _socket?.on('message:updated', (data) => onMessageUpdated?.call(data));
    _socket?.on('message:deleted', (data) => onMessageDeleted?.call(data));
    _socket?.on('notification:new', (data) => onNotificationNew?.call(data));
    _socket?.on('presence:changed', (data) => onPresenceChanged?.call(data));
    _socket?.on('message:read', (data) => onMessageRead?.call(data));
    _socket?.on('group:created', (data) => onGroupCreated?.call(data));
    _socket?.on('group:updated', (data) => onGroupUpdated?.call(data));
    _socket?.on('group:deleted', (data) => onGroupDeleted?.call(data));
    _socket?.on('group:memberAdded', (data) => onGroupMemberAdded?.call(data));
    _socket?.on('group:memberRemoved', (data) => onGroupMemberRemoved?.call(data));
  }
}
```

**依赖**：
```yaml
# pubspec.yaml
dependencies:
  socket_io_client: ^3.0.2
```

---

### 9A.3 聊天状态管理 Provider

使用 Riverpod 管理聊天状态，全部使用类型安全的 Model 类。

**新增文件**：`lib/features/chat/providers/chat_provider.dart`

```dart
/// 聊天状态 Provider
///
/// 管理：
/// - 会话列表（从 REST API 加载，WS 实时更新）
/// - 当前打开的会话 ID
/// - 消息列表（按 converseId 缓存，使用 Message model）
/// - 未读计数
/// - 输入状态
/// - Socket 连接状态
@freezed
class ChatState with _$ChatState {
  const factory ChatState({
    @Default([]) List<Converse> converses,
    String? activeConverseId,
    @Default({}) Map<String, List<Message>> messages,
    @Default({}) Map<String, int> unreadCounts,
    @Default({}) Map<String, List<String>> typingUsers, // converseId → [username]
    @Default(false) bool isLoading,
    @Default(SocketConnectionState.disconnected) SocketConnectionState connectionState,
  }) = _ChatState;
}

class ChatNotifier extends StateNotifier<ChatState> {
  final ChatSocketService _socket;
  final Ref _ref;

  ChatNotifier(this._ref, this._socket) : super(const ChatState()) {
    _setupSocketListeners();
    _setupConnectionStateListener();
  }

  /// 监听 Socket 连接状态
  void _setupConnectionStateListener() {
    _socket.connectionState.listen((socketState) {
      state = state.copyWith(connectionState: socketState);
    });
  }

  /// 从 REST API 加载会话列表
  Future<void> loadConverses() async { ... }

  /// 加载指定会话的消息历史（游标分页）
  Future<void> loadMessages(String converseId, {String? cursor}) async { ... }

  /// 通过 REST API 发送消息
  ///
  /// 设计决策：消息发送走 REST 而非 WS emit。
  /// 原因：REST 保证持久化 + HTTP 响应确认 + 标准错误码处理。
  /// WS 仅用于实时通知（S→C），不用于写操作。
  Future<void> sendMessage(String converseId, String content, {String? replyToId}) async {
    // 1. 乐观更新：先在本地消息列表中插入（sendStatus: sending）
    // 2. POST /api/v1/messages → 成功后更新为 sent
    // 3. 失败时更新为 failed（显示红色感叹号 + 重试按钮）
  }

  /// 重试发送失败的消息
  Future<void> retrySendMessage(String converseId, String localMessageId) async { ... }

  /// 打开会话 — 加入 WS 房间 + 发送已读回执
  void openConverse(String converseId) { ... }

  /// 关闭会话 — 离开 WS 房间
  void closeConverse(String converseId) { ... }

  // 私有：WS 事件处理
  void _onMessageNew(Map<String, dynamic> data) {
    final message = Message.fromJson(data);
    // 去重：检查 messages[converseId] 是否已包含该 id
    // 插入消息列表 + 更新对应 converse 的 lastMessage + 排序
    // 如果非当前 activeConverse → 更新 unreadCount
  }
  void _onNotificationNew(Map<String, dynamic> data) { ... }
  void _onMessageRead(Map<String, dynamic> data) { ... }
}
```

---

### 9A.4 Desktop Socket.IO Hook

**新增文件**：`src/renderer/hooks/useChatSocket.ts`

```typescript
import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useChatStore } from '../stores/chatStore';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * /chat 命名空间 Socket.IO 连接 Hook
 *
 * 功能：
 * - JWT 认证连接
 * - 连接状态暴露给 UI（顶栏"连接中..."指示）
 * - 自动重连 + 重连后重新拉取数据
 * - 事件注册 → 直接调用 chatStore actions
 * - converse:join/leave
 */
export function useChatSocket(token: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  // 获取 store actions（在 hook 内直接集成，避免调用方手动对接）
  const { handleNewMessage, handleNotification, handleMessageRead, handlePresenceChanged,
          handleGroupCreated, handleGroupUpdated, handleGroupDeleted,
          handleGroupMemberAdded, handleGroupMemberRemoved,
          loadConverses } = useChatStore.getState();

  useEffect(() => {
    if (!token) return;

    setConnectionState('connecting');
    const socket = io('http://localhost:3008/chat', {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    socketRef.current = socket;

    // 生命周期事件
    socket.on('connect', () => setConnectionState('connected'));
    socket.on('disconnect', () => setConnectionState('disconnected'));
    socket.io.on('reconnect_attempt', () => setConnectionState('reconnecting'));
    socket.io.on('reconnect', () => {
      setConnectionState('connected');
      // 重连后重新拉取会话列表（补上断连期间的消息）
      loadConverses(token);
    });
    socket.on('connect_error', (err) => {
      console.error('[ChatSocket] connect error:', err.message);
      setConnectionState('disconnected');
    });

    // 业务事件 → 直接更新 store
    socket.on('message:new', handleNewMessage);
    socket.on('notification:new', handleNotification);
    socket.on('message:read', handleMessageRead);
    socket.on('presence:changed', handlePresenceChanged);
    socket.on('group:created', handleGroupCreated);
    socket.on('group:updated', handleGroupUpdated);
    socket.on('group:deleted', handleGroupDeleted);
    socket.on('group:memberAdded', handleGroupMemberAdded);
    socket.on('group:memberRemoved', handleGroupMemberRemoved);

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnectionState('disconnected');
    };
  }, [token]);

  const joinConverse = useCallback((converseId: string) => {
    socketRef.current?.emit('converse:join', { converseId });
  }, []);

  const leaveConverse = useCallback((converseId: string) => {
    socketRef.current?.emit('converse:leave', { converseId });
  }, []);

  const sendTyping = useCallback((converseId: string, isTyping: boolean) => {
    socketRef.current?.emit('message:typing', { converseId, isTyping });
  }, []);

  const sendReadReceipt = useCallback((converseId: string, messageId: string) => {
    socketRef.current?.emit('message:read', { converseId, lastSeenMessageId: messageId });
  }, []);

  return { connectionState, joinConverse, leaveConverse, sendTyping, sendReadReceipt };
}
```

**依赖**：
```bash
cd apps/desktop && pnpm add socket.io-client
```

---

### 9A.5 聊天状态管理 Store

使用 Zustand 管理聊天状态。

> **状态管理统一策略**：聊天功能使用 Zustand，现有设备管理页面（Dashboard）保持原有 IPC + 组件内部 state 不变。后续 Sprint 可统一迁移，MVP 不做额外重构。

**新增文件**：`src/renderer/stores/chatStore.ts`

```typescript
import { create } from 'zustand';
import type { ConverseResponse, MessageResponse } from '@linkingchat/ws-protocol';

interface ChatState {
  converses: ConverseResponse[];
  activeConverseId: string | null;
  messages: Record<string, MessageResponse[]>;
  unreadCounts: Record<string, number>;
  typingUsers: Record<string, string[]>;  // converseId → [username]
  isLoading: boolean;

  // Actions — REST API 交互
  loadConverses: (token: string) => Promise<void>;
  loadMessages: (token: string, converseId: string, cursor?: string) => Promise<void>;

  /**
   * 消息发送走 REST 而非 WS emit。
   * 原因：REST 保证持久化 + HTTP 响应确认 + 标准错误码。
   * WS 仅用于实时推送（S→C），不用于客户端写操作。
   */
  sendMessage: (token: string, converseId: string, content: string, replyToId?: string) => Promise<void>;

  setActiveConverse: (converseId: string | null) => void;

  // Actions — WS 事件 handler（由 useChatSocket hook 直接调用）
  handleNewMessage: (data: any) => void;
  handleNotification: (data: any) => void;
  handleMessageRead: (data: any) => void;
  handlePresenceChanged: (data: any) => void;
  handleGroupCreated: (data: any) => void;
  handleGroupUpdated: (data: any) => void;
  handleGroupDeleted: (data: any) => void;
  handleGroupMemberAdded: (data: any) => void;
  handleGroupMemberRemoved: (data: any) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  converses: [],
  activeConverseId: null,
  messages: {},
  unreadCounts: {},
  typingUsers: {},
  isLoading: false,

  loadConverses: async (token) => {
    set({ isLoading: true });
    try {
      const res = await fetch('http://localhost:3008/api/v1/converses', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const converses = await res.json();
      set({ converses, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  // ... 其余实现

  handleNewMessage: (data) => {
    const { messages, converses, activeConverseId } = get();
    const converseId = data.converseId;
    const existing = messages[converseId] ?? [];

    // 去重：检查是否已包含该 id
    if (existing.some(m => m.id === data.id)) return;

    set({
      messages: { ...messages, [converseId]: [...existing, data] },
      // 非当前活跃会话 → 增加未读计数
      ...(converseId !== activeConverseId && {
        unreadCounts: { ...get().unreadCounts, [converseId]: (get().unreadCounts[converseId] ?? 0) + 1 },
      }),
    });
  },

  // ... 其余 handler
}));
```

**依赖**：
```bash
cd apps/desktop && pnpm add zustand
```

---

### 9A 完成检查清单

- [ ] Flutter: `freezed` model 类生成成功（`dart run build_runner build`）
- [ ] Flutter: `Converse.fromJson()` / `Message.fromJson()` 序列化正确
- [ ] Flutter: Socket.IO 连接 `/chat` 命名空间成功
- [ ] Flutter: `connectionState` 流正确反映连接/断开/重连状态
- [ ] Flutter: Token 刷新后 `reconnectWithToken()` 重连成功
- [ ] Desktop: `socket.io-client` 连接 `/chat` 命名空间成功
- [ ] Desktop: `useChatSocket` 的 `connectionState` 正确暴露
- [ ] Desktop: WS 事件 → chatStore handler 调用链路通
- [ ] Desktop: `loadConverses()` 正确加载会话列表到 store

---

# Phase 9B：核心聊天 UI

> **前置条件**：Phase 9A 完成
>
> **可与 Phase 8 并行开发**（仅使用 DM 会话测试，GROUP 在 9C 集成）

## 任务清单

| # | 任务 | 文件 / 目录 | 依赖 |
|---|------|------------|------|
| **Flutter** | | | |
| 9B.1 | 会话列表页 | `lib/features/chat/pages/converses_list_page.dart` | 9A.3 |
| 9B.2 | 消息线程页 | `lib/features/chat/pages/chat_thread_page.dart` | 9A.3 |
| 9B.3 | Flutter 路由集成 + 底部导航 | `lib/main.dart` + `lib/app.dart` | 9B.1-9B.2 |
| **Desktop** | | | |
| 9B.4 | 聊天主页面（三栏布局） | `src/renderer/pages/Chat.tsx` | 9A.5 |
| 9B.5 | 会话列表侧边栏 | `src/renderer/components/ConversationList.tsx` | 9A.5 |
| 9B.6 | 消息线程区域 | `src/renderer/components/ChatThread.tsx` | 9A.5 |
| 9B.7 | 消息输入框 | `src/renderer/components/MessageInput.tsx` | 9B.6 |
| 9B.8 | Desktop 路由集成 + MainLayout | `src/renderer/App.tsx` + `src/renderer/pages/MainLayout.tsx` | 9B.4 |

---

### 9B.1 Flutter 会话列表页

**新增文件**：`lib/features/chat/pages/converses_list_page.dart`

```
ConversesListPage
├── AppBar：标题"消息" + 搜索图标 + 创建群组按钮
├── ConnectionStatusBanner（Socket 断连时显示"连接中..."横幅）
├── RefreshIndicator（下拉刷新）
│   └── ListView.builder
│       ├── ConverseTile（已有组件 — Phase 7）
│       │   ├── Bot DM → BotBadge 角标 + 置顶图标
│       │   ├── 好友 DM → 对方头像 + 在线状态指示点
│       │   └── GROUP → 群头像 + 群名 + 成员数
│       └── onTap → 导航到 ChatThreadPage
├── EmptyState（无会话时显示占位插图 + "添加好友开始聊天"提示）
└── FloatingActionButton → 创建群组 / 添加好友
```

**关键逻辑**：
- 页面初始化时调用 `chatProvider.loadConverses()`
- Socket 连接后自动接收 `notification:new` 更新未读计数
- Bot 会话 `isPinned=true` 始终在列表顶部
- GROUP 类型显示群图标 + 群名
- 长按 DM → 标记已读/删除会话（设置 isOpen=false）
- 监听 `chatProvider.connectionState` 显示/隐藏连接状态横幅

### 9B.2 Flutter 消息线程页

**新增文件**：`lib/features/chat/pages/chat_thread_page.dart`

新增辅助 widget 文件：
```
lib/features/chat/widgets/
├── message_input.dart            # 消息输入框
├── typing_indicator.dart         # "正在输入..." 指示器
└── date_separator.dart           # 日期分隔符
```

```
ChatThreadPage
├── AppBar
│   ├── DM：对方头像 + 名字 + 在线状态
│   ├── Bot DM：Bot 头像(角标) + Bot 名字
│   └── GROUP：群头像 + 群名 + 成员数 + 详情按钮(→ GroupDetailPage)
├── 消息列表（reverse ListView.builder — 天然虚拟化）
│   ├── MessageBubble（已有组件 — Phase 7）
│   │   ├── TEXT → 文本气泡（左/右对齐）
│   │   ├── BOT_NOTIFICATION → NotificationCard（已有组件）
│   │   ├── SYSTEM → 居中灰色文字（"xxx 创建了群组"）
│   │   └── 引用回复 → 嵌套回复预览条
│   ├── 发送失败消息 → 红色感叹号 + "重试"按钮
│   └── 日期分隔符
├── 输入状态指示："{user} 正在输入..."
├── 消息输入区域
│   ├── TextInput + 表情选择器入口
│   ├── 引用回复预览条（长按消息 → 引用回复）
│   └── 发送按钮
└── 向上滚动触发加载更多（游标分页）
```

**关键逻辑**：
- 进入页面：`chatProvider.openConverse(id)` → 加入 WS 房间 + 加载消息 + 发送已读
- 离开页面：`chatProvider.closeConverse(id)` → 离开 WS 房间
- 新消息自动滚动到底部（当用户在底部时）
- 向上滚动到顶部触发 `loadMessages(cursor: nextCursor)` 加载更早消息
- 长按消息弹出操作菜单：回复 / 编辑（仅自己的）/ 撤回（仅自己的）/ 复制
- 输入文字时发送 `message:typing` 事件（2 秒 debounce）
- 收到 `message:read` 更新消息的已读状态
- 发送失败消息显示红色感叹号，点击弹出"重试/删除"选项

### 9B.3 Flutter 路由集成

**修改**：`lib/main.dart` + `lib/app.dart`

```dart
// 底部导航栏结构
BottomNavigationBar
├── 消息（ConversesListPage）    — 默认 tab
├── 好友（占位 — 9C 实现）
├── 设备（DeviceListPage）       — 已有
└── 我的（ProfilePage）          — 占位
```

**路由新增**：

| 路由 | 页面 | 说明 |
|------|------|------|
| `/chat` | ConversesListPage | 会话列表（底部 tab 1） |
| `/chat/:converseId` | ChatThreadPage | 消息线程 |

**Socket.IO 连接时机**：
- 登录成功后立即建立 `/chat` 命名空间连接
- 存储在 Riverpod Provider 中，全局共享
- Token 刷新后调用 `reconnectWithToken(newToken)`
- 退出登录时调用 `disconnect()`

---

### 9B.4 Desktop 聊天主页面（三栏布局）

**新增文件**：`src/renderer/pages/Chat.tsx`

```
Chat Page（三栏布局）
┌─────────────────┬──────────────────────────┬──────────────┐
│ ConversationList │     ChatThread           │ DetailPanel  │
│ (260px 侧边栏)   │  (flex-1 主区域)          │ (可收起面板)  │
│                  │                          │              │
│ ┌─ 搜索框 ─┐    │ ┌─ Header ──────────┐    │ 群组详情      │
│ │          │    │ │ 头像 + 名字 + 状态  │    │ 成员列表      │
│ │          │    │ └──────────────────┘    │ 角色管理      │
│ ├──────────┤    │                          │ 退出/解散     │
│ │ Bot DM   │    │ ┌─ Messages ────────┐    │              │
│ │ Bot DM   │    │ │ MessageBubble     │    │              │
│ │ 好友 DM  │    │ │ MessageBubble     │    │              │
│ │ GROUP    │    │ │ ...               │    │              │
│ │ ...      │    │ └──────────────────┘    │              │
│ │          │    │                          │              │
│ └──────────┘    │ ┌─ MessageInput ────┐    │              │
│                  │ │ [输入框] [发送]    │    │              │
│                  │ └──────────────────┘    │              │
└─────────────────┴──────────────────────────┴──────────────┘
```

**响应式规则**：

| 窗口宽度 | 布局 |
|----------|------|
| >= 1200px | 三栏：侧边栏(260px) + 消息区(flex-1) + 详情面板(300px) |
| 800-1199px | 两栏：侧边栏(260px) + 消息区(flex-1)，详情面板收起 |
| < 800px | 不支持（Electron 窗口最小宽度设为 800px） |

侧边栏固定 260px 不可折叠。DetailPanel 默认收起，点击群组详情按钮时展开/收起。

### 9B.5 Desktop 会话列表侧边栏

**新增文件**：`src/renderer/components/ConversationList.tsx` + `src/renderer/components/ConversationItem.tsx`

```typescript
/**
 * 会话列表侧边栏
 *
 * 功能：
 * - 搜索过滤（按名字/最近消息）
 * - Bot DM isPinned 置顶
 * - GROUP 显示群图标 + 群名 + 成员数
 * - DM 显示对方头像 + 在线状态
 * - 未读计数红点
 * - 最后消息预览 + 时间戳
 * - 点击切换 activeConverse
 * - 右键菜单：标记已读 / 删除会话
 */
export function ConversationList() { ... }
```

### 9B.6 Desktop 消息线程区域

**新增文件**：`src/renderer/components/ChatThread.tsx` + `src/renderer/components/ChatHeader.tsx`

```typescript
/**
 * 消息线程区域
 *
 * 功能：
 * - 虚拟化消息列表（react-virtuoso）
 * - 自动滚动到底部（新消息时）
 * - 向上滚动加载更多（游标分页）
 * - 日期分隔符
 * - 消息气泡（自己右对齐蓝色，对方左对齐白色）
 * - BOT_NOTIFICATION → NotificationCard 组件（已有）
 * - SYSTEM → 居中灰色文字
 * - 发送失败 → 红色感叹号 + 重试按钮
 * - 引用回复预览
 * - 输入状态指示器
 * - 右键消息菜单：回复 / 编辑 / 撤回 / 复制
 */
export function ChatThread({ converseId }: { converseId: string }) { ... }
```

### 9B.7 Desktop 消息输入框

**新增文件**：`src/renderer/components/MessageInput.tsx`

```typescript
/**
 * 消息输入组件
 *
 * 功能：
 * - 多行文本输入（Shift+Enter 换行，Enter 发送）
 * - 引用回复模式（显示被引用消息预览 + 取消按钮）
 * - 输入状态上报（2 秒 debounce）
 * - 发送按钮（空内容禁用）
 * - Ctrl+V 粘贴图片（Sprint 2 暂不实现，预留接口）
 */
export function MessageInput({ converseId }: { converseId: string }) { ... }
```

### 9B.8 Desktop 路由集成

**新增文件**：`src/renderer/pages/MainLayout.tsx`

**修改**：`src/renderer/App.tsx`

```typescript
// 更新路由配置
<Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/" element={<MainLayout />}>
    <Route index element={<Navigate to="/chat" />} />
    <Route path="chat" element={<Chat />} />
    <Route path="devices" element={<Dashboard />} />  {/* 原有 */}
  </Route>
</Routes>
```

**MainLayout 侧边导航**：

```
┌──────┐
│ Chat │ → /chat     （消息）
│ Dev  │ → /devices  （设备管理，已有 Dashboard）
│ Set  │ → /settings （设置，占位）
└──────┘
```

> 好友入口内嵌在 Chat 侧边栏顶部（tab 切换：会话/好友），不独立占导航位。

---

### 9B 错误状态 UI 规格

| 场景 | Flutter | Desktop |
|------|---------|---------|
| Socket 断连 | 顶部红色横幅："连接已断开，正在重连..." + 加载动画 | ChatHeader 下方黄色横幅："Reconnecting..." |
| 消息发送失败 | 消息右下角红色 `!` 图标，点击弹出 BottomSheet："重试 / 删除" | 消息右下角红色 `!` 图标，hover 显示 tooltip "发送失败"，点击弹出菜单 |
| 加载消息失败 | 消息区域居中："加载失败" + "重试"按钮 | 同左 |
| 空会话列表 | 居中插图 + "还没有消息，去添加好友吧" | 居中文字："No conversations yet" |
| 空消息列表 | 居中浅色文字："开始你们的对话吧" | 居中浅色文字："Start a conversation" |

---

### 9B 完成检查清单

- [ ] Flutter: 底部导航显示 4 个 tab（消息/好友占位/设备/我的占位）
- [ ] Flutter: 会话列表页正确显示 Bot DM（置顶）+ 好友 DM
- [ ] Flutter: 点击会话进入消息线程页，显示消息历史
- [ ] Flutter: 发送消息后消息出现在列表中
- [ ] Flutter: 实时收到对方消息（通过 WS message:new）
- [ ] Flutter: 未读计数红点正确显示和清除
- [ ] Flutter: Socket 断连时显示连接状态横幅
- [ ] Flutter: 消息发送失败显示红色感叹号 + 重试可用
- [ ] Desktop: 侧边导航包含消息 + 设备 tab
- [ ] Desktop: 三栏布局正确渲染（侧边栏 + 消息区域 + 可选面板）
- [ ] Desktop: 会话列表正确显示并可切换
- [ ] Desktop: 消息发送和接收正常
- [ ] Desktop: 输入状态指示正常显示
- [ ] DM 消息收发 Flutter <-> Desktop <-> Server 全链路通过
- [ ] Bot DM 消息发送触发 `[Bot] Message to ...` 日志
- [ ] `pnpm build` 编译通过
- [ ] `flutter build apk` 编译通过

---

# Phase 9C：群组 UI + 好友 UI

> **前置条件**：Phase 8（群组后端）+ Phase 9B（核心聊天 UI）全部完成

## 任务清单

| # | 任务 | 文件 / 目录 | 依赖 |
|---|------|------------|------|
| **Flutter** | | | |
| 9C.1 | 群组详情页 | `lib/features/chat/pages/group_detail_page.dart` | Phase 8 |
| 9C.2 | 好友列表 + 添加好友页 | `lib/features/friends/` | Phase 1 |
| 9C.3 | Flutter 路由补全（群组 + 好友） | `lib/app.dart` | 9C.1, 9C.2 |
| **Desktop** | | | |
| 9C.4 | 群组头部 + 详情面板 | `src/renderer/components/GroupHeader.tsx` + `GroupPanel.tsx` | Phase 8 |
| 9C.5 | 创建群组对话框 | `src/renderer/components/CreateGroupDialog.tsx` | Phase 8 |

---

### 9C.1 Flutter 群组详情页

**新增文件**：`lib/features/chat/pages/group_detail_page.dart`

```
GroupDetailPage
├── 群头像（可点击更换 — OWNER/ADMIN）
├── 群名 + 描述（OWNER/ADMIN 可编辑）
├── 成员列表
│   ├── 角色标签（群主 / 管理员 / 成员）
│   ├── 在线状态指示点
│   ├── OWNER 长按 → 设为管理员 / 移除
│   ├── ADMIN 长按 → 移除（仅 MEMBER）
│   └── "添加成员" 按钮（OWNER / ADMIN 可见）
├── 操作区域
│   ├── 退出群组（所有成员可见）
│   └── 解散群组（仅 OWNER 可见，红色警告 + 二次确认对话框）
└── 群组信息（创建时间、创建者、成员数）
```

**数据来源**：`GET /api/v1/converses/groups/:id` → 群组详情 + 完整成员列表

### 9C.2 Flutter 好友列表 + 添加好友页

**新增文件**：

```
lib/features/friends/
├── pages/
│   ├── friends_list_page.dart       # 好友列表 + 在线状态
│   └── add_friend_page.dart         # 搜索用户 + 发送好友请求
├── providers/
│   └── friends_provider.dart        # 好友状态管理
└── widgets/
    └── friend_request_card.dart     # 好友请求通知卡片
```

**好友列表页**：
- 从 `GET /api/v1/friends` 加载好友列表
- 每个好友显示：头像 + 名字 + 在线状态（绿点/灰点）
- 点击好友 → 导航到 DM ChatThreadPage（使用 `converseId`）
- 右上角"添加好友"按钮 → AddFriendPage

**添加好友页**：
- 搜索框输入 username / email
- 搜索结果列表 + "添加好友" 按钮
- 发送好友请求后显示"已发送"状态

### 9C.3 Flutter 路由补全

**修改**：`lib/app.dart`

新增路由：

| 路由 | 页面 | 说明 |
|------|------|------|
| `/chat/:converseId/group` | GroupDetailPage | 群组详情 |
| `/friends` | FriendsListPage | 好友列表（底部 tab 2，替换占位） |
| `/friends/add` | AddFriendPage | 添加好友 |
| `/friends/requests` | FriendRequestsPage | 好友请求列表 |

底部导航"好友"tab 从占位页替换为 `FriendsListPage`。

---

### 9C.4 Desktop 群组头部 + 详情面板

**新增文件**：`src/renderer/components/GroupHeader.tsx` + `src/renderer/components/GroupPanel.tsx`

**GroupHeader**（消息区域顶部，替换 ChatHeader 当 converse.type === 'GROUP'）：
- 群头像 + 群名 + 成员数
- 点击群名/详情按钮 → 展开/收起 GroupPanel

**GroupPanel**（右侧面板，可收起）：
- 群组信息：群名、描述、创建时间
- 成员列表：头像 + 名字 + 角色标签 + 在线状态
- OWNER 操作：修改群信息、管理成员角色、添加/移除成员
- ADMIN 操作：添加成员、移除 MEMBER
- 通用操作：退出群组
- OWNER 专属：解散群组（红色按钮 + 确认对话框）

### 9C.5 Desktop 创建群组对话框

**新增文件**：`src/renderer/components/CreateGroupDialog.tsx`

- 模态对话框
- 群名输入（必填）+ 描述输入（可选）
- 好友列表多选（checkbox）
- 确认创建 → `POST /api/v1/converses/groups`
- 创建成功后自动切换到新群组

---

### 9C 完成检查清单

- [ ] Flutter: 群组详情页显示成员列表和角色
- [ ] Flutter: OWNER 可在群组详情页设置管理员 / 移除成员
- [ ] Flutter: 退出群组 / 解散群组功能正常
- [ ] Flutter: 好友列表显示在线状态
- [ ] Flutter: 添加好友 → 接受 → DM 出现在会话列表全流程通过
- [ ] Desktop: 群组面板显示成员列表和角色标签
- [ ] Desktop: 创建群组对话框正常工作
- [ ] GROUP 消息收发全链路通过
- [ ] WS `group:*` 实时事件在 Flutter / Desktop 正确反映
- [ ] 好友请求 → 接受 → DM 出现在会话列表全流程通过

---

## 新增文件清单

### Flutter（~15 个新文件）

```
apps/mobile/lib/
├── core/
│   ├── models/                              # [9A] 数据模型
│   │   ├── converse.dart
│   │   ├── message.dart
│   │   ├── user_brief.dart
│   │   └── models.dart                      # barrel export
│   └── services/
│       └── chat_socket_service.dart          # [9A] Socket.IO /chat 连接服务
│
├── features/chat/
│   ├── providers/
│   │   └── chat_provider.dart               # [9A] 聊天状态管理（Riverpod）
│   ├── pages/
│   │   ├── converses_list_page.dart         # [9B] 会话列表页
│   │   ├── chat_thread_page.dart            # [9B] 消息线程页
│   │   └── group_detail_page.dart           # [9C] 群组详情页
│   └── widgets/
│       ├── message_input.dart               # [9B] 消息输入框
│       ├── typing_indicator.dart            # [9B] "正在输入..." 指示器
│       └── date_separator.dart              # [9B] 日期分隔符
│
├── features/friends/                        # [9C]
│   ├── providers/
│   │   └── friends_provider.dart
│   ├── pages/
│   │   ├── friends_list_page.dart
│   │   └── add_friend_page.dart
│   └── widgets/
│       └── friend_request_card.dart
```

### Desktop（~12 个新文件）

```
apps/desktop/src/renderer/
├── hooks/
│   └── useChatSocket.ts                     # [9A] Socket.IO 连接 Hook
│
├── stores/
│   └── chatStore.ts                         # [9A] 聊天状态（Zustand）
│
├── pages/
│   ├── Chat.tsx                             # [9B] 聊天主页面（三栏布局）
│   └── MainLayout.tsx                       # [9B] 侧边导航 + 内容区域
│
├── components/
│   ├── ConversationList.tsx                 # [9B] 会话列表侧边栏
│   ├── ConversationItem.tsx                 # [9B] 单个会话条目
│   ├── ChatThread.tsx                       # [9B] 消息线程区域
│   ├── ChatHeader.tsx                       # [9B] 消息区域顶栏
│   ├── MessageInput.tsx                     # [9B] 消息输入框
│   ├── GroupHeader.tsx                      # [9C] 群组顶栏
│   ├── GroupPanel.tsx                       # [9C] 群组详情面板
│   └── CreateGroupDialog.tsx                # [9C] 创建群组对话框
```

### 修改的已有文件

| 文件 | 变更 | 子阶段 |
|------|------|--------|
| `apps/mobile/pubspec.yaml` | 新增 `socket_io_client` + `freezed_annotation` + `json_annotation` 依赖 | 9A |
| `apps/mobile/lib/main.dart` | 集成底部导航 + Socket.IO 初始化 | 9B |
| `apps/desktop/package.json` | 新增 `socket.io-client` + `zustand` 依赖 | 9A |
| `apps/desktop/src/renderer/App.tsx` | 更新路由配置 | 9B |

---

## 依赖包

### Flutter

| 包 | 版本 | 用途 | 子阶段 |
|---|------|------|--------|
| `socket_io_client` | ^3.0.2 | Socket.IO 客户端（/chat 命名空间） | 9A |
| `freezed_annotation` | ^2.4.1 | 不可变数据模型注解 | 9A |
| `json_annotation` | ^4.9.0 | JSON 序列化注解 | 9A |
| `freezed` | ^2.5.2 (dev) | 代码生成 | 9A |
| `json_serializable` | ^6.8.0 (dev) | JSON 序列化生成 | 9A |
| `build_runner` | ^2.4.9 (dev) | 代码生成运行器 | 9A |
| `flutter_riverpod` | 已有 | 状态管理 | — |
| `http` 或 `dio` | 已有/新增 | REST API 调用 | — |

### Desktop（Electron + React）

| 包 | 版本 | 用途 | 子阶段 |
|---|------|------|--------|
| `socket.io-client` | ^4.x | Socket.IO 客户端 | 9A |
| `zustand` | ^5.x | 轻量状态管理 | 9A |
| `react-virtuoso` | ^4.x | 虚拟化消息列表（可选，长列表性能优化） | 9B |

---

## 设计笔记

### 消息发送：REST 而非 WS

消息发送走 `POST /api/v1/messages`（REST），而非 WS emit：

| | REST | WS emit |
|---|------|---------|
| 持久化保证 | HTTP 响应确认持久化完成 | 需要额外 ACK 机制 |
| 错误处理 | 标准 HTTP 状态码（400/403/500） | 需自定义错误协议 |
| 幂等性 | 天然（重试安全） | 需自己实现 |
| 复杂度 | 低 | 高 |

WS 仅用于 Server → Client 实时推送，不用于客户端写操作。这是 IM 系统的常见模式（Discord、Slack 均如此）。

### 数据流

```
REST API                        Socket.IO (/chat)
  │                               │
  ├─ GET /converses  ────┐        ├─ message:new ──────┐
  ├─ POST /messages ──┐  │        ├─ notification:new ─┤
  ├─ GET /messages ─┐ │  │        ├─ message:read ─────┤
  │                  │ │  │        ├─ presence:changed ─┤
  ▼                  ▼ ▼  ▼        ├─ group:* ──────────┤
  ┌──────────────────────────┐     │                    │
  │ ChatStore / ChatProvider │◄────┘                    │
  │                          │                          │
  │ converses: Converse[]    │◄─────────────────────────┘
  │ messages: Message[]      │
  │ unreadCounts{}           │
  │ connectionState          │
  └──────────────────────────┘
         │
         ▼
  ┌──────────────────────────┐
  │    UI Components         │
  │ ConversationList         │
  │ ChatThread               │
  │ GroupPanel               │
  │ ConnectionStatusBanner   │
  └──────────────────────────┘
```

### 离线 / 弱网处理

MVP 阶段使用简单策略：
- Socket 断开时顶栏显示"连接中..."横幅
- 重连成功后重新拉取会话列表 + 当前会话的最新消息
- 消息发送失败显示红色感叹号 + "重试"按钮（sendStatus: failed）
- 消息发送中显示加载状态（sendStatus: sending）

### 消息去重

- 消息以 `id` 为唯一键
- WS 收到 `message:new` 时，检查 `messages[converseId]` 是否已包含该 `id`（防重连后收到重复消息）
- REST 发送消息后返回完整 message 对象，直接插入列表（WS 后续推送同一消息时被去重过滤）

### 性能考虑

- 消息列表使用虚拟化渲染（Desktop: react-virtuoso / Flutter: ListView.builder 天然虚拟化）
- 会话列表按 updatedAt 排序，只加载 isOpen=true 的会话
- 消息每次只加载 35 条，向上滚动按需加载
- 头像图片使用缓存（Flutter: CachedNetworkImage / Desktop: 浏览器缓存）
