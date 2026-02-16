import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/friends_provider.dart';

class FriendsListPage extends ConsumerStatefulWidget {
  const FriendsListPage({super.key});

  @override
  ConsumerState<FriendsListPage> createState() => _FriendsListPageState();
}

class _FriendsListPageState extends ConsumerState<FriendsListPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(friendsProvider.notifier).fetchFriends();
      ref.read(friendsProvider.notifier).fetchRequests();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(friendsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Contacts'),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_add),
            onPressed: () => context.push('/contacts/add'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(friendsProvider.notifier).fetchFriends();
          await ref.read(friendsProvider.notifier).fetchRequests();
        },
        child: ListView(
          children: [
            // Pending requests section
            if (state.receivedRequests.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Text(
                  'Friend Requests (${state.receivedRequests.length})',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: Colors.grey.shade600,
                  ),
                ),
              ),
              ...state.receivedRequests.map((req) => ListTile(
                    leading: CircleAvatar(
                      child: Text(
                        req.userName.isNotEmpty ? req.userName[0].toUpperCase() : '?',
                      ),
                    ),
                    title: Text(req.userName),
                    subtitle: req.message != null
                        ? Text(req.message!, maxLines: 1, overflow: TextOverflow.ellipsis)
                        : null,
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.check, color: Colors.green),
                          onPressed: () =>
                              ref.read(friendsProvider.notifier).acceptRequest(req.id),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, color: Colors.red),
                          onPressed: () =>
                              ref.read(friendsProvider.notifier).rejectRequest(req.id),
                        ),
                      ],
                    ),
                  )),
              const Divider(),
            ],

            // Friends list
            if (state.isLoading && state.friends.isEmpty)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (state.friends.isEmpty)
              Center(
                child: Padding(
                  padding: const EdgeInsets.all(48),
                  child: Column(
                    children: [
                      Icon(Icons.people_outline, size: 64, color: Colors.grey.shade400),
                      const SizedBox(height: 12),
                      Text(
                        'No contacts yet',
                        style: TextStyle(color: Colors.grey.shade500),
                      ),
                      const SizedBox(height: 8),
                      FilledButton.icon(
                        onPressed: () => context.push('/contacts/add'),
                        icon: const Icon(Icons.person_add),
                        label: const Text('Add Friend'),
                      ),
                    ],
                  ),
                ),
              )
            else ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Text(
                  'Friends (${state.friends.length})',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: Colors.grey.shade600,
                  ),
                ),
              ),
              ...state.friends.map((friend) => ListTile(
                    leading: Stack(
                      children: [
                        CircleAvatar(
                          child: Text(
                            friend.displayName.isNotEmpty
                                ? friend.displayName[0].toUpperCase()
                                : '?',
                          ),
                        ),
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Container(
                            width: 12,
                            height: 12,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: friend.status == 'ONLINE'
                                  ? Colors.green
                                  : Colors.grey.shade400,
                              border: Border.all(
                                color: Theme.of(context).scaffoldBackgroundColor,
                                width: 2,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    title: Text(friend.displayName),
                    subtitle: Text(
                      '@${friend.username}',
                      style: TextStyle(color: Colors.grey.shade500),
                    ),
                    trailing: Text(
                      friend.status == 'ONLINE' ? 'Online' : '',
                      style: TextStyle(fontSize: 12, color: Colors.green.shade600),
                    ),
                    onTap: () {
                      if (friend.converseId != null) {
                        context.push('/chat/${friend.converseId}');
                      }
                    },
                  )),
            ],
          ],
        ),
      ),
    );
  }
}
