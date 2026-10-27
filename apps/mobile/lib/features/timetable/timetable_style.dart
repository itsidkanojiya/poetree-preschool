import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/widgets/sticker_text.dart';

/// The timetable's look, from the designer's reference: a sky header with a
/// waving child, days as round pills, and each subject a pastel card with its
/// own picture.

/// The designer's pictures, in assets/timetable_ui.
abstract final class TimetableArt {
  static const _dir = 'assets/timetable_ui';
  static const back = '$_dir/back.svg';
  static const book = '$_dir/book.svg';
  static const check = '$_dir/check.svg';
  static const clock = '$_dir/clock.svg';
  static const globe = '$_dir/globe.svg';
  static const snack = '$_dir/snack.svg';
  static const ball = '$_dir/soccer_ball.svg';
  static const star = '$_dir/star.svg';
  static const user = '$_dir/user.svg';

  /// The app's own waving child, shown in a round frame.
  static const kid = 'assets/images/characters/waving_kid.png';
}

abstract final class TimetableInk {
  static const navy = Color(0xFF172E83);
  static const quiet = Color(0xFF5E6A8F);
  static const skyTop = Color(0xFFB9E3FF);
  static const skyBottom = Color(0xFFEAF6FF);
  static const page = Color(0xFFF2F9FF);
  static const dayPicked = Color(0xFFFFE8A3);
  static const dayPickedEdge = Color(0xFFFFD56B);
  static const line = Color(0xFFE3EAF6);
  static const snack = Color(0xFFFFF4D6);
  static const snackInk = Color(0xFFE8890C);
}

/// One subject's colours: the picture tile's, and the card's wash.
class SubjectColours {
  const SubjectColours(this.tile, this.wash, this.edge);

  final Color tile;
  final Color wash;
  final Color edge;

  /// Coral, blue, green, purple, orange, teal — the reference's four first,
  /// in its order.
  static const all = [
    SubjectColours(Color(0xFFFF7A7A), Color(0xFFFFF1F1), Color(0xFFFFD9D9)),
    SubjectColours(Color(0xFF3EA6F0), Color(0xFFEEF6FD), Color(0xFFD3E8FA)),
    SubjectColours(Color(0xFF5ACB68), Color(0xFFEFFAF0), Color(0xFFD3F0D6)),
    SubjectColours(Color(0xFFA674F0), Color(0xFFF4EFFD), Color(0xFFE3D6FB)),
    SubjectColours(Color(0xFFFFA544), Color(0xFFFFF5EA), Color(0xFFFFE2C2)),
    SubjectColours(Color(0xFF26BFAE), Color(0xFFEAFAF8), Color(0xFFC9EFEA)),
  ];

  static SubjectColours at(int index) => all[index % all.length];
}

/// The picture for a subject, from what it is called: a book for a language,
/// 123 for maths, the globe for EVS and social, a ball for play and PE. Any
/// other subject shows its first letter as a sticker.
enum SubjectPicture {
  book,
  numbers,
  globe,
  ball,
  letter;

  static SubjectPicture of(String subject) {
    final name = subject.toLowerCase();
    bool has(List<String> words) => words.any(name.contains);
    // Whole words for the short ones: the "pe" in "speaking" is not PE.
    bool word(String pattern) => RegExp('\\b$pattern\\b').hasMatch(name);

    if (has(['math', 'number', 'numeracy', 'count'])) return numbers;
    if (has(['evs', 'social', 'science', 'environment', 'general', 'world']) ||
        has(['nature']) ||
        word(r'g\.?k')) {
      return globe;
    }
    if (has(['sport', 'game', 'physical', 'yoga', 'play', 'dance']) ||
        word(r'p\.?e')) {
      return ball;
    }
    if (has([
      'english',
      'hindi',
      'gujarati',
      'marathi',
      'language',
      'literacy',
      'phonic',
      'reading',
      'story',
      'rhyme',
      'alphabet',
      'letter',
    ])) {
      return book;
    }
    return letter;
  }
}

