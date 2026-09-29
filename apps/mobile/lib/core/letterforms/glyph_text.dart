import 'dart:async';

import 'package:flutter/material.dart';

import 'letterforms.dart';

/// A letter, number or pattern in the school's own handwriting.
///
/// Wherever a character is shown to a child — a question, an answer tile, a
/// game, the tracing screen — it is drawn from the school's sheet rather than
/// the app's typeface, so the "a" they are asked to find is the "a" they are
/// taught to write. Anything not on the sheet (an emoji, a picture word) is
/// drawn as ordinary text, at the same size.
///
/// [size] is the height of the drawn character. Solid by default, which reads
/// best at a glance; [dotted] draws it as the sheet does, a dot at a time.
class GlyphText extends StatefulWidget {
  const GlyphText(
    this.glyph, {
    this.size = 48,
    this.color,
    this.dotted = false,
    this.weight = 1,
    super.key,
  });

  final String glyph;
  final double size;
  final Color? color;
  final bool dotted;

  /// Line thickness, relative to the usual.
  final double weight;

  @override
  State<GlyphText> createState() => _GlyphTextState();
}

class _GlyphTextState extends State<GlyphText> {
  @override
  void initState() {
    super.initState();
    if (Letterforms.current == null) {
      unawaited(
        Letterforms.load().then((_) {
          if (mounted) setState(() {});
        }),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final colour =
        widget.color ??
        DefaultTextStyle.of(context).style.color ??
        Theme.of(context).colorScheme.onSurface;
    final shapes = Letterforms.current?.shapesFor(widget.glyph);

    if (shapes == null) {
      return Text(
        widget.glyph,
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: widget.size * 0.9,
          color: widget.color,
          height: 1.1,
        ),
      );
    }

    final run = LetterformRun(shapes);
    final bounds = run.bounds;
    // A line has no height of its own (a hyphen, a sleeping line): give it
    // the room a letter would have.
    final unitHeight = bounds.height < 0.2 ? 1.0 : bounds.height;
    final scale = widget.size / unitHeight;
    final pad = widget.size * 0.08;

    return Semantics(
      label: Letterforms.current?.patternNames[widget.glyph] ?? widget.glyph,
      child: CustomPaint(
        size: Size(
          bounds.width * scale + pad * 2,
          bounds.height * scale + pad * 2,
        ),
        painter: _LetterformPainter(
          run: run,
          scale: scale,
          pad: pad,
          colour: colour,
          dotted: widget.dotted,
          weight: widget.weight,
          size: widget.size,
        ),
      ),
    );
  }
}

class _LetterformPainter extends CustomPainter {
  _LetterformPainter({
    required this.run,
    required this.scale,
    required this.pad,
    required this.colour,
    required this.dotted,
    required this.weight,
    required this.size,
  });

  final LetterformRun run;
  final double scale;
  final double pad;
  final Color colour;
  final bool dotted;
  final double weight;
  final double size;

  @override
  void paint(Canvas canvas, Size canvasSize) {
    final origin = Offset(pad, pad) - run.bounds.topLeft * scale;
    Offset at(Offset dot) => origin + dot * scale;

    if (dotted) {
      final paint = Paint()..color = colour;
      final radius = (size * 0.035 * weight).clamp(1.2, 12.0);
      for (final dot in run.dots) {
        canvas.drawCircle(at(dot), radius, paint);
      }
      return;
    }

    final width = (size * 0.1 * weight).clamp(1.5, 40.0);
    final line = Paint()
      ..color = colour
      ..strokeWidth = width
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    for (final (a, b) in run.links) {
      canvas.drawLine(at(run.dots[a]), at(run.dots[b]), line);
    }
    // Every dot too, so a dot on its own (the dot of an i) is drawn and the
    // joins are round.
    final dot = Paint()..color = colour;
    for (final point in run.dots) {
      canvas.drawCircle(at(point), width / 2, dot);
    }
  }

  @override
  bool shouldRepaint(_LetterformPainter old) =>
      old.run != run ||
      old.colour != colour ||
      old.scale != scale ||
      old.dotted != dotted ||
      old.weight != weight;
}
