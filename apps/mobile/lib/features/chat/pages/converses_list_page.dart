import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/chat_provider.dart';
import '../../../core/models/converse.dart';
import '../widgets/converse_tile.dart';

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
        title: const Text('Chats'),
        elevation: 0,
      ),
      body: _buildBody(state),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          // TODO: Navigate to new DM / contact picker
        },
        child: const Icon(Icons.chat),
      ),
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
              'Start a conversation',
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
          return ConverseTile(
            converse: converse.toJson(),
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
}
