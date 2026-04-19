import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/chat_provider.dart';
import '../../../core/models/converse.dart';
import '../../auth/providers/auth_provider.dart';
import '../widgets/converse_tile.dart';
import 'search_page.dart';

class ConversesListPage extends ConsumerStatefulWidget {
  const ConversesListPage({super.key});

  @override
  ConsumerState<ConversesListPage> createState() => _ConversesListPageState();
}

class _ConversesListPageState extends ConsumerState<ConversesListPage> {
  @override
  void initState() {
    super.initState();
    // Fetch converses on mount
    Future.microtask(() {
      ref.read(conversesProvider.notifier).fetchConverses();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(conversesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('消息'),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.search_rounded),
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const SearchPage(), // global search (no converseId)
                ),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.add_circle_outline_rounded),
            onPressed: () => _showNewChatOptions(context),
          ),
        ],
      ),
      body: _buildBody(state),
    );
  }

  Widget _buildBody(ConversesState state) {
    if (state.isLoading && state.converses.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.error != null && state.converses.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.grey),
            const SizedBox(height: 16),
            Text(state.error!, style: const TextStyle(color: Colors.grey)),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () {
                ref.read(conversesProvider.notifier).fetchConverses();
              },
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (state.converses.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.chat_bubble_outline,
                size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              '开始一段对话',
              style: TextStyle(fontSize: 16, color: Colors.grey.shade600),
            ),
          ],
        ),
      );
    }

    // Sort: pinned first, then by updatedAt
    final sorted = List<Converse>.from(state.converses)
      ..sort((a, b) {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.updatedAt.compareTo(a.updatedAt);
      });

    return RefreshIndicator(
      onRefresh: () async {
        await ref.read(conversesProvider.notifier).fetchConverses();
      },
      child: ListView.separated(
        itemCount: sorted.length,
        separatorBuilder: (_, __) =>
            const Divider(height: 1, indent: 72),
        itemBuilder: (context, index) {
          final converse = sorted[index];
          final currentUserId = ref.read(authProvider).user?.id;
          return ConverseTile(
            converse: converse.toJson(),
            currentUserId: currentUserId,
            onTap: () {
              ref
                  .read(conversesProvider.notifier)
                  .markConverseRead(converse.id);
              context.push('/chat/${converse.id}');
            },
          );
        },
      ),
    );
  }

  void _showNewChatOptions(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.group_add),
                title: const Text('创建群聊'),
                onTap: () {
                  Navigator.pop(ctx);
                  context.push('/chat/new/group');
                },
              ),
              ListTile(
                leading: const Icon(Icons.person_add),
                title: const Text('添加好友'),
                onTap: () {
                  Navigator.pop(ctx);
                  context.push('/contacts/add');
                },
              ),
            ],
          ),
        );
      },
    );
  }
}
