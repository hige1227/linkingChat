# Sprint 1 — Phase 3：Mobile（Flutter 最小骨架）

> **负责人**：移动端开发者
>
> **前置条件**：Phase 1 Auth API 已就绪（POST /api/v1/auth/login, /auth/refresh 可用）
>
> **产出**：Flutter 最小 App —— 登录 → 设备列表 → 发送命令 → 查看结果

---

## 任务清单

| # | 任务 | 文件 / 目录 | 依赖 |
|---|------|------------|------|
| 3.1 | 项目结构初始化 | `apps/mobile/lib/` 全目录 | Sprint 0 monorepo |
| 3.2 | 登录页面 | `features/auth/` | 3.1 |
| 3.3 | JWT Token 管理 | `core/network/auth_repository.dart` | 3.2 |
| 3.4 | WebSocket 客户端 | `core/network/ws_service.dart` | 3.3 |
| 3.5 | 设备列表页面 | `features/device/pages/device_list_page.dart` | 3.4 |
| 3.6 | 命令输入页面 | `features/device/pages/command_page.dart` | 3.5 |
| 3.7 | 命令结果显示 | `features/device/widgets/command_result_card.dart` | 3.6 |

---

## 3.1 项目结构初始化

采用 feature-based 目录组织，使用 `go_router` 做路由管理，`flutter_riverpod` 做状态管理。

```
apps/mobile/
├── lib/
│   ├── main.dart
│   ├── app.dart                         # MaterialApp.router 入口
│   ├── router.dart                      # go_router 路由配置
│   │
│   ├── core/
│   │   ├── network/
│   │   │   ├── api_client.dart          # Dio 单例，baseUrl + interceptors
│   │   │   ├── auth_repository.dart     # JWT 存取 + 自动刷新
│   │   │   ├── auth_interceptor.dart    # Dio interceptor：自动附 Bearer token
│   │   │   └── ws_service.dart          # Socket.IO 客户端封装
│   │   ├── constants/
│   │   │   ├── api_endpoints.dart       # REST 端点常量
│   │   │   └── ws_events.dart           # 手动镜像 ws-protocol 事件名
│   │   └── theme/
│   │       └── app_theme.dart           # 主题配色（WeChat 风格）
│   │
│   ├── features/
│   │   ├── auth/
│   │   │   ├── pages/
│   │   │   │   └── login_page.dart
│   │   │   ├── providers/
│   │   │   │   └── auth_provider.dart
│   │   │   └── models/
│   │   │       └── auth_response.dart
│   │   └── device/
│   │       ├── pages/
│   │       │   ├── device_list_page.dart
│   │       │   └── command_page.dart
│   │       ├── providers/
│   │       │   ├── device_provider.dart
│   │       │   └── command_provider.dart
│   │       ├── models/
│   │       │   ├── device.dart
│   │       │   └── command_result.dart
│   │       └── widgets/
│   │           ├── device_tile.dart
│   │           └── command_result_card.dart
│   │
│   └── l10n/                            # Sprint 1 暂不实现 i18n，预留目录
│
├── pubspec.yaml
├── analysis_options.yaml
└── test/
```

### pubspec.yaml 核心依赖

```yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: ^2.5.1
  riverpod_annotation: ^2.3.5
  dio: ^5.4.0
  socket_io_client: ^2.0.3+1
  flutter_secure_storage: ^9.0.0
  go_router: ^14.2.0
  freezed_annotation: ^2.4.1
  json_annotation: ^4.8.1

dev_dependencies:
  flutter_test:
    sdk: flutter
  build_runner: ^2.4.9
  freezed: ^2.5.2
  json_serializable: ^6.7.1
  riverpod_generator: ^2.4.0
  flutter_lints: ^4.0.0
```

### 路由配置

```dart
// lib/router.dart

import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'features/auth/pages/login_page.dart';
import 'features/device/pages/device_list_page.dart';
import 'features/device/pages/command_page.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/login',
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginPage(),
      ),
      GoRoute(
        path: '/devices',
        builder: (context, state) => const DeviceListPage(),
      ),
      GoRoute(
        path: '/command/:deviceId',
        builder: (context, state) => CommandPage(
          deviceId: state.pathParameters['deviceId']!,
        ),
      ),
    ],
  );
});
```

### WS 事件名常量

