import 'dart:math' as math;
import 'dart:ui';

/// Whether a child's finger actually traced the shape they were shown.
///
/// "Any line counts" was the old rule, and it meant a scribble across the box
/// finished the page. A child being taught to write a one learns nothing from
/// being told they got it right for drawing a cloud.
///
/// Two measures, because either one alone is easy to cheat:
///
///   * **Coverage** — how much of the guide they actually went over. Catches
///     the short dash in the middle that touches the line and stops.
///   * **Accuracy** — how much of what they drew was on the guide. Catches the
///     scribble that covers everything, including the line, by covering the
///     whole box.
///
/// Both have to pass. Neither is strict: this is a three-year-old with a finger
/// on glass, and the thing being taught is the shape of a numeral, not fine
/// motor control. The thresholds are set to accept a wobbly, recognisable one
/// and refuse a circle.
class TraceCheck {
  const TraceCheck({required this.coverage, required this.accuracy});

  /// How much of the *least* covered stroke the child went over, 0–1.
  ///
  /// The minimum across strokes rather than the average over all of them. A
  /// four is a diagonal, a crossbar and a long stem: cover two of those
  /// perfectly and skip the stem and the average is still high enough to pass,
  /// which is exactly what happened — a four with no stem was told it looked
  /// like a four. A shape is all of its strokes.
  final double coverage;

  /// Fraction of the child's line that was on the guide, 0–1.
  final double accuracy;

  /// Generous on purpose — see the class comment. Coverage is per stroke, so
  /// this is "you drew most of every part", not "most of the whole".
  static const minCoverage = 0.7;
  static const minAccuracy = 0.55;

  bool get passes => coverage >= minCoverage && accuracy >= minAccuracy;

  /// What to say when it did not pass.
  ///
  /// The two failures need different words. "Follow the whole line" to a child
  /// who drew neatly but stopped early, and "stay on the line" to one who drew
  /// all over the box, are the two different things they actually did.
  String get hint => coverage < minCoverage
      ? 'Nearly! Try to follow the whole line.'
      : 'Nearly! Try to stay on the line.';
}

/// A single tap or a flick is not an attempt.
///
/// Without this a child who touches the glass once scores 100% accuracy — the
/// one point they drew is on the line — and 0% coverage, which already fails.
/// This is here so the answer is "you have not started" rather than a score.
const _minPoints = 8;

/// Measures [drawn] against the guide [strokes].
///
/// [strokes] are normalised 0–1, as they are stored; [drawn] is in canvas
/// pixels, as the gesture reports it. [size] converts between the two.
TraceCheck checkTrace({
  required List<List<({double x, double y})>> strokes,
  required List<Offset> drawn,
  required Size size,
}) {
  if (drawn.length < _minPoints) {
    return const TraceCheck(coverage: 0, accuracy: 0);
  }

  final perStroke = [
    for (final stroke in strokes)
      if (stroke.length >= 2) _samplePixels([stroke], size),
  ]..removeWhere((points) => points.isEmpty);

  if (perStroke.isEmpty) {
    // Nothing to measure against. An item with no strokes is a content fault,
    // and refusing every attempt would trap a child on it forever — so let it
    // through rather than lock the page.
    return const TraceCheck(coverage: 1, accuracy: 1);
  }

  final guide = [for (final stroke in perStroke) ...stroke];

  /// How far off the line still counts as on it.
  ///
  /// The guide is drawn 18 logical pixels wide, so being "on" it is already
  /// ±9 before any wobble. This is proportional to the box so the rule is the
  /// same on a small phone and a tablet, with a floor for very narrow screens.
  final tolerance = math.max(size.shortestSide * 0.075, 28.0);

  // The worst-covered stroke decides it: skipping one part of a shape is
  // skipping the shape.
  var weakest = 1.0;
  for (final stroke in perStroke) {
    var covered = 0;
    for (final point in stroke) {
      if (_nearAny(point, drawn, tolerance)) covered += 1;
    }
    final fraction = covered / stroke.length;
    if (fraction < weakest) weakest = fraction;
  }

  var on = 0;
  for (final point in drawn) {
    if (_nearAny(point, guide, tolerance)) on += 1;
  }

  return TraceCheck(coverage: weakest, accuracy: on / drawn.length);
}

bool _nearAny(Offset point, List<Offset> others, double tolerance) {
  final limit = tolerance * tolerance;
  for (final other in others) {
    final dx = point.dx - other.dx;
    final dy = point.dy - other.dy;
    if (dx * dx + dy * dy <= limit) return true;
  }
  return false;
}

/// The guide as evenly spaced points in canvas pixels.
///
/// Sampled along each segment rather than using the stored corners: a stroke
/// defined by two far-apart points would otherwise be two points to cover, and
/// touching both ends would score full marks for a line that was never drawn.
List<Offset> _samplePixels(
  List<List<({double x, double y})>> strokes,
  Size size,
) {
  const spacing = 6.0;
  final samples = <Offset>[];

  for (final stroke in strokes) {
    if (stroke.length < 2) continue;

    for (var i = 1; i < stroke.length; i++) {
      final from = Offset(
        stroke[i - 1].x * size.width,
        stroke[i - 1].y * size.height,
      );
      final to = Offset(stroke[i].x * size.width, stroke[i].y * size.height);

      final steps = math.max(1, ((to - from).distance / spacing).ceil());
      for (var step = 0; step <= steps; step++) {
        samples.add(Offset.lerp(from, to, step / steps)!);
      }
    }
  }

  return samples;
}
