import 'dart:math' as math;
import 'dart:ui';

/// What a finger movement did to the trace.
enum TraceEvent {
  /// Nothing changed: the finger is resting, or moving where it cannot help.
  none,

  /// The traced part of the current stroke grew.
  advanced,

  /// A stroke is finished.
  strokeDone,

  /// Every stroke is finished.
  complete,

  /// The finger came down away from where tracing can carry on.
  wrongStart,

  /// The finger wandered off the path while tracing.
  offTrack,
}

/// Guided tracing of one letter, number or pattern.
///
/// The shape is a list of strokes, each a run of points in a 0–1 box — the
/// same data for A, 7, अ or અ, so nothing here knows which one it is drawing.
///
/// **In order** (the default), the child can only ever move the current
/// stroke forward:
///
///  * A touch counts only if it lands near the head — the start of the stroke,
///    or wherever they stopped on it.
///  * Moving advances the head along the stroke as far as the finger reaches,
///    looking only a short way ahead. A finger cannot jump to the far end, go
///    backwards, or finish a loop by touching where it began.
///  * Strokes open one at a time, in order.
///
/// **In free order** — for a shape whose stroke order is not taught yet, such
/// as the Hindi and Gujarati letters — any part may be traced first and either
/// way round. Each part fills in as the finger goes over it, and the shape is
/// done when every part is.
///
/// In both, the finger has to stay on the path: leaving it stops the trace
/// until the next touch, so scribbling over the whole box does nothing.
/// Lifting the finger keeps what was done.
///
/// Positions are in the same 0–1 box as the strokes. The caller converts from
/// screen pixels, which keeps this free of any widget and easy to test.
class GuidedTrace {
  GuidedTrace(
    List<List<Offset>> strokes, {
    double spacing = 0.01,
    this.ordered = true,
  }) : _samples = [
         for (final stroke in strokes)
           if (stroke.length >= 2) _resample(stroke, spacing),
       ],
       _spacing = spacing {
    _covered = [for (final s in _samples) List.filled(s.length, false)];
  }

  final List<List<Offset>> _samples;
  final double _spacing;

  /// Whether the strokes must be traced in order, each from its start.
  final bool ordered;

  // In order: which stroke, and how far along it.
  int _stroke = 0;
  int _head = 0;

  // In free order: which points of each stroke have been gone over.
  late List<List<bool>> _covered;
  final _finished = <int>{};

  /// A part counts as traced once this much of it is covered.
  static const _enough = 0.9;

  /// Whether the finger currently down is allowed to trace.
  bool _tracking = false;

  /// The strokes as evenly spaced points, for drawing.
  List<List<Offset>> get strokes => _samples;

  int get strokeCount => _samples.length;

  /// The stroke to trace next — in free order, the first one not yet done.
  /// Equal to [strokeCount] once complete.
  int get currentStroke {
    if (ordered) return _stroke;
    for (var i = 0; i < _samples.length; i++) {
      if (!_finished.contains(i)) return i;
    }
    return _samples.length;
  }

  bool get isComplete => ordered
      ? _stroke >= _samples.length
      : _finished.length >= _samples.length;

  /// How many strokes are finished.
  int get strokesDone => ordered ? _stroke : _finished.length;

  /// Whether a finger is down and tracing.
  bool get isTracking => _tracking;

  /// How much of stroke [index] is traced, 0–1.
  double progressOf(int index) {
    if (!ordered) {
      if (_finished.contains(index)) return 1;
      final covered = _covered[index].where((c) => c).length;
      return covered / _covered[index].length;
    }
    if (index < _stroke) return 1;
    if (index > _stroke || isComplete) return index < _stroke ? 1 : 0;
    final last = _samples[index].length - 1;
    return last <= 0 ? 1 : _head / last;
  }

  /// Whether sample [point] of stroke [index] has been traced over.
  bool isCovered(int index, int point) {
    if (!ordered) return _finished.contains(index) || _covered[index][point];
    if (index < _stroke) return true;
    if (index > _stroke) return false;
    return point <= _head;
  }

  /// The traced part of stroke [index], as points (in order: one run from the
  /// start).
  List<Offset> tracedOf(int index) {
    if (!ordered) {
      final runs = tracedRunsOf(index);
      return runs.isEmpty ? const [] : runs.first;
    }
    if (index < _stroke) return _samples[index];
    if (index > _stroke || isComplete) return const [];
    return _samples[index].sublist(0, _head + 1);
  }

  /// The traced parts of stroke [index] as unbroken runs, for painting.
  List<List<Offset>> tracedRunsOf(int index) {
    if (ordered) {
      final traced = tracedOf(index);
      return traced.length >= 2 ? [traced] : const [];
    }
    if (_finished.contains(index)) return [_samples[index]];
    final runs = <List<Offset>>[];
    List<Offset>? run;
    for (var i = 0; i < _samples[index].length; i++) {
      if (_covered[index][i]) {
        (run ??= <Offset>[]).add(_samples[index][i]);
      } else if (run != null) {
        if (run.length >= 2) runs.add(run);
        run = null;
      }
    }
    if (run != null && run.length >= 2) runs.add(run);
    return runs;
  }

  /// Where on [currentStroke] tracing carries on from, as a sample index.
  int get headIndex {
    if (isComplete) return 0;
    if (ordered) return _head;
    final covered = _covered[currentStroke];
    final first = covered.indexOf(false);
    return first < 0 ? 0 : first;
  }

