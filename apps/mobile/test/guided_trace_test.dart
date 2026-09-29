import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/features/tracing/guided_trace.dart';

/// The letter A as the server sends it: two diagonals from the top, then the
/// bar.
final letterA = [
  [const Offset(0.5, 0.13), const Offset(0.22, 0.87)],
  [const Offset(0.5, 0.13), const Offset(0.78, 0.87)],
  [const Offset(0.3, 0.63), const Offset(0.7, 0.63)],
];

/// An O: one stroke that ends where it began.
final letterO = [
  [
    for (var i = 0; i <= 60; i++)
      Offset(
        0.5 + 0.3 * math.sin(i / 60 * 2 * math.pi),
        0.5 - 0.35 * math.cos(i / 60 * 2 * math.pi),
      ),
  ],
];

const tolerance = 0.07;

/// Drags a finger from [from] to [to] in small steps, as a real one moves.
List<TraceEvent> drag(GuidedTrace trace, Offset from, Offset to) {
  final events = <TraceEvent>[trace.touchDown(from, tolerance)];
  for (var i = 1; i <= 40; i++) {
    events.add(trace.touchMove(Offset.lerp(from, to, i / 40)!, tolerance));
  }
  trace.touchUp();
  return events;
}

void main() {
  test('an A traced stroke by stroke, in order, is complete', () {
    final trace = GuidedTrace(letterA);

    expect(
      drag(trace, letterA[0][0], letterA[0][1]),
      contains(TraceEvent.strokeDone),
    );
    expect(trace.currentStroke, 1);
    expect(
      drag(trace, letterA[1][0], letterA[1][1]),
      contains(TraceEvent.strokeDone),
    );
    expect(
      drag(trace, letterA[2][0], letterA[2][1]),
      contains(TraceEvent.complete),
    );
    expect(trace.isComplete, isTrue);
  });

  test('the strokes open in order — the bar first does nothing', () {
    final trace = GuidedTrace(letterA);

    final events = drag(trace, letterA[2][0], letterA[2][1]);

    expect(events.first, TraceEvent.wrongStart);
    expect(trace.currentStroke, 0);
    expect(trace.progressOf(0), 0);
  });

  test('a stroke drawn backwards does not count', () {
    final trace = GuidedTrace(letterA);

    final events = drag(trace, letterA[0][1], letterA[0][0]);

    expect(events.first, TraceEvent.wrongStart);
    expect(trace.progressOf(0), 0);
  });

  test('scribbling over the whole box finishes nothing', () {
    final trace = GuidedTrace(letterA);
    final random = math.Random(7);

    for (var s = 0; s < 30; s++) {
      final from = Offset(random.nextDouble(), random.nextDouble());
      final to = Offset(random.nextDouble(), random.nextDouble());
      drag(trace, from, to);
    }

    expect(trace.currentStroke, 0);
  });

  test('lifting the finger keeps the work, and the next touch carries on', () {
    final trace = GuidedTrace(letterA);
    final half = Offset.lerp(letterA[0][0], letterA[0][1], 0.5)!;

    drag(trace, letterA[0][0], half);
    final halfway = trace.progressOf(0);
    expect(halfway, greaterThan(0.4));
    expect(halfway, lessThan(0.6));

    // Coming down at the start again is not where they left off.
    expect(trace.touchDown(letterA[0][0], tolerance), TraceEvent.wrongStart);
    trace.touchUp();

    expect(drag(trace, half, letterA[0][1]), contains(TraceEvent.strokeDone));
  });

  test(
    'wandering off the path stops the stroke until the finger comes back',
    () {
      final trace = GuidedTrace(letterA);

      trace.touchDown(letterA[0][0], tolerance);
      expect(
        trace.touchMove(const Offset(0.9, 0.2), tolerance),
        TraceEvent.offTrack,
      );
      expect(trace.isTracking, isFalse);

      // Further moves, even back on the line, do nothing until a new touch.
      expect(trace.touchMove(letterA[0][1], tolerance), TraceEvent.none);
      expect(trace.currentStroke, 0);
    },
  );

  test('an O is not finished by touching where it began', () {
    final trace = GuidedTrace(letterO);
    final start = letterO[0].first;

    trace.touchDown(start, tolerance);
    trace.touchMove(start, tolerance);
    trace.touchMove(letterO[0][1], tolerance);

    expect(trace.isComplete, isFalse);
    expect(trace.progressOf(0), lessThan(0.2));
  });

  test('an O traced all the way round is complete', () {
    final trace = GuidedTrace(letterO);

    var last = TraceEvent.none;
    last = trace.touchDown(letterO[0].first, tolerance);
    for (final point in letterO[0].skip(1)) {
      final event = trace.touchMove(point, tolerance);
      if (event != TraceEvent.none) last = event;
    }

    expect(last, TraceEvent.complete);
  });

  test('a quick finger that skips a few points still counts', () {
    final trace = GuidedTrace([letterA[2]]);

    trace.touchDown(letterA[2][0], tolerance);
    trace.touchMove(
      Offset.lerp(letterA[2][0], letterA[2][1], 0.25)!,
      tolerance,
    );
    trace.touchMove(Offset.lerp(letterA[2][0], letterA[2][1], 0.5)!, tolerance);
    trace.touchMove(
      Offset.lerp(letterA[2][0], letterA[2][1], 0.75)!,
      tolerance,
    );
    final last = trace.touchMove(letterA[2][1], tolerance);

    expect(last, TraceEvent.complete);
  });

  test('the head and its direction lead the child along the stroke', () {
    final trace = GuidedTrace(letterA);

    expect(trace.head, letterA[0][0]);
    final direction = trace.headDirection!;
    // Down and to the left.
    expect(direction.dx, lessThan(0));
    expect(direction.dy, greaterThan(0));
  });

  group('in free order', () {
    test('any part may come first, and either way round', () {
      final trace = GuidedTrace(letterA, ordered: false);

      // The bar first, drawn right to left, then the diagonals upwards.
      drag(trace, letterA[2][1], letterA[2][0]);
      expect(trace.progressOf(2), 1);
      drag(trace, letterA[1][1], letterA[1][0]);
      final last = drag(trace, letterA[0][1], letterA[0][0]);

      expect(last, contains(TraceEvent.complete));
      expect(trace.isComplete, isTrue);
    });

    test('scribbling over the box still finishes nothing', () {
      final trace = GuidedTrace(letterA, ordered: false);
      final random = math.Random(11);

      for (var s = 0; s < 30; s++) {
        drag(
          trace,
          Offset(random.nextDouble(), random.nextDouble()),
          Offset(random.nextDouble(), random.nextDouble()),
        );
      }

      expect(trace.isComplete, isFalse);
    });

    test('a touch off the letter does not start a trace', () {
      final trace = GuidedTrace(letterA, ordered: false);

      expect(
        trace.touchDown(const Offset(0.95, 0.05), tolerance),
        TraceEvent.wrongStart,
      );
    });

    test('leaving the letter stops the trace until the next touch', () {
      final trace = GuidedTrace(letterA, ordered: false);

      trace.touchDown(letterA[2][0], tolerance);
      expect(
        trace.touchMove(const Offset(0.95, 0.05), tolerance),
        TraceEvent.offTrack,
      );
      expect(trace.touchMove(letterA[2][1], tolerance), TraceEvent.none);
      expect(trace.progressOf(2), lessThan(1));
    });

    test('a part half traced shows as traced runs, and the rest as dots', () {
      final trace = GuidedTrace(letterA, ordered: false);
      final half = Offset.lerp(letterA[0][0], letterA[0][1], 0.5)!;

      drag(trace, letterA[0][0], half);

      expect(trace.tracedRunsOf(0), hasLength(1));
      expect(trace.progressOf(0), inInclusiveRange(0.4, 0.65));
      expect(trace.isCovered(0, 0), isTrue);
      expect(trace.isCovered(0, trace.strokes[0].length - 1), isFalse);
    });
  });
}
