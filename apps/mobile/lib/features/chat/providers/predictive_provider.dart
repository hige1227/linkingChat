import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/ai_events.dart';
import '../../../core/network/chat_socket_service.dart';

// ── Models ──

class PredictiveAction {
  final String type; // 'shell' | 'message' | 'file'
  final String action;
  final String description;
  final String dangerLevel; // 'safe' | 'warning' | 'dangerous'

  const PredictiveAction({
    required this.type,
    required this.action,
    required this.description,
    required this.dangerLevel,
  });

  factory PredictiveAction.fromJson(Map<String, dynamic> json) {
    return PredictiveAction(
      type: json['type'] as String? ?? 'shell',
      action: json['action'] as String? ?? '',
      description: json['description'] as String? ?? '',
      dangerLevel: json['dangerLevel'] as String? ?? 'safe',
    );
  }
}

class PredictiveSuggestion {
  final String suggestionId;
  final String converseId;
  final String trigger;
  final List<PredictiveAction> actions;
  final bool dismissed;

  const PredictiveSuggestion({
    required this.suggestionId,
    required this.converseId,
    required this.trigger,
    required this.actions,
    this.dismissed = false,
  });

  PredictiveSuggestion copyWith({bool? dismissed}) {
    return PredictiveSuggestion(
      suggestionId: suggestionId,
      converseId: converseId,
      trigger: trigger,
      actions: actions,
      dismissed: dismissed ?? this.dismissed,
    );
  }
}

// ── State ──

class PredictiveState {
  final List<PredictiveSuggestion> suggestions;

  const PredictiveState({this.suggestions = const []});

  List<PredictiveSuggestion> get activeSuggestions =>
      suggestions.where((s) => !s.dismissed).toList();

  PredictiveState copyWith({List<PredictiveSuggestion>? suggestions}) {
    return PredictiveState(suggestions: suggestions ?? this.suggestions);
  }
}

// ── Notifier ──

class PredictiveNotifier extends StateNotifier<PredictiveState> {
  final String converseId;
  final ChatSocketService _chatSocket;

  PredictiveNotifier(this.converseId, this._chatSocket)
      : super(const PredictiveState()) {
    _chatSocket.on(AiEvents.predictiveAction, _onAction);
  }

  void _onAction(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    if (data['converseId'] != converseId) return;

    final actions = (data['actions'] as List<dynamic>?)
            ?.map((a) => PredictiveAction.fromJson(a as Map<String, dynamic>))
            .toList() ??
        [];

    final suggestion = PredictiveSuggestion(
      suggestionId: data['suggestionId'] as String? ?? '',
      converseId: converseId,
      trigger: data['trigger'] as String? ?? '',
      actions: actions,
    );

    state = state.copyWith(suggestions: [suggestion, ...state.suggestions]);
    debugPrint('[Predictive] New suggestion for $converseId: ${suggestion.suggestionId}');
  }

  void executeAction(String suggestionId, int actionIndex) {
    _chatSocket.emitPredictiveExecute(suggestionId, actionIndex);
    // Dismiss the suggestion after executing
    dismiss(suggestionId);
  }

  void dismiss(String suggestionId) {
    _chatSocket.emitPredictiveDismiss(suggestionId);
    state = state.copyWith(
      suggestions: state.suggestions.map((s) {
        if (s.suggestionId == suggestionId) return s.copyWith(dismissed: true);
        return s;
      }).toList(),
    );
  }

  @override
  void dispose() {
    _chatSocket.off(AiEvents.predictiveAction, _onAction);
    super.dispose();
  }
}

// ── Provider ──

final predictiveProvider = StateNotifierProvider.family<PredictiveNotifier,
    PredictiveState, String>((ref, converseId) {
  final chatSocket = ref.read(chatSocketServiceProvider);
  return PredictiveNotifier(converseId, chatSocket);
});
