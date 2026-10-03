import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';

import '../../core/audio/speech_service.dart';
import '../../core/letterforms/glyph_text.dart';
import '../../core/widgets/kid_ui.dart';
import '../activities/activity_controller.dart';
import '../activities/activity_models.dart';
import 'guided_trace.dart';
import 'lesson_reveal.dart';
import 'trace_lessons.dart';

/// Tracing letters and numbers, one at a time, the way they are written.
///
///   pick → watch the finger show the stroke → trace it along the dots →
///   next stroke → shape complete → confetti → the lesson ("A for Apple") →
///   Next.
///
/// The shape is drawn as a fat outlined tube with dots down the stroke to trace
/// and a pulsing green dot where to start. Only the current stroke can be
/// traced, only forwards, and only by staying on it ([GuidedTrace]) — a finger
/// scribbling over the box fills nothing. When the child is idle a finger
/// shows the stroke again.
///
/// Built for portrait: the list of letters, the instruction, then the tracing
/// card taking every pixel that is left, then paints and Next.
class TracingPlay extends StatefulWidget {
  const TracingPlay({
    required this.controller,
    required this.content,
    this.finishLabel = 'Finish',
    super.key,
  });

  final ActivityPlayController controller;
  final TracingContent content;

  /// The last button's words. The tracing module says where it goes next:
  /// "Next letter".
  final String finishLabel;

  @override
  State<TracingPlay> createState() => _TracingPlayState();
}

enum _Phase { tracing, celebrating, lesson }

/// The paints on offer, as in a child's paintbox.
const _paints = [
  Color(0xFFFF3B30),
  Color(0xFFFF9500),
  Color(0xFFFFC300),
  Color(0xFF34C759),
  Color(0xFF0A84FF),
  Color(0xFFAF52DE),
];

/// The tube's colours. Fixed, not themed: this is paper a child writes on.
const _outline = Color(0xFF8E9BEA);
const _dot = Color(0xFFB9C1F5);
const _start = Color(0xFF2EC4A0);

/// How far off the path still counts as on it, in the shape's 0–1 box. Wide:
/// a three-year-old with a finger on glass.
const _tolerance = 0.085;

