import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/kid_icons.dart';
import '../../core/widgets/authed_image.dart';
import 'activity_controller.dart';
import 'trace_check.dart';
import 'activity_models.dart';

/// A child doing one activity.
///
/// Designed for two to six year olds who cannot read: every prompt is a
/// sentence for the adult beside them plus something to look at, targets are
/// large, and there is exactly one right answer per question because ambiguity
/// at this age reads as failure.
///
/// There is no timer and no score shown during play. The number is for the
/// teacher afterwards, not for the child now.
class ActivityPlayView extends GetView<ActivityPlayController> {
  const ActivityPlayView({super.key});

  @override
  Widget build(BuildContext context) {
    final content = controller.activity.content;

    return Scaffold(
      appBar: AppBar(
        title: Text(controller.activity.title),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(3),
          child: Obx(
            () => LinearProgressIndicator(
              value: controller.total == 0
                  ? 0
                  : (controller.index.value + 1) / controller.total,
              minHeight: 3,
            ),
          ),
        ),
      ),
      body: Obx(() {
        if (controller.isFinished.value) {
          return _Finished(controller: controller);
        }

        return switch (content) {
          // Drag and drop carries the same content as a tap question; what
          // changes is how the child gets the answer there.
          ChoiceContent c when c.kind == 'DRAG_DROP' => _DragStep(
            controller: controller,
            content: c,
          ),
          ChoiceContent c => _ChoiceStep(controller: controller, content: c),
          MultiChoiceContent c => _MultiChoiceStep(
            controller: controller,
            content: c,
          ),
          CardContent c => _CardStep(controller: controller, content: c),
          TracingContent c => _TracingStep(controller: controller, content: c),
          null => const Center(child: Text('Nothing to do here yet.')),
        };
      }),
    );
  }
}

class _ChoiceStep extends StatelessWidget {
  const _ChoiceStep({required this.controller, required this.content});

  final ActivityPlayController controller;
  final ChoiceContent content;

  /// Subscribed here, not by the player's own [Obx].
  ///
  /// That one reads `isFinished` and then *returns* this widget, and a widget
  /// it returns is built later, outside its reactive scope — so tapping an
  /// answer changed `chosen` and nothing repainted. The tick came back only
  /// after leaving the page and coming back, which rebuilds everything.
  ///
  /// `_body` is called synchronously inside this closure, so every observable
  /// it reads is tracked. Returning a widget is what breaks it; calling a
  /// function is not.
  @override
  Widget build(BuildContext context) => Obx(() => _body(context));

  Widget _body(BuildContext context) {
    final item = content.items[controller.index.value];
    final chosen = controller.chosen.value;

    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          const SizedBox(height: 8),
          if (item.imagePath != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: AuthedImage(
                path: item.imagePath!,
                height: 140,
                fit: BoxFit.contain,
              ),
            )
          else if (item.glyph != null)
            Text(item.glyph!, style: const TextStyle(fontSize: 64)),
          const SizedBox(height: 12),
          Text(
            item.say,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 28),

          Expanded(
            child: GridView.count(
              crossAxisCount: item.options.length > 2 ? 3 : 2,
              childAspectRatio: 1,
              mainAxisSpacing: 14,
              crossAxisSpacing: 14,
              children: List.generate(item.options.length, (option) {
                final isChosen = chosen == option;
                final isAnswer = option == item.answer;

                // After a tap, the right answer is always shown — including
                // when they got it wrong. Being told only "no" teaches nothing.
                final colour = chosen == null
                    ? Theme.of(context).colorScheme.surfaceContainerHighest
                    : isAnswer
                    ? const Color(0xFFDCFCE7)
                    : isChosen
                    ? const Color(0xFFFEE2E2)
                    : Theme.of(context).colorScheme.surfaceContainerHighest;

                return Material(
                  color: colour,
                  borderRadius: BorderRadius.circular(20),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(20),
                    onTap: () => controller.answer(option, item.answer),
                    child: _Option(media: item.options[option]),
                  ),
                );
              }),
            ),
          ),

          if (chosen != null) ...[
            Text(
              controller.wasCorrect.value == true
                  ? 'Yes! Well done.'
                  : 'Nearly — this one is right.',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: controller.next,
              child: Text(controller.isLast ? 'Finish' : 'Next'),
            ),
          ],
        ],
      ),
    );
  }
}

/// Tap everything that fits, then say you are done.
///
/// Nothing is judged on the first tap. A child sifting a set changes their mind
/// — that is the skill being practised — so choices stay editable until they
/// press the button, and only then is the whole set marked at once.
class _MultiChoiceStep extends StatelessWidget {
  const _MultiChoiceStep({required this.controller, required this.content});

