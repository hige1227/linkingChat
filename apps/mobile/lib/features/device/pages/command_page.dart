import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/command_provider.dart';
import '../providers/device_provider.dart';
import '../widgets/command_result_card.dart';

class CommandPage extends ConsumerStatefulWidget {
  final String deviceId;

  const CommandPage({super.key, required this.deviceId});

  @override
  ConsumerState<CommandPage> createState() => _CommandPageState();
}

class _CommandPageState extends ConsumerState<CommandPage> {
  final _commandController = TextEditingController();

  @override
  void dispose() {
    _commandController.dispose();
    super.dispose();
  }

  void _handleExecute() {
    final command = _commandController.text.trim();
    if (command.isEmpty) return;

    ref.read(commandProvider.notifier).executeCommand(
          targetDeviceId: widget.deviceId,
          action: command,
        );
  }

  @override
  Widget build(BuildContext context) {
    final commandStatus = ref.watch(commandProvider);
    final devicesAsync = ref.watch(deviceListProvider);

    final device = devicesAsync.whenOrNull(
      data: (devices) =>
          devices.where((d) => d.id == widget.deviceId).firstOrNull,
    );

    final isExecuting = commandStatus.state == CommandState.sending ||
        commandStatus.state == CommandState.waiting;

    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        title: Text(device?.name ?? 'Remote Command'),
        backgroundColor: const Color(0xFFEDEDED),
        foregroundColor: const Color(0xFF333333),
        elevation: 0.5,
      ),
      body: Column(
        children: [
          if (device != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              color: Colors.white,
              child: Row(
                children: [
                  Icon(
                    device.platformIcon,
                    color: device.isOnline
                        ? const Color(0xFF07C160)
                        : Colors.grey,
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '${device.platformLabel} - ${device.isOnline ? "Online" : "Offline"}',
                    style:
                        const TextStyle(fontSize: 14, color: Colors.grey),
                  ),
                ],
              ),
            ),
          Expanded(
            child: _buildResultArea(commandStatus),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
            decoration: const BoxDecoration(
              color: Color(0xFFF5F5F5),
              border: Border(
                top: BorderSide(color: Color(0xFFDDDDDD), width: 0.5),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: TextField(
                      controller: _commandController,
                      enabled: !isExecuting,
                      decoration: const InputDecoration(
                        hintText: 'Enter shell command...',
                        hintStyle: TextStyle(color: Colors.grey),
                        border: InputBorder.none,
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                      ),
                      style: const TextStyle(fontSize: 15),
                      onSubmitted: (_) => _handleExecute(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  height: 40,
                  child: ElevatedButton(
                    onPressed: isExecuting ? null : _handleExecute,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF07C160),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      padding:
                          const EdgeInsets.symmetric(horizontal: 16),
                    ),
                    child: isExecuting
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Run'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResultArea(CommandStatus status) {
    switch (status.state) {
      case CommandState.idle:
        return const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.terminal, size: 48, color: Colors.grey),
              SizedBox(height: 16),
              Text(
                'Enter a command and tap Run',
                style: TextStyle(color: Colors.grey, fontSize: 15),
              ),
            ],
          ),
        );
      case CommandState.sending:
        return const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Sending command...',
                  style: TextStyle(color: Colors.grey)),
            ],
          ),
        );
      case CommandState.waiting:
        return const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Waiting for desktop...',
                  style: TextStyle(color: Colors.grey)),
            ],
          ),
        );
      case CommandState.completed:
        if (status.result != null) {
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: CommandResultCard(result: status.result!),
          );
        }
        return const SizedBox.shrink();
      case CommandState.error:
        return Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline,
                  size: 48, color: Colors.red),
              const SizedBox(height: 16),
              Text(
                status.errorMessage ?? 'Unknown error',
                style:
                    const TextStyle(color: Colors.red, fontSize: 15),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () =>
                    ref.read(commandProvider.notifier).reset(),
                child: const Text('Retry'),
              ),
            ],
          ),
        );
    }
  }
}
