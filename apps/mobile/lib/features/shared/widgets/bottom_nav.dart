import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../chat/providers/chat_provider.dart';
import '../../friends/providers/friends_provider.dart';

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
    final friendsState = ref.watch(friendsProvider);
    final pendingRequests = friendsState.receivedRequests.length;

    final location = GoRouterState.of(context).matchedLocation;

    return Column(
      children: [
        Expanded(child: widget.child),
        NavigationBar(
          selectedIndex: _getSelectedIndex(location),
          onDestinationSelected: (index) => _onTabSelected(context, index),
          indicatorColor: const Color(0xFFd97757).withValues(alpha: 0.15),
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          destinations: [
            NavigationDestination(
              icon: Badge(
                isLabelVisible: totalUnread > 0,
                label: Text(totalUnread > 99 ? '99+' : '$totalUnread'),
                child: const Icon(Icons.chat_bubble_outline_rounded),
              ),
              selectedIcon: Badge(
                isLabelVisible: totalUnread > 0,
                label: Text(totalUnread > 99 ? '99+' : '$totalUnread'),
                child: const Icon(Icons.chat_bubble_rounded),
              ),
              label: '消息',
            ),
            NavigationDestination(
              icon: Badge(
                isLabelVisible: pendingRequests > 0,
                label: Text(pendingRequests > 99 ? '99+' : '$pendingRequests'),
                child: const Icon(Icons.people_outline_rounded),
              ),
              selectedIcon: Badge(
                isLabelVisible: pendingRequests > 0,
                label: Text(pendingRequests > 99 ? '99+' : '$pendingRequests'),
                child: const Icon(Icons.people_rounded),
              ),
              label: '通讯录',
            ),
            const NavigationDestination(
              icon: Icon(Icons.explore_outlined),
              selectedIcon: Icon(Icons.explore),
              label: '发现',
            ),
            const NavigationDestination(
              icon: Icon(Icons.person_outline_rounded),
              selectedIcon: Icon(Icons.person_rounded),
              label: '我',
            ),
          ],
        ),
      ],
    );
  }

  int _getSelectedIndex(String location) {
    if (location.startsWith('/contacts')) return 1;
    if (location.startsWith('/discover')) return 2;
    if (location.startsWith('/profile')) return 3;
    return 0;
  }

  void _onTabSelected(BuildContext context, int index) {
    switch (index) {
      case 0:
        context.go('/chat');
      case 1:
        context.go('/contacts');
      case 2:
        context.go('/discover');
      case 3:
        context.go('/profile');
    }
  }
}