  final ActivityPlayController controller;
  final MultiChoiceContent content;

  /// See [_ChoiceStep.build] — same reason, same fix.
  @override
  Widget build(BuildContext context) => Obx(() => _body(context));

  Widget _body(BuildContext context) {
    final item = content.items[controller.index.value];
    final done = controller.chosen.value != null;
    final picked = controller.picked;

    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          const SizedBox(height: 8),
          if (item.imagePath != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: AuthedImage(
                path: item.imagePath!,
                height: 130,
                fit: BoxFit.contain,
              ),
            )
          else if (item.glyph != null)
            Text(item.glyph!, style: const TextStyle(fontSize: 60)),
          const SizedBox(height: 12),
          Text(
            item.say,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 20),

          Expanded(
            child: GridView.count(
              crossAxisCount: item.options.length > 4 ? 3 : 2,
              childAspectRatio: 1,
              mainAxisSpacing: 14,
              crossAxisSpacing: 14,
              children: List.generate(item.options.length, (option) {
                final isPicked = picked.contains(option);
                final isAnswer = item.answers.contains(option);

                // Before finishing, a tick is just a tick. Afterwards every
                // right answer is shown, including the ones they missed.
                final colour = !done
                    ? isPicked
                          ? const Color(0xFFDBEAFE)
                          : Theme.of(
                              context,
                            ).colorScheme.surfaceContainerHighest
                    : isAnswer
                    ? const Color(0xFFDCFCE7)
                    : isPicked
                    ? const Color(0xFFFEE2E2)
                    : Theme.of(context).colorScheme.surfaceContainerHighest;

                return Material(
                  color: colour,
                  borderRadius: BorderRadius.circular(20),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(20),
                    onTap: done ? null : () => controller.toggle(option),
                    child: Stack(
                      children: [
                        _Option(media: item.options[option]),
                        if (isPicked)
                          const Positioned(
                            top: 8,
                            right: 8,
                            child: Icon(Icons.check_circle, size: 22),
                          ),
                      ],
                    ),
                  ),
                );
              }),
            ),
          ),

          if (!done)
            FilledButton(
              // Nothing chosen is not an answer; it is a child who has not
              // started, and marking it wrong would teach them that trying is
              // the risky part.
              onPressed: picked.isEmpty
                  ? null
                  : () => controller.finishMulti(item.answers),
              child: const Text('Done'),
            )
          else ...[
            Text(
              controller.wasCorrect.value == true
                  ? 'Yes! You found them all.'
                  : 'Nearly — the green ones are right.',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: controller.next,
              child: Text(controller.isLast ? 'Finish' : 'Next'),
            ),
          ],
        ],
      ),
    );
  }
}

/// Drag the answer into the box.
///
/// The same question as a tap, with the answer carried rather than pointed at.
/// Tapping still works: a two-year-old with a small finger should not be locked
/// out of a page because dragging is hard, and the answer is the same either
/// way.
class _DragStep extends StatelessWidget {
  const _DragStep({required this.controller, required this.content});

  final ActivityPlayController controller;
  final ChoiceContent content;

  /// See [_ChoiceStep.build] — same reason, same fix.
  @override
  Widget build(BuildContext context) => Obx(() => _body(context));

