import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../../core/models/converse.dart';
import '../../../core/models/message.dart';
import '../../../core/network/chat_socket_service.dart';
import '../../../core/network/api_client.dart';

// ──────────────────────────────────────
// Converses State + Notifier
// ──────────────────────────────────────

class ConversesState {
  final List<Converse> converses;
  final bool isLoading;
  final String? error;

  const ConversesState({
    this.converses = const [],
    this.isLoading = false,
    this.error,
  });

  ConversesState copyWith({
    List<Converse>? converses,
    bool? isLoading,
    String? error,
  }) {
    return ConversesState(
      converses: converses ?? this.converses,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class ConversesNotifier extends StateNotifier<ConversesState> {
  final Dio _dio;
  final ChatSocketService _chatSocket;

  ConversesNotifier(this._dio, this._chatSocket)
      : super(const ConversesState()) {
    _setupSocketListeners();
  }

  void _setupSocketListeners() {
    _chatSocket.on('converse:new', (data) {
      if (data is Map<String, dynamic>) {
        // A new converse was created (e.g., DM from friend accept)
        // Refresh full list to get complete data
        fetchConverses();
      }
    });

    _chatSocket.on('converse:updated', (data) {
      if (data is Map<String, dynamic>) {
        final id = data['id'] as String?;
        if (id != null) {
          state = state.copyWith(
            converses: state.converses.map((c) {
              if (c.id == id) {
                return c.copyWith(
                  name: data['name'] as String? ?? c.name,
                  updatedAt: data['updatedAt'] as String? ?? c.updatedAt,
                );
              }
              return c;
            }).toList(),
          );
        }
      }
    });

    _chatSocket.on('message:new', (data) {
      if (data is Map<String, dynamic>) {
        final converseId = data['converseId'] as String?;
        if (converseId != null) {
          final msg = Message.fromJson(data);
          state = state.copyWith(
            converses: state.converses.map((c) {
              if (c.id == converseId) {
                return c.copyWith(
                  lastMessage: msg,
                  updatedAt: msg.createdAt,
                  unreadCount: c.unreadCount + 1,
                );
              }
              return c;
            }).toList(),
          );
        }
      }
    });

    _chatSocket.on('group:created', (_) => fetchConverses());
    _chatSocket.on('group:member:added', (_) => fetchConverses());
    _chatSocket.on('group:member:removed', (_) => fetchConverses());
    _chatSocket.on('group:deleted', (data) {
      if (data is Map<String, dynamic>) {
        final id = data['id'] as String?;
        if (id != null) {
          state = state.copyWith(
            converses: state.converses.where((c) => c.id != id).toList(),
          );
        }
      }
    });
  }

  Future<void> fetchConverses() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _dio.get('/api/v1/converses');
      final list = (response.data as List<dynamic>)
          .map((json) => Converse.fromJson(json as Map<String, dynamic>))
          .toList();
      state = state.copyWith(converses: list, isLoading: false);

      // Join rooms for all converses
      for (final converse in list) {
        _chatSocket.joinRoom(converse.id);
      }
    } on DioException catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.response?.data?['message']?.toString() ?? e.message,
      );
    }
  }

  void markConverseRead(String converseId, {String? lastMessageId}) {
    state = state.copyWith(
      converses: state.converses.map((c) {
        if (c.id == converseId) {
          return c.copyWith(unreadCount: 0);
        }
        return c;
      }).toList(),
    );
    // Emit to server so other clients see read status
    if (lastMessageId != null) {
      _chatSocket.markRead(converseId, lastMessageId);
    }
  }
}

final conversesProvider =
    StateNotifierProvider<ConversesNotifier, ConversesState>((ref) {
  final dio = ref.read(dioProvider);
  final chatSocket = ref.read(chatSocketServiceProvider);
  return ConversesNotifier(dio, chatSocket);
});

// ──────────────────────────────────────
// Messages State + Notifier (per converse)
// ──────────────────────────────────────

class MessagesState {
  final List<Message> messages;
  final bool isLoading;
  final bool hasMore;
  final String? nextCursor;
  final String? error;
  /// Last message ID read by a peer (for read receipt ✓✓)
  final String? lastReadMessageId;

