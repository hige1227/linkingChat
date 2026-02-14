import 'package:flutter/material.dart';

class Device {
  final String id;
  final String name;
  final String platform;
  final String status;
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