  Widget _body(BuildContext context) {
    final item = content.items[controller.index.value];
    final chosen = controller.chosen.value;
    final colors = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          const SizedBox(height: 8),
          Text(
            item.say,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 16),

          // The target: what the dragged answer lands on.
          DragTarget<int>(
            onAcceptWithDetails: (details) =>
                controller.answer(details.data, item.answer),
            builder: (context, candidate, _) => Container(
              height: 150,
              decoration: BoxDecoration(
                color: chosen == null
                    ? (candidate.isEmpty
                          ? colors.surfaceContainerHighest
                          : const Color(0xFFDBEAFE))
                    : controller.wasCorrect.value == true
                    ? const Color(0xFFDCFCE7)
                    : const Color(0xFFFEE2E2),
                borderRadius: BorderRadius.circular(22),
                border: Border.all(
                  color: colors.outlineVariant,
                  width: 2,
                  style: BorderStyle.solid,
                ),
              ),
              alignment: Alignment.center,
              child: chosen == null
                  ? (item.imagePath != null
                        ? AuthedImage(
                            path: item.imagePath!,
                            height: 110,
                            fit: BoxFit.contain,
                          )
                        : Text(
                            item.glyph ?? 'Drop it here',
                            style: TextStyle(
                              fontSize: item.glyph == null ? 18 : 56,
                              color: colors.outline,
                            ),
                          ))
                  : _Option(media: item.options[chosen]),
            ),
          ),

          const SizedBox(height: 24),

          Expanded(
            child: GridView.count(
              crossAxisCount: item.options.length > 2 ? 3 : 2,
              childAspectRatio: 1,
              mainAxisSpacing: 14,
              crossAxisSpacing: 14,
              children: List.generate(item.options.length, (option) {
                final tile = Material(
                  color: colors.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(20),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(20),
                    // Tap as well as drag, deliberately.
                    onTap: chosen == null
                        ? () => controller.answer(option, item.answer)
                        : null,
                    child: _Option(media: item.options[option]),
                  ),
                );

                if (chosen != null) return Opacity(opacity: 0.4, child: tile);

                return Draggable<int>(
                  data: option,
                  feedback: Material(
                    color: Colors.transparent,
                    child: SizedBox(
                      width: 96,
                      height: 96,
                      child: Material(
                        color: const Color(0xFFDBEAFE),
                        borderRadius: BorderRadius.circular(20),
                        elevation: 6,
                        child: _Option(media: item.options[option]),
                      ),
                    ),
                  ),
                  childWhenDragging: Opacity(opacity: 0.3, child: tile),
                  child: tile,
                );
              }),
            ),
          ),

          if (chosen != null) ...[
            Text(
              controller.wasCorrect.value == true
                  ? 'Yes! Well done.'
                  : 'Nearly — this one is right.',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: controller.next,
              child: Text(controller.isLast ? 'Finish' : 'Next'),
            ),
          ],
        ],
      ),
    );
  }
}

class _CardStep extends StatelessWidget {
  const _CardStep({required this.controller, required this.content});

  final ActivityPlayController controller;
  final CardContent content;

  /// See [_ChoiceStep.build] — same reason, same fix. A flashcard has no answer
  /// to reveal, but turning to the next card is a change to `index` and was
  /// just as invisible.
  @override
  Widget build(BuildContext context) => Obx(() => _body(context));

  Widget _body(BuildContext context) {
    final item = content.items[controller.index.value];

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (item.imagePath != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(22),
              child: AuthedImage(
                path: item.imagePath!,
                height: 220,
                fit: BoxFit.contain,
              ),
            )
          else if (item.glyph != null)
            Text(item.glyph!, style: const TextStyle(fontSize: 110)),
          const SizedBox(height: 20),
          Text(item.title, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 12),
          Text(
            item.say,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const Spacer(),
          FilledButton(
            onPressed: () {
              controller.seen();
              controller.next();
            },
            child: Text(controller.isLast ? 'Finish' : 'Next'),
          ),
        ],
      ),
    );
  }
}

class _TracingStep extends StatefulWidget {
  const _TracingStep({required this.controller, required this.content});

  final ActivityPlayController controller;
  final TracingContent content;

  @override
  State<_TracingStep> createState() => _TracingStepState();
}

class _TracingStepState extends State<_TracingStep> {
  final _drawn = <Offset>[];

  /// The last judgement, or null while the finger is still down.
  ///
  /// Held rather than recomputed on every frame: measuring a few hundred
  /// points against a few hundred more, sixty times a second, for no reason.
  /// It is worked out once, when the finger lifts.
  TraceCheck? _check;

  /// The canvas, so a lifted finger can be measured against a guide drawn at
  /// the same size the child saw.
  Size _canvas = Size.zero;

  void _judge() {
    final item = widget.content.items[widget.controller.index.value];
    final result = checkTrace(
      strokes: item.strokes,
      drawn: _drawn,
      size: _canvas,
    );

    setState(() => _check = result);
    if (result.passes) widget.controller.traceAccepted();
  }

  void _restart() {
    setState(() {
      _drawn.clear();
      _check = null;
    });
  }

  /// See [_ChoiceStep.build] — same reason, same fix. `setState` keeps driving
  /// the finger-drawing, which is this widget's own state and not the
  /// controller's; the two rebuild paths sit happily on top of each other.
  @override
  Widget build(BuildContext context) => Obx(() => _body(context));