  const MessagesState({
    this.messages = const [],
    this.isLoading = false,
    this.hasMore = true,
    this.nextCursor,
    this.error,
    this.lastReadMessageId,
  });

  MessagesState copyWith({
    List<Message>? messages,
    bool? isLoading,
    bool? hasMore,
    String? nextCursor,
    String? error,
    String? lastReadMessageId,
  }) {
    return MessagesState(
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      hasMore: hasMore ?? this.hasMore,
      nextCursor: nextCursor ?? this.nextCursor,
      error: error,
      lastReadMessageId: lastReadMessageId ?? this.lastReadMessageId,
    );
  }
}

class MessagesNotifier extends StateNotifier<MessagesState> {
  final String converseId;
  final Dio _dio;
  final ChatSocketService _chatSocket;

  MessagesNotifier(this.converseId, this._dio, this._chatSocket)
      : super(const MessagesState()) {
    _setupSocketListeners();
  }

  void _setupSocketListeners() {
    _chatSocket.on('message:new', (data) {
      if (data is Map<String, dynamic>) {
        if (data['converseId'] == converseId) {
          final msg = Message.fromJson(data);

          // 1. Dedup: message with same server ID already exists
          if (state.messages.any((m) => m.id == msg.id)) {
            state = state.copyWith(
              messages: state.messages.map((m) {
                if (m.id == msg.id) return msg;
                return m;
              }).toList(),
            );
            return;
          }

          // 2. Race condition: WS broadcast arrived before REST response.
          //    Find and replace the pending optimistic message (temp_*) from same author.
          final tempIdx = state.messages.indexWhere((m) =>
              m.id.startsWith('temp_') && m.authorId == msg.authorId);
          if (tempIdx >= 0) {
            final updated = List<Message>.from(state.messages);
            updated[tempIdx] = msg;
            state = state.copyWith(messages: updated);
            return;
          }

          // 3. New message from another user
          state = state.copyWith(
            messages: [msg, ...state.messages],
          );
        }
      }
    });

    _chatSocket.on('message:updated', (data) {
      if (data is Map<String, dynamic> && data['converseId'] == converseId) {
        final msgId = data['id'] as String?;
        if (msgId != null) {
          state = state.copyWith(
            messages: state.messages.map((m) {
              if (m.id == msgId) {
                return m.copyWith(
                  content: data['content'] as String?,
                  updatedAt: data['updatedAt'] as String? ?? m.updatedAt,
                );
              }
              return m;
            }).toList(),
          );
        }
      }
    });

    _chatSocket.on('message:deleted', (data) {
      if (data is Map<String, dynamic> && data['converseId'] == converseId) {
        final msgId = data['id'] as String? ?? data['messageId'] as String?;
        if (msgId != null) {
          final recalledBy = data['recalledBy'] as String?;
          if (recalledBy != null) {
            // Recall: mark message as deleted in-place (show "[已撤回]")
            state = state.copyWith(
              messages: state.messages.map((m) {
                if (m.id == msgId) {
                  return m.copyWith(
                    deletedAt: data['deletedAt'] as String? ??
                        DateTime.now().toUtc().toIso8601String(),
                  );
                }
                return m;
              }).toList(),
            );
          } else {
            // Hard delete: remove from list
            state = state.copyWith(
              messages: state.messages.where((m) => m.id != msgId).toList(),
            );
          }
        }
      }
    });

    _chatSocket.on('message:read', (data) {
      if (data is Map<String, dynamic> && data['converseId'] == converseId) {
        final lastSeenId = data['lastSeenMessageId'] as String?;
        if (lastSeenId != null) {
          state = state.copyWith(lastReadMessageId: lastSeenId);
        }
      }
    });
  }

