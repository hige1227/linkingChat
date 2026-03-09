import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../friends/providers/friends_provider.dart';
import '../../../core/network/api_client.dart';
import '../providers/chat_provider.dart';

class CreateGroupPage extends ConsumerStatefulWidget {
  const CreateGroupPage({super.key});

  @override
  ConsumerState<CreateGroupPage> createState() => _CreateGroupPageState();
}

class _CreateGroupPageState extends ConsumerState<CreateGroupPage> {
  final _nameController = TextEditingController();
  final _descController = TextEditingController();
  final Set<String> _selectedIds = {};
  bool _isCreating = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(friendsProvider.notifier).fetchFriends();
    });
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _createGroup() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Please enter a group name');
      return;
    }
    if (_selectedIds.isEmpty) {
      setState(() => _error = 'Please select at least one member');
      return;
    }

    setState(() {
      _isCreating = true;
      _error = null;
    });

    try {
      final dio = ref.read(dioProvider);
      final body = <String, dynamic>{
        'name': name,
        'memberIds': _selectedIds.toList(),
      };
      final desc = _descController.text.trim();
      if (desc.isNotEmpty) {
        body['description'] = desc;
      }

      final response = await dio.post('/api/v1/converses/groups', data: body);
      final data = response.data as Map<String, dynamic>;
      final converseId = data['id'] as String;

      // Refresh converses list
      ref.read(conversesProvider.notifier).fetchConverses();

      if (mounted) {
        // Go back then navigate to the new group chat
        context.pop();
        context.push('/chat/$converseId');
      }
    } on DioException catch (e) {
      setState(() {
        _isCreating = false;
        _error = e.response?.data?['message']?.toString() ?? 'Failed to create group';
      });
    } catch (e) {
      setState(() {
        _isCreating = false;
        _error = 'Failed to create group';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final friendsState = ref.watch(friendsProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Create Group'),
        actions: [
          TextButton(
            onPressed: _isCreating ? null : _createGroup,
            child: _isCreating
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(
                    'Create',
                    style: TextStyle(
                      color: _selectedIds.isNotEmpty
                          ? theme.colorScheme.primary
                          : Colors.grey,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
          ),
        ],
      ),
      body: Column(
        children: [
          // Group name + description inputs
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                TextField(
                  controller: _nameController,
                  decoration: const InputDecoration(
                    labelText: 'Group name *',
                    hintText: 'Enter group name',
                    border: OutlineInputBorder(),
                  ),
                  maxLength: 100,
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _descController,
                  decoration: const InputDecoration(
                    labelText: 'Description (optional)',
                    hintText: 'What is this group about?',
                    border: OutlineInputBorder(),
                  ),
                  maxLength: 500,
                  maxLines: 2,
                ),
              ],
            ),
          ),

          // Error message
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                _error!,
                style: TextStyle(color: theme.colorScheme.error, fontSize: 13),
              ),
            ),

          // Selected count
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                Text(
                  'Select members',
                  style: theme.textTheme.titleSmall,
                ),
                const SizedBox(width: 8),
                if (_selectedIds.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      '${_selectedIds.length}',
                      style: const TextStyle(color: Colors.white, fontSize: 12),
                    ),
                  ),
              ],
            ),
          ),

          const Divider(height: 1),

          // Friends list
          Expanded(
            child: _buildFriendsList(friendsState),
          ),
        ],
      ),
    );
  }

  Widget _buildFriendsList(FriendsState state) {
    if (state.isLoading && state.friends.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.friends.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.people_outline, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              'No friends yet',
              style: TextStyle(fontSize: 16, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 8),
            Text(
              'Add friends first to create a group',
              style: TextStyle(fontSize: 14, color: Colors.grey.shade500),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      itemCount: state.friends.length,
      itemBuilder: (context, index) {
        final friend = state.friends[index];
        final isSelected = _selectedIds.contains(friend.id);

        return CheckboxListTile(
          value: isSelected,
          onChanged: (checked) {
            setState(() {
              if (checked == true) {
                _selectedIds.add(friend.id);
              } else {
                _selectedIds.remove(friend.id);
              }
            });
          },
          secondary: CircleAvatar(
            backgroundColor: Colors.blueGrey,
            child: Text(
              (friend.displayName.isNotEmpty
                      ? friend.displayName
                      : friend.username)
                  .substring(0, 1)
                  .toUpperCase(),
              style: const TextStyle(color: Colors.white),
            ),
          ),
          title: Text(friend.displayName),
          subtitle: Text(
            '@${friend.username}',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
          ),
        );
      },
    );
  }
}
