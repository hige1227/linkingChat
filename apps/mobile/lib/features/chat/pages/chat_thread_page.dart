import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/chat_provider.dart';
import '../../../core/models/message.dart';
import '../../../core/network/chat_socket_service.dart';
import '../../auth/providers/auth_provider.dart';
import '../widgets/message_bubble.dart';
import '../widgets/message_input.dart';
import '../widgets/typing_indicator.dart';
import '../widgets/whisper_suggestions.dart';
import '../widgets/draft_card.dart';
import '../widgets/predictive_action_card.dart';
import '../widgets/media_picker.dart';
import '../../../core/services/upload_service.dart';
import '../providers/whisper_provider.dart';
import '../providers/draft_provider.dart';
import '../providers/predictive_provider.dart';
import 'search_page.dart';

class ChatThreadPage extends ConsumerStatefulWidget {
  final String converseId;

  const ChatThreadPage({super.key, required this.converseId});

  @override
  ConsumerState<ChatThreadPage> createState() => _ChatThreadPageState();
}

class _ChatThreadPageState extends ConsumerState<ChatThreadPage> {
  final _scrollController = ScrollController();
  final _messageInputKey = GlobalKey<MessageInputState>();

  @override
  void initState() {
    super.initState();
    // Fetch initial messages then mark as read
    Future.microtask(() async {
      await ref
          .read(messagesProvider(widget.converseId).notifier)
          .fetchMessages();
      _markCurrentConverseRead();
    });

    // Load more on scroll to top
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 100) {
      ref
          .read(messagesProvider(widget.converseId).notifier)
          .fetchMessages(loadMore: true);
    }
  }

  void _markCurrentConverseRead() {
    final msgs = ref.read(messagesProvider(widget.converseId)).messages;
    if (msgs.isNotEmpty) {
      ref.read(conversesProvider.notifier).markConverseRead(
            widget.converseId,
            lastMessageId: msgs.first.id,
          );
    }
  }

  @override
  Widget build(BuildContext context) {
    final msgState = ref.watch(messagesProvider(widget.converseId));
    final typingState = ref.watch(typingProvider(widget.converseId));
    final whisperState = ref.watch(whisperProvider(widget.converseId));
    final draftState = ref.watch(draftProvider(widget.converseId));
    final predictiveState = ref.watch(predictiveProvider(widget.converseId));
    final authState = ref.watch(authProvider);
    final currentUserId = authState.user?.id ?? '';

    // Auto-mark read when new messages arrive
    ref.listen<MessagesState>(messagesProvider(widget.converseId),
        (prev, next) {
      if (next.messages.isNotEmpty &&
          (prev == null ||
              prev.messages.isEmpty ||
              next.messages.first.id != prev.messages.first.id)) {
        final newest = next.messages.first;
        if (newest.authorId != currentUserId) {
          _markCurrentConverseRead();
        }
      }
    });

    // Get converse info for title
    final conversesState = ref.watch(conversesProvider);
    final converse = conversesState.converses
        .where((c) => c.id == widget.converseId)
        .firstOrNull;
    final title = converse?.getDisplayName(currentUserId) ?? 'Chat';

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontSize: 16)),
            if (converse?.type == 'GROUP' && converse?.memberCount != null)
              Text(
                '${converse!.memberCount} members',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => SearchPage(converseId: widget.converseId),
                ),
              );
            },
          ),
          if (converse?.type == 'GROUP')
            IconButton(
              icon: const Icon(Icons.info_outline),
              onPressed: () => context.push('/chat/${widget.converseId}/group'),
            ),
        ],
        elevation: 0,
      ),
      body: Column(
        children: [
          // Message list
          Expanded(
            child: _buildMessageList(msgState, currentUserId, converse),
          ),

          // Draft cards (pinned above input area)
          ...draftState.activeDrafts.map((draft) => DraftCard(
                draft: draft,
                onApprove: (draftId) {
                  ref.read(draftProvider(widget.converseId).notifier).approve(draftId);
                },
                onReject: (draftId, {String? reason}) {
                  ref.read(draftProvider(widget.converseId).notifier).reject(draftId, reason: reason);
                },
                onEdit: (draftId, editedContent) {
                  ref.read(draftProvider(widget.converseId).notifier).editAndApprove(draftId, editedContent);
                },
              )),

          // Predictive action cards
          ...predictiveState.activeSuggestions.map((suggestion) =>
              PredictiveActionCard(
                suggestion: suggestion,
                onExecute: (suggestionId, actionIndex) {
                  ref.read(predictiveProvider(widget.converseId).notifier)
                      .executeAction(suggestionId, actionIndex);
                },
                onDismiss: (suggestionId) {
                  ref.read(predictiveProvider(widget.converseId).notifier)
                      .dismiss(suggestionId);
                },
              )),

          // Typing indicator
          TypingIndicator(
            usernames: typingState.typingUsers.values.toList(),
          ),

          // Whisper suggestions bar
          WhisperSuggestions(
            whisperState: whisperState,
            onAccept: (index) {
              final text = ref
                  .read(whisperProvider(widget.converseId).notifier)
                  .accept(index);
              if (text != null) {
                _messageInputKey.currentState?.prefillText(text);
              }
            },
            onToggleAlternatives: () {
              ref
                  .read(whisperProvider(widget.converseId).notifier)
                  .toggleAlternatives();
            },
            onDismiss: () {
              ref
                  .read(whisperProvider(widget.converseId).notifier)
                  .dismiss();
            },
          ),

          // Message input
          MessageInput(
            key: _messageInputKey,
            onSend: (content) {
              ref
                  .read(messagesProvider(widget.converseId).notifier)
                  .sendMessage(
                    content,
                    currentUserId,
                    authState.user?.username ?? '',
                    authState.user?.displayName ?? '',
                  );
            },
            onWhisperRequest: () {
              ref
                  .read(whisperProvider(widget.converseId).notifier)
                  .requestSuggestions();
            },
            onTypingStart: () {
              ref.read(chatSocketServiceProvider).emitTyping(
                    widget.converseId,
                    currentUserId,
                    authState.user?.username ?? '',
                  );
            },
            onTypingStop: () {
              ref.read(chatSocketServiceProvider).emitTyping(
                    widget.converseId,
                    currentUserId,
                    authState.user?.username ?? '',
                    isTyping: false,
                  );
            },
            onAttachmentTap: () => _handleAttachment(currentUserId, authState),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageList(MessagesState state, String currentUserId, dynamic converse) {
    if (state.isLoading && state.messages.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.messages.isEmpty) {
      return Center(
        child: Text(
          'No messages yet',
          style: TextStyle(color: Colors.grey.shade500),
        ),
      );
    }

    // Determine read receipt boundary
    final lastReadId = state.lastReadMessageId;
    int lastReadIndex = -1;
    if (lastReadId != null) {
      lastReadIndex =
          state.messages.indexWhere((m) => m.id == lastReadId);
    }

    return ListView.builder(
      controller: _scrollController,
      reverse: true,
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: state.messages.length + (state.isLoading ? 1 : 0),
      itemBuilder: (context, index) {
        if (state.isLoading && index == state.messages.length) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          );
        }

        final msg = state.messages[index];
        final isOwn = msg.authorId == currentUserId;
        // Messages stored newest-first; index >= lastReadIndex means read
        final isRead = isOwn &&
            lastReadIndex >= 0 &&
            index >= lastReadIndex;

        return Opacity(
          opacity: msg.sendStatus == MessageSendStatus.sending ? 0.6 : 1.0,
          child: Column(
            children: [
              MessageBubble(
                message: msg.toJson(),
                isOwnMessage: isOwn,
                isRead: isRead,
                showAuthor: converse?.type == 'GROUP',
                onLongPress: msg.deletedAt == null
                    ? () => _showMessageMenu(context, msg, isOwn, currentUserId)
                    : null,
              ),
              if (msg.sendStatus == MessageSendStatus.failed)
                Padding(
                  padding: const EdgeInsets.only(right: 16),
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: Text(
                      'Failed to send',
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.red.shade400,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _handleAttachment(String currentUserId, AuthState authState) async {
    final picked = await MediaPicker.showPicker(context);
    if (picked == null) return;

    // Size limits: image 10MB, file 50MB
    final sizeBytes = await picked.file.length();
    final limitMB = picked.category == 'image' ? 10 : 50;
    if (sizeBytes > limitMB * 1024 * 1024) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('File too large (max ${limitMB}MB)')),
        );
      }
      return;
    }

    try {
      final uploadService = ref.read(uploadServiceProvider);
      final result = await uploadService.uploadFile(
        file: picked.file,
        filename: picked.filename,
        mimeType: picked.mimeType,
        category: picked.category,
      );

      // Send message with attachment
      ref.read(messagesProvider(widget.converseId).notifier).sendMessage(
        '',
        currentUserId,
        authState.user?.username ?? '',
        authState.user?.displayName ?? '',
        attachments: [
          {
            'url': result.url,
            'fileKey': result.fileKey,
            'filename': picked.filename,
            'mimeType': result.mimeType,
            'size': result.size,
          }
        ],
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: $e')),
        );
      }
    }
  }

  void _showMessageMenu(
      BuildContext context, Message msg, bool isOwn, String currentUserId) {
    // Check if recall is allowed (own message within 2 min, or admin)
    final createdAt = DateTime.tryParse(msg.createdAt);
    final withinRecallWindow = createdAt != null &&
        DateTime.now().toUtc().difference(createdAt).inSeconds <= 120;

    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.copy),
              title: const Text('Copy'),
              onTap: () {
                Navigator.pop(ctx);
                if (msg.content != null) {
                  Clipboard.setData(ClipboardData(text: msg.content!));
                }
              },
            ),
            if (isOwn && withinRecallWindow)
              ListTile(
                leading: Icon(Icons.undo, color: Colors.red.shade400),
                title: Text('Recall',
                    style: TextStyle(color: Colors.red.shade400)),
                onTap: () async {
                  Navigator.pop(ctx);
                  await ref
                      .read(messagesProvider(widget.converseId).notifier)
                      .recallMessage(msg.id);
                },
              ),
          ],
        ),
      ),
    );
  }
}