/// One of the designer's icons; recoloured only when asked.
class TimetableIcon extends StatelessWidget {
  const TimetableIcon(this.asset, {this.size = 24, this.colour, super.key});

  final String asset;
  final double size;
  final Color? colour;

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    asset,
    width: size,
    height: size,
    colorFilter: colour == null
        ? null
        : ColorFilter.mode(colour!, BlendMode.srcIn),
  );
}

/// The sky at the top: title, the line under it, the waving child with stars
/// and the sun, and the round back button. Sits under the status bar.
class TimetableHeader extends StatelessWidget {
  const TimetableHeader({
    required this.subtitle,
    required this.onBack,
    super.key,
  });

  final String subtitle;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final narrow = MediaQuery.sizeOf(context).width < 360;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 12, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            button: true,
            label: 'Back',
            excludeSemantics: true,
            child: Material(
              color: Colors.white,
              shape: const CircleBorder(),
              elevation: 2,
              shadowColor: const Color(0x331D2560),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onBack,
                child: const SizedBox(
                  width: 48,
                  height: 48,
                  child: Center(
                    child: TimetableIcon(TimetableArt.back, size: 24),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(
                    header: true,
                    child: Text(
                      'Timetable',
                      style: theme.textTheme.headlineMedium?.copyWith(
                        color: TimetableInk.navy,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: TimetableInk.quiet,
                      height: 1.3,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (!narrow) const _Waving(),
        ],
      ),
    );
  }
}

/// The app's waving child in a round white frame, with stars and the sun.
class _Waving extends StatelessWidget {
  const _Waving();

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: SizedBox(
        width: 124,
        height: 104,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            const Positioned(
              right: 0,
              top: 0,
              child: SizedBox(
                width: 34,
                height: 34,
                child: CustomPaint(painter: _SunPainter()),
              ),
            ),
            Positioned(
              left: 14,
              top: 8,
              child: Container(
                width: 88,
                height: 88,
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
                    TimetableArt.kid,
                    fit: BoxFit.cover,
                    alignment: const Alignment(0, -0.6),
                  ),
                ),
              ),
            ),
            const Positioned(
              left: 0,
              top: 4,
              child: TimetableIcon(TimetableArt.star, size: 18),
            ),
            const Positioned(
              left: 2,
              bottom: 6,
              child: TimetableIcon(TimetableArt.star, size: 12),
            ),
            const Positioned(
              right: 4,
              bottom: 12,
              child: TimetableIcon(TimetableArt.star, size: 14),
            ),
          ],
        ),
      ),
    );
  }
}

/// A small smiling sun.
class _SunPainter extends CustomPainter {
  const _SunPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final centre = size.center(Offset.zero);
    final radius = size.shortestSide * 0.3;
    final rays = Paint()
      ..color = const Color(0xFFFFC83D)
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.round;
    for (var i = 0; i < 8; i++) {
      final angle = i * math.pi / 4;
      final direction = Offset(math.cos(angle), math.sin(angle));
      canvas.drawLine(
        centre + direction * (radius + 3),
        centre + direction * (radius + 7),
        rays,
      );
    }
    canvas.drawCircle(centre, radius, Paint()..color = const Color(0xFFFFD84D));
    final face = Paint()
      ..color = const Color(0xFF8A5A00)
      ..strokeWidth = 1.4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    canvas
      ..drawCircle(
        centre + Offset(-radius * 0.35, -radius * 0.15),
        1.2,
        Paint()..color = const Color(0xFF8A5A00),
      )
      ..drawCircle(
        centre + Offset(radius * 0.35, -radius * 0.15),
        1.2,
        Paint()..color = const Color(0xFF8A5A00),
      )
      ..drawArc(
        Rect.fromCircle(
          center: centre + Offset(0, radius * 0.1),
          radius: radius * 0.42,
        ),
        0.3,
        math.pi - 0.6,
        false,
        face,
      );
  }

  @override
  bool shouldRepaint(_SunPainter oldDelegate) => false;
}

