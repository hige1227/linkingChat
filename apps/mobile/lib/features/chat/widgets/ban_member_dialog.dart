import 'package:flutter/material.dart';

class BanMemberDialog extends StatefulWidget {
  final String memberName;
  final void Function(String? reason) onConfirm;
  final VoidCallback onCancel;

  const BanMemberDialog({
    super.key,
    required this.memberName,
    required this.onConfirm,
    required this.onCancel,
  });

  @override
  State<BanMemberDialog> createState() => _BanMemberDialogState();
}

class _BanMemberDialogState extends State<BanMemberDialog> {
  final _reasonController = TextEditingController();
  bool _isLoading = false;

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      icon: const Icon(Icons.block, color: Colors.red, size: 32),
      title: const Text('Ban & Remove Member'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'This will remove ${widget.memberName} from the group and prevent them from rejoining.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _reasonController,
            maxLines: 3,
            maxLength: 500,
            decoration: const InputDecoration(
              labelText: 'Reason (optional)',
              border: OutlineInputBorder(),
              alignLabelWithHint: true,
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : widget.onCancel,
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: Colors.red,
          ),
          onPressed: _isLoading
              ? null
              : () {
                  setState(() => _isLoading = true);
                  widget.onConfirm(
                    _reasonController.text.trim().isEmpty
                        ? null
                        : _reasonController.text.trim(),
                  );
                },
          child: _isLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Text('Ban'),
        ),
      ],
    );
  }
}

/// Helper function to show ban dialog
Future<void> showBanMemberDialog({
  required BuildContext context,
  required String memberName,
  required void Function(String? reason) onConfirm,
}) async {
  await showDialog(
    context: context,
    builder: (ctx) => BanMemberDialog(
      memberName: memberName,
      onConfirm: (reason) {
        Navigator.pop(ctx);
        onConfirm(reason);
      },
      onCancel: () => Navigator.pop(ctx),
    ),
  );
}
