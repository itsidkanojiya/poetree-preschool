import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/kid_icons.dart';
import '../../core/widgets/authed_image.dart';
import '../../core/widgets/sticker_text.dart';
import '../../core/letterforms/glyph_text.dart';
import 'activity_controller.dart';
import 'activity_models.dart';
import 'steps/count_out_step.dart';
import 'steps/fill_gap_step.dart';
import 'steps/letter_hunt_step.dart';
import 'steps/match_pairs_step.dart';
import 'steps/rhyme_step.dart';
import 'steps/sort_groups_step.dart';
import 'steps/step_kit.dart';
import '../tracing/tracing_play.dart';

/// A child doing one activity.
///
/// Designed for two to six year olds who cannot read: every question is read
/// aloud and comes with something to look at, targets are large, and a wrong
/// tap earns one gentle "try again" before the answer is shown.
///
/// There is no timer and no score shown during play. The number is for the
/// teacher afterwards, not for the child now.
///
/// The top and the end are the same for every type; the middle is the type's
/// own screen — the ones made from the Pre-Primary books are in `steps/`.
class ActivityPlayView extends GetView<ActivityPlayController> {
  const ActivityPlayView({super.key});

  @override
  Widget build(BuildContext context) {
    final content = controller.activity.content;

    return Scaffold(
      appBar: AppBar(
        title: Text(controller.activity.title),
        // Where they are, in numbers a parent can read over the child's
        // shoulder: "3 / 10" — in the tracing lesson's sticker numbers.
        actions: [
          // The question again, as often as it is wanted.
          Obx(
            () => controller.isFinished.value || controller.total == 0
                ? const SizedBox.shrink()
                : IconButton(
                    tooltip: 'Hear the question',
                    onPressed: controller.sayQuestion,
                    icon: const Icon(Icons.volume_up_rounded),
                  ),
          ),
          Obx(
            () => controller.isFinished.value || controller.total == 0
                ? const SizedBox.shrink()
                : Padding(
                    padding: const EdgeInsets.only(right: 16),
                    child: Center(
                      child: _Count(
                        controller.index.value + 1,
                        controller.total,
                      ),
                    ),
                  ),
          ),
        ],
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

        // Keyed by the question, so a screen that keeps its own state — pairs
        // joined, cards sorted — starts clean on the next one.
        final at = controller.index.value;
        final key = ValueKey('question-$at');

        return switch (content) {
          MatchPairsContent c => MatchPairsStep(
            key: key,
            controller: controller,
            item: c.items[at],
          ),
          SortGroupsContent c => SortGroupsStep(
            key: key,
            controller: controller,
            item: c.items[at],
          ),
          CountOutContent c => CountOutStep(
            key: key,
            controller: controller,
            item: c.items[at],
          ),
          FillGapContent c => FillGapStep(
            key: key,
            controller: controller,
            item: c.items[at],
          ),
          LetterHuntContent c => LetterHuntStep(
            key: key,
            controller: controller,
            item: c.items[at],
          ),
          // A rhyme or story with its words: read along, a line at a time.
          CardContent c
              when c.kind != 'FLASHCARD' && c.items[at].lines.isNotEmpty =>
            RhymeStep(key: key, controller: controller, item: c.items[at]),
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
          TracingContent c => TracingPlay(controller: controller, content: c),
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
            _Prompt(item.glyph!, size: 56),
          const SizedBox(height: 12),
          Text(
            item.say,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 28),

          Expanded(
            child: GridView.count(
              // Four as two by two: a row of three and one alone looks like
              // the odd one out before anyone has looked.
              crossAxisCount: item.options.length == 3 ? 3 : 2,
              childAspectRatio: 1,
              mainAxisSpacing: 14,
              crossAxisSpacing: 14,
              children: List.generate(item.options.length, (option) {
                final isChosen = chosen == option;
                final isAnswer = option == item.answer;
                final shake = controller.shake.value;

                // After the answer, the right one is always shown — including
                // when they got it wrong. Being told only "no" teaches nothing.
                return PlayTile(
                  look: chosen == null
                      ? TileLook.idle
                      : isAnswer
                      ? TileLook.right
                      : isChosen
                      ? TileLook.wrong
                      : TileLook.idle,
                  shake: shake != null && shake.option == option
                      ? shake.count
                      : 0,
                  onTap: () => controller.answer(option, item.answer),
                  child: _Option(media: item.options[option]),
                );
              }),
            ),
          ),

          if (chosen != null) ...[
            StepFeedback(
              controller.wasCorrect.value == true
                  ? 'Yes! Well done.'
                  : 'Nearly — this one is right.',
              good: controller.wasCorrect.value == true,
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: controller.next,
              child: Text(controller.isLast ? 'Finish' : 'Next'),
            ),
          ] else if (controller.misses.value > 0)
            const StepFeedback('Not that one. Try again!', good: false),
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
            _Prompt(item.glyph!, size: 52),
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
                        : item.glyph != null && StickerText.fits(item.glyph!)
                        ? Opacity(
                            opacity: 0.45,
                            child: StickerText(item.glyph!, size: 64),
                          )
                        : item.glyph != null
                        ? GlyphText(
                            item.glyph!,
                            size: 48,
                            color: colors.outline,
                          )
                        : Text(
                            'Drop it here',
                            style: TextStyle(
                              fontSize: 18,
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
            _Prompt(item.glyph!, size: 96),
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
          _Sentence(
            scored
                ? [
                    'Got ',
                    controller.correct.value,
                    ' of ',
                    controller.total,
                    ' right.',
                  ]
                : ['Looked at all ', controller.total, ' of them.'],
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

    // A number or a letter as the tracing lesson draws it — counting
    // answers, numbered and lettered tiles — whether the question gave it as
    // a glyph or as text.
    final sticker = media.glyph ?? media.text;
    if (sticker != null && StickerText.fits(sticker)) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: FittedBox(child: StickerText(sticker, size: 64)),
        ),
      );
    }

    // Anything else the school's letterforms draw; an emoji or a word as
    // text.
    if (media.glyph != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: FittedBox(child: GlyphText(media.glyph!, size: 44)),
        ),
      );
    }

    final label = media.text ?? '';
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

/// The letter or number a question is about, as a sticker; anything the
/// sticker does not draw, in the school's letterforms as before.
class _Prompt extends StatelessWidget {
  const _Prompt(this.glyph, {required this.size});

  final String glyph;
  final double size;

  @override
  Widget build(BuildContext context) => StickerText.fits(glyph)
      ? StickerText(glyph, size: size * 1.15)
      : GlyphText(glyph, size: size);
}

/// "3 / 10": the question they are on, and how many there are.
class _Count extends StatelessWidget {
  const _Count(this.at, this.of);

  final int at;
  final int of;

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Question $at of $of',
    excludeSemantics: true,
    child: Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        StickerText('$at', size: 26),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            '/',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: Theme.of(context).colorScheme.outline,
            ),
          ),
        ),
        StickerText('$of', size: 20, colour: const Color(0xFF4C7FF0)),
      ],
    ),
  );
}

/// A sentence with its numbers as stickers: words are strings, numbers ints.
class _Sentence extends StatelessWidget {
  const _Sentence(this.parts, {this.style});

  final List<Object> parts;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) => Semantics(
    label: parts.join(),
    excludeSemantics: true,
    child: Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        for (final part in parts)
          part is int
              ? Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: StickerText('$part', size: 40),
                )
              : Text('$part', style: style),
      ],
    ),
  );
}
