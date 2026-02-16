import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/chat_provider.dart';
import '../../../core/models/converse.dart';
import '../../../core/models/converse_member.dart';
import '../../../core/network/api_client.dart';
import '../../auth/providers/auth_provider.dart';

class GroupDetailPage extends ConsumerStatefulWidget {
  final String converseId;

  const GroupDetailPage({super.key, required this.converseId});

  @override
  ConsumerState<GroupDetailPage> createState() => _GroupDetailPageState();
}

class _GroupDetailPageState extends ConsumerState<GroupDetailPage> {
  bool _isLoading = false;

  Converse? get _converse {
    final state = ref.watch(conversesProvider);
    return state.converses.where((c) => c.id == widget.converseId).firstOrNull;
  }

  String get _myRole {
    final userId = ref.read(authProvider).user?.id ?? '';
    final member = _converse?.members.where((m) => m.userId == userId).firstOrNull;
    return member?.role ?? 'MEMBER';
  }

  bool get _isOwner => _myRole == 'OWNER';
  bool get _isAdmin => _myRole == 'ADMIN';
  bool get _canManage => _isOwner || _isAdmin;

  @override
  Widget build(BuildContext context) {
    final converse = _converse;
    if (converse == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Group Info')),
        body: const Center(child: Text('Group not found')),
      );
    }

    final currentUserId = ref.watch(authProvider).user?.id ?? '';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Group Info'),
        actions: [
          if (_canManage)
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: () => _showEditDialog(converse),
            ),
        ],
      ),
      body: ListView(
        children: [
          // Group header
          Container(
            padding: const EdgeInsets.all(24),
            alignment: Alignment.center,
            child: Column(
              children: [
                CircleAvatar(
                  radius: 40,
                  backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                  child: Text(
                    (converse.name ?? 'G').substring(0, 1).toUpperCase(),
                    style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  converse.name ?? 'Unnamed Group',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                if (converse.description != null && converse.description!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      converse.description!,
                      style: TextStyle(color: Colors.grey.shade600),
                    ),
                  ),
                const SizedBox(height: 4),
                Text(
                  '${converse.memberCount ?? converse.members.length} members',
                  style: TextStyle(color: Colors.grey.shade500, fontSize: 13),
                ),
              ],
            ),
          ),

          const Divider(),

          // Members section
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Members',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),

          ...converse.members.map((member) => _buildMemberTile(member, currentUserId)),

          const Divider(height: 32),

          // Actions
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.logout, color: Colors.orange),
                  title: const Text('Leave Group'),
                  onTap: _isLoading ? null : () => _confirmLeave(),
                ),
                if (_isOwner)
                  ListTile(
                    leading: const Icon(Icons.delete_forever, color: Colors.red),
                    title: const Text('Delete Group', style: TextStyle(color: Colors.red)),
                    onTap: _isLoading ? null : () => _confirmDelete(),
                  ),
              ],
            ),
          ),

          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildMemberTile(ConverseMemberModel member, String currentUserId) {
    final isMe = member.userId == currentUserId;
    final canRemoveThis = _canRemoveMember(member.role);

    return ListTile(
      leading: CircleAvatar(
        child: Text(
          (member.displayName).substring(0, 1).toUpperCase(),
        ),
      ),
      title: Row(
        children: [
          Flexible(
            child: Text(
              member.displayName + (isMe ? ' (you)' : ''),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (member.role != null) ...[
            const SizedBox(width: 8),
            _buildRoleBadge(member.role!),
          ],
        ],
      ),
      subtitle: Text('@${member.username}'),
      trailing: !isMe && canRemoveThis
          ? PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert, size: 20),
              onSelected: (action) => _handleMemberAction(action, member),
              itemBuilder: (context) => [
                if (_isOwner && member.role != 'ADMIN')
                  const PopupMenuItem(value: 'promote', child: Text('Make Admin')),
                if (_isOwner && member.role == 'ADMIN')
                  const PopupMenuItem(value: 'demote', child: Text('Remove Admin')),
                const PopupMenuItem(
                  value: 'remove',
                  child: Text('Remove', style: TextStyle(color: Colors.red)),
                ),
              ],
            )
          : null,
    );
  }

  Widget _buildRoleBadge(String role) {
    Color color;
    switch (role) {
      case 'OWNER':
        color = Colors.amber;
      case 'ADMIN':
        color = Colors.blue;
      default:
        color = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        role.toLowerCase(),
        style: TextStyle(fontSize: 10, color: color, fontWeight: FontWeight.bold),
      ),
    );
  }

  bool _canRemoveMember(String? targetRole) {
    if (targetRole == null) return false;
    if (_isOwner) return targetRole != 'OWNER';
    if (_isAdmin) return targetRole == 'MEMBER';
    return false;
  }

  Future<void> _handleMemberAction(String action, ConverseMemberModel member) async {
    final dio = ref.read(dioProvider);
    setState(() => _isLoading = true);
    try {
      switch (action) {
        case 'promote':
          await dio.patch(
            '/api/v1/converses/groups/${widget.converseId}/members/${member.userId}/role',
            data: {'role': 'ADMIN'},
          );
        case 'demote':
          await dio.patch(
            '/api/v1/converses/groups/${widget.converseId}/members/${member.userId}/role',
            data: {'role': 'MEMBER'},
          );
        case 'remove':
          await dio.delete(
            '/api/v1/converses/groups/${widget.converseId}/members/${member.userId}',
          );
      }
      await ref.read(conversesProvider.notifier).fetchConverses();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Action failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showEditDialog(Converse converse) {
    final nameController = TextEditingController(text: converse.name ?? '');
    final descController = TextEditingController(text: converse.description ?? '');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit Group'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: const InputDecoration(labelText: 'Group Name'),
              maxLength: 100,
            ),
            TextField(
              controller: descController,
              decoration: const InputDecoration(labelText: 'Description'),
              maxLength: 500,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.pop(ctx);
              final dio = ref.read(dioProvider);
              await dio.patch(
                '/api/v1/converses/groups/${widget.converseId}',
                data: {
                  'name': nameController.text.trim(),
                  'description': descController.text.trim(),
                },
              );
              await ref.read(conversesProvider.notifier).fetchConverses();
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _confirmLeave() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave Group'),
        content: const Text('Are you sure you want to leave this group?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.orange),
            onPressed: () async {
              Navigator.pop(ctx);
              final dio = ref.read(dioProvider);
              await dio.post('/api/v1/converses/groups/${widget.converseId}/leave');
              await ref.read(conversesProvider.notifier).fetchConverses();
              if (mounted) context.go('/chat');
            },
            child: const Text('Leave'),
          ),
        ],
      ),
    );
  }

  void _confirmDelete() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Group'),
        content: const Text('This will permanently delete the group for all members. This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () async {
              Navigator.pop(ctx);
              final dio = ref.read(dioProvider);
              await dio.delete('/api/v1/converses/groups/${widget.converseId}');
              await ref.read(conversesProvider.notifier).fetchConverses();
              if (mounted) context.go('/chat');
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }
}
