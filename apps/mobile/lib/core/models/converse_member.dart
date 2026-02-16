class ConverseMemberModel {
  final String userId;
  final String username;
  final String displayName;
  final String? avatarUrl;
  final String? role;
  final bool isOpen;

  const ConverseMemberModel({
    required this.userId,
    required this.username,
    required this.displayName,
    this.avatarUrl,
    this.role,
    this.isOpen = true,
  });

  factory ConverseMemberModel.fromJson(Map<String, dynamic> json) {
    return ConverseMemberModel(
      userId: json['userId'] as String,
      username: json['username'] as String,
      displayName: json['displayName'] as String,
      avatarUrl: json['avatarUrl'] as String?,
      role: json['role'] as String?,
      isOpen: json['isOpen'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'username': username,
        'displayName': displayName,
        'avatarUrl': avatarUrl,
        'role': role,
        'isOpen': isOpen,
      };

  ConverseMemberModel copyWith({
    String? userId,
    String? username,
    String? displayName,
    String? avatarUrl,
    String? role,
    bool? isOpen,
  }) {
    return ConverseMemberModel(
      userId: userId ?? this.userId,
      username: username ?? this.username,
      displayName: displayName ?? this.displayName,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      role: role ?? this.role,
      isOpen: isOpen ?? this.isOpen,
    );
  }
}
