import 'package:flutter/material.dart';

/// Confirmation dialog for warning/dangerous predictive actions.
class DangerConfirmDialog extends StatelessWidget {
  final String dangerLevel; // 'warning' | 'dangerous'
  final String actionDescription;
  final String commandText;

  const DangerConfirmDialog({
    super.key,
    required this.dangerLevel,
    required this.actionDescription,
    required this.commandText,
  });

  /// Show the dialog and return true if confirmed.
  static Future<bool> show(
    BuildContext context, {
    required String dangerLevel,
    required String actionDescription,
    required String commandText,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (_) => DangerConfirmDialog(
        dangerLevel: dangerLevel,
        actionDescription: actionDescription,
        commandText: commandText,
      ),
    );
    return result ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final isDangerous = dangerLevel == 'dangerous';
    final accentColor =
        isDangerous ? const Color(0xFFF44336) : const Color(0xFFFFC107);

    return AlertDialog(
      title: Row(
        children: [
          Icon(
            isDangerous ? Icons.dangerous_outlined : Icons.warning_amber_outlined,
            color: accentColor,
            size: 24,
          ),
          const SizedBox(width: 8),
          Text(
            isDangerous ? 'Dangerous Action' : 'Confirm Action',
            style: const TextStyle(fontSize: 16),
          ),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            actionDescription,
            style: const TextStyle(fontSize: 14),
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: const Color(0xFF1E1E1E),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              commandText,
              style: const TextStyle(
                fontSize: 12,
                fontFamily: 'monospace',
                color: Colors.white,
              ),
            ),
          ),
          if (isDangerous) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFFFFEBEE),
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Row(
                children: [
                  Icon(Icons.error_outline, size: 16, color: Color(0xFFF44336)),
                  SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'This action may be destructive and cannot be undone.',
                      style: TextStyle(
                          fontSize: 12, color: Color(0xFFF44336)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: FilledButton.styleFrom(backgroundColor: accentColor),
          child: Text(
            isDangerous ? 'Execute Anyway' : 'Execute',
            style: TextStyle(
              color: isDangerous ? Colors.white : Colors.black87,
            ),
          ),
        ),
      ],
    );
  }
}
