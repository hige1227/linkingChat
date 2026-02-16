class MessageAuthor {
  final String id;
  final String username;
  final String displayName;
  final String? avatarUrl;

  const MessageAuthor({
    required this.id,
    required this.username,
    required this.displayName,
    this.avatarUrl,
  });

  factory MessageAuthor.fromJson(Map<String, dynamic> json) {
    return MessageAuthor(
      id: json['id'] as String,
      username: json['username'] as String,
      displayName: json['displayName'] as String,
      avatarUrl: json['avatarUrl'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'displayName': displayName,
        'avatarUrl': avatarUrl,
      };
}

class Message {
  final String id;
  final String? content;
  final String type;
  final String converseId;
  final String authorId;
  final MessageAuthor author;
  final Map<String, dynamic>? metadata;
  final String? replyToId;
  final String createdAt;
  final String updatedAt;
  final String? deletedAt;

  /// Client-only: optimistic send status
  final MessageSendStatus sendStatus;

  const Message({
    required this.id,
    this.content,
    this.type = 'TEXT',
    required this.converseId,
    required this.authorId,
    required this.author,
    this.metadata,
    this.replyToId,
    required this.createdAt,
    required this.updatedAt,
    this.deletedAt,
    this.sendStatus = MessageSendStatus.sent,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    return Message(
      id: json['id'] as String,
      content: json['content'] as String?,
      type: json['type'] as String? ?? 'TEXT',
      converseId: json['converseId'] as String,
      authorId: json['authorId'] as String,
      author: MessageAuthor.fromJson(json['author'] as Map<String, dynamic>),
      metadata: json['metadata'] as Map<String, dynamic>?,
      replyToId: json['replyToId'] as String?,
      createdAt: json['createdAt'] as String,
      updatedAt: json['updatedAt'] as String,
      deletedAt: json['deletedAt'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'content': content,
        'type': type,
        'converseId': converseId,
        'authorId': authorId,
        'author': author.toJson(),
        'metadata': metadata,
        'replyToId': replyToId,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
        'deletedAt': deletedAt,
      };

  Message copyWith({
    String? id,
    String? content,
    String? type,
    String? converseId,
    String? authorId,
    MessageAuthor? author,
    Map<String, dynamic>? metadata,
    String? replyToId,
    String? createdAt,
    String? updatedAt,
    String? deletedAt,
    MessageSendStatus? sendStatus,
  }) {
    return Message(
      id: id ?? this.id,
      content: content ?? this.content,
      type: type ?? this.type,
      converseId: converseId ?? this.converseId,
      authorId: authorId ?? this.authorId,
      author: author ?? this.author,
      metadata: metadata ?? this.metadata,
      replyToId: replyToId ?? this.replyToId,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      deletedAt: deletedAt ?? this.deletedAt,
      sendStatus: sendStatus ?? this.sendStatus,
    );
  }
}

enum MessageSendStatus { sending, sent, failed }
