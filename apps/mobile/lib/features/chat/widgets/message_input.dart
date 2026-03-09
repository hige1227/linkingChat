import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'voice_recorder.dart';

class MessageInput extends StatefulWidget {
  final Function(String) onSend;
  final VoidCallback? onTypingStart;
  final VoidCallback? onTypingStop;
  final VoidCallback? onAttachmentTap;
  final Function(File audioFile, Duration duration)? onVoiceSend;

  /// Key for programmatic access to pre-fill text (e.g., from Whisper)
  final GlobalKey<MessageInputState>? inputKey;

  const MessageInput({
    super.key,
    required this.onSend,
    this.onTypingStart,
    this.onTypingStop,
    this.onAttachmentTap,
    this.onVoiceSend,
    this.inputKey,
  });

  @override
  State<MessageInput> createState() => MessageInputState();
}

class MessageInputState extends State<MessageInput> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  Timer? _typingTimer;
  bool _isTyping = false;

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    _typingTimer?.cancel();
    super.dispose();
  }

  /// Pre-fill text (e.g., from Whisper suggestion). Does NOT replace if user
  /// is already typing — only fills when input is empty.
  void prefillText(String text) {
    if (_controller.text.trim().isNotEmpty) return;
    _controller.text = text;
    _controller.selection = TextSelection.fromPosition(
      TextPosition(offset: text.length),
    );
    _focusNode.requestFocus();
  }

  void _handleTextChanged(String text) {
    if (text.isNotEmpty && !_isTyping) {
      _isTyping = true;
      widget.onTypingStart?.call();
    }

    _typingTimer?.cancel();
    _typingTimer = Timer(const Duration(seconds: 2), () {
      if (_isTyping) {
        _isTyping = false;
        widget.onTypingStop?.call();
      }
    });
  }

  void _handleSend() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    widget.onSend(text);
    _controller.clear();

    if (_isTyping) {
      _isTyping = false;
      _typingTimer?.cancel();
      widget.onTypingStop?.call();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        border: Border(
          top: BorderSide(color: Colors.grey.shade300, width: 0.5),
        ),
      ),
      child: SafeArea(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (widget.onAttachmentTap != null)
              IconButton(
                onPressed: widget.onAttachmentTap,
                icon: Icon(
                  Icons.add_circle_outline,
                  color: Colors.grey.shade600,
                ),
              ),
            Expanded(
              child: TextField(
                controller: _controller,
                focusNode: _focusNode,
                maxLines: 6,
                minLines: 1,
                textInputAction: TextInputAction.newline,
                decoration: InputDecoration(
                  hintText: 'Type a message...',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(20),
                    borderSide: BorderSide.none,
                  ),
                  filled: true,
                  fillColor: Colors.grey.shade100,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 10,
                  ),
                ),
                onChanged: _handleTextChanged,
              ),
            ),
            const SizedBox(width: 8),
            ValueListenableBuilder<TextEditingValue>(
              valueListenable: _controller,
              builder: (_, value, __) {
                final hasText = value.text.trim().isNotEmpty;
                if (hasText) {
                  return IconButton(
                    onPressed: _handleSend,
                    icon: Icon(
                      Icons.send,
                      color: Theme.of(context).primaryColor,
                    ),
                  );
                }
                // Show mic button when input is empty
                if (widget.onVoiceSend != null) {
                  return VoiceRecorder(
                    onRecordComplete: (file, duration) {
                      widget.onVoiceSend!(file, duration);
                    },
                    onRecordCancel: () {},
                  );
                }
                return IconButton(
                  onPressed: null,
                  icon: Icon(
                    Icons.send,
                    color: Colors.grey.shade400,
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
