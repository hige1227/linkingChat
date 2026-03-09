// apps/mobile/lib/features/profile/models/user_profile.dart

class UserProfile {
  final String id;
  final String email;
  final String username;
  final String displayName;
  final String? avatarUrl;
  final String status;
  final DateTime? lastSeenAt;

  UserProfile({
    required this.id,
    required this.email,
    required this.username,
    required this.displayName,
    this.avatarUrl,
    required this.status,
    this.lastSeenAt,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
        id: json['id'] as String,
        email: json['email'] as String,
        username: json['username'] as String,
        displayName: json['displayName'] as String,
        avatarUrl: json['avatarUrl'] as String?,
        status: json['status'] as String,
        lastSeenAt: json['lastSeenAt'] == null
            ? null
            : DateTime.parse(json['lastSeenAt'] as String),
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'email': email,
        'username': username,
        'displayName': displayName,
        'avatarUrl': avatarUrl,
        'status': status,
        'lastSeenAt': lastSeenAt?.toIso8601String(),
      };

  UserProfile copyWith({
    String? displayName,
    String? avatarUrl,
    String? status,
  }) {
    return UserProfile(
      id: id,
      email: email,
      username: username,
      displayName: displayName ?? this.displayName,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      status: status ?? this.status,
      lastSeenAt: lastSeenAt,
    );
  }

  String get statusText {
    switch (status) {
      case 'ONLINE':
        return '在线';
      case 'IDLE':
        return '离开';
      case 'DND':
        return '请勿打扰';
      case 'OFFLINE':
        return '离线';
      default:
        return '离线';
    }
  }

  bool get isOnline => status == 'ONLINE';
}
