import 'dart:math' as math;

import 'package:flutter/material.dart';

/// What a child is being offered, drawn rather than borrowed.
///
/// Material's icon set is drawn for toolbars: thin, even-weight, and read at
/// 24px by adults who already know what the symbols mean. A tracing page was
/// `Icons.gesture` — a squiggle that means "swipe" to a developer and nothing
/// at all to a four-year-old.
///
/// These are drawn for the size they are used at and for a viewer who cannot
/// read the label underneath. Thick strokes with round caps, one idea per
/// glyph, and a second lighter tone so they read as objects rather than as
/// symbols.
enum KidGlyph {
  /// A book on a shelf.
  book,

  /// The film that opens a chapter.
  film,

  /// Trace a letter with a finger.
  trace,

  /// Match one thing to another.
  match,

  /// Count what is there.
  count,

  /// Put things into the right group.
  sort,

  /// Colour it in.
  colour,

  /// Cards to look at.
  cards,

  /// A rhyme or a song.
  song,

  /// A story being read.
  story,

  /// Pick one, or pick several.
  choose,

  /// Drag it into place.
  drag,

  /// Well done.
  star,
}

/// One hand-drawn glyph.
///
/// Two colours: [color] carries the shape and [tint] fills behind it. Passing
/// only a colour still works — the fill falls back to a soft wash of it, which
/// is what most callers want.
class KidIcon extends StatelessWidget {
  const KidIcon(this.glyph, {super.key, this.size = 32, this.color, this.tint});

  final KidGlyph glyph;
  final double size;
  final Color? color;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final ink = color ?? Theme.of(context).colorScheme.onSurface;

    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _GlyphPainter(
          glyph: glyph,
          ink: ink,
          fill: tint ?? ink.withValues(alpha: 0.22),
        ),
      ),
    );
  }
}

class _GlyphPainter extends CustomPainter {
  _GlyphPainter({required this.glyph, required this.ink, required this.fill});

  final KidGlyph glyph;
  final Color ink;
  final Color fill;

