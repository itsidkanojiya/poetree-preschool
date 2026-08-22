import 'package:flutter/material.dart';

/// Something that answers a small finger.
///
/// A tap target that does nothing until its screen changes reads as broken to a
/// three-year-old, who will tap it again — and the second tap is the one that
/// lands somewhere unintended. This presses in under the thumb and lets go, so
/// the answer arrives before the navigation does.
///
/// Deliberately small: 4% and 90 milliseconds. Anything more is a toy in its
/// own right, and the child came here for what is behind it.
class Squish extends StatefulWidget {
  const Squish({super.key, required this.child, this.onTap});

  final Widget child;
  final VoidCallback? onTap;

  @override
  State<Squish> createState() => _SquishState();
}

class _SquishState extends State<Squish> {
  bool _down = false;

  void _set(bool value) {
    if (_down != value && mounted) setState(() => _down = value);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: widget.onTap == null ? null : (_) => _set(true),
      onTapUp: widget.onTap == null ? null : (_) => _set(false),
      onTapCancel: () => _set(false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _down ? 0.96 : 1,
        duration: const Duration(milliseconds: 90),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}
