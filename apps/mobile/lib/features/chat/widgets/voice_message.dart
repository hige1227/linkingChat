import 'dart:math';
import 'package:flutter/material.dart';

/// Voice message playback widget with waveform visualization.
///
/// Displays a play/pause button, animated waveform bars, duration text,
/// and a progress slider. Uses the `audioplayers` package for playback
/// (when added to pubspec.yaml). Currently provides the UI structure.
class VoiceMessage extends StatefulWidget {
  final String audioUrl;
  final int durationMs;
  final bool isOwn;

  const VoiceMessage({
    super.key,
    required this.audioUrl,
    required this.durationMs,
    required this.isOwn,
  });

  @override
  State<VoiceMessage> createState() => _VoiceMessageState();
}

class _VoiceMessageState extends State<VoiceMessage> {
  bool _isPlaying = false;
  double _progress = 0.0;

  // In production, use AudioPlayer from 'audioplayers' package:
  // final _player = AudioPlayer();
  // Listen to onPlayerStateChanged, onPositionChanged, onDurationChanged

  void _togglePlay() {
    setState(() => _isPlaying = !_isPlaying);

    // In production:
    // if (_isPlaying) {
    //   await _player.play(UrlSource(widget.audioUrl));
    // } else {
    //   await _player.pause();
    // }
  }

  String _formatDuration(int ms) {
    final totalSeconds = ms ~/ 1000;
    final minutes = totalSeconds ~/ 60;
    final seconds = totalSeconds % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  @override
  void dispose() {
    // _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final duration = widget.durationMs > 0 ? widget.durationMs : 1000;
    // Calculate dynamic width based on duration (min 120, max 240)
    final width = (120.0 + (duration / 1000) * 8).clamp(120.0, 240.0);

    return Align(
      alignment: widget.isOwn ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        width: width,
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: widget.isOwn
              ? const Color(0xFF95EC69)
              : const Color(0xFFFFFFFF),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Play/Pause button
            GestureDetector(
              onTap: _togglePlay,
              child: Icon(
                _isPlaying ? Icons.pause_circle_filled : Icons.play_circle_filled,
                size: 32,
                color: widget.isOwn ? Colors.green.shade800 : Colors.blue,
              ),
            ),
            const SizedBox(width: 6),
            // Waveform bars
            Expanded(
              child: _WaveformBars(
                isPlaying: _isPlaying,
                progress: _progress,
                isOwn: widget.isOwn,
              ),
            ),
            const SizedBox(width: 6),
            // Duration
            Text(
              _formatDuration(duration),
              style: TextStyle(
                fontSize: 12,
                color: widget.isOwn ? Colors.green.shade900 : Colors.grey.shade600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Simple waveform visualization using random-height bars.
class _WaveformBars extends StatelessWidget {
  final bool isPlaying;
  final double progress;
  final bool isOwn;

  const _WaveformBars({
    required this.isPlaying,
    required this.progress,
    required this.isOwn,
  });

  @override
  Widget build(BuildContext context) {
    final random = Random(42); // Fixed seed for consistent bars
    const barCount = 20;

    return SizedBox(
      height: 24,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: List.generate(barCount, (i) {
          final barHeight = 6.0 + random.nextDouble() * 18;
          final filled = i / barCount <= progress;
          return Container(
            width: 2,
            height: barHeight,
            decoration: BoxDecoration(
              color: filled
                  ? (isOwn ? Colors.green.shade800 : Colors.blue)
                  : (isOwn ? Colors.green.shade300 : Colors.grey.shade300),
              borderRadius: BorderRadius.circular(1),
            ),
          );
        }),
      ),
    );
  }
}
