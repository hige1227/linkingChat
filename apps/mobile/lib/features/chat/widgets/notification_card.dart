import 'package:flutter/material.dart';

/// BOT_NOTIFICATION 消息的通知卡片组件
///
/// 根据 metadata.cardType 渲染不同样式的卡片：
/// - task_complete: 绿色，任务执行成功
/// - error: 红色，任务执行失败
/// - info: 蓝色，一般信息通知
/// - action_required: 黄色，需要用户操作
class NotificationCard extends StatelessWidget {
  final Map<String, dynamic> metadata;

  const NotificationCard({super.key, required this.metadata});

  @override
  Widget build(BuildContext context) {
    final cardType = metadata['cardType'] as String? ?? 'info';
    final title = metadata['title'] as String? ?? '';
    final description = metadata['description'] as String?;
    final actions = metadata['actions'] as List<dynamic>?;
    final executionTimeMs = metadata['executionTimeMs'] as int?;
    final sourceBotName = metadata['sourceBotName'] as String?;

    final style = _getCardStyle(cardType);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: style.backgroundColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: style.borderColor, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 标题行
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            child: Row(
              children: [
                Icon(style.icon, color: style.iconColor, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: style.iconColor,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // 描述文本
          if (description != null && description.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(40, 4, 12, 0),
              child: Text(
                description,
                style:
                    const TextStyle(fontSize: 13, color: Color(0xFF666666)),
              ),
            ),

          // 来源 + 耗时
          if (sourceBotName != null || executionTimeMs != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(40, 8, 12, 0),
              child: Row(
                children: [
                  if (sourceBotName != null)
                    Text(
                      '来自 $sourceBotName',
                      style: const TextStyle(
                          fontSize: 11, color: Color(0xFF999999)),
                    ),
                  if (sourceBotName != null && executionTimeMs != null)
                    const Text(
                      ' · ',
                      style:
                          TextStyle(fontSize: 11, color: Color(0xFF999999)),
                    ),
                  if (executionTimeMs != null)
                    Text(
                      '耗时 ${_formatDuration(executionTimeMs)}',
                      style: const TextStyle(
                          fontSize: 11, color: Color(0xFF999999)),
                    ),
                ],
              ),
            ),

          // 操作按钮
          if (actions != null && actions.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(32, 8, 12, 12),
              child: Wrap(
                spacing: 8,
                children: actions.map((a) {
                  final action = a as Map<String, dynamic>;
                  return _ActionButton(
                    label: action['label'] as String? ?? '',
                    actionType: action['action'] as String? ?? '',
                    payload: action['payload'] as Map<String, dynamic>?,
                    accentColor: style.iconColor,
                  );
                }).toList(),
              ),
            )
          else
            const SizedBox(height: 12),
        ],
      ),
    );
  }

  static String _formatDuration(int ms) {
    if (ms < 1000) return '${ms}ms';
    final seconds = (ms / 1000).toStringAsFixed(1);
    return '${seconds}s';
  }

  static _CardStyle _getCardStyle(String cardType) {
    switch (cardType) {
      case 'task_complete':
        return _CardStyle(
          icon: Icons.check_circle_outline,
          iconColor: const Color(0xFF4CAF50),
          backgroundColor: const Color(0xFFE8F5E9),
          borderColor: const Color(0xFF4CAF50).withValues(alpha: 0.3),
        );
      case 'error':
        return _CardStyle(
          icon: Icons.error_outline,
          iconColor: const Color(0xFFF44336),
          backgroundColor: const Color(0xFFFFEBEE),
          borderColor: const Color(0xFFF44336).withValues(alpha: 0.3),
        );
      case 'action_required':
        return _CardStyle(
          icon: Icons.warning_amber_outlined,
          iconColor: const Color(0xFFFFC107),
          backgroundColor: const Color(0xFFFFF8E1),
          borderColor: const Color(0xFFFFC107).withValues(alpha: 0.3),
        );
      case 'info':
      default:
        return _CardStyle(
          icon: Icons.info_outline,
          iconColor: const Color(0xFF2196F3),
          backgroundColor: const Color(0xFFE3F2FD),
          borderColor: const Color(0xFF2196F3).withValues(alpha: 0.3),
        );
    }
  }
}

class _CardStyle {
  final IconData icon;
  final Color iconColor;
  final Color backgroundColor;
  final Color borderColor;

  const _CardStyle({
    required this.icon,
    required this.iconColor,
    required this.backgroundColor,
    required this.borderColor,
  });
}

class _ActionButton extends StatelessWidget {
  final String label;
  final String actionType;
  final Map<String, dynamic>? payload;
  final Color accentColor;

  const _ActionButton({
    required this.label,
    required this.actionType,
    this.payload,
    required this.accentColor,
  });

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: () {
        // Sprint 2: 操作按钮 UI 就绪，具体动作在 Sprint 3 实现
        debugPrint(
            '[NotificationCard] Action tapped: $actionType, payload: $payload');
      },
      style: OutlinedButton.styleFrom(
        foregroundColor: accentColor,
        side: BorderSide(color: accentColor.withValues(alpha: 0.5)),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        minimumSize: const Size(0, 28),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(6),
        ),
      ),
      child: Text(label, style: const TextStyle(fontSize: 12)),
    );
  }
}
