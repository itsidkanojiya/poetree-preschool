import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/features/activities/activity_controller.dart';
import 'package:poetree_school/features/activities/activity_models.dart';

/// Numbers open one at a time, in order.
///
/// Tracing is the one activity whose items are a sequence rather than a set:
/// you learn to write one before two. So the page cannot be left by tapping
/// Next, and nine of the ten start shut.
void main() {
  ActivityPlayController tenNumbers() {
    final activity = ActivityDefinition(
      id: 'act_1',
      code: 'TRACE_1_10',
      title: 'Trace numbers 1 to 10',
      type: 'TRACING',
      skillName: 'Writing',
      bookName: 'Numbers',
      chapterName: 'One to ten',
      chapterId: 'ch_1',
      bookId: 'bk_1',
      isLocked: false,
      content: TracingContent(
        items: [
          for (var n = 1; n <= 10; n++)
            TracingItem(glyph: '$n', say: 'Trace the $n.', strokes: const []),
        ],
      ),
    );

    return ActivityPlayController(activity: activity, studentId: 'stu_1');
  }

  test('only the first number is open to begin with', () {
    final controller = tenNumbers();

    expect(controller.isUnlocked(0), isTrue);
    for (var n = 1; n < 10; n++) {
      expect(controller.isUnlocked(n), isFalse, reason: 'number ${n + 1}');
    }
  });

  test('tracing one opens the next, and only the next', () {
    final controller = tenNumbers();
    controller.traceAccepted();

    expect(controller.isUnlocked(1), isTrue);
    expect(controller.isUnlocked(2), isFalse);
  });

  test('a locked number cannot be jumped to', () {
    final controller = tenNumbers();

    controller.goTo(4);

    // Still on the first. This is the rule the strip draws a padlock for.
    expect(controller.index.value, 0);
  });

  test('a number already done can be gone back to', () {
    final controller = tenNumbers();
    controller.traceAccepted();
    controller.index.value = 1;

    controller.goTo(0);

    expect(controller.index.value, 0);
    // And it starts clean rather than showing its old tick, or there would be
    // nothing to do on the page.
    expect(controller.chosen.value, isNull);
  });

  test('re-tracing a number does not score it twice', () {
    final controller = tenNumbers();

    controller.traceAccepted();
    expect(controller.correct.value, 1);

    // Back to it and traced again — practice, not a second mark.
    controller.goTo(0);
    controller.traceAccepted();

    expect(controller.correct.value, 1);
    expect(controller.traced, {0});
  });

  test('accepting a trace is what makes the page finishable', () {
    final controller = tenNumbers();

    // Nothing tapped: the page has no way on, which is the point.
    expect(controller.chosen.value, isNull);

    controller.traceAccepted();

    expect(controller.chosen.value, isNotNull);
    expect(controller.wasCorrect.value, isTrue);
  });
}
