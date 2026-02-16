import 'package:flutter/material.dart';
import 'bot_badge.dart';

/// 会话列表中的单个会话 tile 组件
///
/// 支持 Bot 识别（角标 + 置顶图标）和 BOT_NOTIFICATION 消息预览。
class ConverseTile extends StatelessWidget {
  final Map<String, dynamic> converse;
  final VoidCallback onTap;

  const ConverseTile({
    super.key,
    required this.converse,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isBot = converse['isBot'] as bool? ?? false;
    final isPinned = converse['isPinned'] as bool? ?? false;
    final displayName = _getDisplayName();
    final avatarUrl = _getAvatarUrl();
    final lastMessage = converse['lastMessage'] as Map<String, dynamic>?;
    final unreadCount = converse['unreadCount'] as int? ?? 0;

    // 构建头像 Widget
    Widget avatarWidget = CircleAvatar(
      radius: 24,
      backgroundColor: isBot
          ? const Color(0xFF2196F3).withValues(alpha: 0.1)
          : const Color(0xFFE0E0E0),
      backgroundImage: avatarUrl != null ? NetworkImage(avatarUrl) : null,
      child: avatarUrl == null
          ? Text(
              displayName.isNotEmpty ? displayName[0].toUpperCase() : '?',
              style: TextStyle(
                color:
                    isBot ? const Color(0xFF2196F3) : const Color(0xFF666666),
                fontWeight: FontWeight.w600,
              ),
            )
          : null,
    );

    // Bot 头像叠加角标
    if (isBot) {
      avatarWidget = BotBadge(child: avatarWidget);
    }

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: avatarWidget,
      title: Row(
        children: [
          Expanded(
            child: Text(
              displayName,
              style:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (isPinned)
            const Padding(
              padding: EdgeInsets.only(left: 4),
              child:
                  Icon(Icons.push_pin, size: 14, color: Color(0xFF999999)),
            ),
        ],
      ),
      subtitle: _buildSubtitle(lastMessage),
      trailing: unreadCount > 0
          ? Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFFF44336),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                unreadCount > 99 ? '99+' : '$unreadCount',
                style: const TextStyle(color: Colors.white, fontSize: 11),
              ),
            )
          : null,
      onTap: onTap,
    );
  }

  Widget? _buildSubtitle(Map<String, dynamic>? lastMessage) {
    if (lastMessage == null) return null;

    final type = lastMessage['type'] as String? ?? 'TEXT';
    final content = lastMessage['content'] as String? ?? '';

    // BOT_NOTIFICATION 类型显示卡片标题
    if (type == 'BOT_NOTIFICATION') {
      final metadata = lastMessage['metadata'] as Map<String, dynamic>?;
      final title = metadata?['title'] as String? ?? '通知';
      return Text(
        '[通知] $title',
        style: const TextStyle(fontSize: 13, color: Color(0xFF999999)),
        overflow: TextOverflow.ellipsis,
      );
    }

    return Text(
      content,
      style: const TextStyle(fontSize: 13, color: Color(0xFF999999)),
      overflow: TextOverflow.ellipsis,
      maxLines: 1,
    );
  }

  String _getDisplayName() {
    final botInfo = converse['botInfo'] as Map<String, dynamic>?;
    if (botInfo != null) return botInfo['name'] as String? ?? '';

    // 普通 DM：取对方成员的 displayName
    final members = converse['members'] as List<dynamic>?;
    if (members != null && members.length == 2) {
      for (final m in members) {
        final member = m as Map<String, dynamic>;
        final user = member['user'] as Map<String, dynamic>?;
        if (user != null) return user['displayName'] as String? ?? '';
      }
    }
    return converse['name'] as String? ?? '';
  }

  String? _getAvatarUrl() {
    final members = converse['members'] as List<dynamic>?;
    if (members != null) {
      for (final m in members) {
        final member = m as Map<String, dynamic>;
        final user = member['user'] as Map<String, dynamic>?;
        if (user != null) return user['avatarUrl'] as String?;
      }
    }
    return null;
  }
}
