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
        overlayColor = const Color(0xFF788c5d).withValues(alpha: 0.06);
        statusLabel = '已发送';
        break;
      case DraftStatus.rejected:
        overlayColor = Colors.grey.withValues(alpha: 0.06);
        statusLabel = '已拒绝';
        break;
      case DraftStatus.expired:
        overlayColor = Colors.grey.withValues(alpha: 0.06);
        statusLabel = '已过期';
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
              ? const Color(0xFF788c5d).withValues(alpha: 0.25)
              : Colors.grey.shade300,
          width: 1.5,
        ),
        boxShadow: isPending
            ? [BoxShadow(color: const Color(0xFF788c5d).withValues(alpha: 0.08), blurRadius: 8)]
            : null,
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
                  Icons.auto_awesome_outlined,
                  size: 16,
                  color: isPending ? const Color(0xFF788c5d) : Colors.grey,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Jarvis 起草的回复',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: isPending ? const Color(0xFF788c5d) : Colors.grey,
                      textBaseline: TextBaseline.alphabetic,
                      letterSpacing: 0.6,
                    ),
                  ),
                ),
                if (statusLabel != null)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: draft.status == DraftStatus.approved
                          ? const Color(0xFF788c5d).withValues(alpha: 0.12)
                          : Colors.grey.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      statusLabel,
                      style: TextStyle(
                        fontSize: 11,
                        color: draft.status == DraftStatus.approved
                            ? const Color(0xFF788c5d)
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
                          child: const Text('保存并发送'),
                        ),
                      ],
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        // Reject
                        TextButton(
                          onPressed: () =>
                              widget.onReject(draft.draftId),
                          style: TextButton.styleFrom(
                            backgroundColor: const Color(0xFFf0eeea),
                            foregroundColor: const Color(0xFF6b6966),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 4),
                            minimumSize: const Size(0, 34),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          child: const Text('✕ 拒绝', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                        ),
                        const SizedBox(width: 8),
                        // Edit
                        TextButton(
                          onPressed: () => setState(() => _isEditing = true),
                          style: TextButton.styleFrom(
                            backgroundColor: const Color(0xFF788c5d).withValues(alpha: 0.10),
                            foregroundColor: const Color(0xFF788c5d),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 4),
                            minimumSize: const Size(0, 34),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                              side: const BorderSide(
                                color: Color(0x40788c5d),
                              ),
                            ),
                          ),
                          child: const Text('✎ 编辑', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                        ),
                        const SizedBox(width: 8),
                        // Approve
                        FilledButton(
                          onPressed: () => widget.onApprove(draft.draftId),
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFF788c5d),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 4),
                            minimumSize: const Size(0, 34),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          child: const Text('✓ 发送', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
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
