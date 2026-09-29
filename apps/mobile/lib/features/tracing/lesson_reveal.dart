import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/letterforms/glyph_text.dart';
import 'trace_lessons.dart';

/// What a traced letter or number teaches, shown once it is traced.
///
/// A letter: the big letter pops in, its object slides in and keeps bobbing,
/// its word appears with the first letter in the paint colour, and the voice
/// says "A for Apple. Apple starts with A."
///
/// A number: the big numeral, then that many objects popping in one at a time
/// while the voice counts them — "one, two, three" — then "Three stars."
///
/// Without a picture for the object, a letter shows its word as the picture
/// and a number counts bubbles instead. Never an emoji, never a blank.
class LessonReveal extends StatefulWidget {
  const LessonReveal({
    required this.lesson,
    required this.colour,
    required this.say,
    required this.onDone,
    super.key,
  });

  final TraceLesson lesson;

  /// The paint the child traced with; the lesson carries it on.
  final Color colour;

  /// Speaks a line, cutting off whatever was being said.
  final void Function(String text) say;

  /// Called once everything has been shown and said: Next can open.
  final VoidCallback onDone;

  @override
  State<LessonReveal> createState() => _LessonRevealState();
}

const _numberWords = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

class _LessonRevealState extends State<LessonReveal>
    with TickerProviderStateMixin {
  late final AnimationController _enter;
  late final AnimationController _bob;
  late final AnimationController _count;
  final _timers = <Timer>[];

  /// How long each counted object takes to arrive.
  static const _perItem = Duration(milliseconds: 650);

  TraceLesson get _lesson => widget.lesson;
  int get _items => _lesson.isNumber ? _lesson.count.clamp(0, 10) : 0;

  @override
  void initState() {
    super.initState();
    _enter = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..forward();
    _bob = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
    _count = AnimationController(
      vsync: this,
      duration: _perItem * math.max(_items, 1),
    );

    if (_lesson.isNumber && _items > 0) {
      // Counting starts once the numeral has landed.
      _later(
        const Duration(milliseconds: 700),
        () => unawaited(_count.forward()),
      );
      for (var i = 1; i <= _items; i++) {
        _later(
          const Duration(milliseconds: 700) + _perItem * (i - 1),
          () => widget.say(_numberWords[i]),
        );
      }
      final counted = const Duration(milliseconds: 900) + _perItem * _items;
      _later(counted, () => widget.say(_lesson.say));
      _later(counted + const Duration(milliseconds: 1400), widget.onDone);
    } else {
      _later(const Duration(milliseconds: 700), () => widget.say(_lesson.say));
      _later(const Duration(milliseconds: 1900), widget.onDone);
    }
  }

  void _later(Duration after, VoidCallback action) {
    _timers.add(
      Timer(after, () {
        if (mounted) action();
      }),
    );
  }

  @override
  void dispose() {
    for (final timer in _timers) {
      timer.cancel();
    }
    _enter.dispose();
    _bob.dispose();
    _count.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final side = math.min(constraints.maxWidth, constraints.maxHeight);

        return Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ScaleTransition(
                scale: CurvedAnimation(
                  parent: _enter,
                  curve: const Interval(0, 0.6, curve: Curves.elasticOut),
                ),
                child: _BigGlyph(
                  glyph: _lesson.glyph,
                  colour: widget.colour,
                  size: side * (_lesson.isPattern ? 0.34 : 0.28),
                ),
              ),
              SizedBox(height: side * 0.04),
              Flexible(
                // Nothing more to show for a pattern, or a letter the
                // catalogue has no word for yet: the letter is the picture.
                child:
                    _lesson.isPattern ||
                        (!_lesson.isNumber &&
                            _lesson.word == null &&
                            _lesson.imagePath == null)
                    ? const SizedBox.shrink()
                    : _lesson.isNumber
                    ? _Counted(
                        lesson: _lesson,
                        items: _items,
                        count: _count,
                        colour: widget.colour,
                        side: side,
                      )
                    : _Object(
                        lesson: _lesson,
                        enter: _enter,
                        bob: _bob,
                        colour: widget.colour,
                        side: side,
                      ),
              ),
              SizedBox(height: side * 0.04),
              FadeTransition(
                opacity: CurvedAnimation(
                  parent: _enter,
                  curve: const Interval(0.5, 1),
                ),
                child: _Caption(lesson: _lesson, colour: widget.colour),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// The letter or number, large, in the child's paint, outlined in white.
class _BigGlyph extends StatelessWidget {
  const _BigGlyph({
    required this.glyph,
    required this.colour,
    required this.size,
  });

  final String glyph;
  final Color colour;
  final double size;

  @override
  Widget build(BuildContext context) {
    // In the school's handwriting, as it was just traced: a lavender edge
    // under the child's paint.
    return Stack(
      alignment: Alignment.center,
      children: [
        GlyphText(
          glyph,
          size: size,
          weight: 2.1,
          color: const Color(0xFF8E9BEA),
        ),
        GlyphText(glyph, size: size, weight: 1.4, color: colour),
      ],
    );
  }
}

/// A letter's object: its picture sliding in and bobbing, or the word itself.
class _Object extends StatelessWidget {
  const _Object({
    required this.lesson,
    required this.enter,
    required this.bob,
    required this.colour,
    required this.side,
  });

  final TraceLesson lesson;
  final Animation<double> enter;
  final Animation<double> bob;
  final Color colour;
  final double side;

  @override
  Widget build(BuildContext context) {
    final arrive = CurvedAnimation(
      parent: enter,
      curve: const Interval(0.3, 1, curve: Curves.elasticOut),
    );

    final Widget picture = lesson.imagePath != null
        ? Image.asset(
            lesson.imagePath!,
            width: side * 0.46,
            height: side * 0.46,
            fit: BoxFit.contain,
          )
        : _WordPicture(
            word: lesson.word ?? lesson.glyph,
            colour: colour,
            side: side,
          );

    return AnimatedBuilder(
      animation: Listenable.merge([arrive, bob]),
      builder: (context, child) {
        final value = arrive.value;
        return Transform.translate(
          offset: Offset(
            (1 - value) * side * 0.6,
            math.sin(bob.value * math.pi) * -side * 0.025,
          ),
          child: Transform.rotate(
            angle: (1 - value) * 0.4,
            child: Opacity(opacity: value.clamp(0.0, 1.0), child: child),
          ),
        );
      },
      child: picture,
    );
  }
}

/// A letter's word drawn as the picture, until a picture is added.
class _WordPicture extends StatelessWidget {
  const _WordPicture({
    required this.word,
    required this.colour,
    required this.side,
  });

  final String word;
  final Color colour;
  final double side;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: side * 0.07,
        vertical: side * 0.04,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(side * 0.08),
        border: Border.all(color: colour.withValues(alpha: 0.35), width: 3),
        boxShadow: [
          BoxShadow(
            color: colour.withValues(alpha: 0.2),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: FittedBox(
        child: _Word(word: word, colour: colour, size: side * 0.14),
      ),
    );
  }
}

/// A word with its first letter picked out in the paint colour.
class _Word extends StatelessWidget {
  const _Word({required this.word, required this.colour, required this.size});

  final String word;
  final Color colour;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (word.isEmpty) return const SizedBox.shrink();
    return Text.rich(
      TextSpan(
        style: TextStyle(
          fontSize: size,
          fontWeight: FontWeight.w800,
          color: const Color(0xFF3A3F5C),
          height: 1.1,
        ),
        children: [
          TextSpan(
            text: word.substring(0, 1),
            style: TextStyle(color: colour),
          ),
          TextSpan(text: word.substring(1)),
        ],
      ),
    );
  }
}

/// A number's objects, arriving one at a time as they are counted.
class _Counted extends StatelessWidget {
  const _Counted({
    required this.lesson,
    required this.items,
    required this.count,
    required this.colour,
    required this.side,
  });

  final TraceLesson lesson;
  final int items;
  final Animation<double> count;
  final Color colour;
  final double side;

  static const _bubbles = [
    Color(0xFFFF6B6B),
    Color(0xFFFFB547),
    Color(0xFF2EC4A0),
    Color(0xFF3FA9F5),
    Color(0xFF7B5CF0),
    Color(0xFFF0648C),
  ];

  @override
  Widget build(BuildContext context) {
    if (items == 0) return const SizedBox.shrink();

    // Five to a row at most, so ten reads as two rows of five.
    final perRow = math.min(items, 5);
    final size = math.min(side * 0.17, side * 0.9 / perRow - 8);

    return AnimatedBuilder(
      animation: count,
      builder: (context, _) {
        return Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          runSpacing: 8,
          children: [
            for (var i = 0; i < items; i++) _pop(i, size, _item(i, size)),
          ],
        );
      },
    );
  }

  /// Item [i] grows in during its own slice of the count.
  Widget _pop(int i, double size, Widget child) {
    final start = i / items;
    final end = (i + 1) / items;
    final t = ((count.value - start) / (end - start)).clamp(0.0, 1.0);
    final scale = Curves.elasticOut.transform(t);
    return SizedBox(
      width: size,
      height: size,
      child: Transform.scale(scale: scale, child: child),
    );
  }

  Widget _item(int i, double size) {
    if (lesson.imagePath != null) {
      return Image.asset(lesson.imagePath!, fit: BoxFit.contain);
    }
    final bubble = _bubbles[i % _bubbles.length];
    return DecoratedBox(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          center: const Alignment(-0.3, -0.4),
          colors: [Color.lerp(bubble, Colors.white, 0.45)!, bubble],
        ),
        boxShadow: [
          BoxShadow(
            color: bubble.withValues(alpha: 0.35),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Center(
        child: Text(
          '${i + 1}',
          style: TextStyle(
            color: Colors.white,
            fontSize: size * 0.42,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

/// "A for Apple" under a letter; "Three stars" under a number.
class _Caption extends StatelessWidget {
  const _Caption({required this.lesson, required this.colour});

  final TraceLesson lesson;
  final Color colour;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final word = lesson.word;

    final String text;
    if (lesson.isPattern) {
      text = word ?? 'Well done!';
    } else if (lesson.isNumber) {
      final name = lesson.countName ?? '${lesson.count}';
      final what = lesson.imagePath != null ? lesson.objectName : null;
      final spoken = what == null ? name : '$name $what';
      text = spoken.substring(0, 1).toUpperCase() + spoken.substring(1);
    } else {
      text = word == null ? lesson.glyph : '${lesson.glyph} for $word';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: Color.lerp(colour, Colors.black, 0.25),
        ),
      ),
    );
  }
}
