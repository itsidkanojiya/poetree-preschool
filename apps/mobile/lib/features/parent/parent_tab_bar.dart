import 'package:flutter/material.dart';

/// The parent app's bottom bar on a phone: Home, Learning, Progress, Settings.
///
/// Drawn to the designer's reference: a near-white bar, rounded along the
/// top, with the friendly full-colour icons from that reference — the orange
/// house, the cap, the rainbow bars, the blue gear. Each tab sits on its own
/// soft pastel blob; the chosen one sits in a warm cream pill instead, its
/// word in orange. Every tab is a quarter of the bar and its full height, so a
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
    _TabArt('home', 'Home', Color(0xFFFFEFD9)),
    _TabArt('learning', 'Learning', Color(0xFFECEBFD)),
    _TabArt('progress', 'Progress', Color(0xFFE5F6EE)),
    _TabArt('settings', 'Settings', Color(0xFFE6EFFD)),
  ];

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final surface = dark
        ? Theme.of(context).navigationBarTheme.backgroundColor ??
              Theme.of(context).colorScheme.surface
        : const Color(0xFFF8F9FE);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
        border: Border(
          top: BorderSide(
            color: dark ? Colors.white10 : Colors.white,
            width: 1.5,
          ),
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF1D2560).withValues(alpha: dark ? 0.3 : 0.07),
            blurRadius: 24,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        // Above the gesture bar or the buttons, whichever the phone has, and
        // never flush to the edge on a phone that reports no inset.
        minimum: const EdgeInsets.only(bottom: 8),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 10, 8, 2),
          child: Row(
            children: [
              for (final (index, art) in _tabs.indexed)
                Expanded(
                  child: _Tab(
                    art: art,
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

/// A tab's picture, its word, and the pastel its blob is drawn in.
class _TabArt {
  const _TabArt(this.icon, this.label, this.blob);

  /// The file in assets/images/bottom_nav, without `.png`.
  final String icon;
  final String label;
  final Color blob;
}

class _Tab extends StatelessWidget {
  const _Tab({
    required this.art,
    required this.active,
    required this.dark,
    required this.onTap,
  });

  final _TabArt art;
  final bool active;
  final bool dark;
  final VoidCallback onTap;

  static const _orange = Color(0xFFF28C1B);
  static const _quiet = Color(0xFF66729A);
  static const _quietDark = Color(0xFFA3AECB);

  static const _motion = Duration(milliseconds: 240);

  @override
  Widget build(BuildContext context) {
    final labelColor = active ? _orange : (dark ? _quietDark : _quiet);

    return Semantics(
      button: true,
      selected: active,
      label: art.label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 3),
          child: AnimatedContainer(
            duration: _motion,
            curve: Curves.easeOutCubic,
            height: 84,
            decoration: BoxDecoration(
              // The chosen tab's warm pill; nothing behind the others.
              gradient: active
                  ? LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: dark
                          ? [
                              _orange.withValues(alpha: 0.22),
                              _orange.withValues(alpha: 0.14),
                            ]
                          : const [Color(0xFFFFF4E4), Color(0xFFFFEBD0)],
                    )
                  : null,
              borderRadius: BorderRadius.circular(26),
              boxShadow: active && !dark
                  ? [
                      BoxShadow(
                        color: _orange.withValues(alpha: 0.16),
                        blurRadius: 14,
                        offset: const Offset(0, 4),
                      ),
                    ]
                  : null,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 58,
                  height: 48,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      // Each tab's own soft blob, giving way to the pill.
                      AnimatedOpacity(
                        duration: _motion,
                        opacity: active ? 0 : 1,
                        child: Container(
                          width: 56,
                          height: 46,
                          decoration: BoxDecoration(
                            color: dark
                                ? art.blob.withValues(alpha: 0.16)
                                : art.blob,
                            borderRadius: BorderRadius.circular(18),
                          ),
                        ),
                      ),
                      AnimatedScale(
                        duration: _motion,
                        curve: Curves.easeOutBack,
                        scale: active ? 1.1 : 1,
                        child: Image.asset(
                          'assets/images/bottom_nav/${art.icon}.png',
                          width: 38,
                          height: 38,
                          filterQuality: FilterQuality.medium,
                          excludeFromSemantics: true,
                        ),
                      ),
                    ],
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
                      fontSize: 13.5,
                      fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                      color: labelColor,
                    ),
                    child: Text(art.label, maxLines: 1),
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
