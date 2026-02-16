import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../features/chat/providers/chat_provider.dart';

class BottomNavScaffold extends ConsumerStatefulWidget {
  final Widget child;

  const BottomNavScaffold({super.key, required this.child});

  @override
  ConsumerState<BottomNavScaffold> createState() => _BottomNavScaffoldState();
}

class _BottomNavScaffoldState extends ConsumerState<BottomNavScaffold> {
  @override
  Widget build(BuildContext context) {
    final conversesState = ref.watch(conversesProvider);
    final totalUnread = conversesState.converses
        .fold<int>(0, (sum, c) => sum + c.unreadCount);

    return Scaffold(
      body: widget.child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _getSelectedIndex(context),
        onDestinationSelected: (index) => _onTabSelected(context, index),
        destinations: [
          NavigationDestination(
            icon: Badge(
              isLabelVisible: totalUnread > 0,
              label: Text(totalUnread > 99 ? '99+' : '$totalUnread'),
              child: const Icon(Icons.chat_outlined),
            ),
            selectedIcon: Badge(
              isLabelVisible: totalUnread > 0,
              label: Text(totalUnread > 99 ? '99+' : '$totalUnread'),
              child: const Icon(Icons.chat),
            ),
            label: 'Chat',
          ),
          const NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'Contacts',
          ),
          const NavigationDestination(
            icon: Icon(Icons.devices_outlined),
            selectedIcon: Icon(Icons.devices),
            label: 'Devices',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }

  int _getSelectedIndex(BuildContext context) {
    // Determine from current route - simplified
    final location = ModalRoute.of(context)?.settings.name ?? '/chat';
    if (location.startsWith('/contacts')) return 1;
    if (location.startsWith('/devices')) return 2;
    if (location.startsWith('/profile')) return 3;
    return 0;
  }

  void _onTabSelected(BuildContext context, int index) {
    // Use GoRouter for navigation - handled in router.dart
    // This is a simplified version
  }
}
