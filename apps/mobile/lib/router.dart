import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'features/auth/pages/login_page.dart';
import 'features/auth/pages/verify_email_page.dart';
import 'features/auth/providers/auth_provider.dart';
import 'features/device/pages/device_list_page.dart';
import 'features/device/pages/command_page.dart';
import 'features/chat/pages/converses_list_page.dart';
import 'features/chat/pages/chat_thread_page.dart';
import 'features/chat/pages/group_detail_page.dart';
import 'features/chat/pages/create_group_page.dart';
import 'features/friends/pages/friends_list_page.dart';
import 'features/friends/pages/add_friend_page.dart';
import 'features/profile/pages/profile_page.dart';
import 'features/shared/widgets/bottom_nav.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/chat',
    refreshListenable: _AuthRefreshNotifier(ref),
    redirect: (context, state) {
      final status = authState.status;
      final loc = state.matchedLocation;

      // Pending email verification → force to verify-email page
      if (status == AuthStatus.pendingVerification) {
        if (loc != '/verify-email') return '/verify-email';
        return null;
      }

      final isAuth = status == AuthStatus.authenticated;
      if (!isAuth && loc != '/login') return '/login';
      if (isAuth && loc == '/login') return '/chat';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginPage(),
      ),
      // Tab pages wrapped with bottom navigation
      ShellRoute(
        builder: (context, state, child) => BottomNavScaffold(child: child),
        routes: [
          GoRoute(
            path: '/chat',
            builder: (context, state) => const ConversesListPage(),
          ),
          GoRoute(
            path: '/contacts',
            builder: (context, state) => const FriendsListPage(),
          ),
          GoRoute(
            path: '/devices',
            builder: (context, state) => const DeviceListPage(),
          ),
          GoRoute(
            path: '/profile',
            builder: (context, state) => ProfilePage(),
          ),
        ],
      ),
      // Full-screen pages (no bottom nav)
      // Static paths MUST come before dynamic :converseId to avoid conflicts
      GoRoute(
        path: '/chat/new/group',
        builder: (context, state) => const CreateGroupPage(),
      ),
      GoRoute(
        path: '/chat/:converseId',
        builder: (context, state) => ChatThreadPage(
          converseId: state.pathParameters['converseId']!,
        ),
      ),
      GoRoute(
        path: '/chat/:converseId/group',
        builder: (context, state) => GroupDetailPage(
          converseId: state.pathParameters['converseId']!,
        ),
      ),
      GoRoute(
        path: '/contacts/add',
        builder: (context, state) => const AddFriendPage(),
      ),
      GoRoute(
        path: '/command/:deviceId',
        builder: (context, state) => CommandPage(
          deviceId: state.pathParameters['deviceId']!,
        ),
      ),
      GoRoute(
        path: '/verify-email',
        builder: (context, state) => const VerifyEmailPage(),
      ),
    ],
  );
});

/// Bridges Riverpod auth state changes to GoRouter's refreshListenable.
class _AuthRefreshNotifier extends ChangeNotifier {
  _AuthRefreshNotifier(this._ref) {
    _ref.listen<AuthState>(authProvider, (_, __) => notifyListeners());
  }
  final Ref _ref;
}
