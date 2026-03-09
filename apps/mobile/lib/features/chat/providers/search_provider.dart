import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class SearchResult {
  final String id;
  final String content;
  final String converseId;
  final String authorId;
  final String? authorUsername;
  final String? authorDisplayName;
  final String createdAt;

  const SearchResult({
    required this.id,
    required this.content,
    required this.converseId,
    required this.authorId,
    this.authorUsername,
    this.authorDisplayName,
    required this.createdAt,
  });

  factory SearchResult.fromJson(Map<String, dynamic> json) {
    final author = json['author'] as Map<String, dynamic>?;
    return SearchResult(
      id: json['id'] as String,
      content: json['content'] as String? ?? '',
      converseId: json['converseId'] as String,
      authorId: json['authorId'] as String,
      authorUsername: author?['username'] as String?,
      authorDisplayName: author?['displayName'] as String?,
      createdAt: json['createdAt'] as String,
    );
  }
}

class SearchState {
  final String query;
  final List<SearchResult> results;
  final bool isLoading;
  final String? error;
  final int total;
  final bool hasMore;

  const SearchState({
    this.query = '',
    this.results = const [],
    this.isLoading = false,
    this.error,
    this.total = 0,
    this.hasMore = false,
  });

  SearchState copyWith({
    String? query,
    List<SearchResult>? results,
    bool? isLoading,
    String? error,
    int? total,
    bool? hasMore,
  }) {
    return SearchState(
      query: query ?? this.query,
      results: results ?? this.results,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      total: total ?? this.total,
      hasMore: hasMore ?? this.hasMore,
    );
  }
}

class SearchNotifier extends StateNotifier<SearchState> {
  final Dio _dio;
  final String? converseId; // null = global search
  Timer? _debounceTimer;

  SearchNotifier(this._dio, {this.converseId}) : super(const SearchState());

  void search(String query) {
    _debounceTimer?.cancel();
    if (query.trim().isEmpty) {
      state = const SearchState();
      return;
    }
    state = state.copyWith(query: query, isLoading: true);
    _debounceTimer = Timer(const Duration(milliseconds: 300), () {
      _executeSearch(query.trim());
    });
  }

  Future<void> _executeSearch(String query) async {
    try {
      final params = <String, dynamic>{
        'query': query,
        'limit': 20,
        'offset': 0,
      };
      if (converseId != null) {
        params['converseId'] = converseId;
      }

      final response = await _dio.get(
        '/api/v1/messages/search',
        queryParameters: params,
      );

      final data = response.data as Map<String, dynamic>;
      final results = (data['results'] as List<dynamic>)
          .map((json) => SearchResult.fromJson(json as Map<String, dynamic>))
          .toList();

      state = state.copyWith(
        results: results,
        isLoading: false,
        total: data['total'] as int? ?? results.length,
        hasMore: results.length >= 20,
      );
    } on DioException catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.response?.data?['message']?.toString() ?? e.message,
      );
    }
  }

  Future<void> loadMore() async {
    if (state.isLoading || !state.hasMore) return;
    state = state.copyWith(isLoading: true);

    try {
      final params = <String, dynamic>{
        'query': state.query,
        'limit': 20,
        'offset': state.results.length,
      };
      if (converseId != null) {
        params['converseId'] = converseId;
      }

      final response = await _dio.get(
        '/api/v1/messages/search',
        queryParameters: params,
      );

      final data = response.data as Map<String, dynamic>;
      final results = (data['results'] as List<dynamic>)
          .map((json) => SearchResult.fromJson(json as Map<String, dynamic>))
          .toList();

      state = state.copyWith(
        results: [...state.results, ...results],
        isLoading: false,
        hasMore: results.length >= 20,
      );
    } on DioException catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.response?.data?['message']?.toString() ?? e.message,
      );
    }
  }

  void clear() {
    _debounceTimer?.cancel();
    state = const SearchState();
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    super.dispose();
  }
}

/// Per-converse search provider (converseId → SearchNotifier)
final searchProvider = StateNotifierProvider.family<SearchNotifier, SearchState, String?>(
  (ref, converseId) {
    final dio = ref.read(dioProvider);
    return SearchNotifier(dio, converseId: converseId);
  },
);