Flutter 无法直接使用 TypeScript 共享包，需手动镜像 `packages/ws-protocol` 的事件名到 Dart。

```dart
// lib/core/constants/ws_events.dart

class WsEvents {
  // Client → Server
  static const commandSend    = 'device:command:send';
  static const commandCancel  = 'device:command:cancel';

  // Server → Client
  static const commandAck       = 'device:command:ack';
  static const resultDelivered  = 'device:result:delivered';
  static const resultProgress   = 'device:result:progress';
  static const statusChanged    = 'device:status:changed';
}
```

> **同步纪律**：每次 `packages/ws-protocol/src/events.ts` 变更时，同步更新 `ws_events.dart`。Sprint 2 考虑自动代码生成。

---

## 3.2 登录页面

简洁登录表单：邮箱 + 密码，调用 `POST /api/v1/auth/login`，JWT 存入 `flutter_secure_storage`，成功后跳转设备列表。

UI 风格参考微信登录页——干净留白，单色调，居中 logo + 表单。

### API 端点常量

```dart
// lib/core/constants/api_endpoints.dart

class ApiEndpoints {
  static const String baseUrl = 'http://localhost:3008';  // 开发环境
  static const String login   = '/api/v1/auth/login';
  static const String refresh = '/api/v1/auth/refresh';
  static const String devices = '/api/v1/devices';
}
```

### 数据模型

```dart
// lib/features/auth/models/auth_response.dart

class AuthResponse {
  final String accessToken;
  final String refreshToken;
  final UserInfo user;

  AuthResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> json) {
    return AuthResponse(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      user: UserInfo.fromJson(json['user'] as Map<String, dynamic>),
    );
  }
}

class UserInfo {
  final String id;
  final String username;
  final String displayName;

  UserInfo({
    required this.id,
    required this.username,
    required this.displayName,
  });

  factory UserInfo.fromJson(Map<String, dynamic> json) {
    return UserInfo(
      id: json['id'] as String,
      username: json['username'] as String,
      displayName: json['displayName'] as String,
    );
  }
}
```

### 登录页面 Widget

```dart
// lib/features/auth/pages/login_page.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await ref.read(authProvider.notifier).login(
        email: _emailController.text.trim(),
        password: _passwordController.text,
      );
      if (mounted) {
        context.go('/devices');
      }
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
      });
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Logo 区域
                  const Icon(
                    Icons.devices_other,
                    size: 72,
                    color: Color(0xFF07C160), // 微信绿
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'LinkingChat',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF333333),
                    ),
                  ),
                  const SizedBox(height: 48),

                  // 邮箱输入
                  TextFormField(
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                      hintText: '邮箱',
                      prefixIcon: Icon(Icons.email_outlined),
                      border: UnderlineInputBorder(),
                    ),
                    validator: (v) =>
                        v != null && v.contains('@') ? null : '请输入有效邮箱',
                  ),
                  const SizedBox(height: 16),

                  // 密码输入
                  TextFormField(
                    controller: _passwordController,
                    obscureText: true,
                    decoration: const InputDecoration(
                      hintText: '密码',
                      prefixIcon: Icon(Icons.lock_outline),
                      border: UnderlineInputBorder(),
                    ),
                    validator: (v) =>
                        v != null && v.length >= 8 ? null : '密码至少 8 位',
                    onFieldSubmitted: (_) => _handleLogin(),
                  ),
                  const SizedBox(height: 24),

                  // 错误提示
                  if (_errorMessage != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Text(
                        _errorMessage!,
                        style: const TextStyle(color: Colors.red, fontSize: 14),
                      ),
                    ),

                  // 登录按钮
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _handleLogin,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF07C160),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: _isLoading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('登录', style: TextStyle(fontSize: 16)),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
```

---

## 3.3 JWT Token 管理

`AuthRepository` 统一管理 access token 和 refresh token 的存取。配合 Dio Interceptor 实现：

1. 每次请求自动附加 `Authorization: Bearer <accessToken>`
2. 收到 401 时自动用 refresh token 换取新 access token 并重试原请求
3. refresh token 也过期则清除存储、跳转登录页