  Future<void> fetchMessages({bool loadMore = false}) async {
    if (state.isLoading) return;
    if (loadMore && !state.hasMore) return;

    state = state.copyWith(isLoading: true, error: null);
    try {
      final queryParams = <String, dynamic>{
        'converseId': converseId,
        'limit': 35,
      };
      if (loadMore && state.nextCursor != null) {
        queryParams['cursor'] = state.nextCursor;
      }

      final response = await _dio.get(
        '/api/v1/messages',
        queryParameters: queryParams,
      );

      final data = response.data as Map<String, dynamic>;
      final newMessages = (data['messages'] as List<dynamic>)
          .map((json) => Message.fromJson(json as Map<String, dynamic>))
          .toList();

      state = state.copyWith(
        messages: loadMore
            ? [...state.messages, ...newMessages]
            : newMessages,
        isLoading: false,
        hasMore: data['hasMore'] as bool? ?? false,
        nextCursor: data['nextCursor'] as String?,
      );
    } on DioException catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.response?.data?['message']?.toString() ?? e.message,
      );
    }
  }

  /// Recall a message (soft-delete)
  Future<bool> recallMessage(String messageId) async {
    try {
      await _dio.delete('/api/v1/messages/$messageId');
      return true;
    } on DioException {
      return false;
    }
  }

  /// Optimistic send: insert message locally, then POST to server
  Future<void> sendMessage(String content, String userId, String username,
      String displayName, {List<Map<String, dynamic>>? attachments}) async {
    final tempId = 'temp_${DateTime.now().millisecondsSinceEpoch}';
    final now = DateTime.now().toUtc().toIso8601String();

    final optimistic = Message(
      id: tempId,
      content: content,
      type: 'TEXT',
      converseId: converseId,
      authorId: userId,
      author: MessageAuthor(
        id: userId,
        username: username,
        displayName: displayName,
      ),
      createdAt: now,
      updatedAt: now,
      sendStatus: MessageSendStatus.sending,
    );

    state = state.copyWith(messages: [optimistic, ...state.messages]);

    try {
      final data = <String, dynamic>{
        'converseId': converseId,
        'content': content,
      };
      if (attachments != null && attachments.isNotEmpty) {
        data['attachments'] = attachments;
      }

      final response = await _dio.post('/api/v1/messages', data: data);

      final serverMsg = Message.fromJson(response.data as Map<String, dynamic>);

      state = state.copyWith(
        messages: state.messages.map((m) {
          if (m.id == tempId) return serverMsg;
          return m;
        }).toList(),
      );
    } catch (e) {
      state = state.copyWith(
        messages: state.messages.map((m) {
          if (m.id == tempId) {
            return m.copyWith(sendStatus: MessageSendStatus.failed);
          }
          return m;
        }).toList(),
      );
    }
  }
}

final messagesProvider = StateNotifierProvider.family<MessagesNotifier,
    MessagesState, String>((ref, converseId) {
  final dio = ref.read(dioProvider);
  final chatSocket = ref.read(chatSocketServiceProvider);
  return MessagesNotifier(converseId, dio, chatSocket);
});

// ──────────────────────────────────────
// Typing Notifier
// ──────────────────────────────────────

class TypingState {
  final Map<String, String> typingUsers; // userId → username

  const TypingState({this.typingUsers = const {}});
}

class TypingNotifier extends StateNotifier<TypingState> {
  final String converseId;
  final ChatSocketService _chatSocket;

  TypingNotifier(this.converseId, this._chatSocket)
      : super(const TypingState()) {
    _chatSocket.on('message:typing', _onTyping);
  }

  void _onTyping(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    if (data['converseId'] != converseId) return;

    final userId = data['userId'] as String?;
    final username = data['username'] as String?;
    final isTyping = data['isTyping'] as bool? ?? false;

    if (userId == null || username == null) return;

    final updated = Map<String, String>.from(state.typingUsers);
    if (isTyping) {
      updated[userId] = username;
    } else {
      updated.remove(userId);
    }
    state = TypingState(typingUsers: updated);
  }

  @override
  void dispose() {
    _chatSocket.off('message:typing', _onTyping);
    super.dispose();
  }
}

final typingProvider =
    StateNotifierProvider.family<TypingNotifier, TypingState, String>(
        (ref, converseId) {
  final chatSocket = ref.read(chatSocketServiceProvider);
  return TypingNotifier(converseId, chatSocket);
});
