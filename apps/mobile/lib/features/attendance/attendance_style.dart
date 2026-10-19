import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// The attendance screens' look, from the designer's reference: a soft blue
/// sky behind white rounded cards, pastel washes, and one colour per status.

/// The pictures the screens borrow from the app's own pack.
abstract final class AttendanceArt {
  static const wavingKid = 'assets/images/characters/waving_kid.png';
}

/// One of the designer's line icons, in assets/attendance_ui.
class AttendanceIcon extends StatelessWidget {
  const AttendanceIcon(this.name, {this.size = 24, this.color, super.key});

  final String name;
  final double size;

  /// Redraws the icon in one colour; null keeps the designer's own.
  final Color? color;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    'assets/attendance_ui/$name.svg',
    width: size,
    height: size,
    colorFilter: color == null
        ? null
        : ColorFilter.mode(color!, BlendMode.srcIn),
    excludeFromSemantics: true,
  );
}

/// What one register status looks like and says.
class StatusStyle {
  const StatusStyle({
    required this.status,
    required this.label,
    required this.color,
    required this.ink,
    required this.wash,
    required this.icon,
  });

  final String status;
  final String label;

  /// The status colour, for dots and borders.
  final Color color;

  /// A darker shade of it, for words on a light wash.
  final Color ink;
  final Color wash;
  final String icon;

  /// Present green, Absent red, Late amber, Leave purple, Half day blue — the
  /// designer's five, in the register's own order.
  static const all = [
    StatusStyle(
      status: 'PRESENT',
      label: 'Present',
      color: Color(0xFF22A66A),
      ink: Color(0xFF15803D),
      wash: Color(0xFFE5F7EE),
      icon: 'attendance',
    ),
    StatusStyle(
      status: 'ABSENT',
      label: 'Absent',
      color: Color(0xFFEF4444),
      ink: Color(0xFFDC2626),
      wash: Color(0xFFFDECEC),
      icon: 'absent',
    ),
    StatusStyle(
      status: 'LATE',
      label: 'Late',
      color: Color(0xFFF59E0B),
      ink: Color(0xFFB45309),
      wash: Color(0xFFFEF4E2),
      icon: 'late',
    ),
    StatusStyle(
      status: 'LEAVE',
      label: 'Leave',
      color: Color(0xFF8B5CF6),
      ink: Color(0xFF6D28D9),
      wash: Color(0xFFF1EBFE),
      icon: 'leave',
    ),
    StatusStyle(
      status: 'HALF_DAY',
      label: 'Half day',
      color: Color(0xFF0EA5E9),
      ink: Color(0xFF0369A1),
      wash: Color(0xFFE4F4FD),
      icon: 'half_day',
    ),
  ];

  static StatusStyle? of(String? status) {
    for (final style in all) {
      if (style.status == status) return style;
    }
    return null;
  }
}

/// The few colours the screens are built from, for light and dark.
class AttendancePalette {
  const AttendancePalette._({
    required this.skyTop,
    required this.skyBottom,
    required this.card,
    required this.line,
    required this.ink,
    required this.quiet,
  });

  final Color skyTop;
  final Color skyBottom;
  final Color card;
  final Color line;
  final Color ink;
  final Color quiet;

  static const accent = Color(0xFFF28C1B);
  static const today = Color(0xFFF7B731);
  static const homework = Color(0xFFF04463);
  static const notice = Color(0xFF8B5CF6);

  static AttendancePalette of(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return dark
        ? AttendancePalette._(
            skyTop: const Color(0xFF16213E),
            skyBottom: Theme.of(context).colorScheme.surface,
            card: Theme.of(context).colorScheme.surfaceContainer,
            line: Colors.white12,
            ink: Colors.white,
            quiet: const Color(0xFFA3AECB),
          )
        : const AttendancePalette._(
            skyTop: Color(0xFFD9EEFF),
            skyBottom: Color(0xFFF4F9FF),
            card: Colors.white,
            line: Color(0xFFE3EAF6),
            ink: Color(0xFF1D2560),
            quiet: Color(0xFF66729A),
          );
  }

  /// A status wash that still reads in dark mode.
  Color washOf(BuildContext context, StatusStyle style) =>
      Theme.of(context).brightness == Brightness.dark
      ? style.color.withValues(alpha: 0.18)
      : style.wash;
}

/// The page behind everything: sky at the top fading to near-white.
class SkyBackground extends StatelessWidget {
  const SkyBackground({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          stops: const [0, 0.45],
          colors: [palette.skyTop, palette.skyBottom],
        ),
      ),
      child: child,
    );
  }
}

/// A round white button, for back and for stepping between months and days.
class RoundButton extends StatelessWidget {
  const RoundButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.size = 46,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    final enabled = onTap != null;
    return Semantics(
      // Its own node, so a screen reader says "Next day" and not the heading
      // beside it run together with it.
      container: true,
      button: true,
      enabled: enabled,
      label: label,
      excludeSemantics: true,
      child: Material(
        color: palette.card.withValues(alpha: enabled ? 1 : 0.5),
        shape: const CircleBorder(),
        elevation: enabled ? 2 : 0,
        shadowColor: const Color(0x331D2560),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: size,
            height: size,
            child: Icon(
              icon,
              size: size * 0.52,
              color: enabled
                  ? palette.ink
                  : palette.quiet.withValues(alpha: 0.5),
            ),
          ),
        ),
      ),
    );
  }
}

/// A white rounded card with a soft shadow.
class AttendanceCard extends StatelessWidget {
  const AttendanceCard({
    required this.child,
    this.padding = const EdgeInsets.all(16),
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: palette.card,
        borderRadius: BorderRadius.circular(26),
        boxShadow: const [
          BoxShadow(
            color: Color(0x141D2560),
            blurRadius: 18,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: child,
    );
  }
}

/// A small rounded label: a status, or when something is due.
class AttendancePill extends StatelessWidget {
  const AttendancePill({
    required this.text,
    required this.color,
    required this.wash,
    super.key,
  });

  final String text;
  final Color color;
  final Color wash;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
    decoration: BoxDecoration(
      color: wash,
      borderRadius: BorderRadius.circular(99),
    ),
    child: Text(
      text,
      maxLines: 1,
      style: TextStyle(
        color: color,
        fontSize: 12.5,
        fontWeight: FontWeight.w700,
      ),
    ),
  );
}