```dart
// lib/core/network/auth_repository.dart

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:dio/dio.dart';
import '../constants/api_endpoints.dart';

class AuthRepository {
  static const _accessTokenKey = 'access_token';
  static const _refreshTokenKey = 'refresh_token';
  static const _userIdKey = 'user_id';

  final FlutterSecureStorage _storage;

  AuthRepository({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  // ── Token 存取 ────────────────────────────────

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    await Future.wait([
      _storage.write(key: _accessTokenKey, value: accessToken),
      _storage.write(key: _refreshTokenKey, value: refreshToken),
    ]);
  }

  Future<String?> get accessToken => _storage.read(key: _accessTokenKey);
  Future<String?> get refreshToken => _storage.read(key: _refreshTokenKey);

  Future<void> saveUserId(String userId) =>
      _storage.write(key: _userIdKey, value: userId);

  Future<String?> get userId => _storage.read(key: _userIdKey);

  Future<void> clearAll() => _storage.deleteAll();

  Future<bool> get isLoggedIn async => (await accessToken) != null;

  // ── Token 刷新 ────────────────────────────────

  Future<String?> refreshAccessToken() async {
    final currentRefreshToken = await refreshToken;
    if (currentRefreshToken == null) return null;

    try {
      // 使用独立 Dio 实例，避免拦截器循环
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
      // refresh token 也过期，需重新登录
      await clearAll();
      return null;
    }
  }
}
```

### Dio Interceptor

```dart
// lib/core/network/auth_interceptor.dart

import 'package:dio/dio.dart';
import 'auth_repository.dart';

class AuthInterceptor extends QueuedInterceptor {
  final AuthRepository _authRepo;
  final Dio _dio;

  AuthInterceptor({
    required AuthRepository authRepo,
    required Dio dio,
  })  : _authRepo = authRepo,
        _dio = dio;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _authRepo.accessToken;
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode != 401) {
      return handler.next(err);
    }

    // 尝试刷新 token
    final newToken = await _authRepo.refreshAccessToken();
    if (newToken == null) {
      // refresh 也失败，需重新登录（由 UI 层监听 authState 跳转）
      return handler.next(err);
    }

    // 用新 token 重试原请求
    final options = err.requestOptions;
    options.headers['Authorization'] = 'Bearer $newToken';

    try {
      final response = await _dio.fetch(options);
      return handler.resolve(response);
    } on DioException catch (e) {
      return handler.next(e);
    }
  }
}
```

### API Client 初始化

```dart
// lib/core/network/api_client.dart

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../constants/api_endpoints.dart';
import 'auth_repository.dart';
import 'auth_interceptor.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository();
});

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(BaseOptions(
    baseUrl: ApiEndpoints.baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 10),
    headers: {'Content-Type': 'application/json'},
  ));

  final authRepo = ref.read(authRepositoryProvider);
  dio.interceptors.add(AuthInterceptor(authRepo: authRepo, dio: dio));

  return dio;
});
```

### Auth Provider

```dart
// lib/features/auth/providers/auth_provider.dart

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/constants/api_endpoints.dart';
import '../models/auth_response.dart';

enum AuthStatus { initial, authenticated, unauthenticated }

class AuthState {
  final AuthStatus status;
  final UserInfo? user;

  const AuthState({this.status = AuthStatus.initial, this.user});

  AuthState copyWith({AuthStatus? status, UserInfo? user}) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
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

    state = AuthState(
      status: AuthStatus.authenticated,
      user: authResponse.user,
    );
  }

  Future<void> logout() async {
    final authRepo = _ref.read(authRepositoryProvider);
    await authRepo.clearAll();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref);
});
```

---

## 3.4 WebSocket 客户端

使用 `socket_io_client` 包连接 Cloud Brain 的 `/device` 命名空间。JWT 通过 `auth.token` 字段在握手时传递（与 websocket-protocol.md §2.1 一致）。

