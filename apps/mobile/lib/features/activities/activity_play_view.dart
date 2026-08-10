import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'activity_controller.dart';
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
          ChoiceContent c => _ChoiceStep(controller: controller, content: c),
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

  @override
  Widget build(BuildContext context) {
    final item = content.items[controller.index.value];
    final chosen = controller.chosen.value;

    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          const SizedBox(height: 8),
          if (item.glyph != null)
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
                    child: Center(
                      child: Text(
                        item.options[option],
                        style: const TextStyle(fontSize: 44),
                      ),
                    ),
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

class _CardStep extends StatelessWidget {
  const _CardStep({required this.controller, required this.content});

  final ActivityPlayController controller;
  final CardContent content;

  @override
  Widget build(BuildContext context) {
    final item = content.items[controller.index.value];

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (item.glyph != null)
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

  @override
  Widget build(BuildContext context) {
    final item = widget.content.items[widget.controller.index.value];
    final answered = widget.controller.chosen.value != null;

    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          Text(
            item.say,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 16),

          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final size = Size(constraints.maxWidth, constraints.maxHeight);

                return GestureDetector(
                  onPanUpdate: (details) {
                    if (answered) return;
                    setState(() => _drawn.add(details.localPosition));
                  },
                  child: Container(
                    width: size.width,
                    height: size.height,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: Theme.of(context).colorScheme.outlineVariant,
                      ),
                    ),
                    child: CustomPaint(
                      painter: _TracePainter(
                        item: item,
                        drawn: _drawn,
                        guideColour: Theme.of(
                          context,
                        ).colorScheme.outlineVariant,
                        inkColour: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),

          const SizedBox(height: 12),
          Row(
            children: [
              TextButton(
                onPressed: () => setState(_drawn.clear),
                child: const Text('Start again'),
              ),
              const Spacer(),
              FilledButton(
                onPressed: () {
                  // Any real attempt counts. A three-year-old's line will never
                  // sit on the path, and scoring the shape of it would measure
                  // fine motor control rather than letter recognition.
                  widget.controller.answer(_drawn.length > 12 ? 1 : 0, 1);
                  setState(_drawn.clear);
                  widget.controller.next();
                },
                child: Text(widget.controller.isLast ? 'Finish' : 'Next'),
              ),
            ],
          ),
        ],
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

  @override
  Widget build(BuildContext context) {
    final scored = controller.isScored;

    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('🎉', style: TextStyle(fontSize: 84)),
          const SizedBox(height: 16),
          Text('All done!', style: Theme.of(context).textTheme.headlineSmall),
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
