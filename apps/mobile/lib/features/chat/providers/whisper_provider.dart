import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/ai_events.dart';
import '../../../core/network/chat_socket_service.dart';

// ── State ──

class WhisperState {
  final String? suggestionId;
  final String? primary;
  final List<String> alternatives;
  final bool showAlternatives;

  const WhisperState({
    this.suggestionId,
    this.primary,
    this.alternatives = const [],
    this.showAlternatives = false,
  });

  bool get hasSuggestion => primary != null;

  WhisperState copyWith({
    String? suggestionId,
    String? primary,
    List<String>? alternatives,
    bool? showAlternatives,
  }) {
    return WhisperState(
      suggestionId: suggestionId ?? this.suggestionId,
      primary: primary ?? this.primary,
      alternatives: alternatives ?? this.alternatives,
      showAlternatives: showAlternatives ?? this.showAlternatives,
    );
  }
}

// ── Notifier ──

class WhisperNotifier extends StateNotifier<WhisperState> {
  final String converseId;
  final ChatSocketService _chatSocket;

  WhisperNotifier(this.converseId, this._chatSocket)
      : super(const WhisperState()) {
    _chatSocket.on(AiEvents.whisperSuggestions, _onSuggestions);
  }

  void _onSuggestions(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    if (data['converseId'] != converseId) return;

    state = WhisperState(
      suggestionId: data['suggestionId'] as String?,
      primary: data['primary'] as String?,
      alternatives: (data['alternatives'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      showAlternatives: false,
    );

    debugPrint('[Whisper] Suggestions received for $converseId');
  }

  /// Accept a suggestion at the given index (0 = primary, 1-2 = alternatives)
  String? accept(int index) {
    final id = state.suggestionId;
    if (id == null) return null;

    String? text;
    if (index == 0) {
      text = state.primary;
    } else if (index - 1 < state.alternatives.length) {
      text = state.alternatives[index - 1];
    }

    _chatSocket.emitWhisperAccept(id, index);
    dismiss();
    return text;
  }

  void toggleAlternatives() {
    state = state.copyWith(showAlternatives: !state.showAlternatives);
  }

  void dismiss() {
    state = const WhisperState();
  }

  @override
  void dispose() {
    _chatSocket.off(AiEvents.whisperSuggestions, _onSuggestions);
    super.dispose();
  }
}

// ── Provider ──

final whisperProvider = StateNotifierProvider.family<WhisperNotifier,
    WhisperState, String>((ref, converseId) {
  final chatSocket = ref.read(chatSocketServiceProvider);
  return WhisperNotifier(converseId, chatSocket);
});
