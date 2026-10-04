import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:get/get.dart';

import '../../core/assets/app_assets.dart';
import '../../core/audio/speech_service.dart';
import '../../core/widgets/squish.dart';
import 'tracing_module_models.dart';

/// The tracing screens' shared look: a sky with clouds and hills, a big navy
/// heading, round white buttons, and one bright card per category.
///
/// Mobile portrait only — every size here comes from the space it is given,
/// so a small phone and a large one both fit.

abstract final class TraceInk {
  static const navy = Color(0xFF173A78);
  static const soft = Color(0xFF52607A);
  static const green = Color(0xFF2E9E5B);
}

/// Says [text] if the app's voice is on.
void sayAloud(String text) {
  if (Get.isRegistered<SpeechService>()) {
    unawaited(Get.find<SpeechService>().say(text));
  }
}

/* -------------------------------------------------------------------------- */
/* Category styles                                                            */
/* -------------------------------------------------------------------------- */

/// How one category is drawn: its card's colours, its button, and the line
/// under its name.
class CategoryStyle {
  const CategoryStyle({
    required this.paper,
    required this.button,
    required this.subtitle,
  });

  /// The card's gradient, light to a little deeper.
  final List<Color> paper;
  final Color button;
  final String subtitle;

  static CategoryStyle of(String key) => switch (key) {
    'capital' => const CategoryStyle(
      paper: [Color(0xFFF3ECFF), Color(0xFFE3D6FF)],
      button: Color(0xFF7B4FE0),
      subtitle: 'Learn and trace A to Z',
    ),
    'number' => const CategoryStyle(
      paper: [Color(0xFFFFEEDF), Color(0xFFFFD9BF)],
      button: Color(0xFFF2672A),
      subtitle: 'Learn and trace 1 to 10',
    ),
    'small' => const CategoryStyle(
      paper: [Color(0xFFE6F9F0), Color(0xFFCDEFDF)],
      button: Color(0xFF1FA463),
      subtitle: 'Learn and trace a to z',
    ),
    'gujarati-number' => const CategoryStyle(
      paper: [Color(0xFFFFF6D6), Color(0xFFFFE8A3)],
      button: Color(0xFFE1A00A),
      subtitle: 'Learn and trace 1 to 10 in Gujarati',
    ),
    'gujarati' => const CategoryStyle(
      paper: [Color(0xFFFFF6D6), Color(0xFFFFE8A3)],
      button: Color(0xFFE1A00A),
      subtitle: 'Learn and trace Gujarati letters',
    ),
    'hindi-number' => const CategoryStyle(
      paper: [Color(0xFFFFEAF2), Color(0xFFFFD3E4)],
      button: Color(0xFFE2457E),
      subtitle: 'Learn and trace 1 to 10 in Hindi',
    ),
    'hindi' => const CategoryStyle(
      paper: [Color(0xFFFFEAF2), Color(0xFFFFD3E4)],
      button: Color(0xFFE2457E),
      subtitle: 'Learn and trace Hindi letters',
    ),
    'pattern' => const CategoryStyle(
      paper: [Color(0xFFE6F2FF), Color(0xFFCFE4FF)],
      button: Color(0xFF2F80ED),
      subtitle: 'Learn and trace lines and curves',
    ),
    _ => const CategoryStyle(
      paper: [Color(0xFFE6F2FF), Color(0xFFCFE4FF)],
      button: Color(0xFF2F80ED),
      subtitle: 'Learn and trace',
    ),
  };
}

/// The bubble letters' colours, in turn: red, blue, yellow, as in the art.
const _bubbleInks = [Color(0xFFE8455B), Color(0xFF3D72E5), Color(0xFFF5A623)];

/* -------------------------------------------------------------------------- */
/* Background                                                                 */
/* -------------------------------------------------------------------------- */

/// Sky to pale, with soft clouds.
class TracingSky extends StatelessWidget {
  const TracingSky({super.key});

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF9FD8FF), Color(0xFFD6EEFF), Color(0xFFEAF7FF)],
          stops: [0, 0.35, 1],
        ),
      ),
      child: CustomPaint(painter: _Clouds(), size: Size.infinite),
    );
  }
}

class _Clouds extends CustomPainter {
  const _Clouds();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white.withValues(alpha: 0.8);
    void cloud(double x, double y, double r) {
      canvas
        ..drawCircle(Offset(x, y), r, paint)
        ..drawCircle(Offset(x + r * 0.95, y + r * 0.2), r * 0.78, paint)
        ..drawCircle(Offset(x - r * 0.95, y + r * 0.25), r * 0.66, paint);
    }

