import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/chat_provider.dart';
import '../../../core/models/message.dart';
import '../../../core/network/chat_socket_service.dart';
import '../../auth/providers/auth_provider.dart';
import '../widgets/message_bubble.dart';
import '../widgets/message_input.dart';
import '../widgets/typing_indicator.dart';

class ChatThreadPage extends ConsumerStatefulWidget {
  final String converseId;

  const ChatThreadPage({super.key, required this.converseId});

  @override
  ConsumerState<ChatThreadPage> createState() => _ChatThreadPageState();
}

class _ChatThreadPageState extends ConsumerState<ChatThreadPage> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    // Fetch initial messages
    Future.microtask(() {
      ref.read(messagesProvider(widget.converseId).notifier).fetchMessages();
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

  @override
  Widget build(BuildContext context) {
    final msgState = ref.watch(messagesProvider(widget.converseId));
    final typingState = ref.watch(typingProvider(widget.converseId));
    final authState = ref.watch(authProvider);
    final currentUserId = authState.user?.id ?? '';

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
            child: _buildMessageList(msgState, currentUserId),
          ),

          // Typing indicator
          TypingIndicator(
            usernames: typingState.typingUsers.values.toList(),
          ),

          // Message input
          MessageInput(
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
          ),
        ],
      ),
    );
  }

  Widget _buildMessageList(MessagesState state, String currentUserId) {
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

        return Opacity(
          opacity: msg.sendStatus == MessageSendStatus.sending ? 0.6 : 1.0,
          child: Column(
            children: [
              MessageBubble(
                message: msg.toJson(),
                isOwnMessage: isOwn,
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
}
