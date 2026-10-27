import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../tracing_module/tracing_ui.dart';

/// The certificates screens' look, from the designer's reference: a sky with
/// clouds, a meadow at the bottom, white rounded cards, navy words, and one
/// colour for each kind of certificate.

/// The designer's pictures, in assets/certificates_ui.
abstract final class CertificateArt {
  static const _dir = 'assets/certificates_ui';
  static const back = '$_dir/arrow_left.svg';
  static const certificate = '$_dir/certificate.svg';
  static const chevron = '$_dir/chevron_right.svg';
  static const graduationCap = '$_dir/graduation_cap.svg';
  static const print = '$_dir/print.svg';
  static const share = '$_dir/share.svg';
  static const star = '$_dir/star.svg';
  static const trophy = '$_dir/trophy.svg';
  static const book = '$_dir/book.svg';

  /// A child holding up a certificate, faded at the edges into the sky.
  static const kid = '$_dir/kid_with_certificate.webp';
}

abstract final class CertificateInk {
  static const navy = Color(0xFF1D2560);
  static const quiet = Color(0xFF66729A);
  static const card = Colors.white;
  static const line = Color(0xFFE3EAF6);

  /// Print: a soft lilac; Share: the strong indigo beside it.
  static const printWash = Color(0xFFEDE9FE);
  static const printInk = Color(0xFF5B3FD9);
  static const share = Color(0xFF4F2EE8);
}

/// What one kind of certificate looks like: gold for an achievement, blue for
/// a test, pink for behaviour.
class CertificateKind {
  const CertificateKind._({
    required this.category,
    required this.label,
    required this.plural,
    required this.colour,
    required this.wash,
    required this.icon,
  });

  final String category;
  final String label;

  /// What its filter is called: "Achievements", "Tests", "Behaviour".
  final String plural;

  /// The frame and the badge's icon.
  final Color colour;

  /// The light fill behind the thumbnail and the badge.
  final Color wash;
  final String icon;

  static const achievement = CertificateKind._(
    category: 'ACHIEVEMENT',
    label: 'Achievement',
    plural: 'Achievements',
    colour: Color(0xFFF5B301),
    wash: Color(0xFFFFF6DC),
    icon: CertificateArt.star,
  );

  static const test = CertificateKind._(
    category: 'TEST',
    label: 'Test',
    plural: 'Tests',
    colour: Color(0xFF2F9BDB),
    wash: Color(0xFFE2F2FC),
    icon: CertificateArt.graduationCap,
  );

  static const behaviour = CertificateKind._(
    category: 'BEHAVIOUR',
    label: 'Behaviour',
    plural: 'Behaviour',
    colour: Color(0xFFE5508A),
    wash: Color(0xFFFDE7EF),
    icon: CertificateArt.trophy,
  );

  /// In the order the filters show them.
  static const all = [achievement, test, behaviour];

  static CertificateKind of(String category) => all.firstWhere(
    (kind) => kind.category == category,
    orElse: () => achievement,
  );
}

/// One of the designer's line icons, in one colour.
class CertificateIcon extends StatelessWidget {
  const CertificateIcon(this.asset, {this.size = 24, this.colour, super.key});

  final String asset;
  final double size;
  final Color? colour;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    asset,
    width: size,
    height: size,
    colorFilter: ColorFilter.mode(
      colour ?? CertificateInk.navy,
      BlendMode.srcIn,
    ),
  );
}

/// The page every certificates screen sits on: sky and clouds behind, the
/// meadow along the bottom, a round back button and the title on top.
class CertificatePage extends StatelessWidget {
  const CertificatePage({
    required this.title,
    required this.child,
    this.trailing,
    this.meadow = true,
    super.key,
  });

  final String title;
  final Widget child;

  /// Beside the title on the right: the detail screen's share button.
  final Widget? trailing;

  /// The grass and flowers at the bottom. Off where a bar sits there instead.
  final bool meadow;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFEAF7FF),
      body: Stack(
        children: [
          const Positioned.fill(child: TracingSky()),
          if (meadow)
            const Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: TracingHills(height: 140),
            ),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: Row(
                    children: [
                      RoundButton(
                        tooltip: 'Back',
                        onTap: () => Navigator.of(context).maybePop(),
                        size: 48,
                        child: const CertificateIcon(
                          CertificateArt.back,
                          size: 24,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Semantics(
                          header: true,
                          child: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.headlineSmall
                                ?.copyWith(
                                  color: CertificateInk.navy,
                                  fontWeight: FontWeight.w800,
                                ),
                          ),
                        ),
                      ),
                      if (trailing != null) ...[
                        const SizedBox(width: 12),
                        trailing!,
                      ],
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

/// A white rounded card with a soft shadow, as every card on these screens is.
class CertificateCard extends StatelessWidget {
  const CertificateCard({
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.radius = 24,
    this.onTap,
    this.semanticLabel,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final VoidCallback? onTap;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: onTap != null,
      label: semanticLabel,
      child: Material(
        type: MaterialType.transparency,
        child: Ink(
          // The white is the box's own: a shadow under a box with no fill
          // shows through it, and the card turns grey.
          decoration: BoxDecoration(
            color: CertificateInk.card,
            borderRadius: BorderRadius.circular(radius),
            boxShadow: const [
              BoxShadow(
                color: Color(0x141D2560),
                blurRadius: 18,
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
      ),
    );
  }
}
