import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/features/activities/activity_models.dart';

/// Parsing and scoring rules.
///
/// These decide what number reaches a parent's progress screen, so getting
/// them wrong does not produce an error — it produces a plausible figure about
/// a child that is not true.

Map<String, dynamic> _choice() => {
  'kind': 'MATCHING',
  'items': [
    {
      'prompt': {'say': 'Find the circle.'},
      'options': ['🔺', '⭕'],
      'answer': 1,
    },
  ],
};

void main() {
  group('parsing', () {
    test('reads a choice activity', () {
      final content = ActivityContent.tryParse(_choice());

      expect(content, isA<ChoiceContent>());
      expect(content!.itemCount, 1);
      expect((content as ChoiceContent).items.first.answer, 1);
    });

    test('reads a tracing activity with normalised strokes', () {
      final content = ActivityContent.tryParse({
        'kind': 'TRACING',
        'items': [
          {
            'glyph': 'I',
            'say': 'Trace the letter I.',
            'strokes': [
              [
                {'x': 0.5, 'y': 0.1},
                {'x': 0.5, 'y': 0.9},
              ],
            ],
          },
        ],
      });

      expect(content, isA<TracingContent>());
      final item = (content! as TracingContent).items.first;
      expect(item.strokes.single.last.y, 0.9);
    });

    test('returns nothing for an activity nobody has authored', () {
      // The list screen filters on this. Offering an activity the app cannot
      // render means a child taps it and finds a blank screen.
      expect(ActivityContent.tryParse(null), isNull);
      expect(
        ActivityContent.tryParse({'kind': 'MATCHING', 'items': <dynamic>[]}),
        isNull,
      );
    });

    test('returns nothing for a kind this build does not know', () {
      // Content newer than the app. Better to show nothing than to render
      // something wrong to a child.
      expect(
        ActivityContent.tryParse({
          'kind': 'PUZZLE',
          'items': [
            {'title': 'x', 'say': 'y'},
          ],
        }),
        isNull,
      );
    });
  });

  group('what counts as a score', () {
    test('questions are scored', () {
      expect(ActivityContent.tryParse(_choice())!.isScored, isTrue);
    });

    test('flashcards, rhymes and stories are not', () {
      // Scoring a child for looking at a picture of a cow would put a number on
      // something that is not a test, and every mastery figure built on top of
      // it would mean nothing.
      for (final kind in ['FLASHCARD', 'RHYME', 'STORY']) {
        final content = ActivityContent.tryParse({
          'kind': kind,
          'items': [
            {'title': 'Cow', 'say': 'A cow says moo.'},
          ],
        });

        expect(content, isNotNull, reason: kind);
        expect(content!.isScored, isFalse, reason: kind);
      }
    });
  });
}
