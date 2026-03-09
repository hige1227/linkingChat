import 'dart:async';
import 'package:flutter/material.dart';
import '../providers/draft_provider.dart';

/// Draft & Verify card: bot name header, content, countdown, action buttons.
class DraftCard extends StatefulWidget {
  final DraftItem draft;
  final void Function(String draftId) onApprove;
  final void Function(String draftId, {String? reason}) onReject;
  final void Function(String draftId, Map<String, dynamic> editedContent)
      onEdit;

  const DraftCard({
    super.key,
    required this.draft,
    required this.onApprove,
    required this.onReject,
    required this.onEdit,
  });

  @override
  State<DraftCard> createState() => _DraftCardState();
}

class _DraftCardState extends State<DraftCard> {
  Timer? _countdownTimer;
  Duration _remaining = Duration.zero;
  bool _isEditing = false;
  late TextEditingController _editController;

  @override
  void initState() {
    super.initState();
    _editController = TextEditingController(text: widget.draft.contentText);
    _remaining = widget.draft.remainingTime;
    if (widget.draft.status == DraftStatus.pending) {
      _startCountdown();
    }
  }

  @override
  void didUpdateWidget(DraftCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.draft.status != DraftStatus.pending) {
      _countdownTimer?.cancel();
    }
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _editController.dispose();
    super.dispose();
  }

  void _startCountdown() {
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      final r = widget.draft.remainingTime;
      if (mounted) {
        setState(() => _remaining = r);
      }
      if (r == Duration.zero) _countdownTimer?.cancel();
    });
  }

  String _formatDuration(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final draft = widget.draft;
    final isPending = draft.status == DraftStatus.pending;
    final isCommand = draft.draftType == 'command';

    // Status overlay color
    Color? overlayColor;
    String? statusLabel;
    switch (draft.status) {
      case DraftStatus.approved:
        overlayColor = const Color(0xFF4CAF50).withValues(alpha: 0.08);
        statusLabel = 'Approved';
        break;
      case DraftStatus.rejected:
        overlayColor = Colors.grey.withValues(alpha: 0.08);
        statusLabel = 'Rejected';
        break;
      case DraftStatus.expired:
        overlayColor = Colors.grey.withValues(alpha: 0.08);
        statusLabel = 'Expired';
        break;
      case DraftStatus.pending:
        break;
    }

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: overlayColor ?? Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isPending
              ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.3)
              : Colors.grey.shade300,
          width: 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: bot name + countdown + status
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
            child: Row(
              children: [
                Icon(
                  Icons.smart_toy_outlined,
                  size: 18,
                  color: isPending
                      ? Theme.of(context).colorScheme.primary
                      : Colors.grey,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Draft from ${draft.botName}',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: isPending ? null : Colors.grey,
                    ),
                  ),
                ),
                if (statusLabel != null)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: draft.status == DraftStatus.approved
                          ? const Color(0xFF4CAF50).withValues(alpha: 0.15)
                          : Colors.grey.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      statusLabel,
                      style: TextStyle(
                        fontSize: 11,
                        color: draft.status == DraftStatus.approved
                            ? const Color(0xFF4CAF50)
                            : Colors.grey,
                      ),
                    ),
                  )
                else
                  Text(
                    _formatDuration(_remaining),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: _remaining.inSeconds <= 30
                          ? const Color(0xFFF44336)
                          : Colors.grey.shade600,
                    ),
                  ),
              ],
            ),
          ),

          // Content
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: _isEditing
                ? TextField(
                    controller: _editController,
                    maxLines: null,
                    style: TextStyle(
                      fontSize: 13,
                      fontFamily: isCommand ? 'monospace' : null,
                    ),
                    decoration: InputDecoration(
                      isDense: true,
                      contentPadding: const EdgeInsets.all(8),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  )
                : Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: isCommand
                          ? const Color(0xFF1E1E1E)
                          : Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      draft.contentText,
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.5,
                        fontFamily: isCommand ? 'monospace' : null,
                        color: isCommand ? Colors.white : null,
                      ),
                    ),
                  ),
          ),

          // Action buttons
          if (isPending)
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
              child: _isEditing
                  ? Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(
                          onPressed: () => setState(() => _isEditing = false),
                          child: const Text('Cancel'),
                        ),
                        const SizedBox(width: 8),
                        FilledButton(
                          onPressed: () {
                            final edited = {
                              ...draft.draftContent,
                              'content': _editController.text,
                            };
                            widget.onEdit(draft.draftId, edited);
                            setState(() => _isEditing = false);
                          },
                          child: const Text('Save & Approve'),
                        ),
                      ],
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        // Reject
                        OutlinedButton(
                          onPressed: () =>
                              widget.onReject(draft.draftId),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFFF44336),
                            side: const BorderSide(
                              color: Color(0xFFF44336),
                              width: 0.5,
                            ),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 4),
                            minimumSize: const Size(0, 32),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.close, size: 16),
                              SizedBox(width: 4),
                              Text('Reject', style: TextStyle(fontSize: 12)),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        // Edit
                        OutlinedButton(
                          onPressed: () => setState(() => _isEditing = true),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: const Color(0xFF2196F3),
                            side: const BorderSide(
                              color: Color(0xFF2196F3),
                              width: 0.5,
                            ),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 4),
                            minimumSize: const Size(0, 32),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.edit, size: 16),
                              SizedBox(width: 4),
                              Text('Edit', style: TextStyle(fontSize: 12)),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        // Approve
                        FilledButton(
                          onPressed: () => widget.onApprove(draft.draftId),
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFF4CAF50),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 4),
                            minimumSize: const Size(0, 32),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.check, size: 16),
                              SizedBox(width: 4),
                              Text('Approve', style: TextStyle(fontSize: 12)),
                            ],
                          ),
                        ),
                      ],
                    ),
            )
          else
            const SizedBox(height: 8),
        ],
      ),
    );
  }
}
