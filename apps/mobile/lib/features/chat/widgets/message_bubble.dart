import 'package:flutter/material.dart';
import 'notification_card.dart';
import 'image_message.dart';
import 'file_message.dart';
import 'voice_message.dart';

/// 消息气泡组件
///
/// 根据 message.type 和 attachments 渲染不同样式：
/// - BOT_NOTIFICATION: 渲染 NotificationCard 卡片
/// - SYSTEM: 居中灰色文字
/// - Attachments: 图片/文件气泡
/// - TEXT / 其他: 普通聊天气泡（含已读/撤回状态）
class MessageBubble extends StatelessWidget {
  final Map<String, dynamic> message;
  final bool isOwnMessage;
  final bool isRead;
  final bool showAuthor;
  final VoidCallback? onLongPress;

  const MessageBubble({
    super.key,
    required this.message,
    required this.isOwnMessage,
    this.isRead = false,
    this.showAuthor = false,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final type = message['type'] as String? ?? 'TEXT';
    final deletedAt = message['deletedAt'] as String?;

    // BOT_NOTIFICATION: 渲染通知卡片
    if (type == 'BOT_NOTIFICATION') {
      final metadata = message['metadata'] as Map<String, dynamic>? ?? {};
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: NotificationCard(metadata: metadata),
      );
    }

    // SYSTEM: 系统消息（居中灰色文字）
    if (type == 'SYSTEM') {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Text(
            message['content'] as String? ?? '',
            style: const TextStyle(fontSize: 12, color: Color(0xFF999999)),
          ),
        ),
      );
    }

    // Recalled message: show placeholder
    if (deletedAt != null) {
      return Align(
        alignment: isOwnMessage ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Text(
            isOwnMessage ? '你撤回了一条消息' : '对方撤回了一条消息',
            style: const TextStyle(
              fontSize: 13,
              color: Color(0xFF999999),
              fontStyle: FontStyle.italic,
            ),
          ),
        ),
      );
    }

    // Check for attachments
    final attachments = message['attachments'] as List<dynamic>?;
    if (attachments != null && attachments.isNotEmpty) {
      return GestureDetector(
        onLongPress: onLongPress,
        child: _buildAttachmentBubble(context, attachments),
      );
    }

    // TEXT / 其他: 普通文本气泡
    return GestureDetector(
      onLongPress: onLongPress,
      child: Align(
        alignment:
            isOwnMessage ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.7,
          ),
          decoration: BoxDecoration(
            color: isOwnMessage
                ? const Color(0xFF95EC69)
                : const Color(0xFFFFFFFF),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (showAuthor && !isOwnMessage) _buildAuthorName(),
              Text(
                message['content'] as String? ?? '',
                style: const TextStyle(fontSize: 14, height: 1.5),
              ),
              if (isOwnMessage)
                Align(
                  alignment: Alignment.centerRight,
                  child: _buildReadReceipt(),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAttachmentBubble(
      BuildContext context, List<dynamic> attachments) {
    final att = attachments.first as Map<String, dynamic>;
    final mimeType = att['mimeType'] as String? ?? '';
    final url = att['url'] as String? ?? '';
    final filename = att['filename'] as String? ?? 'file';
    final size = att['size'] as int? ?? 0;

    if (mimeType.startsWith('image/')) {
      return Column(
        crossAxisAlignment:
            isOwnMessage ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          if (showAuthor && !isOwnMessage)
            Padding(
              padding: const EdgeInsets.only(left: 16, bottom: 2),
              child: _buildAuthorName(),
            ),
          ImageMessage(
            imageUrl: url,
            filename: filename,
            isOwnMessage: isOwnMessage,
          ),
          if (isOwnMessage)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: _buildReadReceipt(),
            ),
        ],
      );
    }

    if (mimeType.startsWith('audio/')) {
      final metadata = att['metadata'] as Map<String, dynamic>?;
      final durationMs = metadata?['durationMs'] as int? ?? 0;
      return Column(
        crossAxisAlignment:
            isOwnMessage ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          VoiceMessage(
            audioUrl: url,
            durationMs: durationMs,
            isOwn: isOwnMessage,
          ),
          if (isOwnMessage)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: _buildReadReceipt(),
            ),
        ],
      );
    }

    return Column(
      crossAxisAlignment:
          isOwnMessage ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        FileMessage(
          filename: filename,
          size: size,
          url: url,
          isOwnMessage: isOwnMessage,
        ),
        if (isOwnMessage)
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: _buildReadReceipt(),
          ),
      ],
    );
  }

  Widget _buildAuthorName() {
    final author = message['author'] as Map<String, dynamic>?;
    final name = author?['displayName'] as String? ??
        author?['username'] as String? ??
        '';
    if (name.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text(
        name,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: Color(0xFF4361EE),
        ),
      ),
    );
  }

  Widget _buildReadReceipt() {
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Icon(
        isRead ? Icons.done_all : Icons.done,
        size: 14,
        color: isRead
            ? const Color(0xFF4FC3F7) // Blue for read
            : const Color(0xFF999999), // Grey for sent
      ),
    );
  }
}
