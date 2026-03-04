import 'package:dio/dio.dart';

class GroupModerationService {
  final Dio _dio;

  GroupModerationService(this._dio);

  /// Mute a group member
  Future<MuteResult> muteMember({
    required String converseId,
    required String memberId,
    required int durationMinutes,
  }) async {
    final response = await _dio.patch(
      '/api/v1/converses/groups/$converseId/members/$memberId/mute',
      data: {'durationMinutes': durationMinutes},
    );
    return MuteResult.fromJson(response.data);
  }

  /// Unmute a group member
  Future<void> unmuteMember({
    required String converseId,
    required String memberId,
  }) async {
    await _dio.delete(
      '/api/v1/converses/groups/$converseId/members/$memberId/mute',
    );
  }

  /// Ban a group member
  Future<BanResult> banMember({
    required String converseId,
    required String userId,
    String? reason,
  }) async {
    final response = await _dio.post(
      '/api/v1/converses/groups/$converseId/bans/$userId',
      data: {'reason': reason},
    );
    return BanResult.fromJson(response.data);
  }

  /// Unban a user
  Future<void> unbanMember({
    required String converseId,
    required String userId,
  }) async {
    await _dio.delete(
      '/api/v1/converses/groups/$converseId/bans/$userId',
    );
  }

  /// Get group ban list
  Future<List<GroupBan>> getGroupBans({
    required String converseId,
  }) async {
    final response = await _dio.get(
      '/api/v1/converses/groups/$converseId/bans',
    );
    return (response.data['bans'] as List)
        .map((b) => GroupBan.fromJson(b))
        .toList();
  }
}

class MuteResult {
  final DateTime mutedUntil;

  MuteResult({required this.mutedUntil});

  factory MuteResult.fromJson(Map<String, dynamic> json) {
    return MuteResult(
      mutedUntil: DateTime.parse(json['mutedUntil']),
    );
  }
}

class BanResult {
  final bool banned;
  final bool removedFromGroup;

  BanResult({required this.banned, required this.removedFromGroup});

  factory BanResult.fromJson(Map<String, dynamic> json) {
    return BanResult(
      banned: json['banned'],
      removedFromGroup: json['removedFromGroup'],
    );
  }
}

class GroupBan {
  final String userId;
  final String bannedBy;
  final String? reason;
  final DateTime createdAt;

  GroupBan({
    required this.userId,
    required this.bannedBy,
    this.reason,
    required this.createdAt,
  });

  factory GroupBan.fromJson(Map<String, dynamic> json) {
    return GroupBan(
      userId: json['userId'],
      bannedBy: json['bannedBy'],
      reason: json['reason'],
      createdAt: DateTime.parse(json['createdAt']),
    );
  }
}
