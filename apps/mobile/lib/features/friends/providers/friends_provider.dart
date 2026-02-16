import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

// ──────────────────────────────────────
// Friend Model
// ──────────────────────────────────────

class Friend {
  final String id;
  final String username;
  final String displayName;
  final String? avatarUrl;
  final String status;
  final String? converseId;

  const Friend({
    required this.id,
    required this.username,
    required this.displayName,
    this.avatarUrl,
    this.status = 'OFFLINE',
    this.converseId,
  });

  factory Friend.fromJson(Map<String, dynamic> json) {
    return Friend(
      id: json['id'] as String,
      username: json['username'] as String,
      displayName: json['displayName'] as String,
      avatarUrl: json['avatarUrl'] as String?,
      status: json['status'] as String? ?? 'OFFLINE',
      converseId: json['converseId'] as String?,
    );
  }
}

class FriendRequest {
  final String id;
  final Map<String, dynamic> user;
  final String? message;
  final String createdAt;

  const FriendRequest({
    required this.id,
    required this.user,
    this.message,
    required this.createdAt,
  });

  factory FriendRequest.fromJson(Map<String, dynamic> json) {
    return FriendRequest(
      id: json['id'] as String,
      user: json['user'] as Map<String, dynamic>,
      message: json['message'] as String?,
      createdAt: json['createdAt'] as String,
    );
  }

  String get userName => user['displayName'] as String? ?? user['username'] as String? ?? '';
}

class SearchResult {
  final String id;
  final String username;
  final String displayName;
  final String? avatarUrl;

  const SearchResult({
    required this.id,
    required this.username,
    required this.displayName,
    this.avatarUrl,
  });

  factory SearchResult.fromJson(Map<String, dynamic> json) {
    return SearchResult(
      id: json['id'] as String,
      username: json['username'] as String,
      displayName: json['displayName'] as String,
      avatarUrl: json['avatarUrl'] as String?,
    );
  }
}

// ──────────────────────────────────────
// Friends State + Notifier
// ──────────────────────────────────────

class FriendsState {
  final List<Friend> friends;
  final List<FriendRequest> receivedRequests;
  final List<FriendRequest> sentRequests;
  final bool isLoading;
  final String? error;

  const FriendsState({
    this.friends = const [],
    this.receivedRequests = const [],
    this.sentRequests = const [],
    this.isLoading = false,
    this.error,
  });

  FriendsState copyWith({
    List<Friend>? friends,
    List<FriendRequest>? receivedRequests,
    List<FriendRequest>? sentRequests,
    bool? isLoading,
    String? error,
  }) {
    return FriendsState(
      friends: friends ?? this.friends,
      receivedRequests: receivedRequests ?? this.receivedRequests,
      sentRequests: sentRequests ?? this.sentRequests,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class FriendsNotifier extends StateNotifier<FriendsState> {
  final Dio _dio;

  FriendsNotifier(this._dio) : super(const FriendsState());

  Future<void> fetchFriends() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _dio.get('/api/v1/friends');
      final list = (response.data as List<dynamic>)
          .map((json) => Friend.fromJson(json as Map<String, dynamic>))
          .toList();
      state = state.copyWith(friends: list, isLoading: false);
    } on DioException catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.response?.data?['message']?.toString() ?? e.message,
      );
    }
  }

  Future<void> fetchRequests() async {
    try {
      final response = await _dio.get('/api/v1/friends/requests');
      final data = response.data as Map<String, dynamic>;

      final received = (data['received'] as List<dynamic>?)
              ?.map((j) => FriendRequest.fromJson(j as Map<String, dynamic>))
              .toList() ??
          [];
      final sent = (data['sent'] as List<dynamic>?)
              ?.map((j) => FriendRequest.fromJson(j as Map<String, dynamic>))
              .toList() ??
          [];

      state = state.copyWith(receivedRequests: received, sentRequests: sent);
    } catch (_) {}
  }

  Future<String?> sendRequest(String receiverId, {String? message}) async {
    try {
      await _dio.post('/api/v1/friends/request', data: {
        'receiverId': receiverId,
        if (message != null) 'message': message,
      });
      await fetchRequests();
      return null; // success
    } on DioException catch (e) {
      return e.response?.data?['message']?.toString() ?? 'Failed to send request';
    }
  }

  Future<void> acceptRequest(String requestId) async {
    try {
      await _dio.post('/api/v1/friends/accept/$requestId');
      await fetchRequests();
      await fetchFriends();
    } catch (_) {}
  }

  Future<void> rejectRequest(String requestId) async {
    try {
      await _dio.post('/api/v1/friends/reject/$requestId');
      await fetchRequests();
    } catch (_) {}
  }

  Future<void> removeFriend(String userId) async {
    try {
      await _dio.delete('/api/v1/friends/$userId');
      await fetchFriends();
    } catch (_) {}
  }
}

final friendsProvider =
    StateNotifierProvider<FriendsNotifier, FriendsState>((ref) {
  final dio = ref.read(dioProvider);
  return FriendsNotifier(dio);
});

// ──────────────────────────────────────
// User Search
// ──────────────────────────────────────

final userSearchProvider =
    FutureProvider.family<List<SearchResult>, String>((ref, query) async {
  if (query.length < 2) return [];
  final dio = ref.read(dioProvider);
  final response = await dio.get('/api/v1/users/search', queryParameters: {'q': query});
  return (response.data as List<dynamic>)
      .map((j) => SearchResult.fromJson(j as Map<String, dynamic>))
      .toList();
});
