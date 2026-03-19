import 'dart:async';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/ai_events.dart';
import '../../../core/network/chat_socket_service.dart';

// ── Models ──

enum DraftStatus { pending, approved, rejected, expired }

class DraftItem {
  final String draftId;
  final String converseId;
  final String? botId;
  final String botName;
  final String draftType; // 'message' | 'command'
  final Map<String, dynamic> draftContent;
  final DateTime expiresAt;
  final DateTime createdAt;
  final DraftStatus status;

  const DraftItem({
    required this.draftId,
    required this.converseId,
    this.botId,
    required this.botName,
    required this.draftType,
    required this.draftContent,
    required this.expiresAt,
    required this.createdAt,
    this.status = DraftStatus.pending,
  });

  String get contentText => draftContent['content'] as String? ?? '';

  Duration get remainingTime {
    final diff = expiresAt.difference(DateTime.now().toUtc());
    return diff.isNegative ? Duration.zero : diff;
  }

  bool get isExpired => remainingTime == Duration.zero;

  DraftItem copyWith({DraftStatus? status, Map<String, dynamic>? draftContent}) {
    return DraftItem(
      draftId: draftId,
      converseId: converseId,
      botId: botId,
      botName: botName,
      draftType: draftType,
      draftContent: draftContent ?? this.draftContent,
      expiresAt: expiresAt,
      createdAt: createdAt,
      status: status ?? this.status,
    );
  }
}

// ── State ──

class DraftState {
  final List<DraftItem> drafts;

  const DraftState({this.drafts = const []});

  /// Only PENDING drafts that haven't expired
  List<DraftItem> get activeDrafts =>
      drafts.where((d) => d.status == DraftStatus.pending && !d.isExpired).toList();

  DraftState copyWith({List<DraftItem>? drafts}) {
    return DraftState(drafts: drafts ?? this.drafts);
  }
}

// ── Notifier ──

class DraftNotifier extends StateNotifier<DraftState> {
  final String converseId;
  final ChatSocketService _chatSocket;
  Timer? _expiryTimer;

  DraftNotifier(this.converseId, this._chatSocket) : super(const DraftState()) {
    _chatSocket.on(AiEvents.draftCreated, _onDraftCreated);
    _chatSocket.on(AiEvents.draftExpired, _onDraftExpired);
    _startExpiryCheck();
  }

  void _onDraftCreated(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    if (data['converseId'] != converseId) return;

    final draft = DraftItem(
      draftId: data['draftId'] as String? ?? '',
      converseId: converseId,
      botId: data['botId'] as String?,
      botName: data['botName'] as String? ?? 'Bot',
      draftType: data['draftType'] as String? ?? 'message',
      draftContent: data['draftContent'] as Map<String, dynamic>? ?? {},
      expiresAt: DateTime.parse(
          data['expiresAt'] as String? ?? DateTime.now().toIso8601String()),
      createdAt: DateTime.parse(
          data['createdAt'] as String? ?? DateTime.now().toIso8601String()),
    );

    state = state.copyWith(drafts: [...state.drafts, draft]);
    debugPrint('[Draft] New draft received: ${draft.draftId}');
  }

  void _onDraftExpired(dynamic data) {
    if (data is! Map<String, dynamic>) return;
    final draftId = data['draftId'] as String?;
    if (draftId == null) return;

    _updateDraftStatus(draftId, DraftStatus.expired);
    _scheduleRemoval(draftId);
  }

  void approve(String draftId) {
    _chatSocket.emitDraftApprove(draftId);
    _updateDraftStatus(draftId, DraftStatus.approved);
    _scheduleRemoval(draftId);
  }

  void reject(String draftId, {String? reason}) {
    _chatSocket.emitDraftReject(draftId, reason: reason);
    _updateDraftStatus(draftId, DraftStatus.rejected);
    _scheduleRemoval(draftId);
  }

  void editAndApprove(String draftId, Map<String, dynamic> editedContent) {
    _chatSocket.emitDraftEdit(draftId, editedContent);
    state = state.copyWith(
      drafts: state.drafts.map((d) {
        if (d.draftId == draftId) {
          return d.copyWith(status: DraftStatus.approved, draftContent: editedContent);
        }
        return d;
      }).toList(),
    );
    _scheduleRemoval(draftId);
  }

  /// Auto-remove non-pending cards after 30 seconds to prevent UI overflow
  void _scheduleRemoval(String draftId) {
    Future.delayed(const Duration(seconds: 30), () {
      if (!mounted) return;
      state = state.copyWith(
        drafts: state.drafts.where((d) => d.draftId != draftId).toList(),
      );
    });
  }

  void _updateDraftStatus(String draftId, DraftStatus newStatus) {
    state = state.copyWith(
      drafts: state.drafts.map((d) {
        if (d.draftId == draftId) return d.copyWith(status: newStatus);
        return d;
      }).toList(),
    );
  }

  /// Check every second to update expired drafts in UI
  void _startExpiryCheck() {
    _expiryTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      final hasExpired = state.drafts.any(
          (d) => d.status == DraftStatus.pending && d.isExpired);
      if (hasExpired) {
        debugPrint('[Draft] expiryCheck: marking expired drafts');
        state = state.copyWith(
          drafts: state.drafts.map((d) {
            if (d.status == DraftStatus.pending && d.isExpired) {
              return d.copyWith(status: DraftStatus.expired);
            }
            return d;
          }).toList(),
        );
      }
    });
  }

  @override
  void dispose() {
    _chatSocket.off(AiEvents.draftCreated, _onDraftCreated);
    _chatSocket.off(AiEvents.draftExpired, _onDraftExpired);
    _expiryTimer?.cancel();
    super.dispose();
  }
}

// ── Provider ──

final draftProvider =
    StateNotifierProvider.family<DraftNotifier, DraftState, String>(
        (ref, converseId) {
  final chatSocket = ref.read(chatSocketServiceProvider);
  return DraftNotifier(converseId, chatSocket);
});