  Widget _body(BuildContext context) {
    final controller = widget.controller;
    final item = widget.content.items[controller.index.value];
    final done = controller.chosen.value != null;
    final theme = Theme.of(context);
    final check = _check;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
      child: Column(
        children: [
          // Which number this is, and which are still shut. A sequence, not a
          // set: you learn to write one before two, so they open in order and
          // the strip says how far along the child is.
          _TraceStrip(controller: controller, onPick: _restart),
          const SizedBox(height: 14),

          Text(
            item.say,
            textAlign: TextAlign.center,
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 14),

          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final size = Size(constraints.maxWidth, constraints.maxHeight);
                _canvas = size;

                return GestureDetector(
                  // Judged when the finger lifts, not while it is down: a line
                  // half drawn is not a wrong answer, it is an unfinished one.
                  onPanUpdate: (details) {
                    if (done) return;
                    setState(() {
                      _drawn.add(details.localPosition);
                      _check = null;
                    });
                  },
                  onPanEnd: (_) {
                    if (!done) _judge();
                  },
                  child: Container(
                    width: size.width,
                    height: size.height,
                    // Paper, and paper is white in both themes — a child is
                    // writing on it. Which means every colour on it has to be
                    // fixed too: taking the ink from the theme would give a
                    // pale line on white paper in dark mode, and the guide
                    // would follow the theme away from being visible.
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: done ? AppTheme.leaf : _paperEdge,
                        width: done ? 2 : 1,
                      ),
                    ),
                    child: CustomPaint(
                      painter: _TracePainter(
                        item: item,
                        drawn: _drawn,
                        guideColour: _guideInk,
                        inkColour: done ? AppTheme.leaf : AppTheme.apricot,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),

          const SizedBox(height: 10),

          // One line that says what just happened. Never blank while there is
          // something to say, and never a red failure: a child who missed is
          // asked to go again, not marked wrong.
          SizedBox(
            height: 24,
            child: Center(
              child: Text(
                done
                    ? 'That looks like it! Well done.'
                    : check == null
                    ? 'Trace over the grey line with your finger.'
                    : check.hint,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: done ? AppTheme.leaf : theme.colorScheme.onSurface,
                ),
              ),
            ),
          ),
          const SizedBox(height: 6),

          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: _drawn.isEmpty ? null : _restart,
              child: const Text('Start again'),
            ),
          ),
          const SizedBox(height: 4),

          // Stacked rather than beside "Start again": the theme gives every
          // FilledButton an infinite minimum width, so one in a Row is pushed
          // off the screen — which is how the way on went missing before.
          //
          // Disabled until the shape is actually traced. That is the whole
          // point: a page you could leave by tapping Next taught nothing about
          // writing a one.
          FilledButton(
            onPressed: done
                ? () {
                    _restart();
                    controller.next();
                  }
                : null,
            child: Text(controller.isLast ? 'Finish' : 'Next'),
          ),
        ],
      ),
    );
  }
}

/// The tracing paper's own colours, fixed in both themes.
///
/// The sheet is white because a child is writing on it, so what is drawn on it
/// cannot come from a theme that assumes a dark ground.
const _guideInk = Color(0xFF2B3242);
const _paperEdge = Color(0x1F000000);

/// The numbers in this activity, in order, with the shut ones shut.
///
/// A child sees where they are and what is coming. Tapping one they have
/// already done goes back to it — practice is the point — and tapping a locked
/// one does nothing, because the number before it has not been written yet.
class _TraceStrip extends StatelessWidget {
  const _TraceStrip({required this.controller, required this.onPick});

  final ActivityPlayController controller;

  /// Clears the canvas, so moving between numbers never leaves the last line
  /// drawn on the new one.
  final VoidCallback onPick;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SizedBox(
      height: 42,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: controller.total,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (context, item) {
          final isDone = controller.traced.contains(item);
          final isHere = controller.index.value == item;
          final isOpen = controller.isUnlocked(item);

          final background = isHere
              ? theme.colorScheme.primary
              : isDone
              ? AppTheme.leafSoft
              : isOpen
              ? theme.colorScheme.surface
              : theme.colorScheme.surfaceContainerHighest;

          final foreground = isHere
              ? theme.colorScheme.onPrimary
              : isDone
              ? AppTheme.leaf
              : isOpen
              ? theme.colorScheme.onSurface
              : theme.colorScheme.onSurfaceVariant;

          return GestureDetector(
            onTap: isOpen
                ? () {
                    controller.goTo(item);
                    onPick();
                  }
                : null,
            child: Container(
              width: 42,
              decoration: BoxDecoration(
                color: background,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isHere
                      ? theme.colorScheme.primary
                      : theme.colorScheme.outlineVariant,
                ),
              ),
              alignment: Alignment.center,
              child: isOpen
                  ? Text(
                      '${item + 1}',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: foreground,
                      ),
                    )
                  // A padlock, because a locked number showing its own digit
                  // reads as available and greyed out for no reason.
                  : Icon(Icons.lock_rounded, size: 17, color: foreground),
            ),
          );
        },
      ),
    );
  }
}