/// One day: yellow with a tick when chosen, white otherwise.
class DayPill extends StatelessWidget {
  const DayPill({
    required this.label,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: Material(
        type: MaterialType.transparency,
        child: Ink(
          decoration: BoxDecoration(
            color: selected ? TimetableInk.dayPicked : Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected ? TimetableInk.dayPickedEdge : TimetableInk.line,
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x121D2560),
                blurRadius: 10,
                offset: Offset(0, 4),
              ),
            ],
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: onTap,
            child: Container(
              constraints: const BoxConstraints(minWidth: 82, minHeight: 52),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              alignment: Alignment.center,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (selected) ...[
                    Container(
                      width: 24,
                      height: 24,
                      decoration: const BoxDecoration(
                        color: Color(0xFFFFD56B),
                        shape: BoxShape.circle,
                      ),
                      alignment: Alignment.center,
                      child: const TimetableIcon(TimetableArt.check, size: 16),
                    ),
                    const SizedBox(width: 8),
                  ],
                  Text(
                    label,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: TimetableInk.navy,
                      fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The subject's picture tile: its colour, the period's two letters on top
/// and the subject's picture underneath.
class SubjectTile extends StatelessWidget {
  const SubjectTile({
    required this.code,
    required this.subject,
    required this.colours,
    this.size = 76,
    super.key,
  });

  /// The period's first two letters, as the timetable has always shown.
  final String code;
  final String subject;
  final SubjectColours colours;
  final double size;

  @override
  Widget build(BuildContext context) {
    final picture = SubjectPicture.of(subject);
    final art = size * 0.42;
    final Widget drawing = switch (picture) {
      SubjectPicture.book => TimetableIcon(TimetableArt.book, size: art),
      SubjectPicture.globe => TimetableIcon(TimetableArt.globe, size: art),
      SubjectPicture.ball => TimetableIcon(TimetableArt.ball, size: art),
      // Sticker numbers, in three colours as the designer drew them.
      SubjectPicture.numbers => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          StickerText('1', size: art * 0.86, colour: const Color(0xFFFFC223)),
          StickerText('2', size: art * 0.86, colour: const Color(0xFFFF5968)),
          StickerText('3', size: art * 0.86, colour: const Color(0xFF168EEA)),
        ],
      ),
      SubjectPicture.letter => StickerText(
        subject.characters.first.toUpperCase(),
        size: art,
        colour: Colors.white,
      ),
    };

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: colours.tile,
        borderRadius: BorderRadius.circular(size * 0.26),
        boxShadow: [
          BoxShadow(
            color: colours.tile.withValues(alpha: 0.35),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: EdgeInsets.all(size * 0.08),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (code.isNotEmpty)
            Text(
              code,
              style: TextStyle(
                color: Colors.white,
                fontSize: size * 0.22,
                fontWeight: FontWeight.w800,
                height: 1,
                letterSpacing: 0.5,
              ),
            ),
          SizedBox(height: size * 0.04),
          FittedBox(child: drawing),
        ],
      ),
    );
  }
}

/// One lesson: the subject's tile, its name, the times and the teacher.
class SubjectCard extends StatelessWidget {
  const SubjectCard({
    required this.title,
    required this.time,
    required this.colours,
    required this.tile,
    this.lines = const [],
    this.onTap,
    super.key,
  });

  final String title;

  /// "09:00 – 09:30".
  final String time;
  final SubjectColours colours;
  final Widget tile;

  /// Under the time: the teacher and room, or for a teacher the subject and
  /// room. Each with one of the designer's icons, or a built-in one.
  final List<({String? asset, IconData? icon, String text})> lines;

  /// Opens the subject, where the app has somewhere to open it to. None today,
  /// so no chevron is drawn.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      container: true,
      label: [title, time, for (final line in lines) line.text].join(', '),
      excludeSemantics: true,
      child: Material(
        type: MaterialType.transparency,
        child: Ink(
          decoration: BoxDecoration(
            color: colours.wash,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: colours.edge),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(22),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
              child: Row(
                children: [
                  tile,
                  Container(
                    width: 1,
                    height: 60,
                    margin: const EdgeInsets.symmetric(horizontal: 14),
                    color: colours.edge,
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleLarge?.copyWith(
                            color: TimetableInk.navy,
                            fontWeight: FontWeight.w800,
                            height: 1.15,
                          ),
                        ),
                        const SizedBox(height: 6),
                        _Line(asset: TimetableArt.clock, text: time),
                        for (final line in lines) ...[
                          const SizedBox(height: 4),
                          _Line(
                            asset: line.asset,
                            icon: line.icon,
                            text: line.text,
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (onTap != null)
                    const Icon(
                      Icons.chevron_right_rounded,
                      color: TimetableInk.navy,
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.text, this.asset, this.icon});

  final String text;
  final String? asset;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        if (asset != null)
          TimetableIcon(asset!, size: 18)
        else
          Icon(icon, size: 18, color: TimetableInk.quiet),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: TimetableInk.quiet,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ),
      ],
    );
  }
}

/// A period with no lesson in it: there, so the day keeps its shape, but
/// quiet.
class FreePeriodCard extends StatelessWidget {
  const FreePeriodCard({required this.time, super.key});

  final String time;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: 'Free, $time',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: TimetableInk.line),
        ),
        child: Row(
          children: [
            const TimetableIcon(TimetableArt.clock, size: 18),
            const SizedBox(width: 8),
            Text(
              time,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: TimetableInk.quiet),
            ),
            const Spacer(),
            Text(
              'Free',
              style: Theme.of(
                context,
              ).textTheme.titleSmall?.copyWith(color: TimetableInk.quiet),
            ),
          ],
        ),
      ),
    );
  }
}