class _TracingPlayState extends State<TracingPlay>
    with TickerProviderStateMixin {
  late final AnimationController _pulse;
  late final AnimationController _demo;
  late final AnimationController _confetti;

  late GuidedTrace _trace;
  int _item = -1;
  _Phase _phase = _Phase.tracing;
  bool _nextReady = false;
  Color _paint = _paints.first;
  TraceLessons? _lessons;

  /// A short word of help under the instruction, and when it was last said
  /// out loud — so a child struggling hears it, but not on every frame.
  String? _hint;
  DateTime _hintSpoken = DateTime.fromMillisecondsSinceEpoch(0);

  /// Where the shape's 0–1 box sits on the canvas, for converting touches.
  Offset _origin = Offset.zero;
  double _side = 1;

  Timer? _toLesson;

  SpeechService? get _voice =>
      Get.isRegistered<SpeechService>() ? Get.find<SpeechService>() : null;

  void _say(String text) => unawaited(_voice?.say(text));

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
    _demo = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2600),
    )..repeat();
    _confetti = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    unawaited(
      TraceLessons.load().then((lessons) {
        if (mounted) setState(() => _lessons = lessons);
      }),
    );
  }

  @override
  void dispose() {
    _toLesson?.cancel();
    _pulse.dispose();
    _demo.dispose();
    _confetti.dispose();
    // A child who leaves mid-sentence should not be followed out of the page.
    unawaited(_voice?.stop());
    super.dispose();
  }

  TracingItem get _current => widget.content.items[_item];

  /// Sets the page up for item [index] when it changes — arriving, Next, or a
  /// letter picked from the strip.
  void _arrive(int index) {
    if (index == _item) return;
    _item = index;
    _toLesson?.cancel();
    _trace = GuidedTrace([
      for (final stroke in _current.strokes)
        [for (final point in stroke) Offset(point.x, point.y)],
    ], ordered: _current.ordered);
    _phase = _Phase.tracing;
    _nextReady = false;
    _hint = null;
    _demo.forward(from: 0);

    // After this frame: speaking from inside build would fire while the tree
    // is still being assembled.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _item == index) _say(_instruction(_current));
    });
  }

  String _instruction(TracingItem item) {
    if (item.say.trim().isNotEmpty) return item.say;
    final kind = int.tryParse(item.glyph) != null ? 'number' : 'letter';
    return 'Trace the $kind ${item.glyph}. Follow the dots with your finger.';
  }

  Offset _toBox(Offset local) => (local - _origin) / _side;

  void _down(Offset local) {
    if (_phase != _Phase.tracing) return;
    _react(_trace.touchDown(_toBox(local), _tolerance));
  }

  void _move(Offset local) {
    if (_phase != _Phase.tracing) return;
    _react(_trace.touchMove(_toBox(local), _tolerance));
  }

  void _up() {
    _trace.touchUp();
    // The finger shows the way again, from where they stopped.
    _demo.forward(from: 0);
    setState(() {});
  }

  void _react(TraceEvent event) {
    switch (event) {
      case TraceEvent.none:
        return;
      case TraceEvent.advanced:
        if (_hint != null) setState(() => _hint = null);
        setState(() {});
      case TraceEvent.strokeDone:
        unawaited(HapticFeedback.lightImpact());
        setState(() => _hint = null);
        _demo.forward(from: 0);
      case TraceEvent.complete:
        unawaited(HapticFeedback.mediumImpact());
        _complete();
      case TraceEvent.wrongStart:
        _help('Start at the green dot.');
      case TraceEvent.offTrack:
        _help('Oops! Stay on the path.');
        _demo.forward(from: 0);
    }
  }

  void _help(String text) {
    setState(() => _hint = text);
    final now = DateTime.now();
    if (now.difference(_hintSpoken) > const Duration(seconds: 4)) {
      _hintSpoken = now;
      _say(text);
    }
  }

  /// The shape is traced: count it, celebrate, then teach.
  void _complete() {
    widget.controller.traceAccepted();
    setState(() {
      _phase = _Phase.celebrating;
      _hint = null;
    });
    unawaited(_confetti.forward(from: 0));
    unawaited(_voice?.wellDone());

    _toLesson = Timer(const Duration(milliseconds: 1500), () {
      if (mounted) setState(() => _phase = _Phase.lesson);
    });
  }

  /// Traces the same one again — practice, after or during.
  void _again() {
    _toLesson?.cancel();
    setState(() {
      _trace.reset();
      _phase = _Phase.tracing;
      _nextReady = false;
      _hint = null;
    });
    _demo.forward(from: 0);
  }

  void _next() {
    unawaited(_voice?.stop());
    widget.controller.next();
  }

  /// Rebuilt by the controller's index (Next, the strip) and by setState (the
  /// finger). Observables are read here, inside the Obx closure.
  @override
  Widget build(BuildContext context) => Obx(() {
    final controller = widget.controller;
    final index = controller.index.value;
    // Read so the strip redraws as items are finished.
    controller.traced.length;
    _arrive(index);
    return _body(context);
  });

  Widget _body(BuildContext context) {
    final controller = widget.controller;
    final item = _current;
    // Never waits on the catalogue: one that has not loaded (or never will)
    // still gives every glyph its plain lesson, so Next always opens.
    final lessons = _lessons ?? TraceLessons.from(const {}, const {});

    return Column(
      children: [
        const SizedBox(height: 10),
        // A strip of one is nothing to choose between: the tracing module
        // brings one letter at a time, each after its video.
        if (widget.content.items.length > 1)
          _Strip(
            content: widget.content,
            controller: controller,
            onPick: (i) {
              unawaited(_voice?.stop());
              controller.goTo(i);
            },
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
          child: _Instruction(
            text: _phase == _Phase.tracing
                ? _instruction(item)
                : lessons.forGlyph(item.glyph).isPattern
                ? 'Well done! ${lessons.forGlyph(item.glyph).word ?? ''}'
                : 'Well done! You traced ${item.glyph}.',
            step: _phase != _Phase.tracing
                ? null
                : !_trace.ordered
                ? 'Follow all the dots'
                : _trace.strokeCount > 1
                ? 'Line ${math.min(_trace.currentStroke + 1, _trace.strokeCount)}'
                      ' of ${_trace.strokeCount}'
                : null,
            hint: _phase == _Phase.tracing ? _hint : null,
            // Once traced, the button says the lesson again: "A for Apple".
            onSpeak: () => _say(
              _phase == _Phase.tracing
                  ? _instruction(item)
                  : lessons.forGlyph(item.glyph).say,
            ),
          ),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: _Card(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final size = constraints.biggest;
                  _side = math.min(size.width, size.height) * 0.94;
                  _origin = Offset(
                    (size.width - _side) / 2,
                    (size.height - _side) / 2,
                  );

                  return AnimatedSwitcher(
                    duration: const Duration(milliseconds: 350),
                    // Both pages fill the card, rather than the lesson
                    // shrinking it to the width of its words.
                    layoutBuilder: (current, previous) => Stack(
                      fit: StackFit.expand,
                      children: [...previous, ?current],
                    ),
                    child: _phase == _Phase.lesson
                        ? LessonReveal(
                            key: ValueKey('lesson-$_item'),
                            lesson: lessons.forGlyph(item.glyph),
                            colour: _paint,
                            say: _say,
                            onDone: () {
                              if (mounted) setState(() => _nextReady = true);
                            },
                          )
                        : _canvas(size),
                  );
                },
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            children: [
              if (_phase == _Phase.tracing) ...[
                _PaintBox(
                  selected: _paint,
                  onPick: (colour) => setState(() => _paint = colour),
                ),
                const SizedBox(height: 12),
              ],
              Row(
                children: [
                  _RoundButton(
                    icon: Icons.replay_rounded,
                    tooltip: 'Trace it again',
                    onTap: _again,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: GradientButton(
                      label: controller.isLast ? widget.finishLabel : 'Next',
                      icon: controller.isLast
                          ? Icons.check_rounded
                          : Icons.arrow_forward_rounded,
                      // Only once the lesson has been seen and heard. Before
                      // then there is nothing to move on from.
                      onPressed: _nextReady ? _next : null,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _canvas(Size size) {
    final tracing = _phase == _Phase.tracing;

    return GestureDetector(
      key: ValueKey('canvas-$_item'),
      behavior: HitTestBehavior.opaque,
      // From where the finger touched, not from where it had moved far
      // enough to count as a drag: the green dot is where it has to start.
      dragStartBehavior: DragStartBehavior.down,
      onPanStart: (d) => _down(d.localPosition),
      onPanUpdate: (d) => _move(d.localPosition),
      onPanEnd: (_) => _up(),
      onPanCancel: _up,
      child: Stack(
        children: [
          Positioned.fill(
            child: CustomPaint(
              painter: _GlyphPainter(
                trace: _trace,
                ink: _paint,
                origin: _origin,
                side: _side,
                pulse: _pulse,
                finished: !tracing,
              ),
            ),
          ),
          if (tracing)
            Positioned.fill(
              child: IgnorePointer(
                child: _DemoFinger(
                  trace: _trace,
                  animation: _demo,
                  origin: _origin,
                  side: _side,
                ),
              ),
            ),
          Positioned.fill(
            child: IgnorePointer(child: _Confetti(animation: _confetti)),
          ),
        ],
      ),
    );
  }
}

/// The letters or numbers of this activity: done ones ticked, the current one
/// lit, the rest locked until the one before is traced.
class _Strip extends StatelessWidget {
  const _Strip({
    required this.content,
    required this.controller,
    required this.onPick,
  });

  final TracingContent content;
  final ActivityPlayController controller;
  final ValueChanged<int> onPick;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 58,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: content.items.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final isHere = controller.index.value == i;
          final isDone = controller.traced.contains(i);
          final isOpen = controller.isUnlocked(i);
          final glyph = content.items[i].glyph;

          return GestureDetector(
            onTap: isOpen && !isHere ? () => onPick(i) : null,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 50,
              decoration: BoxDecoration(
                gradient: isHere
                    ? const LinearGradient(colors: KidPalette.action)
                    : null,
                color: isHere
                    ? null
                    : isDone
                    ? KidPalette.mint.withValues(alpha: 0.15)
                    : isOpen
                    ? Colors.white
                    : const Color(0xFFF0EEF6),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isHere
                      ? Colors.transparent
                      : isDone
                      ? KidPalette.mint.withValues(alpha: 0.6)
                      : const Color(0xFFE3E0EE),
                  width: 1.5,
                ),
                boxShadow: [
                  if (isHere)
                    BoxShadow(
                      color: KidPalette.pink.withValues(alpha: 0.3),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                ],
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  if (isOpen || isDone)
                    // In the school's handwriting, like everything a child
                    // is shown to write.
                    Padding(
                      padding: const EdgeInsets.all(8),
                      child: FittedBox(
                        child: GlyphText(
                          glyph,
                          size: 26,
                          weight: 1.3,
                          color: isHere
                              ? Colors.white
                              : isDone
                              ? const Color(0xFF14876B)
                              : const Color(0xFF3A3F5C),
                        ),
                      ),
                    )
                  else
                    const Icon(
                      Icons.lock_rounded,
                      size: 18,
                      color: Color(0xFFA9A6BC),
                    ),
                  if (isDone && !isHere)
                    const Positioned(
                      right: 3,
                      top: 3,
                      child: Icon(
                        Icons.check_circle_rounded,
                        size: 14,
                        color: KidPalette.mint,
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// What to do, said and written, with a button to hear it again.
class _Instruction extends StatelessWidget {
  const _Instruction({
    required this.text,
    required this.onSpeak,
    this.step,
    this.hint,
  });

  final String text;
  final String? step;
  final String? hint;
  final VoidCallback onSpeak;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                text,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  height: 1.25,
                ),
              ),
              const SizedBox(height: 6),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: hint != null
                    ? _Pill(
                        key: ValueKey(hint),
                        text: hint!,
                        colour: KidPalette.coral,
                      )
                    : step != null
                    ? _Pill(
                        key: ValueKey(step),
                        text: step!,
                        colour: KidPalette.violet,
                      )
                    : const SizedBox(height: 26),
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        // Heard again on demand: a child asks for the same thing five times.
        _RoundButton(
          icon: Icons.volume_up_rounded,
          tooltip: 'Say it again',
          onTap: onSpeak,
          filled: true,
        ),
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text, required this.colour, super.key});

  final String text;
  final Color colour;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 26,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: colour,
          fontWeight: FontWeight.w700,
          fontSize: 13,
        ),
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.filled = false,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: filled ? KidPalette.violet : Colors.white,
        shape: CircleBorder(
          side: filled
              ? BorderSide.none
              : const BorderSide(color: Color(0xFFE3E0EE), width: 1.5),
        ),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: 52,
            height: 52,
            child: Icon(
              icon,
              color: filled ? Colors.white : KidPalette.violet,
              size: 26,
            ),
          ),
        ),
      ),
    );
  }
}

/// The tracing card: soft sky above, sand below, like the page of a picture
/// book, so the white tube stands out.
class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFE3F4FF), Color(0xFFF4FAFF), Color(0xFFFFF4DF)],
          stops: [0, 0.6, 1],
        ),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: const Color(0xFFDDE6F5), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: KidPalette.violet.withValues(alpha: 0.08),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: child,
    );
  }
}

