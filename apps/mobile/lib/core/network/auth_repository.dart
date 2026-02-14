import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:dio/dio.dart';
import '../constants/api_endpoints.dart';

class AuthRepository {
  static const _accessTokenKey = 'access_token';
  static const _refreshTokenKey = 'refresh_token';
  static const _userIdKey = 'user_id';

  // On web: use in-memory map (avoids SubtleCrypto OperationError).
  // On mobile: use flutter_secure_storage with OS keychain.
  static final Map<String, String> _memStore = {};
  final FlutterSecureStorage? _storage;

  AuthRepository()
      : _storage = kIsWeb ? null : const FlutterSecureStorage();

  Future<void> _write(String key, String value) async {
    if (kIsWeb) {
      _memStore[key] = value;
    } else {
      await _storage!.write(key: key, value: value);
    }
  }

  Future<String?> _read(String key) async {
    if (kIsWeb) {
      return _memStore[key];
    }
    return _storage!.read(key: key);
  }

  Future<void> _deleteAll() async {
    if (kIsWeb) {
      _memStore.clear();
    } else {
      await _storage!.deleteAll();
    }
  }

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _write(_accessTokenKey, accessToken);
    await _write(_refreshTokenKey, refreshToken);
  }

  Future<String?> get accessToken => _read(_accessTokenKey);
  Future<String?> get refreshToken => _read(_refreshTokenKey);

  Future<void> saveUserId(String userId) => _write(_userIdKey, userId);
  Future<String?> get userId => _read(_userIdKey);

  Future<void> clearAll() => _deleteAll();

  Future<bool> get isLoggedIn async => (await accessToken) != null;

  Future<String?> refreshAccessToken() async {
    final currentRefreshToken = await refreshToken;
    if (currentRefreshToken == null) return null;

    try {
      final dio = Dio(BaseOptions(baseUrl: ApiEndpoints.baseUrl));
      final response = await dio.post(
        ApiEndpoints.refresh,
        data: {'refreshToken': currentRefreshToken},
      );

      final newAccessToken = response.data['accessToken'] as String;
      final newRefreshToken = response.data['refreshToken'] as String;

      await saveTokens(
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      );

      return newAccessToken;
    } on DioException {
      await clearAll();
      return null;
    }
  }
}