```dart
// lib/core/network/ws_service.dart

import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../constants/api_endpoints.dart';
import '../constants/ws_events.dart';
import 'auth_repository.dart';
import 'api_client.dart';

enum WsConnectionState { disconnected, connecting, connected, error }

class WsService {
  io.Socket? _socket;
  final AuthRepository _authRepo;

  WsConnectionState _state = WsConnectionState.disconnected;
  WsConnectionState get state => _state;

  // 事件回调注册表
  final Map<String, List<Function(dynamic)>> _listeners = {};

  WsService({required AuthRepository authRepo}) : _authRepo = authRepo;

  // ── 连接管理 ────────────────────────────────

  Future<void> connect() async {
    if (_state == WsConnectionState.connected ||
        _state == WsConnectionState.connecting) {
      return;
    }
    _state = WsConnectionState.connecting;

    final token = await _authRepo.accessToken;
    if (token == null) {
      _state = WsConnectionState.error;
      return;
    }

    _socket = io.io(
      '${ApiEndpoints.baseUrl}/device',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token, 'deviceType': 'mobile'})
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(30000)
          .build(),
    );

    _socket!.onConnect((_) {
      _state = WsConnectionState.connected;
      _notifyListeners('connection', {'state': 'connected'});
    });

    _socket!.onDisconnect((_) {
      _state = WsConnectionState.disconnected;
      _notifyListeners('connection', {'state': 'disconnected'});
    });

    _socket!.onConnectError((error) {
      _state = WsConnectionState.error;
      _notifyListeners('connection', {'state': 'error', 'error': error});
    });

    _socket!.onReconnect((_) {
      _state = WsConnectionState.connected;
      _notifyListeners('connection', {'state': 'reconnected'});
    });

    // 注册服务端推送事件
    _socket!.on(WsEvents.resultDelivered, (data) {
      _notifyListeners(WsEvents.resultDelivered, data);
    });

    _socket!.on(WsEvents.resultProgress, (data) {
      _notifyListeners(WsEvents.resultProgress, data);
    });

    _socket!.on(WsEvents.statusChanged, (data) {
      _notifyListeners(WsEvents.statusChanged, data);
    });

    _socket!.on(WsEvents.commandAck, (data) {
      _notifyListeners(WsEvents.commandAck, data);
    });

    _socket!.connect();
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _state = WsConnectionState.disconnected;
  }

  // ── 发送命令 ────────────────────────────────

  void sendCommand({
    required String requestId,
    required String targetDeviceId,
    required String action,
    String type = 'shell',
    int timeout = 30000,
  }) {
    _socket?.emit(WsEvents.commandSend, {
      'requestId': requestId,
      'timestamp': DateTime.now().toUtc().toIso8601String(),
      'data': {
        'commandId': requestId, // 由客户端生成 cuid
        'targetDeviceId': targetDeviceId,
        'type': type,
        'action': action,
        'timeout': timeout,
      },
    });
  }

  // ── 事件监听 ────────────────────────────────

  void on(String event, Function(dynamic) callback) {
    _listeners.putIfAbsent(event, () => []);
    _listeners[event]!.add(callback);
  }

  void off(String event, [Function(dynamic)? callback]) {
    if (callback != null) {
      _listeners[event]?.remove(callback);
    } else {
      _listeners.remove(event);
    }
  }

  void _notifyListeners(String event, dynamic data) {
    final callbacks = _listeners[event];
    if (callbacks != null) {
      for (final cb in callbacks) {
        cb(data);
      }
    }
  }
}

// ── Riverpod Provider ────────────────────────────

final wsServiceProvider = Provider<WsService>((ref) {
  final authRepo = ref.read(authRepositoryProvider);
  return WsService(authRepo: authRepo);
});
```

> **重连策略**：Socket.IO 内建指数退避重连（1s → 30s max）。重连后服务端会自动通过 `handleConnection` 重新加入 `u-{userId}` 房间。

---

## 3.5 设备列表页面

通过 `GET /api/v1/devices` 拉取设备列表，同时监听 `device:status:changed` 事件实时更新设备在线状态。

### 设备数据模型

```dart
// lib/features/device/models/device.dart

class Device {
  final String id;
  final String name;
  final String platform; // "darwin" | "win32" | "linux"
  final String status;   // "ONLINE" | "OFFLINE"
  final DateTime? lastSeenAt;

  Device({
    required this.id,
    required this.name,
    required this.platform,
    required this.status,
    this.lastSeenAt,
  });

  bool get isOnline => status == 'ONLINE';

  IconData get platformIcon {
    switch (platform) {
      case 'darwin':
        return Icons.laptop_mac;
      case 'win32':
        return Icons.desktop_windows;
      case 'linux':
        return Icons.computer;
      default:
        return Icons.devices;
    }
  }

  String get platformLabel {
    switch (platform) {
      case 'darwin':
        return 'macOS';
      case 'win32':
        return 'Windows';
      case 'linux':
        return 'Linux';
      default:
        return platform;
    }
  }

  factory Device.fromJson(Map<String, dynamic> json) {
    return Device(
      id: json['id'] as String,
      name: json['name'] as String,
      platform: json['platform'] as String,
      status: json['status'] as String,
      lastSeenAt: json['lastSeenAt'] != null
          ? DateTime.parse(json['lastSeenAt'] as String)
          : null,
    );
  }

  Device copyWith({String? status, DateTime? lastSeenAt}) {
    return Device(
      id: id,
      name: name,
      platform: platform,
      status: status ?? this.status,
      lastSeenAt: lastSeenAt ?? this.lastSeenAt,
    );
  }
}
```