    cloud(size.width * 0.14, 36, 22);
    cloud(size.width * 0.52, 74, 30);
    cloud(size.width * 0.9, 150, 20);
  }

  @override
  bool shouldRepaint(_Clouds oldDelegate) => false;
}

/// Green hills with flowers, for the bottom of a screen.
class TracingHills extends StatelessWidget {
  const TracingHills({this.height = 110, super.key});

  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: Stack(
        children: [
          const Positioned.fill(child: CustomPaint(painter: _HillsPainter())),
          for (final (x, size) in [
            (0.06, 34.0),
            (0.24, 24.0),
            (0.7, 26.0),
            (0.88, 36.0),
          ])
            Align(
              alignment: Alignment(x * 2 - 1, 0.75),
              child: SvgPicture.asset(LearningArt.flower, width: size),
            ),
        ],
      ),
    );
  }
}

class _HillsPainter extends CustomPainter {
  const _HillsPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    canvas
      ..drawPath(
        Path()
          ..moveTo(0, h * 0.45)
          ..quadraticBezierTo(w * 0.3, h * 0.05, w * 0.62, h * 0.4)
          ..quadraticBezierTo(w * 0.85, h * 0.62, w, h * 0.3)
          ..lineTo(w, h)
          ..lineTo(0, h)
          ..close(),
        Paint()..color = const Color(0xFF9BD873),
      )
      ..drawPath(
        Path()
          ..moveTo(0, h * 0.72)
          ..quadraticBezierTo(w * 0.45, h * 0.35, w, h * 0.66)
          ..lineTo(w, h)
          ..lineTo(0, h)
          ..close(),
        Paint()..color = const Color(0xFF6CC24A),
      );
  }

  @override
  bool shouldRepaint(_HillsPainter oldDelegate) => false;
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

/// A round white button: back, or the speaker.
class RoundButton extends StatelessWidget {
  const RoundButton({
    required this.child,
    required this.tooltip,
    required this.onTap,
    this.size = 52,
    super.key,
  });

  final Widget child;
  final String tooltip;
  final VoidCallback onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.white,
        shape: const CircleBorder(),
        elevation: 3,
        shadowColor: TraceInk.navy.withValues(alpha: 0.25),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: size,
            height: size,
            child: Center(child: child),
          ),
        ),
      ),
    );
  }
}

class BackRound extends StatelessWidget {
  const BackRound({required this.onTap, super.key});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => RoundButton(
    tooltip: 'Back',
    onTap: onTap,
    child: const Icon(
      Icons.arrow_back_rounded,
      color: Color(0xFF2F6FED),
      size: 28,
    ),
  );
}

/// The speaker: says [text] when tapped, never on its own.
class AudioButton extends StatelessWidget {
  const AudioButton({required this.text, this.size = 52, super.key});

  final String text;
  final double size;

  @override
  Widget build(BuildContext context) => RoundButton(
    tooltip: 'Say it',
    size: size,
    onTap: () => sayAloud(text),
    child: SvgPicture.asset(LearningArt.speaker, width: size * 0.56),
  );
}

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

/// "Tracing — Choose a category to start learning.", with the back button,
/// the speaker, and the pencil ready to write.
class TracingHeader extends StatelessWidget {
  const TracingHeader({
    required this.title,
    required this.subtitle,
    required this.onBack,
    super.key,
  });

  final String title;
  final String subtitle;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final art = (box.maxWidth * 0.34).clamp(96.0, 150.0);
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
          child: Stack(
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  BackRound(onTap: onBack),
                  const Spacer(),
                  AudioButton(text: '$title. $subtitle'),
                ],
              ),
              Padding(
                padding: EdgeInsets.only(top: 58, right: art * 0.8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        title,
                        style: const TextStyle(
                          color: TraceInk.navy,
                          fontSize: 34,
                          fontWeight: FontWeight.w900,
                          height: 1.05,
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: TraceInk.navy,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(
                right: 0,
                top: 58,
                child: SizedBox(
                  width: art,
                  height: art * 0.85,
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: Image.asset(
                          AppIcons.tracing,
                          fit: BoxFit.contain,
                        ),
                      ),
                      Positioned(
                        left: 0,
                        top: 0,
                        child: SvgPicture.asset(
                          LearningArt.star,
                          width: art * 0.2,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Category cards                                                             */
/* -------------------------------------------------------------------------- */

/// A thick, rounded progress bar: green over a pale track.
class TracingProgressBar extends StatelessWidget {
  const TracingProgressBar({required this.value, super.key});

  final double value;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 10,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.75),
        borderRadius: BorderRadius.circular(6),
      ),
      alignment: Alignment.centerLeft,
      child: FractionallySizedBox(
        widthFactor: value.clamp(0.0, 1.0),
        child: Container(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF39C777), Color(0xFF2EA862)],
            ),
            borderRadius: BorderRadius.circular(6),
          ),
        ),
      ),
    );
  }
}

