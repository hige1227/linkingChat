import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../features/auth/providers/auth_provider.dart';
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
        title: const Text('My Devices'),
        backgroundColor: const Color(0xFFEDEDED),
        foregroundColor: const Color(0xFF333333),
        elevation: 0.5,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(deviceListProvider.notifier).fetchDevices(),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/login');
            },
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
              Text('Load failed: $error'),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () =>
                    ref.read(deviceListProvider.notifier).fetchDevices(),
                child: const Text('Retry'),
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
                    'No devices found\nLogin on desktop first',
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
            separatorBuilder: (_, __) =>
                const Divider(height: 1, indent: 72),
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
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: device.isOnline
              ? const Color(0xFF07C160).withAlpha(25)
              : Colors.grey.withAlpha(25),
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
        '${device.platformLabel} - ${device.isOnline ? "Online" : "Offline"}',
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