/// The paintbox: which colour the traced lines come out in.
class _PaintBox extends StatelessWidget {
  const _PaintBox({required this.selected, required this.onPick});

  final Color selected;
  final ValueChanged<Color> onPick;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (final colour in _paints)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: GestureDetector(
              onTap: () => onPick(colour),
              child: AnimatedScale(
                duration: const Duration(milliseconds: 150),
                scale: colour == selected ? 1.18 : 1,
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      center: const Alignment(-0.3, -0.4),
                      colors: [Color.lerp(colour, Colors.white, 0.4)!, colour],
                    ),
                    border: Border.all(
                      color: colour == selected
                          ? const Color(0xFF3A3F5C)
                          : Colors.white,
                      width: 3,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: colour.withValues(alpha: 0.4),
                        blurRadius: 6,
                        offset: const Offset(0, 3),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// The shape: an outlined tube, what is traced filled with paint, dots down the
/// stroke still to trace, and a pulsing start dot with an arrow.
class _GlyphPainter extends CustomPainter {
  _GlyphPainter({
    required this.trace,
    required this.ink,
    required this.origin,
    required this.side,
    required this.pulse,
    required this.finished,
  }) : super(repaint: pulse);

  final GuidedTrace trace;

  /// The child's chosen paint.
  final Color ink;
  final Offset origin;
  final double side;
  final Animation<double> pulse;
  final bool finished;

  Offset _px(Offset p) => origin + p * side;

  Path _path(List<Offset> points) {
    final path = Path()..moveTo(_px(points.first).dx, _px(points.first).dy);
    for (final p in points.skip(1)) {
      final at = _px(p);
      path.lineTo(at.dx, at.dy);
    }
    return path;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final strokes = trace.strokes;
    if (strokes.isEmpty) return;

    // Thinner for a low, wide shape (a zigzag, a row of sleeping lines),
    // whose parts sit close enough that a fat tube would run them together.
    final all = [for (final stroke in strokes) ...stroke];
    final low =
        all.map((p) => p.dy).reduce(math.max) -
            all.map((p) => p.dy).reduce(math.min) <
        0.45;
    final tube = side * (low ? 0.085 : 0.13);

    Paint line(Color colour, double width) => Paint()
      ..color = colour
      ..strokeWidth = width
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    // All the outlines first, then all the white, so where strokes meet the
    // tube reads as one shape rather than overlapping pieces.
    for (final stroke in strokes) {
      canvas.drawPath(_path(stroke), line(_outline, tube + side * 0.026));
    }
    for (final stroke in strokes) {
      canvas.drawPath(_path(stroke), line(Colors.white, tube));
    }

    // What has been traced, in the child's paint.
    for (var i = 0; i < strokes.length; i++) {
      final runs = finished ? [strokes[i]] : trace.tracedRunsOf(i);
      for (final run in runs) {
        if (run.length >= 2) {
          canvas.drawPath(_path(run), line(ink, tube * 0.84));
        }
      }
    }

    if (finished || trace.isComplete) return;

    // Dots down what is left to trace: the current stroke in order, or every
    // untraced part when any part may come first.
    final current = strokes[trace.currentStroke];
    final gap = math.max(1, (tube * 0.55 / (side * 0.01)).round());
    final dot = Paint()..color = _dot;
    if (trace.ordered) {
      for (var i = trace.headIndex + gap; i < current.length; i += gap) {
        canvas.drawCircle(_px(current[i]), tube * 0.13, dot);
      }
    } else {
      for (var s = 0; s < strokes.length; s++) {
        if (trace.progressOf(s) >= 1) continue;
        for (var i = 0; i < strokes[s].length; i += gap) {
          if (!trace.isCovered(s, i)) {
            canvas.drawCircle(_px(strokes[s][i]), tube * 0.13, dot);
          }
        }
      }
    }

    // The end of the stroke: a ring to aim for.
    canvas.drawCircle(
      _px(current.last),
      tube * 0.2,
      Paint()
        ..color = _outline
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );

    // The start — or wherever they stopped — pulsing green, with an arrow
    // pointing the way.
    final head = _px(trace.head!);
    final grow = pulse.value;
    canvas.drawCircle(
      head,
      tube * (0.55 + grow * 0.25),
      Paint()..color = _start.withValues(alpha: 0.25 * (1 - grow) + 0.1),
    );
    canvas.drawCircle(head, tube * 0.42, Paint()..color = _start);
    canvas.drawCircle(
      head,
      tube * 0.42,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3,
    );

    final direction = trace.headDirection;
    if (direction != null) {
      final tip = head + direction * tube * 1.05;
      final back = tip - direction * tube * 0.32;
      final across = Offset(-direction.dy, direction.dx) * tube * 0.22;
      canvas.drawPath(
        Path()
          ..moveTo(back.dx + across.dx, back.dy + across.dy)
          ..lineTo(tip.dx, tip.dy)
          ..lineTo(back.dx - across.dx, back.dy - across.dy),
        line(_start, 4),
      );
    }

    // Which line this is, on the start dot — when there is an order to count.
    if (trace.ordered && trace.strokeCount > 1) {
      final label = TextPainter(
        text: TextSpan(
          text: '${trace.currentStroke + 1}',
          style: TextStyle(
            fontFamily: 'Poppins',
            color: Colors.white,
            fontSize: tube * 0.42,
            fontWeight: FontWeight.w800,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      label.paint(canvas, head - Offset(label.width / 2, label.height / 2));
    }
  }

  @override
  bool shouldRepaint(_GlyphPainter oldDelegate) => true;
}

/// A finger that shows how the current stroke is written, from where the child
/// is to its end, then again. Hidden while they are tracing.
class _DemoFinger extends StatelessWidget {
  const _DemoFinger({
    required this.trace,
    required this.animation,
    required this.origin,
    required this.side,
  });

  final GuidedTrace trace;
  final Animation<double> animation;
  final Offset origin;
  final double side;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, _) {
        if (trace.isComplete || trace.isTracking) return const SizedBox();

        final stroke = trace.strokes[trace.currentStroke];
        final from = trace.headIndex;

        // Moves for the first two thirds of the loop, rests at the end, fades.
        final t = animation.value;
        final travel = Curves.easeInOut.transform((t / 0.66).clamp(0.0, 1.0));
        final fade = t < 0.08
            ? t / 0.08
            : t > 0.85
            ? (1 - t) / 0.15
            : 1.0;

        final at = from + ((stroke.length - 1 - from) * travel).round();
        final point = origin + stroke[at] * side;
        final ball = side * 0.05;

        return Stack(
          children: [
            Positioned(
              left: point.dx - ball,
              top: point.dy - ball,
              child: Opacity(
                opacity: fade.clamp(0.0, 1.0),
                child: Container(
                  width: ball * 2,
                  height: ball * 2,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: KidPalette.sun,
                    border: Border.all(color: Colors.white, width: 3),
                    boxShadow: [
                      BoxShadow(
                        color: KidPalette.sun.withValues(alpha: 0.6),
                        blurRadius: 12,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              left: point.dx - ball * 0.2,
              top: point.dy + ball * 0.2,
              child: Opacity(
                opacity: fade.clamp(0.0, 1.0),
                child: Icon(
                  Icons.touch_app_rounded,
                  size: side * 0.13,
                  color: const Color(0xFF3A3F5C),
                  shadows: const [Shadow(color: Colors.white, blurRadius: 6)],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// A short burst of confetti from the top of the card.
class _Confetti extends StatelessWidget {
  const _Confetti({required this.animation});

  final Animation<double> animation;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, _) {
        final t = animation.value;
        if (t == 0 || t == 1) return const SizedBox();
        return CustomPaint(painter: _ConfettiPainter(t));
      },
    );
  }
}

class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter(this.t);

  final double t;

  static final _pieces = List.generate(70, (i) {
    final random = math.Random(i * 7919);
    return (
      x: random.nextDouble(),
      vx: (random.nextDouble() - 0.5) * 0.6,
      vy: -0.35 - random.nextDouble() * 0.55,
      spin: (random.nextDouble() - 0.5) * 14,
      size: 6 + random.nextDouble() * 8,
      colour: _paints[i % _paints.length],
    );
  });

  @override
  void paint(Canvas canvas, Size size) {
    final fade = t > 0.7 ? (1 - t) / 0.3 : 1.0;
    for (final piece in _pieces) {
      final x = (piece.x + piece.vx * t) * size.width;
      final y = (0.35 + piece.vy * t + 1.4 * t * t) * size.height;
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(piece.spin * t);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset.zero,
            width: piece.size,
            height: piece.size * 0.55,
          ),
          const Radius.circular(2),
        ),
        Paint()..color = piece.colour.withValues(alpha: fade.clamp(0.0, 1.0)),
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_ConfettiPainter oldDelegate) => oldDelegate.t != t;
}