> 注意：`platformIcon` 用了 `Icons.*` 快速引用，实际文件顶部需 `import 'package:flutter/material.dart';`。

### Device Provider

```dart
// lib/features/device/providers/device_provider.dart

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/ws_service.dart';
import '../../../core/constants/api_endpoints.dart';
import '../../../core/constants/ws_events.dart';
import '../models/device.dart';

class DeviceListNotifier extends StateNotifier<AsyncValue<List<Device>>> {
  final Ref _ref;

  DeviceListNotifier(this._ref) : super(const AsyncValue.loading()) {
    _init();
  }

  Future<void> _init() async {
    // 初始加载
    await fetchDevices();

    // 监听实时状态变更
    final wsService = _ref.read(wsServiceProvider);
    wsService.on(WsEvents.statusChanged, _handleStatusChanged);
  }

  Future<void> fetchDevices() async {
    try {
      final dio = _ref.read(dioProvider);
      final response = await dio.get(ApiEndpoints.devices);

      final devices = (response.data as List)
          .map((json) => Device.fromJson(json as Map<String, dynamic>))
          .toList();

      state = AsyncValue.data(devices);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  void _handleStatusChanged(dynamic data) {
    final payload = data as Map<String, dynamic>;
    final deviceId = payload['deviceId'] as String;
    final online = payload['online'] as bool;

    state.whenData((devices) {
      final updated = devices.map((d) {
        if (d.id == deviceId) {
          return d.copyWith(
            status: online ? 'ONLINE' : 'OFFLINE',
            lastSeenAt:
                online ? null : DateTime.parse(payload['lastSeenAt'] as String),
          );
        }
        return d;
      }).toList();

      state = AsyncValue.data(updated);
    });
  }

  @override
  void dispose() {
    final wsService = _ref.read(wsServiceProvider);
    wsService.off(WsEvents.statusChanged);
    super.dispose();
  }
}

final deviceListProvider =
    StateNotifierProvider<DeviceListNotifier, AsyncValue<List<Device>>>((ref) {
  return DeviceListNotifier(ref);
});
```

### DeviceListPage Widget

```dart
// lib/features/device/pages/device_list_page.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/device_provider.dart';
import '../models/device.dart';

class DeviceListPage extends ConsumerWidget {
  const DeviceListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final devicesAsync = ref.watch(deviceListProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        title: const Text('我的设备'),
        backgroundColor: const Color(0xFFEDEDED),
        foregroundColor: const Color(0xFF333333),
        elevation: 0.5,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(deviceListProvider.notifier).fetchDevices(),
          ),
        ],
      ),
      body: devicesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
              const SizedBox(height: 16),
              Text('加载失败: $error'),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () =>
                    ref.read(deviceListProvider.notifier).fetchDevices(),
                child: const Text('重试'),
              ),
            ],
          ),
        ),
        data: (devices) {
          if (devices.isEmpty) {
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.devices, size: 64, color: Colors.grey),
                  SizedBox(height: 16),
                  Text(
                    '暂无设备\n请先在桌面端登录',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey, fontSize: 16),
                  ),
                ],
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: devices.length,
            separatorBuilder: (_, __) => const Divider(height: 1, indent: 72),
            itemBuilder: (context, index) {
              final device = devices[index];
              return _DeviceTile(device: device);
            },
          );
        },
      ),
    );
  }
}

class _DeviceTile extends StatelessWidget {
  final Device device;

  const _DeviceTile({required this.device});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: device.isOnline
              ? const Color(0xFF07C160).withOpacity(0.1)
              : Colors.grey.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(
          device.platformIcon,
          color: device.isOnline ? const Color(0xFF07C160) : Colors.grey,
          size: 28,
        ),
      ),
      title: Text(
        device.name,
        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
      ),
      subtitle: Text(
        '${device.platformLabel} - ${device.isOnline ? "在线" : "离线"}',
        style: TextStyle(
          color: device.isOnline ? const Color(0xFF07C160) : Colors.grey,
          fontSize: 13,
        ),
      ),
      trailing: device.isOnline
          ? const Icon(Icons.chevron_right, color: Colors.grey)
          : null,
      onTap: device.isOnline
          ? () => context.push('/command/${device.id}')
          : null,
    );
  }
}
```

