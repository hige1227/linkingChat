import 'dart:async';
import 'package:flutter/foundation.dart' show debugPrint, kIsWeb;
import 'package:socket_io_client/socket_io_client.dart' as sio;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../constants/api_endpoints.dart';
import 'auth_repository.dart';
import 'api_client.dart';

enum ChatConnectionState { disconnected, connecting, connected, error }

/// Chat namespace Socket.IO service.
/// Separate from WsService (device namespace).
class ChatSocketService {
  sio.Socket? _socket;
  final AuthRepository _authRepo;

  ChatConnectionState _state = ChatConnectionState.disconnected;
  ChatConnectionState get state => _state;

  final _stateController = StreamController<ChatConnectionState>.broadcast();
  Stream<ChatConnectionState> get stateStream => _stateController.stream;

  final Map<String, List<Function(dynamic)>> _listeners = {};

  ChatSocketService({required AuthRepository authRepo}) : _authRepo = authRepo;

  Future<void> connect() async {
    if (_state == ChatConnectionState.connected ||
        _state == ChatConnectionState.connecting) {
      return;
    }
    _setState(ChatConnectionState.connecting);

    final token = await _authRepo.accessToken;
    if (token == null) {
      _setState(ChatConnectionState.error);
      debugPrint('[ChatSocket] No token, cannot connect');
      return;
    }

    final builder = sio.OptionBuilder()
        .setAuth({'token': token, 'deviceType': 'mobile'})
        .enableReconnection()
        .setReconnectionDelay(1000)
        .setReconnectionDelayMax(30000);

    if (!kIsWeb) {
      builder.setTransports(['websocket']);
    }

    _socket = sio.io(
      '${ApiEndpoints.baseUrl}/chat',
      builder.build(),
    );

    _socket!.onConnect((_) {
      _setState(ChatConnectionState.connected);
      debugPrint('[ChatSocket] Connected! socket.id=${_socket?.id}');
    });

    _socket!.onDisconnect((_) {
      _setState(ChatConnectionState.disconnected);
      debugPrint('[ChatSocket] Disconnected');
    });

    _socket!.onConnectError((error) {
      _setState(ChatConnectionState.error);
      debugPrint('[ChatSocket] Connect error: $error');
    });

    _socket!.onReconnect((_) {
      _setState(ChatConnectionState.connected);
      debugPrint('[ChatSocket] Reconnected');
    });

    // Register event listeners
    const chatEvents = [
      'message:new',
      'message:updated',
      'message:deleted',
      'converse:new',
      'converse:updated',
      'presence:changed',
      'notification:new',
      'friend:request',
      'friend:accepted',
      'friend:removed',
      'group:created',
      'group:updated',
      'group:deleted',
      'group:member:added',
      'group:member:removed',
      'group:member:role:updated',
    ];

    for (final event in chatEvents) {
      _socket!.on(event, (data) {
        _notifyListeners(event, data);
      });
    }

    // Debug: log all events
    _socket!.onAny((event, data) {
      debugPrint('[ChatSocket] <<< $event | $data');
    });

    _socket!.connect();
    debugPrint('[ChatSocket] connect() called');
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _setState(ChatConnectionState.disconnected);
  }

  /// Join a converse room to receive messages
  void joinRoom(String converseId) {
    _socket?.emitWithAck('converse:join', {'converseId': converseId},
        ack: (response) {
      debugPrint('[ChatSocket] joinRoom($converseId) ack: $response');
    });
  }

  /// Leave a converse room
  void leaveRoom(String converseId) {
    _socket?.emit('converse:leave', {'converseId': converseId});
  }

  /// Emit typing indicator
  void emitTyping(String converseId, String userId, String username,
      {bool isTyping = true}) {
    _socket?.emit('message:typing', {
      'converseId': converseId,
      'userId': userId,
      'username': username,
      'isTyping': isTyping,
    });
  }

  /// Mark messages as read
  void markRead(String converseId, String lastSeenMessageId) {
    _socket?.emitWithAck('message:read', {
      'converseId': converseId,
      'lastSeenMessageId': lastSeenMessageId,
    }, ack: (response) {
      debugPrint('[ChatSocket] markRead ack: $response');
    });
  }

  /// Update presence status
  void updatePresence(String status) {
    _socket?.emit('presence:update', {'status': status});
  }

  // ──────────────────────────────────────
  // Event listener pattern (same as WsService)
  // ──────────────────────────────────────

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

  void _setState(ChatConnectionState newState) {
    _state = newState;
    _stateController.add(newState);
  }

  void dispose() {
    disconnect();
    _stateController.close();
  }
}

final chatSocketServiceProvider = Provider<ChatSocketService>((ref) {
  final authRepo = ref.read(authRepositoryProvider);
  final service = ChatSocketService(authRepo: authRepo);
  ref.onDispose(() => service.dispose());
  return service;
});
