import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/widgets/squish.dart';
import 'fee_models.dart';

/// The look Settings, Fees and Fee Details share, drawn to the designer's
/// references: a pale sky behind soft white cards, deep navy type, and each
/// thing its own pastel.
abstract final class FeeInk {
  static const skyTop = Color(0xFFEFF5FF);
  static const skyBottom = Color(0xFFF7F3FF);

  static const ink = Color(0xFF1B2154);
  static const muted = Color(0xFF6B7194);
  static const line = Color(0xFFE6EAF4);

  static const rose = Color(0xFFF0506E);
  static const roseSoft = Color(0xFFFFE3E8);
  static const mint = Color(0xFF22B573);
  static const mintSoft = Color(0xFFDDF6E8);
  static const sky = Color(0xFF3B82F6);
  static const skySoft = Color(0xFFDDEAFE);
  static const amber = Color(0xFFF59E0B);
  static const amberSoft = Color(0xFFFFF0CC);
  static const violet = Color(0xFF8B5CF6);
  static const violetSoft = Color(0xFFEDE5FF);
  static const peach = Color(0xFFFFF3EA);

  static List<BoxShadow> lift([double strength = 1]) => [
    BoxShadow(
      color: ink.withValues(alpha: 0.06 * strength),
      blurRadius: 18,
      offset: const Offset(0, 6),
    ),
  ];
}

/// One of the designer's line icons, in any colour.
class FeeIcon extends StatelessWidget {
  const FeeIcon(
    this.name, {
    this.size = 22,
    this.color = FeeInk.ink,
    super.key,
  });

  /// The file in assets/icons/school_fees, without `.svg`.
  final String name;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    'assets/icons/school_fees/$name.svg',
    width: size,
    height: size,
    colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
  );
}

/// An icon on its own soft tile — the coloured square every card leads with.
class FeeIconTile extends StatelessWidget {
  const FeeIconTile({
    required this.icon,
    required this.color,
    required this.soft,
    this.size = 52,
    super.key,
  });

  final String icon;
  final Color color;
  final Color soft;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: soft,
        borderRadius: BorderRadius.circular(size * 0.3),
      ),
      alignment: Alignment.center,
      child: FeeIcon(icon, size: size * 0.5, color: color),
    );
  }
}

/// The round white button in a screen's corner.
class FeeRoundButton extends StatelessWidget {
  const FeeRoundButton({
    required this.label,
    required this.onTap,
    this.icon,
    this.child,
    super.key,
  });

  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: Squish(
        onTap: onTap,
        child: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: Colors.white,
            shape: BoxShape.circle,
            boxShadow: FeeInk.lift(1.4),
          ),
          alignment: Alignment.center,
          child: child ?? Icon(icon, color: FeeInk.ink, size: 26),
        ),
      ),
    );
  }
}

/// Back, and the screen's name, large.
class FeeHeader extends StatelessWidget {
  const FeeHeader({required this.title, this.trailing, super.key});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Row(
        children: [
          FeeRoundButton(
            label: 'Back',
            icon: Icons.chevron_left_rounded,
            onTap: () => Navigator.of(context).maybePop(),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: FeeInk.ink,
              ),
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// The pale sky every fee screen sits on.
class FeeBackdrop extends StatelessWidget {
  const FeeBackdrop({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [FeeInk.skyTop, FeeInk.skyBottom],
        ),
      ),
      child: child,
    );
  }
}

/// A white card, softly lifted.
class FeeCard extends StatelessWidget {
  const FeeCard({
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.color = Colors.white,
    this.gradient,
    super.key,
  });

  final Widget child;
  final EdgeInsets padding;
  final Color color;
  final Gradient? gradient;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: gradient == null ? color : null,
        gradient: gradient,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withValues(alpha: 0.9)),
        boxShadow: FeeInk.lift(),
      ),
      child: child,
    );
  }
}

/// The pill a status sits in — "Due", "Upcoming", "Paid".
class FeeStatusPill extends StatelessWidget {
  const FeeStatusPill(this.state, {this.large = false, super.key});

  final InstallmentState state;
  final bool large;

  /// The design calls an installment that is near or here "Due".
  static String labelFor(InstallmentState state) => switch (state) {
    InstallmentState.dueSoon || InstallmentState.dueToday => 'Due',
    _ => state.label,
  };

  static (Color, Color) colorsFor(InstallmentState state) => switch (state) {
    InstallmentState.paid => (const Color(0xFF16A34A), const Color(0xFFDCFCE7)),
    InstallmentState.partial => (
      const Color(0xFFEA580C),
      const Color(0xFFFFEDD5),
    ),
    InstallmentState.overdue ||
    InstallmentState.dueToday ||
    InstallmentState.dueSoon => (
      const Color(0xFFE5484D),
      const Color(0xFFFFE4E6),
    ),
    InstallmentState.upcoming => (
      const Color(0xFFD97706),
      const Color(0xFFFFF1D6),
    ),
    InstallmentState.cancelled => (FeeInk.muted, const Color(0xFFEDEFF5)),
  };

  @override
  Widget build(BuildContext context) {
    final (ink, wash) = colorsFor(state);
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: large ? 16 : 12,
        vertical: large ? 7 : 4,
      ),
      decoration: BoxDecoration(
        color: wash,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        labelFor(state),
        style: TextStyle(
          color: ink,
          fontSize: large ? 15 : 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// "31 Oct 2026".
String feeDate(DateTime date) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${date.day} ${months[date.month - 1]} ${date.year}';
}