---

## 3.6 命令输入页面

文本输入框 + 设备选择器（从设备列表页点进来时已选定设备）+ "执行"按钮。发送 `device:command:send` 事件后进入 loading 状态，等待结果返回。

### 命令结果模型

```dart
// lib/features/device/models/command_result.dart

class CommandResult {
  final String commandId;
  final String status;   // 'success' | 'error' | 'partial' | 'cancelled'
  final String? output;
  final int? exitCode;
  final String? errorMessage;
  final int executionTimeMs;

  CommandResult({
    required this.commandId,
    required this.status,
    this.output,
    this.exitCode,
    this.errorMessage,
    required this.executionTimeMs,
  });

  bool get isSuccess => status == 'success';
  bool get isError => status == 'error';

  factory CommandResult.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as Map<String, dynamic>?;
    final error = json['error'] as Map<String, dynamic>?;

    return CommandResult(
      commandId: json['commandId'] as String,
      status: json['status'] as String,
      output: data?['output'] as String?,
      exitCode: data?['exitCode'] as int?,
      errorMessage: error?['message'] as String?,
      executionTimeMs: json['executionTimeMs'] as int,
    );
  }
}
```

### Command Provider

```dart
// lib/features/device/providers/command_provider.dart

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/ws_service.dart';
import '../../../core/constants/ws_events.dart';
import '../models/command_result.dart';

enum CommandState { idle, sending, waiting, completed, error }

class CommandStatus {
  final CommandState state;
  final CommandResult? result;
  final String? errorMessage;

  const CommandStatus({
    this.state = CommandState.idle,
    this.result,
    this.errorMessage,
  });

  CommandStatus copyWith({
    CommandState? state,
    CommandResult? result,
    String? errorMessage,
  }) {
    return CommandStatus(
      state: state ?? this.state,
      result: result ?? this.result,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }
}

class CommandNotifier extends StateNotifier<CommandStatus> {
  final Ref _ref;
  String? _currentCommandId;

  CommandNotifier(this._ref) : super(const CommandStatus()) {
    _listenForResults();
  }

  void _listenForResults() {
    final wsService = _ref.read(wsServiceProvider);

    wsService.on(WsEvents.resultDelivered, (data) {
      final result =
          CommandResult.fromJson(data as Map<String, dynamic>);

      if (result.commandId == _currentCommandId) {
        state = CommandStatus(
          state: CommandState.completed,
          result: result,
        );
      }
    });

    wsService.on(WsEvents.commandAck, (data) {
      final payload = data as Map<String, dynamic>;
      if (payload['commandId'] == _currentCommandId) {
        state = state.copyWith(state: CommandState.waiting);
      }
    });
  }

  Future<void> executeCommand({
    required String targetDeviceId,
    required String action,
  }) async {
    // 生成简易唯一 ID（PoC 阶段，后续替换为 cuid）
    _currentCommandId =
        'cmd_${DateTime.now().millisecondsSinceEpoch}';

    state = const CommandStatus(state: CommandState.sending);

    final wsService = _ref.read(wsServiceProvider);
    wsService.sendCommand(
      requestId: _currentCommandId!,
      targetDeviceId: targetDeviceId,
      action: action,
    );

    // 超时处理：30 秒无响应则报错
    Future.delayed(const Duration(seconds: 30), () {
      if (state.state == CommandState.sending ||
          state.state == CommandState.waiting) {
        state = const CommandStatus(
          state: CommandState.error,
          errorMessage: '命令执行超时（30 秒无响应）',
        );
      }
    });
  }

  void reset() {
    _currentCommandId = null;
    state = const CommandStatus();
  }

  @override
  void dispose() {
    final wsService = _ref.read(wsServiceProvider);
    wsService.off(WsEvents.resultDelivered);
    wsService.off(WsEvents.commandAck);
    super.dispose();
  }
}

final commandProvider =
    StateNotifierProvider<CommandNotifier, CommandStatus>((ref) {
  return CommandNotifier(ref);
});
```

