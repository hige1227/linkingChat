import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'voice_recorder.dart';

class MessageInput extends StatefulWidget {
  final Function(String) onSend;
  final VoidCallback? onWhisperRequest;
  final VoidCallback? onTypingStart;
  final VoidCallback? onTypingStop;
  final VoidCallback? onAttachmentTap;
  final Function(File audioFile, Duration duration)? onVoiceSend;
  final bool showAiButton;
  final bool aiLoading;
  final void Function(String? prompt)? onAiButtonPressed;

  /// Key for programmatic access to pre-fill text (e.g., from Whisper)
  final GlobalKey<MessageInputState>? inputKey;

  const MessageInput({
    super.key,
    required this.onSend,
    this.onWhisperRequest,
    this.onTypingStart,
    this.onTypingStop,
    this.onAttachmentTap,
    this.onVoiceSend,
    this.inputKey,
    this.showAiButton = true,
    this.aiLoading = false,
    this.onAiButtonPressed,
  });

  @override
  State<MessageInput> createState() => MessageInputState();
}

class MessageInputState extends State<MessageInput> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  Timer? _typingTimer;
  bool _isTyping = false;
  bool _showAiHint = false;

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    _typingTimer?.cancel();
    super.dispose();
  }

  /// Pre-fill text (e.g., from Whisper suggestion).
  /// Always replaces current input — user explicitly tapped a suggestion.
  void prefillText(String text) {
    _controller.text = text;
    _controller.selection = TextSelection.fromPosition(
      TextPosition(offset: text.length),
    );
    _focusNode.requestFocus();
  }

  static final _aiPattern = RegExp(r'(?<!\w)@ai\b', caseSensitive: false);

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

    // Real-time @ai detection
    if (widget.showAiButton) {
      final hasAi = _aiPattern.hasMatch(text);
      if (hasAi != _showAiHint) {
        setState(() => _showAiHint = hasAi);
      }
    }
  }

  void _handleSend() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    // @ai intercept: only when hint bar is visible (user has expectation)
    if (_showAiHint) {
      // Extract user's text minus @ai as prompt context
      final prompt = text.replaceAll(_aiPattern, '').trim();
      debugPrint('[MessageInput] @ai intercept: text=$text, prompt=${prompt.isNotEmpty ? prompt : "(empty)"}');
      widget.onAiButtonPressed?.call(prompt.isNotEmpty ? prompt : null);
      _controller.clear();
      setState(() => _showAiHint = false);
      return;
    }

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
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // AI hint bar
        if (_showAiHint)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            decoration: BoxDecoration(
              color: Theme.of(context).primaryColor.withValues(alpha: 0.08),
              border: Border(
                bottom: BorderSide(color: Colors.grey.shade300, width: 0.5),
              ),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline,
                    size: 14, color: Theme.of(context).primaryColor),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Contains @ai — sending will request AI suggestions',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        // Input row
        Container(
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
                const SizedBox(width: 4),
                // AI button
                if (widget.showAiButton)
                  IconButton(
                    onPressed: widget.aiLoading
                        ? null
                        : () {
                            // If user has typed text, use it as prompt context
                            final inputText = _controller.text.trim();
                            final prompt = inputText.isNotEmpty
                                ? inputText.replaceAll(_aiPattern, '').trim()
                                : null;
                            debugPrint('[MessageInput] AI button: inputText=$inputText, prompt=${prompt ?? "(none)"}');
                            widget.onAiButtonPressed
                                ?.call(prompt?.isNotEmpty == true ? prompt : null);
                          },
                    icon: widget.aiLoading
                        ? SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Theme.of(context).primaryColor,
                            ),
                          )
                        : Icon(
                            Icons.auto_awesome,
                            color: Colors.grey.shade500,
                          ),
                  ),
                // Send / voice button
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
        ),
      ],
    );
  }
}
