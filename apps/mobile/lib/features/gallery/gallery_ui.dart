import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/widgets/squish.dart';

/// The look the gallery's media screens share — the event's photos and
/// videos, a photo full screen, a video, the albums, and nothing-yet — drawn
/// to the designer's references. The gallery's first screen, the events, is
/// left as it is.
abstract final class GalleryInk {
  /// Pale sky into pale lilac, behind everything that is not a photo.
  static const skyTop = Color(0xFFEEF4FF);
  static const skyBottom = Color(0xFFF7F2FF);

  static const ink = Color(0xFF1D2560);
  static const muted = Color(0xFF6B7194);
  static const line = Color(0xFFE4E7F3);

  /// All; Photos; Videos — each chip its own colour when chosen.
  static const violet = Color(0xFF7A5AF8);
  static const apricot = Color(0xFFFF8A3D);
  static const rose = Color(0xFFF2508E);

  /// The video's progress bar.
  static const gold = Color(0xFFFFC53D);

  static List<BoxShadow> lift([double strength = 1]) => [
    BoxShadow(
      color: ink.withValues(alpha: 0.08 * strength),
      blurRadius: 14,
      offset: const Offset(0, 5),
    ),
  ];
}

/// One of the designer's line icons, in any colour.
class GalleryIcon extends StatelessWidget {
  const GalleryIcon(
    this.name, {
    this.size = 22,
    this.color = GalleryInk.ink,
    super.key,
  });

  /// The file's name in assets/gallery_ui/icons, without `.svg`.
  final String name;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    'assets/gallery_ui/icons/$name.svg',
    width: size,
    height: size,
    colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
  );
}

/// The round white button the screens put in their corners: back, albums,
/// and on a photo, back again over the picture.
class GalleryRoundButton extends StatelessWidget {
  const GalleryRoundButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.size = 44,
    super.key,
  });

  final String icon;
  final String label;
  final VoidCallback onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: Squish(
        onTap: onTap,
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: Colors.white,
            shape: BoxShape.circle,
            boxShadow: GalleryInk.lift(),
          ),
          alignment: Alignment.center,
          child: GalleryIcon(icon, size: size * 0.5),
        ),
      ),
    );
  }
}

/// Back, the screen's name, and one thing on the right.
class GalleryHeader extends StatelessWidget {
  const GalleryHeader({
    required this.title,
    this.trailing,
    this.onBack,
    super.key,
  });

  final String title;
  final Widget? trailing;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Row(
        children: [
          GalleryRoundButton(
            icon: 'back',
            label: 'Back',
            onTap: onBack ?? () => Navigator.of(context).maybePop(),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: GalleryInk.ink,
              ),
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 12), trailing!],
        ],
      ),
    );
  }
}

/// The pale sky every light gallery screen sits on.
class GalleryBackdrop extends StatelessWidget {
  const GalleryBackdrop({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [GalleryInk.skyTop, GalleryInk.skyBottom],
        ),
      ),
      child: child,
    );
  }
}

/// "All (12)", "Photos (9)", "Videos (3)": a pill, filled with its own colour
/// when chosen.
class GalleryFilterChip extends StatelessWidget {
  const GalleryFilterChip({
    required this.label,
    required this.selected,
    required this.color,
    required this.onTap,
    super.key,
  });

  final String label;
  final bool selected;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: Squish(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: selected ? color : Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: selected ? color : GalleryInk.line),
            boxShadow: selected
                ? [
                    BoxShadow(
                      color: color.withValues(alpha: 0.3),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ]
                : null,
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: selected ? Colors.white : GalleryInk.ink,
            ),
          ),
        ),
      ),
    );
  }
}

/// Nothing to show yet: a folder of photos with a video on top, and a line on
/// what will appear here.
class GalleryEmptyState extends StatelessWidget {
  const GalleryEmptyState({
    this.title = 'No photos or videos yet',
    this.message = 'New memories will appear here once they are uploaded.',
    super.key,
  });

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        // Scrollable, so a pull-to-refresh above it still works.
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const _EmptyArt(),
                const SizedBox(height: 22),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: GalleryInk.ink,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: GalleryInk.muted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The empty state's picture, drawn rather than shipped: two photos tucked
/// into a yellow folder, a pink play button, a green star.
class _EmptyArt extends StatelessWidget {
  const _EmptyArt();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 180,
      height: 140,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            left: 38,
            top: 8,
            child: Transform.rotate(
              angle: -0.18,
              child: const _PhotoCard(color: Color(0xFF5BA8F5)),
            ),
          ),
          Positioned(
            left: 70,
            top: 2,
            child: Transform.rotate(
              angle: 0.1,
              child: const _PhotoCard(color: Color(0xFF8FD3FF)),
            ),
          ),
          // The folder's tab, behind its front.
          Positioned(
            left: 30,
            bottom: 70,
            width: 62,
            height: 22,
            child: Container(
              decoration: const BoxDecoration(
                color: Color(0xFFF5A623),
                borderRadius: BorderRadius.vertical(top: Radius.circular(10)),
              ),
            ),
          ),
          Positioned(
            left: 30,
            right: 20,
            bottom: 0,
            height: 80,
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                gradient: const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xFFFFD45C), Color(0xFFFFB627)],
                ),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFFFFB627).withValues(alpha: 0.35),
                    blurRadius: 16,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
            ),
          ),
          Positioned(
            right: 14,
            top: 14,
            child: Container(
              width: 42,
              height: 42,
              decoration: const BoxDecoration(
                color: GalleryInk.rose,
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: const GalleryIcon('play', size: 20, color: Colors.white),
            ),
          ),
          Positioned(
            left: 4,
            bottom: 24,
            child: Transform.rotate(
              angle: math.pi / 12,
              child: const Icon(
                Icons.star_rounded,
                size: 34,
                color: Color(0xFF4CC38A),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PhotoCard extends StatelessWidget {
  const _PhotoCard({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 64,
      height: 58,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        boxShadow: GalleryInk.lift(),
      ),
      padding: const EdgeInsets.all(5),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(6),
        ),
        child: const Center(
          child: GalleryIcon('image', size: 26, color: Colors.white),
        ),
      ),
    );
  }
}