### CommandPage Widget

```dart
// lib/features/device/pages/command_page.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/command_provider.dart';
import '../providers/device_provider.dart';
import '../widgets/command_result_card.dart';

class CommandPage extends ConsumerStatefulWidget {
  final String deviceId;

  const CommandPage({super.key, required this.deviceId});

  @override
  ConsumerState<CommandPage> createState() => _CommandPageState();
}

class _CommandPageState extends ConsumerState<CommandPage> {
  final _commandController = TextEditingController();

  @override
  void initState() {
    super.initState();
    // 确保 WS 已连接
    final wsService = ref.read(wsServiceProvider);
    wsService.connect();
  }

  @override
  void dispose() {
    _commandController.dispose();
    super.dispose();
  }

  void _handleExecute() {
    final command = _commandController.text.trim();
    if (command.isEmpty) return;

    ref.read(commandProvider.notifier).executeCommand(
          targetDeviceId: widget.deviceId,
          action: command,
        );
  }

  @override
  Widget build(BuildContext context) {
    final commandStatus = ref.watch(commandProvider);
    final devicesAsync = ref.watch(deviceListProvider);

    // 从设备列表中找到当前设备
    final device = devicesAsync.whenOrNull(
      data: (devices) => devices.where((d) => d.id == widget.deviceId).firstOrNull,
    );

    final isExecuting = commandStatus.state == CommandState.sending ||
        commandStatus.state == CommandState.waiting;

    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        title: Text(device?.name ?? '远程命令'),
        backgroundColor: const Color(0xFFEDEDED),
        foregroundColor: const Color(0xFF333333),
        elevation: 0.5,
      ),
      body: Column(
        children: [
          // 设备信息栏
          if (device != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              color: Colors.white,
              child: Row(
                children: [
                  Icon(
                    device.platformIcon,
                    color: device.isOnline
                        ? const Color(0xFF07C160)
                        : Colors.grey,
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '${device.platformLabel} - ${device.isOnline ? "在线" : "离线"}',
                    style: const TextStyle(fontSize: 14, color: Colors.grey),
                  ),
                ],
              ),
            ),

          // 命令结果展示区域
          Expanded(
            child: _buildResultArea(commandStatus),
          ),

          // 底部命令输入栏（仿微信聊天输入栏）
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
            decoration: const BoxDecoration(
              color: Color(0xFFF5F5F5),
              border: Border(
                top: BorderSide(color: Color(0xFFDDDDDD), width: 0.5),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: TextField(
                      controller: _commandController,
                      enabled: !isExecuting,
                      decoration: const InputDecoration(
                        hintText: '输入 Shell 命令...',
                        hintStyle: TextStyle(color: Colors.grey),
                        border: InputBorder.none,
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                      ),
                      style: const TextStyle(fontSize: 15),
                      onSubmitted: (_) => _handleExecute(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  height: 40,
                  child: ElevatedButton(
                    onPressed: isExecuting ? null : _handleExecute,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF07C160),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                    ),
                    child: isExecuting
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('执行'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResultArea(CommandStatus status) {
    switch (status.state) {
      case CommandState.idle:
        return const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.terminal, size: 48, color: Colors.grey),
              SizedBox(height: 16),
              Text(
                '输入命令并点击执行',
                style: TextStyle(color: Colors.grey, fontSize: 15),
              ),
            ],
          ),
        );
      case CommandState.sending:
        return const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('正在发送命令...', style: TextStyle(color: Colors.grey)),
            ],
          ),
        );
      case CommandState.waiting:
        return const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('等待桌面端执行...', style: TextStyle(color: Colors.grey)),
            ],
          ),
        );
      case CommandState.completed:
        if (status.result != null) {
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: CommandResultCard(result: status.result!),
          );
        }
        return const SizedBox.shrink();
      case CommandState.error:
        return Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
              const SizedBox(height: 16),
              Text(
                status.errorMessage ?? '未知错误',
                style: const TextStyle(color: Colors.red, fontSize: 15),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => ref.read(commandProvider.notifier).reset(),
                child: const Text('重试'),
              ),
            ],
          ),
        );
    }
  }
}
```

