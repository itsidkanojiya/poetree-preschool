import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// The parent app's bottom bar on a phone: Home, Learning, Progress, Settings.
///
/// Drawn to the designer's bar — white, rounded along the top, a soft shadow;
/// the chosen tab warm orange on a pale cream pill, the others a quiet
/// blue-grey. Each tab is a quarter of the bar and the full height of it, so a
/// small thumb cannot miss.
///
/// It holds no selection of its own. [selected] is the shell's tab, the one a
/// notification also sets, so the bar can never show one tab while the page
/// shows another.
class ParentTabBar extends StatelessWidget {
  const ParentTabBar({
    required this.selected,
    required this.onSelect,
    super.key,
  });

  final int selected;
  final ValueChanged<int> onSelect;

  /// In the shell's order: the index is the tab.
  static const _tabs = [
    ('home', 'Home'),
    ('learning', 'Learning'),
    ('progress', 'Progress'),
    ('settings', 'Settings'),
  ];

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final surface = dark
        ? Theme.of(context).navigationBarTheme.backgroundColor ??
              Theme.of(context).colorScheme.surface
        : Colors.white;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF1D2560).withValues(alpha: dark ? 0.3 : 0.06),
            blurRadius: 20,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        // Above the gesture bar or the buttons, whichever the phone has, and
        // never flush to the edge on a phone that reports no inset.
        minimum: const EdgeInsets.only(bottom: 8),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(10, 10, 10, 2),
          child: Row(
            children: [
              for (final (index, (icon, label)) in _tabs.indexed)
                Expanded(
                  child: _Tab(
                    icon: icon,
                    label: label,
                    active: index == selected,
                    dark: dark,
                    onTap: () => onSelect(index),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({
    required this.icon,
    required this.label,
    required this.active,
    required this.dark,
    required this.onTap,
  });

  final String icon;
  final String label;
  final bool active;
  final bool dark;
  final VoidCallback onTap;

  static const _orange = Color(0xFFF28C1B);
  static const _cream = Color(0xFFFFF0DA);
  static const _quiet = Color(0xFF7A86A8);
  static const _quietDark = Color(0xFFA3AECB);

  static const _motion = Duration(milliseconds: 220);

  @override
  Widget build(BuildContext context) {
    final color = active ? _orange : (dark ? _quietDark : _quiet);

    return Semantics(
      button: true,
      selected: active,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: AnimatedContainer(
            duration: _motion,
            curve: Curves.easeOutCubic,
            height: 66,
            decoration: BoxDecoration(
              color: active
                  ? (dark ? _orange.withValues(alpha: 0.18) : _cream)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(22),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AnimatedSwitcher(
                  duration: _motion,
                  transitionBuilder: (child, animation) => ScaleTransition(
                    scale: Tween<double>(
                      begin: 0.85,
                      end: 1,
                    ).animate(animation),
                    child: FadeTransition(opacity: animation, child: child),
                  ),
                  child: SvgPicture.asset(
                    'assets/images/bottom_nav/${active ? '${icon}_filled' : icon}.svg',
                    key: ValueKey('$icon-$active'),
                    width: 28,
                    height: 28,
                    // Through currentColor rather than a colour filter, so a
                    // filled icon's own white — the hole in the gear — stays
                    // white.
                    theme: SvgTheme(currentColor: color),
                  ),
                ),
                const SizedBox(height: 4),
                // Shrinks rather than wraps on the narrowest phones.
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: AnimatedDefaultTextStyle(
                    duration: _motion,
                    style: TextStyle(
                      fontFamily: Theme.of(
                        context,
                      ).textTheme.labelMedium?.fontFamily,
                      fontSize: 12.5,
                      fontWeight: active ? FontWeight.w700 : FontWeight.w600,
                      color: color,
                    ),
                    child: Text(label, maxLines: 1),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
