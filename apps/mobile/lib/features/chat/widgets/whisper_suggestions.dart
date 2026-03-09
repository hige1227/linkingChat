import 'package:flutter/material.dart';
import '../providers/whisper_provider.dart';

/// Whisper suggestion bar: primary chip + expand button + dismiss.
/// Shown between TypingIndicator and MessageInput when suggestions exist.
class WhisperSuggestions extends StatelessWidget {
  final WhisperState whisperState;
  final void Function(int index) onAccept;
  final VoidCallback onToggleAlternatives;
  final VoidCallback onDismiss;

  const WhisperSuggestions({
    super.key,
    required this.whisperState,
    required this.onAccept,
    required this.onToggleAlternatives,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    if (!whisperState.hasSuggestion) return const SizedBox.shrink();

    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        border: Border(
          top: BorderSide(color: Colors.grey.shade200, width: 0.5),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Primary suggestion + expand + dismiss
          Row(
            children: [
              // AI label
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  '@ai',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: theme.colorScheme.primary,
                  ),
                ),
              ),
              const SizedBox(width: 6),

              // Primary suggestion chip
              Expanded(
                child: GestureDetector(
                  onTap: () => onAccept(0),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primaryContainer,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      whisperState.primary!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        color: theme.colorScheme.onPrimaryContainer,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 4),

              // Expand alternatives button
              if (whisperState.alternatives.isNotEmpty)
                GestureDetector(
                  onTap: onToggleAlternatives,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    child: Text(
                      whisperState.showAlternatives ? '...' : '...',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                  ),
                ),

              // Dismiss button
              GestureDetector(
                onTap: onDismiss,
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Icon(
                    Icons.close,
                    size: 18,
                    color: Colors.grey.shade500,
                  ),
                ),
              ),
            ],
          ),

          // Alternatives (expanded)
          if (whisperState.showAlternatives &&
              whisperState.alternatives.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 32),
              child: Wrap(
                spacing: 6,
                runSpacing: 4,
                children: [
                  for (var i = 0; i < whisperState.alternatives.length; i++)
                    GestureDetector(
                      onTap: () => onAccept(i + 1),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade100,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                              color: Colors.grey.shade300, width: 0.5),
                        ),
                        child: Text(
                          whisperState.alternatives[i],
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade700,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