class _TracePainter extends CustomPainter {
  _TracePainter({
    required this.item,
    required this.drawn,
    required this.guideColour,
    required this.inkColour,
  });

  final TracingItem item;
  final List<Offset> drawn;
  final Color guideColour;
  final Color inkColour;

  @override
  void paint(Canvas canvas, Size size) {
    final guide = Paint()
      ..color = guideColour
      ..strokeWidth = 18
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    // Coordinates are normalised 0–1 so one definition renders at any size.
    for (final stroke in item.strokes) {
      if (stroke.length < 2) continue;
      final path = Path()
        ..moveTo(stroke.first.x * size.width, stroke.first.y * size.height);
      for (final point in stroke.skip(1)) {
        path.lineTo(point.x * size.width, point.y * size.height);
      }
      canvas.drawPath(path, guide);
    }

    final ink = Paint()
      ..color = inkColour
      ..strokeWidth = 10
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    for (var i = 1; i < drawn.length; i++) {
      // A big jump means the finger lifted and came down elsewhere.
      if ((drawn[i] - drawn[i - 1]).distance > 40) continue;
      canvas.drawLine(drawn[i - 1], drawn[i], ink);
    }
  }

  @override
  bool shouldRepaint(_TracePainter oldDelegate) =>
      oldDelegate.drawn.length != drawn.length || oldDelegate.item != item;
}

class _Finished extends StatelessWidget {
  const _Finished({required this.controller});

  final ActivityPlayController controller;

  /// See [_ChoiceStep.build] — same reason, same fix. The score and the
  /// "we could not tell the school" line are both observables, and the retry
  /// button clearing that line changed nothing on screen.
  @override
  Widget build(BuildContext context) => Obx(() => _body(context));

  Widget _body(BuildContext context) {
    final scored = controller.isScored;

    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Stars, not a party emoji rendered at whatever size the phone's
          // font happens to draw it. Three of them, the middle one bigger,
          // because a child reads "well done" from the shape before the words.
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              KidIcon(
                KidGlyph.star,
                size: 44,
                color: AppTheme.apricot,
                tint: AppTheme.apricotSoft,
              ),
              const SizedBox(width: 10),
              KidIcon(
                KidGlyph.star,
                size: 72,
                color: AppTheme.apricot,
                tint: AppTheme.apricotSoft,
              ),
              const SizedBox(width: 10),
              KidIcon(
                KidGlyph.star,
                size: 44,
                color: AppTheme.apricot,
                tint: AppTheme.apricotSoft,
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text(
            'All done!',
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),

          // Shown to the adult, and phrased as an achievement rather than a
          // mark. No child is told they scored two out of five.
          Text(
            scored
                ? 'Got ${controller.correct.value} of ${controller.total} right.'
                : 'Looked at all ${controller.total} of them.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),

          if (controller.saveFailed.value) ...[
            const SizedBox(height: 20),
            Text(
              'This could not be sent to the school. Their progress is safe — '
              'try again when you have signal.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.error,
              ),
            ),
            const SizedBox(height: 10),
            OutlinedButton(
              onPressed: controller.retrySave,
              child: const Text('Send it again'),
            ),
          ],

          const SizedBox(height: 28),
          FilledButton(
            onPressed: () => Get.back<void>(),
            child: const Text('Done'),
          ),
          TextButton(
            onPressed: controller.restart,
            child: const Text('Do it again'),
          ),
        ],
      ),
    );
  }
}

/// One choice: a picture, an emoji, or a word.
///
/// A picture fills the tile with padding around it, because clip art with a
/// white background butted against a coloured tile looks like a mistake.
class _Option extends StatelessWidget {
  const _Option({required this.media});

  final ActivityMedia media;

  @override
  Widget build(BuildContext context) {
    if (media.imagePath != null) {
      return Padding(
        padding: const EdgeInsets.all(10),
        child: AuthedImage(path: media.imagePath!, fit: BoxFit.contain),
      );
    }

    final label = media.glyph ?? media.text ?? '';
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: FittedBox(
          child: Text(
            label,
            textAlign: TextAlign.center,
            // A word needs to be smaller than a single emoji or it will not
            // fit, and FittedBox does the rest.
            style: TextStyle(fontSize: label.characters.length > 2 ? 28 : 44),
          ),
        ),
      ),
    );
  }
}
