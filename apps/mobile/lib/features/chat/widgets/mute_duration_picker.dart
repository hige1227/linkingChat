import 'package:flutter/material.dart';

/// Telegram-style mute duration presets
const _kMutePresets = [
  _Preset(label: '1 min', minutes: 1),
  _Preset(label: '10 min', minutes: 10),
  _Preset(label: '1 hour', minutes: 60),
  _Preset(label: '1 day', minutes: 1440),
  _Preset(label: '1 week', minutes: 10080),
  _Preset(label: '1 month', minutes: 43200),
];

class _Preset {
  final String label;
  final int minutes;

  const _Preset({required this.label, required this.minutes});
}

class MuteDurationPicker extends StatefulWidget {
  final int? initialMinutes;
  final void Function(int durationMinutes) onConfirm;
  final VoidCallback onCancel;

  const MuteDurationPicker({
    super.key,
    this.initialMinutes,
    required this.onConfirm,
    required this.onCancel,
  });

  @override
  State<MuteDurationPicker> createState() => _MuteDurationPickerState();
}

class _MuteDurationPickerState extends State<MuteDurationPicker> {
  int? _selectedPreset;
  late final TextEditingController _customController;
  bool _useCustom = false;

  @override
  void initState() {
    super.initState();
    _customController = TextEditingController();
    if (widget.initialMinutes != null) {
      final presetIndex = _kMutePresets.indexWhere(
        (p) => p.minutes == widget.initialMinutes,
      );
      if (presetIndex >= 0) {
        _selectedPreset = presetIndex;
      } else {
        _useCustom = true;
        _customController.text = widget.initialMinutes.toString();
      }
    }
  }

  @override
  void dispose() {
    _customController.dispose();
    super.dispose();
  }

  int get _selectedMinutes {
    if (_useCustom) {
      return int.tryParse(_customController.text) ?? 0;
    }
    if (_selectedPreset != null) {
      return _kMutePresets[_selectedPreset!].minutes;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              const Icon(Icons.volume_off, size: 24),
              const SizedBox(width: 12),
              Text(
                'Mute Member',
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ],
          ),
          const SizedBox(height: 20),

          // Preset grid
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 3,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 2.2,
            children: List.generate(_kMutePresets.length, (index) {
              final preset = _kMutePresets[index];
              final isSelected = !_useCustom && _selectedPreset == index;
              return _PresetButton(
                label: preset.label,
                isSelected: isSelected,
                onTap: () => setState(() {
                  _selectedPreset = index;
                  _useCustom = false;
                }),
              );
            }),
          ),

          const SizedBox(height: 16),

          // Custom input
          TextField(
            controller: _customController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Custom (minutes)',
              border: OutlineInputBorder(),
              contentPadding: EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 12,
              ),
              suffixText: 'min',
            ),
            onChanged: (value) {
              if (value.isNotEmpty) {
                setState(() {
                  _useCustom = true;
                  _selectedPreset = null;
                });
              }
            },
          ),

          const SizedBox(height: 24),

          // Actions
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed: widget.onCancel,
                child: const Text('Cancel'),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _selectedMinutes > 0
                    ? () => widget.onConfirm(_selectedMinutes)
                    : null,
                child: const Text('Mute'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PresetButton extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _PresetButton({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: isSelected
          ? Theme.of(context).colorScheme.primaryContainer
          : Theme.of(context).colorScheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              color: isSelected
                  ? Theme.of(context).colorScheme.onPrimaryContainer
                  : null,
            ),
          ),
        ),
      ),
    );
  }
}

/// Helper function to show mute picker as bottom sheet
Future<void> showMuteDurationPicker({
  required BuildContext context,
  int? initialMinutes,
  required void Function(int durationMinutes) onConfirm,
}) async {
  await showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) => MuteDurationPicker(
      initialMinutes: initialMinutes,
      onConfirm: (minutes) {
        Navigator.pop(ctx);
        onConfirm(minutes);
      },
      onCancel: () => Navigator.pop(ctx),
    ),
  );
}