---

## 3.7 命令结果显示

监听 `device:result:delivered` 事件（已在 3.6 的 CommandNotifier 中完成），将结果渲染为可滚动的卡片。区分成功/失败状态，显示执行耗时。

```dart
// lib/features/device/widgets/command_result_card.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/command_result.dart';

class CommandResultCard extends StatelessWidget {
  final CommandResult result;

  const CommandResultCard({super.key, required this.result});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 状态头部
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: result.isSuccess
                  ? const Color(0xFF07C160).withOpacity(0.08)
                  : Colors.red.withOpacity(0.08),
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(12)),
            ),
            child: Row(
              children: [
                Icon(
                  result.isSuccess
                      ? Icons.check_circle
                      : Icons.error,
                  color: result.isSuccess
                      ? const Color(0xFF07C160)
                      : Colors.red,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  result.isSuccess ? '执行成功' : '执行失败',
                  style: TextStyle(
                    color: result.isSuccess
                        ? const Color(0xFF07C160)
                        : Colors.red,
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                  ),
                ),
                const Spacer(),
                Text(
                  '${result.executionTimeMs} ms',
                  style: const TextStyle(color: Colors.grey, fontSize: 13),
                ),
              ],
            ),
          ),

          // 输出内容
          if (result.output != null && result.output!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        '输出',
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      GestureDetector(
                        onTap: () {
                          Clipboard.setData(
                              ClipboardData(text: result.output!));
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('已复制到剪贴板'),
                              duration: Duration(seconds: 1),
                            ),
                          );
                        },
                        child: const Row(
                          children: [
                            Icon(Icons.copy, size: 14, color: Colors.grey),
                            SizedBox(width: 4),
                            Text('复制',
                                style: TextStyle(
                                    color: Colors.grey, fontSize: 12)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E1E1E),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: SelectableText(
                      result.output!,
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 13,
                        color: Color(0xFFD4D4D4),
                        height: 1.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // 错误信息
          if (result.errorMessage != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: Colors.red.withOpacity(0.2),
                  ),
                ),
                child: Text(
                  result.errorMessage!,
                  style: const TextStyle(color: Colors.red, fontSize: 13),
                ),
              ),
            ),

          // Exit Code
          if (result.exitCode != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Text(
                'Exit Code: ${result.exitCode}',
                style: const TextStyle(color: Colors.grey, fontSize: 12),
              ),
            ),
        ],
      ),
    );
  }
}
```

---

## 设计说明

### UI 风格

Sprint 1 是 PoC 级别，但应建立视觉方向。整体参考微信/WhatsApp 的设计语言：

- **配色**：主色 `#07C160`（微信绿），背景 `#F5F5F5`，文字 `#333333`
- **导航栏**：浅灰底色 `#EDEDED`，无阴影或极细分割线
- **列表**：白底卡片，左侧图标 + 右侧箭头，分割线内缩
- **输入栏**：底部固定，灰色背景，圆角白色输入框 + 绿色按钮
- **字体**：系统默认，不引入自定义字体
- **终端输出**：深色底 `#1E1E1E`，等宽字体，模拟终端视觉

### 类型同步纪律

Flutter（Dart）无法直接消费 `packages/ws-protocol` 和 `packages/shared` 中的 TypeScript 类型定义。Sprint 1 采用手动镜像策略：

| TypeScript 源 | Dart 镜像 |
|---------------|-----------|
| `ws-protocol/src/events.ts` | `core/constants/ws_events.dart` |
| `ws-protocol/src/payloads/device.payloads.ts` | `features/device/models/` 下各模型 |
| `shared/src/schemas/user.schema.ts` | `features/auth/models/auth_response.dart` |

每次 TypeScript 类型变更后必须同步更新对应 Dart 文件。Sprint 2 考虑使用代码生成工具自动化此流程。

---

## 完成标准

- [ ] 登录页面可用，JWT 安全存储于 `flutter_secure_storage`
- [ ] 设备列表页显示在线设备，监听 `device:status:changed` 实时更新状态
- [ ] 命令输入页包含设备信息栏 + 命令输入框 + 执行按钮
- [ ] 执行命令后结果在 3 秒内显示（满足性能目标 `Remote action < 3s`）
- [ ] 错误状态正确处理：设备离线时不可点击、命令超时提示、网络错误重试
