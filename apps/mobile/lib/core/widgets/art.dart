import 'package:flutter/material.dart';

import '../assets/app_assets.dart';
import 'squish.dart';

/// One icon from the asset pack, square, decoded no larger than it is drawn.
class ArtIcon extends StatelessWidget {
  const ArtIcon(this.path, {this.size = 48, this.semanticLabel, super.key});

  /// One of [AppIcons].
  final String path;
  final double size;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final pixels = (size * MediaQuery.devicePixelRatioOf(context)).round();

    return Image.asset(
      path,
      width: size,
      height: size,
      fit: BoxFit.contain,
      // The pack's icons are 235 px; a 40 px icon need not hold all of them in
      // memory.
      cacheWidth: pixels,
      filterQuality: FilterQuality.medium,
      semanticLabel: semanticLabel,
      excludeFromSemantics: semanticLabel == null,
    );
  }
}

/// A banner from the asset pack, at the pack's own proportions, tappable.
///
/// Each banner is drawn with a thin white frame and white rounded corners
/// around the picture. Clipped a little inside that frame, it sits on the page
/// as one rounded card with no white showing at its edges.
class ArtBanner extends StatelessWidget {
  const ArtBanner(
    this.path, {
    required this.semanticLabel,
    this.onTap,
    this.overlay,
    super.key,
  });

  /// One of [AppBanners].
  final String path;
  final String semanticLabel;
  final VoidCallback? onTap;

  /// Drawn over the picture — a count, a progress bar.
  final Widget? overlay;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: onTap != null,
      label: semanticLabel,
      child: Squish(
        onTap: onTap,
        child: AspectRatio(
          aspectRatio: AppBanners.aspectRatio,
          child: LayoutBuilder(
            builder: (context, constraints) {
              final radius = constraints.maxWidth * 0.05;

              return DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(radius),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.12),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(radius),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      // 2% larger than the box, so the frame falls outside the
                      // clip.
                      Transform.scale(
                        scale: 1.02,
                        child: Image.asset(
                          path,
                          fit: BoxFit.cover,
                          excludeFromSemantics: true,
                        ),
                      ),
                      ?overlay,
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
