import 'package:flutter/material.dart';
import '../providers/whisper_provider.dart';

/// Whisper suggestion bar: Jarvis label + primary chip + alt chips.
/// Shown between messages and input when AI suggestions exist.
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

  static const _olive = Color(0xFF788c5d);
  static const _olimeDim = Color(0x1F788c5d); // 12% opacity

  @override
  Widget build(BuildContext context) {
    if (!whisperState.hasSuggestion) return const SizedBox.shrink();

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(
          top: BorderSide(color: Color(0x33788c5d), width: 1.5), // olive 20%
        ),
      ),
      child: Stack(
        children: [
          // Left olive accent bar
          Positioned(
            left: 0, top: 6, bottom: 6,
            child: Container(width: 3, decoration: const BoxDecoration(
              color: _olive,
              borderRadius: BorderRadius.horizontal(right: Radius.circular(2)),
            )),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 12, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // Label row
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: _olimeDim,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Text(
                        '✨ JARVIS 建议',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: _olive,
                          letterSpacing: 0.8,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),

                // Chips row
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    // Primary chip
                    _Chip(
                      label: whisperState.primary!,
                      isPrimary: true,
                      onTap: () => onAccept(0),
                    ),
                    // Alt chips
                    if (whisperState.alternatives.isNotEmpty) ...[
                      for (var i = 0; i < whisperState.alternatives.length; i++)
                        _Chip(
                          label: whisperState.alternatives[i],
                          isPrimary: false,
                          onTap: () => onAccept(i + 1),
                        ),
                    ] else
                      _Chip(
                        label: '···',
                        isPrimary: false,
                        onTap: onToggleAlternatives,
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final bool isPrimary;
  final VoidCallback onTap;

  const _Chip({required this.label, required this.isPrimary, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 5),
        decoration: BoxDecoration(
          color: isPrimary ? const Color(0xFF788c5d) : const Color(0xFFf0eeea),
          borderRadius: BorderRadius.circular(16),
          border: isPrimary
              ? null
              : Border.all(color: const Color(0xFFe8e6dc), width: 1.5),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: isPrimary ? 13 : 12,
            color: isPrimary ? Colors.white : const Color(0xFF6b6966),
          ),
        ),
      ),
    );
  }
}
