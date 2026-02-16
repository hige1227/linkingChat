import 'package:flutter/material.dart';

/// 在头像右下角叠加 Bot 标识角标
class BotBadge extends StatelessWidget {
  final Widget child;
  final double badgeSize;

  const BotBadge({
    super.key,
    required this.child,
    this.badgeSize = 16,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        child,
        Positioned(
          right: -2,
          bottom: -2,
          child: Container(
            width: badgeSize,
            height: badgeSize,
            decoration: BoxDecoration(
              color: const Color(0xFF2196F3),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 1.5),
            ),
            child: Icon(
              Icons.smart_toy,
              size: badgeSize * 0.6,
              color: Colors.white,
            ),
          ),
        ),
      ],
    );
  }
}