/// A break in the day — "Snack 10:25 – 10:50" — between the lessons it falls
/// between, with a few cheerful dashes either side.
class BreakBanner extends StatelessWidget {
  const BreakBanner({required this.name, required this.time, super.key});

  final String name;
  final String time;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      container: true,
      label: '$name, $time',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: TimetableInk.snack,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const _Dashes(mirror: false),
            const SizedBox(width: 14),
            const TimetableIcon(
              TimetableArt.snack,
              size: 26,
              colour: TimetableInk.snackInk,
            ),
            const SizedBox(width: 10),
            Flexible(
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: name,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    TextSpan(text: '  $time'),
                  ],
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.titleMedium?.copyWith(
                  color: TimetableInk.navy,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
            const SizedBox(width: 14),
            const _Dashes(mirror: true),
          ],
        ),
      ),
    );
  }
}

/// Three short coloured strokes, like confetti, beside the snack.
class _Dashes extends StatelessWidget {
  const _Dashes({required this.mirror});

  final bool mirror;

  @override
  Widget build(BuildContext context) {
    return Transform.flip(
      flipX: mirror,
      child: const SizedBox(
        width: 14,
        height: 22,
        child: CustomPaint(painter: _DashPainter()),
      ),
    );
  }
}

class _DashPainter extends CustomPainter {
  const _DashPainter();

  @override
  void paint(Canvas canvas, Size size) {
    const colours = [Color(0xFFFF7A59), Color(0xFF3EA6F0), Color(0xFF8ED16A)];
    for (var i = 0; i < 3; i++) {
      final y = size.height * (0.2 + i * 0.3);
      canvas.drawLine(
        Offset(size.width * 0.2, y - 2 + i * 1.5),
        Offset(size.width * 0.9, y + (i - 1) * 2.5),
        Paint()
          ..color = colours[i]
          ..strokeWidth = 2.6
          ..strokeCap = StrokeCap.round,
      );
    }
  }

  @override
  bool shouldRepaint(_DashPainter oldDelegate) => false;
}
