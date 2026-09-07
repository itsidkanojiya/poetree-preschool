import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/features/activities/trace_check.dart';

/// The rule that decides whether a child traced the number or drew something
/// else. Written as examples, because "0.62 coverage" means nothing on its own
/// and "a wobbly one passes, a circle does not" is the actual requirement.
void main() {
  const size = Size(300, 600);

  /// The numeral one, as the content defines it: a single stroke straight down.
  const one = [
    [(x: 0.5, y: 0.15), (x: 0.5, y: 0.85)],
  ];

  /// Points down the same line, with [wobble] pixels of sideways error and
  /// covering [fraction] of its length.
  List<Offset> downTheLine({double wobble = 0, double fraction = 1}) {
    final random = math.Random(7);
    final top = 0.15 * size.height;
    final bottom = top + (0.85 - 0.15) * size.height * fraction;

    return [
      for (var y = top; y <= bottom; y += 4)
        Offset(
          size.width * 0.5 + (random.nextDouble() * 2 - 1) * wobble,
          y,
        ),
    ];
  }

  test('a clean trace passes', () {
    final result = checkTrace(strokes: one, drawn: downTheLine(), size: size);

    expect(result.coverage, greaterThan(0.9));
    expect(result.accuracy, greaterThan(0.9));
    expect(result.passes, isTrue);
  });

  test('a wobbly trace passes, because a three-year-old drew it', () {
    final result = checkTrace(
      strokes: one,
      drawn: downTheLine(wobble: 20),
      size: size,
    );

    expect(result.passes, isTrue);
  });

  test('stopping a third of the way down does not pass', () {
    // Neat, on the line, and not a one. This is the failure the coverage
    // measure exists for.
    final result = checkTrace(
      strokes: one,
      drawn: downTheLine(fraction: 0.33),
      size: size,
    );

    expect(result.accuracy, greaterThan(0.9));
    expect(result.coverage, lessThan(TraceCheck.minCoverage));
    expect(result.passes, isFalse);
    expect(result.hint, contains('whole line'));
  });

  test('a scribble over the whole box does not pass', () {
    // Covers the guide completely — by covering everything. This is the
    // failure the accuracy measure exists for, and the one that used to
    // finish the page.
    final random = math.Random(3);
    final scribble = [
      for (var i = 0; i < 400; i++)
        Offset(
          random.nextDouble() * size.width,
          random.nextDouble() * size.height,
        ),
    ];

    final result = checkTrace(strokes: one, drawn: scribble, size: size);

    expect(result.accuracy, lessThan(TraceCheck.minAccuracy));
    expect(result.passes, isFalse);
    expect(result.hint, contains('stay on the line'));
  });

  test('a circle where a one belongs does not pass', () {
    final circle = [
      for (var i = 0; i < 120; i++)
        Offset(
          size.width * 0.5 + math.cos(i / 120 * 2 * math.pi) * 90,
          size.height * 0.5 + math.sin(i / 120 * 2 * math.pi) * 90,
        ),
    ];

    expect(checkTrace(strokes: one, drawn: circle, size: size).passes, isFalse);
  });

  test('a single touch is not an attempt', () {
    final result = checkTrace(
      strokes: one,
      drawn: [Offset(size.width * 0.5, size.height * 0.5)],
      size: size,
    );

    expect(result.passes, isFalse);
    expect(result.coverage, 0);
  });

  test('an item with no strokes lets the child through', () {
    // A content fault must not trap a child on a page they cannot finish.
    final result = checkTrace(
      strokes: const [],
      drawn: downTheLine(),
      size: size,
    );

    expect(result.passes, isTrue);
  });

  test('a four missing its stem does not pass', () {
    // Exactly what a child drew on a real phone and was told "that looks like
    // it": the diagonal and the crossbar traced neatly, the long stem down the
    // right never touched. Averaged over the whole shape that cleared the bar,
    // which is why coverage is now the worst stroke rather than the mean.
    const four = [
      [(x: 0.62, y: 0.12), (x: 0.28, y: 0.62)],
      [(x: 0.28, y: 0.62), (x: 0.78, y: 0.62)],
      [(x: 0.62, y: 0.12), (x: 0.62, y: 0.9)],
    ];

    final diagonalAndBar = <Offset>[
      for (var t = 0.0; t <= 1.0; t += 0.02)
        Offset(
          (0.62 + (0.28 - 0.62) * t) * size.width,
          (0.12 + (0.62 - 0.12) * t) * size.height,
        ),
      for (var t = 0.0; t <= 1.0; t += 0.02)
        Offset((0.28 + 0.5 * t) * size.width, 0.62 * size.height),
    ];

    final result = checkTrace(
      strokes: four,
      drawn: diagonalAndBar,
      size: size,
    );

    expect(result.passes, isFalse);
    expect(result.hint, contains('whole line'));
  });

  test('a two-stroke shape needs both strokes', () {
    // The numeral four, roughly: a diagonal and a crossbar. Drawing only the
    // crossbar is half the shape and must not pass.
    const four = [
      [(x: 0.55, y: 0.15), (x: 0.25, y: 0.6)],
      [(x: 0.25, y: 0.6), (x: 0.8, y: 0.6)],
    ];

    final crossbarOnly = [
      for (var x = 0.25; x <= 0.8; x += 0.01)
        Offset(x * size.width, 0.6 * size.height),
    ];

    expect(
      checkTrace(strokes: four, drawn: crossbarOnly, size: size).passes,
      isFalse,
    );
  });
}
