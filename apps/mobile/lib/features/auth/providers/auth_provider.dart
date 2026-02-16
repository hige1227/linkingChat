import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/ws_service.dart';
import '../../../core/network/chat_socket_service.dart';
import '../../../core/constants/api_endpoints.dart';
import '../models/auth_response.dart';

enum AuthStatus { initial, authenticated, unauthenticated }

class AuthState {
  final AuthStatus status;
  final UserInfo? user;
  final String? accessToken;

  const AuthState({this.status = AuthStatus.initial, this.user, this.accessToken});

  AuthState copyWith({AuthStatus? status, UserInfo? user, String? accessToken}) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      accessToken: accessToken ?? this.accessToken,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final Ref _ref;

  AuthNotifier(this._ref) : super(const AuthState());

  Future<void> login({
    required String email,
    required String password,
  }) async {
    final dio = _ref.read(dioProvider);
    final authRepo = _ref.read(authRepositoryProvider);

    final response = await dio.post(
      ApiEndpoints.login,
      data: {'email': email, 'password': password},
    );

    final authResponse = AuthResponse.fromJson(response.data);

    await authRepo.saveTokens(
      accessToken: authResponse.accessToken,
      refreshToken: authResponse.refreshToken,
    );
    await authRepo.saveUserId(authResponse.user.id);

    // Connect WebSocket after login
    final wsService = _ref.read(wsServiceProvider);
    await wsService.connect();

    // Connect chat socket after login
    final chatSocket = _ref.read(chatSocketServiceProvider);
    await chatSocket.connect();

    state = AuthState(
      status: AuthStatus.authenticated,
      user: authResponse.user,
      accessToken: authResponse.accessToken,
    );
  }

  Future<bool> checkSavedAuth() async {
    final authRepo = _ref.read(authRepositoryProvider);
    final loggedIn = await authRepo.isLoggedIn;
    if (loggedIn) {
      final wsService = _ref.read(wsServiceProvider);
      await wsService.connect();
      final chatSocket = _ref.read(chatSocketServiceProvider);
      await chatSocket.connect();
      state = const AuthState(status: AuthStatus.authenticated);
      return true;
    }
    state = const AuthState(status: AuthStatus.unauthenticated);
    return false;
  }

  Future<void> logout() async {
    final authRepo = _ref.read(authRepositoryProvider);
    final wsService = _ref.read(wsServiceProvider);
    final chatSocket = _ref.read(chatSocketServiceProvider);
    wsService.disconnect();
    chatSocket.disconnect();
    await authRepo.clearAll();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref);
});
