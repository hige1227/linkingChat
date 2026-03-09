import 'package:flutter/material.dart';
import '../providers/predictive_provider.dart';
import 'danger_confirm_dialog.dart';

/// Predictive action card: trigger description + color-coded action buttons.
class PredictiveActionCard extends StatelessWidget {
  final PredictiveSuggestion suggestion;
  final void Function(String suggestionId, int actionIndex) onExecute;
  final void Function(String suggestionId) onDismiss;

  const PredictiveActionCard({
    super.key,
    required this.suggestion,
    required this.onExecute,
    required this.onDismiss,
  });

  Color _dangerColor(String level) {
    switch (level) {
      case 'dangerous':
        return const Color(0xFFF44336);
      case 'warning':
        return const Color(0xFFFFC107);
      case 'safe':
      default:
        return const Color(0xFF4CAF50);
    }
  }

  IconData _actionIcon(String type) {
    switch (type) {
      case 'shell':
        return Icons.terminal;
      case 'file':
        return Icons.insert_drive_file_outlined;
      case 'message':
        return Icons.chat_bubble_outline;
      default:
        return Icons.play_arrow;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.orange.withValues(alpha: 0.3), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: title + dismiss
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 4, 0),
            child: Row(
              children: [
                const Icon(Icons.auto_fix_high, size: 18, color: Colors.orange),
                const SizedBox(width: 6),
                const Expanded(
                  child: Text(
                    'Suggested Actions',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => onDismiss(suggestion.suggestionId),
                  icon: const Icon(Icons.close, size: 18),
                  padding: EdgeInsets.zero,
                  constraints:
                      const BoxConstraints(minWidth: 32, minHeight: 32),
                  color: Colors.grey.shade500,
                ),
              ],
            ),
          ),

          // Trigger description
          if (suggestion.trigger.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(36, 0, 12, 4),
              child: Text(
                suggestion.trigger,
                style: const TextStyle(fontSize: 12, color: Color(0xFF666666)),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),

          // Action list
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
            child: Column(
              children: [
                for (var i = 0; i < suggestion.actions.length; i++)
                  _ActionRow(
                    action: suggestion.actions[i],
                    icon: _actionIcon(suggestion.actions[i].type),
                    color: _dangerColor(suggestion.actions[i].dangerLevel),
                    onTap: () => _handleTap(context, i),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _handleTap(BuildContext context, int index) async {
    final action = suggestion.actions[index];

    if (action.dangerLevel == 'safe') {
      onExecute(suggestion.suggestionId, index);
      return;
    }

    // Warning or dangerous — show confirmation dialog
    final confirmed = await DangerConfirmDialog.show(
      context,
      dangerLevel: action.dangerLevel,
      actionDescription: action.description,
      commandText: action.action,
    );

    if (confirmed) {
      onExecute(suggestion.suggestionId, index);
    }
  }
}

class _ActionRow extends StatelessWidget {
  final PredictiveAction action;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  const _ActionRow({
    required this.action,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    action.description,
                    style: const TextStyle(fontSize: 13),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (action.type == 'shell')
                    Text(
                      action.action,
                      style: TextStyle(
                        fontSize: 11,
                        fontFamily: 'monospace',
                        color: Colors.grey.shade600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),
            const SizedBox(width: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: color.withValues(alpha: 0.4), width: 0.5),
              ),
              child: Text(
                'Run',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
