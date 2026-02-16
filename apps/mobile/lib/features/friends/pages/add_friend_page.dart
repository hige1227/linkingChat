import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/friends_provider.dart';

class AddFriendPage extends ConsumerStatefulWidget {
  const AddFriendPage({super.key});

  @override
  ConsumerState<AddFriendPage> createState() => _AddFriendPageState();
}

class _AddFriendPageState extends ConsumerState<AddFriendPage> {
  final _searchController = TextEditingController();
  Timer? _debounce;
  String _query = '';
  final _sentIds = <String>{}; // Track which users we've sent requests to

  @override
  void dispose() {
    _searchController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      setState(() => _query = value.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Add Friend'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              onChanged: _onSearchChanged,
              decoration: InputDecoration(
                hintText: 'Search by username or name...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
              ),
              autofocus: true,
            ),
          ),
          Expanded(
            child: _query.length < 2
                ? Center(
                    child: Text(
                      'Type at least 2 characters to search',
                      style: TextStyle(color: Colors.grey.shade500),
                    ),
                  )
                : _buildResults(),
          ),
        ],
      ),
    );
  }

  Widget _buildResults() {
    final results = ref.watch(userSearchProvider(_query));

    return results.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, _) => Center(
        child: Text('Search failed: $err', style: TextStyle(color: Colors.red.shade400)),
      ),
      data: (users) {
        if (users.isEmpty) {
          return Center(
            child: Text(
              'No users found for "$_query"',
              style: TextStyle(color: Colors.grey.shade500),
            ),
          );
        }

        return ListView.builder(
          itemCount: users.length,
          itemBuilder: (context, index) {
            final user = users[index];
            final isSent = _sentIds.contains(user.id);

            return ListTile(
              leading: CircleAvatar(
                child: Text(
                  user.displayName.isNotEmpty
                      ? user.displayName[0].toUpperCase()
                      : '?',
                ),
              ),
              title: Text(user.displayName),
              subtitle: Text('@${user.username}'),
              trailing: isSent
                  ? const Chip(
                      label: Text('Sent', style: TextStyle(fontSize: 12)),
                      backgroundColor: Colors.transparent,
                    )
                  : FilledButton.tonal(
                      onPressed: () => _sendRequest(user.id),
                      child: const Text('Add'),
                    ),
            );
          },
        );
      },
    );
  }

  Future<void> _sendRequest(String userId) async {
    final error = await ref.read(friendsProvider.notifier).sendRequest(userId);
    if (error != null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error)),
        );
      }
    } else {
      setState(() => _sentIds.add(userId));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Friend request sent!')),
        );
      }
    }
  }
}