/// A category's characters as bright bubble letters on a soft cloud, with
/// stars — "ABC", "123", "abc", "૧૨૩". Taken from the category's own label,
/// so a category the publisher adds gets its own art.
class CategoryIllustration extends StatelessWidget {
  const CategoryIllustration({required this.label, super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    final characters = label
        .split(RegExp(r'\s+'))
        .where((c) => c.isNotEmpty)
        .take(3)
        .toList();

    return LayoutBuilder(
      builder: (context, box) {
        final size = box.maxHeight * 0.62;
        return Stack(
          alignment: Alignment.center,
          children: [
            // The cloud.
            Container(
              width: box.maxWidth * 0.92,
              height: box.maxHeight * 0.72,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.7),
                borderRadius: BorderRadius.circular(box.maxHeight),
              ),
            ),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (final (i, c) in characters.indexed)
                    Transform.translate(
                      offset: Offset(0, i.isOdd ? -size * 0.08 : size * 0.04),
                      child: _Bubble(
                        text: c,
                        colour: _bubbleInks[i % _bubbleInks.length],
                        size: size,
                      ),
                    ),
                ],
              ),
            ),
            Align(
              alignment: const Alignment(-0.7, -0.95),
              child: SvgPicture.asset(LearningArt.star, width: size * 0.3),
            ),
            Align(
              alignment: const Alignment(0.75, -0.9),
              child: SvgPicture.asset(LearningArt.star, width: size * 0.24),
            ),
          ],
        );
      },
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.text, required this.colour, required this.size});

  final String text;
  final Color colour;
  final double size;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontSize: size,
      fontWeight: FontWeight.w900,
      height: 1.1,
      letterSpacing: -1,
    );
    return Stack(
      children: [
        Text(
          text,
          style: style.copyWith(
            foreground: Paint()
              ..style = PaintingStyle.stroke
              ..strokeWidth = size * 0.14
              ..strokeJoin = StrokeJoin.round
              ..color = Colors.white,
            shadows: [
              Shadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 8,
                offset: const Offset(0, 4),
              ),
            ],
          ),
        ),
        Text(text, style: style.copyWith(color: colour)),
      ],
    );
  }
}

/// One category: its art, its name, what it teaches, how far along, and a
/// big arrow to go in.
class TracingCategoryCard extends StatelessWidget {
  const TracingCategoryCard({
    required this.category,
    required this.onTap,
    super.key,
  });

  final TracingCategorySummary category;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final style = CategoryStyle.of(category.key);
    final done = category.tracedCount;
    final total = category.itemCount;

    return Semantics(
      button: true,
      label: '${category.name}. $done of $total traced.',
      child: Squish(
        onTap: onTap,
        child: Container(
          height: 138,
          padding: const EdgeInsets.fromLTRB(10, 12, 14, 12),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: style.paper,
            ),
            borderRadius: BorderRadius.circular(26),
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: [
              BoxShadow(
                color: style.button.withValues(alpha: 0.18),
                blurRadius: 16,
                offset: const Offset(0, 7),
              ),
            ],
          ),
          child: Row(
            children: [
              Expanded(
                flex: 37,
                child: CategoryIllustration(label: category.label),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 53,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        category.name,
                        style: const TextStyle(
                          color: TraceInk.navy,
                          fontSize: 21,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      style.subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: TraceInk.soft,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        height: 1.25,
                      ),
                    ),
                    const SizedBox(height: 10),
                    TracingProgressBar(value: total == 0 ? 0 : done / total),
                    const SizedBox(height: 6),
                    Text(
                      '$done of $total traced',
                      style: const TextStyle(
                        color: TraceInk.soft,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: style.button,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 3),
                  boxShadow: [
                    BoxShadow(
                      color: style.button.withValues(alpha: 0.4),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Icon(
                  done >= total && total > 0
                      ? Icons.emoji_events_rounded
                      : Icons.arrow_forward_rounded,
                  color: Colors.white,
                  size: 28,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
