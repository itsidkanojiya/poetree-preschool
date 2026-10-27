import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../features/tracing_module/tracing_ui.dart';

/// The sky-and-meadow page the family's own screens are drawn on —
/// Announcements and Settings: a soft sky, the waving child in a round frame
/// with a badge saying what the page is for, white cards, and grass along the
/// bottom. In dark mode the sky turns to night and the cards to the theme's
/// own surfaces, so a family who chose dark is not handed a bright page.

/// The page's colours, for the theme the app is in.
class KidSkyPalette {
  const KidSkyPalette._({
    required this.skyTop,
    required this.skyBottom,
    required this.card,
    required this.line,
    required this.ink,
    required this.quiet,
    required this.dark,
  });

  final Color skyTop;
  final Color skyBottom;
  final Color card;
  final Color line;

  /// Headings and the words that matter: navy, or white at night.
  final Color ink;
  final Color quiet;
  final bool dark;

  static KidSkyPalette of(BuildContext context) {
    final theme = Theme.of(context);
    return theme.brightness == Brightness.dark
        ? KidSkyPalette._(
            skyTop: const Color(0xFF16213E),
            skyBottom: theme.colorScheme.surface,
            card: theme.colorScheme.surfaceContainer,
            line: Colors.white12,
            ink: Colors.white,
            quiet: const Color(0xFFA3AECB),
            dark: true,
          )
        : const KidSkyPalette._(
            skyTop: Color(0xFFBFE4FF),
            skyBottom: Color(0xFFF2F9FF),
            card: Colors.white,
            line: Color(0xFFE3EAF6),
            ink: Color(0xFF1D2560),
            quiet: Color(0xFF66729A),
            dark: false,
          );
  }

  /// A pastel wash of [colour] that still reads at night.
  Color wash(Color colour) => dark
      ? colour.withValues(alpha: 0.18)
      : Color.lerp(colour, Colors.white, 0.86)!;
}

/// One of the designer's line icons, in one colour.
class KidIconArt extends StatelessWidget {
  const KidIconArt(
    this.asset, {
    required this.colour,
    this.size = 24,
    super.key,
  });

  final String asset;
  final Color colour;
  final double size;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    asset,
    width: size,
    height: size,
    colorFilter: ColorFilter.mode(colour, BlendMode.srcIn),
  );
}

/// The page: the sky, its header, [child] under it, and the meadow behind.
class KidSkyPage extends StatelessWidget {
  const KidSkyPage({
    required this.title,
    required this.child,
    this.subtitle,
    this.badge,
    this.badgeColour = const Color(0xFFF7A928),
    this.backIcon = 'assets/announcements_settings_ui/back.svg',
    this.showChild = true,
    super.key,
  });

  final String title;
  final String? subtitle;
  final Widget child;

  /// What the page is for, on a little round badge by the child: the
  /// megaphone, the gear.
  final String? badge;
  final Color badgeColour;
  final String backIcon;

  /// The waving child. Off on a page that draws its own picture.
  final bool showChild;

  @override
  Widget build(BuildContext context) {
    final palette = KidSkyPalette.of(context);
    final narrow = MediaQuery.sizeOf(context).width < 360;

    return Scaffold(
      backgroundColor: palette.skyBottom,
      body: Stack(
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [palette.skyTop, palette.skyBottom],
                  stops: const [0, 0.42],
                ),
              ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: 220,
            child: CustomPaint(painter: _Clouds(dark: palette.dark)),
          ),
          // Behind what scrolls, so cards pass over the grass, never under.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Opacity(
              opacity: palette.dark ? 0.45 : 1,
              child: const TracingHills(height: 110),
            ),
          ),
          SafeArea(
            bottom: false,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 12, 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _BackButton(icon: backIcon, palette: palette),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Semantics(
                                header: true,
                                child: Text(
                                  title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context)
                                      .textTheme
                                      .headlineSmall
                                      ?.copyWith(
                                        color: palette.ink,
                                        fontWeight: FontWeight.w800,
                                      ),
                                ),
                              ),
                              if (subtitle != null) ...[
                                const SizedBox(height: 6),
                                Text(
                                  subtitle!,
                                  style: Theme.of(context).textTheme.bodyMedium
                                      ?.copyWith(
                                        color: palette.quiet,
                                        height: 1.35,
                                      ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                      if (showChild && !narrow)
                        _WavingChild(badge: badge, badgeColour: badgeColour),
                    ],
                  ),
                ),
                Expanded(child: child),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BackButton extends StatelessWidget {
  const _BackButton({required this.icon, required this.palette});

  final String icon;
  final KidSkyPalette palette;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Back',
      excludeSemantics: true,
      child: Material(
        color: palette.card,
        shape: const CircleBorder(),
        elevation: 2,
        shadowColor: const Color(0x331D2560),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => Navigator.of(context).maybePop(),
          child: SizedBox(
            width: 48,
            height: 48,
            child: Center(
              child: KidIconArt(icon, colour: palette.ink, size: 24),
            ),
          ),
        ),
      ),
    );
  }
}