  /// Where the next touch should land. Null once complete.
  Offset? get head => isComplete ? null : _samples[currentStroke][headIndex];

  /// The direction the stroke heads in from [head], for an arrow.
  Offset? get headDirection {
    if (isComplete) return null;
    final points = _samples[currentStroke];
    final at = headIndex;
    final to = math.min(at + 4, points.length - 1);
    final from = to == at ? math.max(at - 4, 0) : at;
    final delta = points[to] - points[from];
    return delta.distance == 0 ? null : delta / delta.distance;
  }

  /// A finger came down at [point].
  ///
  /// [tolerance] is how far from the path still counts as on it, in the same
  /// 0–1 units.
  TraceEvent touchDown(Offset point, double tolerance) {
    if (isComplete) return TraceEvent.none;

    if (ordered) {
      // Near the head, not merely near the path: starting a stroke in its
      // middle is not writing it.
      if ((point - head!).distance > tolerance * 1.3) {
        _tracking = false;
        return TraceEvent.wrongStart;
      }
    } else if (_nearest(point) > tolerance * 1.3) {
      // Anywhere on the letter will do — but on it.
      _tracking = false;
      return TraceEvent.wrongStart;
    }

    _tracking = true;
    return touchMove(point, tolerance);
  }

  /// The finger moved to [point].
  TraceEvent touchMove(Offset point, double tolerance) {
    if (isComplete || !_tracking) return TraceEvent.none;
    return ordered
        ? _moveInOrder(point, tolerance)
        : _moveFree(point, tolerance);
  }

  TraceEvent _moveInOrder(Offset point, double tolerance) {
    final points = _samples[_stroke];

    // Only a short way ahead: enough to keep up with a quick finger, never
    // enough to reach round a loop or across to another part of the stroke.
    final window = math.max(3, (tolerance * 2.5 / _spacing).ceil());
    final limit = math.min(points.length - 1, _head + window);

    var reached = -1;
    for (var i = _head; i <= limit; i++) {
      if ((points[i] - point).distance <= tolerance) reached = i;
    }

    if (reached < 0) {
      // Off the path. The finger has to come back to the head to carry on,
      // which is exactly what the arrow and the dot are showing.
      if ((points[_head] - point).distance > tolerance * 1.6) {
        _tracking = false;
        return TraceEvent.offTrack;
      }
      return TraceEvent.none;
    }

    if (reached <= _head) return TraceEvent.none;
    _head = reached;

    // Finished by distance along the stroke rather than by being near its end
    // point: an O ends where it starts, and would otherwise finish at once.
    final tail = math.max(1, (tolerance * 0.5 / _spacing).floor());
    if (_head >= points.length - 1 - tail) {
      _stroke += 1;
      _head = 0;
      _tracking = false;
      return isComplete ? TraceEvent.complete : TraceEvent.strokeDone;
    }

    return TraceEvent.advanced;
  }

  TraceEvent _moveFree(Offset point, double tolerance) {
    // Travelling along a finished part to reach the next is still on the
    // letter; only leaving the letter altogether stops the trace.
    if (_nearest(point) > tolerance * 1.6) {
      _tracking = false;
      return TraceEvent.offTrack;
    }

    var grew = false;
    var done = false;
    for (var s = 0; s < _samples.length; s++) {
      if (_finished.contains(s)) continue;
      final points = _samples[s];
      for (var i = 0; i < points.length; i++) {
        if (!_covered[s][i] && (points[i] - point).distance <= tolerance) {
          _covered[s][i] = true;
          grew = true;
        }
      }
      if (progressOf(s) >= _enough) {
        _finished.add(s);
        done = true;
      }
    }

    if (isComplete) {
      _tracking = false;
      return TraceEvent.complete;
    }
    if (done) return TraceEvent.strokeDone;
    return grew ? TraceEvent.advanced : TraceEvent.none;
  }

  /// How far [point] is from the nearest point of any stroke.
  double _nearest(Offset point) {
    var best = double.infinity;
    for (final stroke in _samples) {
      for (final p in stroke) {
        final d = (p - point).distance;
        if (d < best) best = d;
      }
    }
    return best;
  }

  /// The finger lifted. What was traced stays traced.
  void touchUp() => _tracking = false;

  /// Back to the start, nothing traced.
  void reset() {
    _stroke = 0;
    _head = 0;
    _tracking = false;
    _finished.clear();
    _covered = [for (final s in _samples) List.filled(s.length, false)];
  }

  /// Marks every stroke traced — a shape already done, shown finished.
  void completeAll() {
    _stroke = _samples.length;
    _head = 0;
    _tracking = false;
    _finished.addAll([for (var i = 0; i < _samples.length; i++) i]);
  }

  /// A stroke as points [spacing] apart along its length, first and last kept.
  static List<Offset> _resample(List<Offset> stroke, double spacing) {
    final out = <Offset>[stroke.first];
    var carried = 0.0;

    for (var i = 1; i < stroke.length; i++) {
      final from = stroke[i - 1];
      final to = stroke[i];
      final length = (to - from).distance;
      if (length == 0) continue;

      var at = spacing - carried;
      while (at <= length) {
        out.add(Offset.lerp(from, to, at / length)!);
        at += spacing;
      }
      carried = length - (at - spacing);
    }

    if ((out.last - stroke.last).distance > spacing * 0.25) {
      out.add(stroke.last);
    }
    return out;
  }
}
