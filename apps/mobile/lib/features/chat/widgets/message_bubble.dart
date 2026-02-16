import 'package:flutter/material.dart';
import 'notification_card.dart';

/// 消息气泡组件
///
/// 根据 message.type 渲染不同样式：
/// - BOT_NOTIFICATION: 渲染 NotificationCard 卡片
/// - SYSTEM: 居中灰色文字
/// - TEXT / 其他: 普通聊天气泡
class MessageBubble extends StatelessWidget {
  final Map<String, dynamic> message;
  final bool isOwnMessage;

  const MessageBubble({
    super.key,
    required this.message,
    required this.isOwnMessage,
  });

  @override
  Widget build(BuildContext context) {
    final type = message['type'] as String? ?? 'TEXT';

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

    // TEXT / 其他: 普通文本气泡
    return Align(
      alignment: isOwnMessage ? Alignment.centerRight : Alignment.centerLeft,
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
        child: Text(
          message['content'] as String? ?? '',
          style: const TextStyle(fontSize: 14, height: 1.5),
        ),
      ),
    );
  }
}
