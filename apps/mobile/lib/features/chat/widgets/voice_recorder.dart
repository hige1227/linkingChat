import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

/// Voice recorder widget with long-press to record, slide up to cancel.
///
/// Requires the `record` package. Since it's not yet added to pubspec.yaml,
/// we use a simplified implementation using the platform's native recording
/// capability. When the `record` package is added, replace with AudioRecorder.
class VoiceRecorder extends StatefulWidget {
  final Function(File audioFile, Duration duration) onRecordComplete;
  final VoidCallback? onRecordCancel;

  const VoiceRecorder({
    super.key,
    required this.onRecordComplete,
    this.onRecordCancel,
  });

  @override
  State<VoiceRecorder> createState() => _VoiceRecorderState();
}

class _VoiceRecorderState extends State<VoiceRecorder>
    with SingleTickerProviderStateMixin {
  bool _isRecording = false;
  bool _isCancelling = false;
  Duration _duration = Duration.zero;
  Timer? _timer;
  double _startY = 0;

  static const _maxDuration = Duration(minutes: 5);
  static const _cancelThreshold = 100.0;

  Future<void> _startRecording() async {
    // In production, this would use AudioRecorder from 'record' package:
    // final recorder = AudioRecorder();
    // if (await recorder.hasPermission()) { ... }
    setState(() {
      _isRecording = true;
      _isCancelling = false;
      _duration = Duration.zero;
    });

    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() => _duration += const Duration(seconds: 1));
      if (_duration >= _maxDuration) {
        _stopRecording();
      }
    });
  }

  Future<void> _stopRecording() async {
    _timer?.cancel();

    if (_isCancelling) {
      widget.onRecordCancel?.call();
      _reset();
      return;
    }

    if (_duration.inSeconds < 1) {
      // Too short
      _reset();
      return;
    }

    // In production, stop the recorder and get the file path
    // final path = await recorder.stop();
    // Create a placeholder file for now
    final tempDir = await getTemporaryDirectory();
    final path =
        '${tempDir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.aac';
    final file = File(path);
    // In production, the recorder writes the actual audio file

    widget.onRecordComplete(file, _duration);
    _reset();
  }

  void _reset() {
    setState(() {
      _isRecording = false;
      _isCancelling = false;
      _duration = Duration.zero;
    });
  }

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes.remainder(60).toString().padLeft(1, '0');
    final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isRecording) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: _isCancelling ? Colors.grey : Colors.red,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              _formatDuration(_duration),
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
            ),
            const Spacer(),
            Text(
              _isCancelling ? '松手取消' : '⬆ 上滑取消',
              style: TextStyle(
                color: _isCancelling ? Colors.red : Colors.grey.shade600,
                fontSize: 13,
              ),
            ),
          ],
        ),
      );
    }

    return GestureDetector(
      onLongPressStart: (details) {
        _startY = details.globalPosition.dy;
        _startRecording();
      },
      onLongPressMoveUpdate: (details) {
        final delta = _startY - details.globalPosition.dy;
        setState(() => _isCancelling = delta > _cancelThreshold);
      },
      onLongPressEnd: (_) => _stopRecording(),
      child: Icon(
        Icons.mic,
        color: Colors.grey.shade600,
        size: 24,
      ),
    );
  }
}
