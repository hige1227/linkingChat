import 'converse_member.dart';
import 'message.dart';

class Converse {
  final String id;
  final String type;
  final String? name;
  final String? description;
  final String? avatarUrl;
  final String? creatorId;
  final int? memberCount;
  final List<ConverseMemberModel> members;
  final Message? lastMessage;
  final int unreadCount;
  final String createdAt;
  final String updatedAt;

  // Bot info (from server response)
  final bool isBot;
  final bool isPinned;
  final Map<String, dynamic>? botInfo;

  const Converse({
    required this.id,
    required this.type,
    this.name,
    this.description,
    this.avatarUrl,
    this.creatorId,
    this.memberCount,
    this.members = const [],
    this.lastMessage,
    this.unreadCount = 0,
    required this.createdAt,
    required this.updatedAt,
    this.isBot = false,
    this.isPinned = false,
    this.botInfo,
  });

  factory Converse.fromJson(Map<String, dynamic> json) {
    return Converse(
      id: json['id'] as String,
      type: json['type'] as String,
      name: json['name'] as String?,
      description: json['description'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      creatorId: json['creatorId'] as String?,
      memberCount: json['memberCount'] as int?,
      members: (json['members'] as List<dynamic>?)
              ?.map((m) =>
                  ConverseMemberModel.fromJson(m as Map<String, dynamic>))
              .toList() ??
          [],
      lastMessage: json['lastMessage'] != null
          ? Message.fromJson(json['lastMessage'] as Map<String, dynamic>)
          : null,
      unreadCount: json['unreadCount'] as int? ?? 0,
      createdAt: json['createdAt'] is String
          ? json['createdAt'] as String
          : (json['createdAt'] as DateTime).toIso8601String(),
      updatedAt: json['updatedAt'] is String
          ? json['updatedAt'] as String
          : (json['updatedAt'] as DateTime).toIso8601String(),
      isBot: json['isBot'] as bool? ?? false,
      isPinned: json['isPinned'] as bool? ?? false,
      botInfo: json['botInfo'] as Map<String, dynamic>?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type,
        'name': name,
        'description': description,
        'avatarUrl': avatarUrl,
        'creatorId': creatorId,
        'memberCount': memberCount,
        'members': members.map((m) => m.toJson()).toList(),
        'lastMessage': lastMessage?.toJson(),
        'unreadCount': unreadCount,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
        'isBot': isBot,
        'isPinned': isPinned,
        'botInfo': botInfo,
      };

  Converse copyWith({
    String? id,
    String? type,
    String? name,
    String? description,
    String? avatarUrl,
    String? creatorId,
    int? memberCount,
    List<ConverseMemberModel>? members,
    Message? lastMessage,
    int? unreadCount,
    String? createdAt,
    String? updatedAt,
    bool? isBot,
    bool? isPinned,
    Map<String, dynamic>? botInfo,
  }) {
    return Converse(
      id: id ?? this.id,
      type: type ?? this.type,
      name: name ?? this.name,
      description: description ?? this.description,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      creatorId: creatorId ?? this.creatorId,
      memberCount: memberCount ?? this.memberCount,
      members: members ?? this.members,
      lastMessage: lastMessage ?? this.lastMessage,
      unreadCount: unreadCount ?? this.unreadCount,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      isBot: isBot ?? this.isBot,
      isPinned: isPinned ?? this.isPinned,
      botInfo: botInfo ?? this.botInfo,
    );
  }

  /// Display name: bot name > group name > other member's displayName
  String getDisplayName(String currentUserId) {
    if (botInfo != null) return botInfo!['name'] as String? ?? '';
    if (name != null && name!.isNotEmpty) return name!;
    // DM: show other member's displayName
    final other = members.where((m) => m.userId != currentUserId);
    if (other.isNotEmpty) return other.first.displayName;
    return '';
  }
}
