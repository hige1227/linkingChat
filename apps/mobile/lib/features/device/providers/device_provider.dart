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
    await fetchDevices();

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
            lastSeenAt: online
                ? null
                : DateTime.parse(payload['lastSeenAt'] as String),
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