  @override
  void paint(Canvas canvas, Size size) {
    // Drawn in a 24×24 square and scaled, so a glyph looks the same at 20 as
    // at 64 and the stroke weight stays honest.
    final scale = size.width / 24;
    canvas.scale(scale);

    final stroke = Paint()
      ..color = ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final solid = Paint()
      ..color = ink
      ..style = PaintingStyle.fill;

    final wash = Paint()
      ..color = fill
      ..style = PaintingStyle.fill;

    switch (glyph) {
      case KidGlyph.book:
        // A closed book seen face on, with a spine down one side.
        canvas.drawRRect(
          RRect.fromLTRBR(4, 3, 20, 21, const Radius.circular(3)),
          wash,
        );
        canvas.drawRRect(
          RRect.fromLTRBR(4, 3, 20, 21, const Radius.circular(3)),
          stroke,
        );
        canvas.drawLine(const Offset(8.5, 3), const Offset(8.5, 21), stroke);
        canvas.drawLine(const Offset(12, 8), const Offset(17, 8), stroke);
        canvas.drawLine(const Offset(12, 12), const Offset(17, 12), stroke);

      case KidGlyph.film:
        // A play triangle inside a rounded screen.
        canvas.drawRRect(
          RRect.fromLTRBR(3, 5, 21, 19, const Radius.circular(4)),
          wash,
        );
        canvas.drawRRect(
          RRect.fromLTRBR(3, 5, 21, 19, const Radius.circular(4)),
          stroke,
        );
        final play = Path()
          ..moveTo(10.5, 9)
          ..lineTo(16, 12)
          ..lineTo(10.5, 15)
          ..close();
        canvas.drawPath(play, solid);

      case KidGlyph.trace:
        // A dotted line with a pencil coming down onto it. Drawn as a pencil
        // rather than a squiggle: a squiggle means "swipe" to somebody who
        // already knows what swiping is, and nothing to anybody else.
        for (var i = 0; i < 5; i += 1) {
          canvas.drawCircle(Offset(4.0 + i * 3.6, 19.5), 1.0, solid);
        }
        canvas.save();
        canvas.translate(13.5, 9.5);
        canvas.rotate(0.62);
        // Body.
        canvas.drawRRect(
          RRect.fromLTRBR(-2.6, -7.5, 2.6, 4.5, const Radius.circular(1.2)),
          wash,
        );
        canvas.drawRRect(
          RRect.fromLTRBR(-2.6, -7.5, 2.6, 4.5, const Radius.circular(1.2)),
          stroke,
        );
        // The band where the wood meets the paint.
        canvas.drawLine(const Offset(-2.6, 2), const Offset(2.6, 2), stroke);
        // Nib.
        final tip = Path()
          ..moveTo(-2.6, 4.5)
          ..lineTo(2.6, 4.5)
          ..lineTo(0, 8.6)
          ..close();
        canvas.drawPath(tip, solid);
        canvas.restore();

      case KidGlyph.match:
        // Two shapes joined by a line: this one goes with that one.
        canvas.drawCircle(const Offset(7, 8), 3.4, wash);
        canvas.drawCircle(const Offset(7, 8), 3.4, stroke);
        canvas.drawRRect(
          RRect.fromLTRBR(13.5, 12.5, 20.5, 19.5, const Radius.circular(2)),
          wash,
        );
        canvas.drawRRect(
          RRect.fromLTRBR(13.5, 12.5, 20.5, 19.5, const Radius.circular(2)),
          stroke,
        );
        canvas.drawLine(
          const Offset(9.4, 10.4),
          const Offset(13.4, 12.6),
          stroke,
        );

      case KidGlyph.count:
        // Three beads and a fourth being added.
        for (var i = 0; i < 3; i += 1) {
          canvas.drawCircle(Offset(6.0 + i * 5, 9), 2.6, wash);
          canvas.drawCircle(Offset(6.0 + i * 5, 9), 2.6, stroke);
        }
        canvas.drawLine(const Offset(4, 15.5), const Offset(20, 15.5), stroke);
        canvas.drawLine(const Offset(11, 19), const Offset(13, 19), stroke);
        canvas.drawLine(const Offset(12, 18), const Offset(12, 20), stroke);

      case KidGlyph.sort:
        // Shapes dropping into a box.
        canvas.drawRRect(
          RRect.fromLTRBR(4, 12, 20, 20, const Radius.circular(2.5)),
          wash,
        );
        canvas.drawRRect(
          RRect.fromLTRBR(4, 12, 20, 20, const Radius.circular(2.5)),
          stroke,
        );
        final tri = Path()
          ..moveTo(8, 3.5)
          ..lineTo(11, 9)
          ..lineTo(5, 9)
          ..close();
        canvas.drawPath(tri, stroke);
        canvas.drawCircle(const Offset(16, 6.5), 2.8, stroke);

      case KidGlyph.colour:
        // A paint blob with a brush over it.
        final blob = Path()
          ..moveTo(4, 18)
          ..cubicTo(4, 12, 9, 9, 13, 12)
          ..cubicTo(16, 14.2, 14, 19, 9, 19)
          ..cubicTo(6, 19, 4, 19, 4, 18)
          ..close();
        canvas.drawPath(blob, wash);
        canvas.drawPath(blob, stroke);
        canvas.drawLine(
          const Offset(14, 10),
          const Offset(20, 4),
          stroke..strokeWidth = 2.6,
        );
        canvas.drawCircle(const Offset(20.4, 3.6), 1.4, solid);

      case KidGlyph.cards:
        // A card in front of another, slightly turned.
        canvas.save();
        canvas.translate(9, 12);
        canvas.rotate(-0.22);
        canvas.drawRRect(
          RRect.fromLTRBR(-5, -7.5, 5, 7.5, const Radius.circular(2)),
          wash,
        );
        canvas.drawRRect(
          RRect.fromLTRBR(-5, -7.5, 5, 7.5, const Radius.circular(2)),
          stroke,
        );
        canvas.restore();
        canvas.drawRRect(
          RRect.fromLTRBR(11, 5, 21, 20, const Radius.circular(2)),
          wash,
        );
        canvas.drawRRect(
          RRect.fromLTRBR(11, 5, 21, 20, const Radius.circular(2)),
          stroke,
        );

      case KidGlyph.song:
        // Two notes joined by a beam.
        canvas.drawCircle(const Offset(7.5, 17), 2.8, wash);
        canvas.drawCircle(const Offset(7.5, 17), 2.8, stroke);
        canvas.drawCircle(const Offset(17, 15), 2.8, wash);
        canvas.drawCircle(const Offset(17, 15), 2.8, stroke);
        canvas.drawLine(
          const Offset(10.3, 17),
          const Offset(10.3, 5.5),
          stroke,
        );
        canvas.drawLine(const Offset(19.8, 15), const Offset(19.8, 4), stroke);
        canvas.drawLine(
          const Offset(10.3, 5.5),
          const Offset(19.8, 4),
          stroke..strokeWidth = 2.6,
        );

      case KidGlyph.story:
        // An open book with a page turning.
        final left = Path()
          ..moveTo(3.5, 6)
          ..cubicTo(7, 4.5, 10, 5.4, 12, 7)
          ..lineTo(12, 19)
          ..cubicTo(10, 17.4, 7, 16.6, 3.5, 18)
          ..close();
        final right = Path()
          ..moveTo(20.5, 6)
          ..cubicTo(17, 4.5, 14, 5.4, 12, 7)
          ..lineTo(12, 19)
          ..cubicTo(14, 17.4, 17, 16.6, 20.5, 18)
          ..close();
        canvas.drawPath(left, wash);
        canvas.drawPath(right, wash);
        canvas.drawPath(left, stroke);
        canvas.drawPath(right, stroke);

      case KidGlyph.choose:
        // A tick inside a rounded box: pick this one.
        canvas.drawRRect(
          RRect.fromLTRBR(3.5, 3.5, 20.5, 20.5, const Radius.circular(5)),
          wash,
        );
        canvas.drawRRect(
          RRect.fromLTRBR(3.5, 3.5, 20.5, 20.5, const Radius.circular(5)),
          stroke,
        );
        final tick = Path()
          ..moveTo(7.5, 12.5)
          ..lineTo(10.8, 15.8)
          ..lineTo(16.5, 8.8);
        canvas.drawPath(tick, stroke..strokeWidth = 2.6);

      case KidGlyph.drag:
        // A shape with a hand under it, moving right.
        canvas.drawRRect(
          RRect.fromLTRBR(3.5, 4, 12.5, 13, const Radius.circular(2.5)),
          wash,
        );
        canvas.drawRRect(
          RRect.fromLTRBR(3.5, 4, 12.5, 13, const Radius.circular(2.5)),
          stroke,
        );
        canvas.drawLine(
          const Offset(14.5, 8.5),
          const Offset(20.5, 8.5),
          stroke,
        );
        canvas.drawLine(const Offset(18, 6), const Offset(20.5, 8.5), stroke);
        canvas.drawLine(const Offset(18, 11), const Offset(20.5, 8.5), stroke);
        canvas.drawArc(
          Rect.fromLTRB(8, 14, 20, 22),
          math.pi,
          math.pi,
          false,
          stroke,
        );

      case KidGlyph.star:
        final star = Path();
        for (var i = 0; i < 10; i += 1) {
          final r = i.isEven ? 9.0 : 4.0;
          final a = -math.pi / 2 + i * math.pi / 5;
          final p = Offset(12 + r * math.cos(a), 12 + r * math.sin(a));
          i == 0 ? star.moveTo(p.dx, p.dy) : star.lineTo(p.dx, p.dy);
        }
        star.close();
        canvas.drawPath(star, wash);
        canvas.drawPath(star, stroke);
    }
  }

  @override
  bool shouldRepaint(_GlyphPainter old) =>
      old.glyph != glyph || old.ink != ink || old.fill != fill;
}

/// The glyph for a question type, as the API names it.
KidGlyph glyphForActivity(String type) => switch (type) {
  'TRACING' => KidGlyph.trace,
  'MATCHING' => KidGlyph.match,
  'COUNTING' => KidGlyph.count,
  'SORTING' => KidGlyph.sort,
  'COLOURING' => KidGlyph.colour,
  'FLASHCARD' => KidGlyph.cards,
  'RHYME' => KidGlyph.song,
  'STORY' => KidGlyph.story,
  'SINGLE_CHOICE' || 'MULTIPLE_CHOICE' => KidGlyph.choose,
  'DRAG_DROP' => KidGlyph.drag,
  _ => KidGlyph.book,
};