/// The app's waving child in a round white frame, the page's badge beside
/// them, and a few stars.
class _WavingChild extends StatelessWidget {
  const _WavingChild({required this.badge, required this.badgeColour});

  final String? badge;
  final Color badgeColour;

  static const _star = 'assets/announcements_settings_ui/star.svg';

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: SizedBox(
        width: 118,
        height: 100,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              right: 4,
              top: 2,
              child: Container(
                width: 86,
                height: 86,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white,
                  border: Border.all(color: Colors.white, width: 4),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x261D2560),
                      blurRadius: 12,
                      offset: Offset(0, 5),
                    ),
                  ],
                ),
                child: ClipOval(
                  child: Image.asset(
                    'assets/images/characters/waving_kid.png',
                    fit: BoxFit.cover,
                    alignment: const Alignment(0, -0.6),
                  ),
                ),
              ),
            ),
            if (badge != null)
              Positioned(
                left: 2,
                bottom: 2,
                child: Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: badgeColour,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 3),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x261D2560),
                        blurRadius: 8,
                        offset: Offset(0, 3),
                      ),
                    ],
                  ),
                  alignment: Alignment.center,
                  child: KidIconArt(badge!, colour: Colors.white, size: 22),
                ),
              ),
            const Positioned(
              left: 4,
              top: 6,
              child: KidIconArt(_star, colour: Color(0xFFFFC83D), size: 18),
            ),
            const Positioned(
              right: 0,
              bottom: 0,
              child: KidIconArt(_star, colour: Color(0xFFFFC83D), size: 14),
            ),
          ],
        ),
      ),
    );
  }
}

/// A white rounded card with a soft shadow; the theme's surface at night.
class KidCard extends StatelessWidget {
  const KidCard({
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.radius = 22,
    this.colour,
    this.onTap,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;

  /// The card's own wash instead of white: an emergency notice is red.
  final Color? colour;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final palette = KidSkyPalette.of(context);
    return Material(
      type: MaterialType.transparency,
      child: Ink(
        // The fill is the box's own: a shadow under a box with no fill shows
        // through it and greys the card.
        decoration: BoxDecoration(
          color: colour ?? palette.card,
          borderRadius: BorderRadius.circular(radius),
          border: palette.dark ? Border.all(color: palette.line) : null,
          boxShadow: palette.dark
              ? null
              : const [
                  BoxShadow(
                    color: Color(0x141D2560),
                    blurRadius: 16,
                    offset: Offset(0, 6),
                  ),
                ],
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(radius),
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

/// Soft clouds in the header's sky; faint stars at night.
class _Clouds extends CustomPainter {
  const _Clouds({required this.dark});

  final bool dark;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: dark ? 0.06 : 0.75);
    void cloud(double x, double y, double r) {
      canvas
        ..drawCircle(Offset(x, y), r, paint)
        ..drawCircle(Offset(x + r * 0.95, y + r * 0.2), r * 0.78, paint)
        ..drawCircle(Offset(x - r * 0.95, y + r * 0.25), r * 0.66, paint);
    }

    cloud(size.width * 0.03, size.height * 0.55, 18);
    cloud(size.width * 0.52, size.height * 0.16, 14);
    cloud(size.width * 1.0, size.height * 0.62, 20);

    if (dark) {
      final star = Paint()..color = Colors.white.withValues(alpha: 0.5);
      for (final (x, y) in [
        (0.3, 0.2),
        (0.62, 0.42),
        (0.86, 0.12),
        (0.12, 0.3),
      ]) {
        canvas.drawCircle(Offset(size.width * x, size.height * y), 1.4, star);
      }
    }
  }

  @override
  bool shouldRepaint(_Clouds oldDelegate) => oldDelegate.dark != dark;
}
