import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/features/activities/activity_models.dart';

void main() {
  test('an option can be a picture', () {
    final content = ActivityContent.tryParse({
      'kind': 'MATCHING',
      'items': [
        {
          'prompt': {
            'say': 'Circle the apple',
            'imageUrl': '/api/v1/catalogue/assets/prompt_1',
          },
          'options': [
            {'imageUrl': '/api/v1/catalogue/assets/apple_1'},
            {'imageUrl': '/api/v1/catalogue/assets/ball_1'},
          ],
          'answer': 0,
        },
      ],
    });

    expect(content, isA<ChoiceContent>());
    final item = (content! as ChoiceContent).items.first;

    // The same trim every other file path in this app needs: the base URL
    // already ends in /api/v1, and leaving it would 404 every picture.
    expect(item.imagePath, '/catalogue/assets/prompt_1');
    expect(item.options.first.imagePath, '/catalogue/assets/apple_1');
    expect(item.options.first.isEmpty, isFalse);
  });

  test('an option can still be an emoji or a word', () {
    final content = ActivityContent.tryParse({
      'kind': 'COUNTING',
      'items': [
        {
          'prompt': {'say': 'How many apples?', 'glyph': '🍎🍎'},
          'options': [
            {'text': '1'},
            {'text': '2'},
            {'glyph': '🍎'},
          ],
          'answer': 1,
        },
      ],
    });

    final item = (content! as ChoiceContent).items.first;

    expect(item.options[0].text, '1');
    expect(item.options[2].glyph, '🍎');
    expect(item.options[0].imagePath, isNull);
  });

  test('content written before pictures existed still plays', () {
    // Options were bare strings. An older activity that has not been lifted
    // into rows yet must not become unplayable because the shape moved on.
    final content = ActivityContent.tryParse({
      'kind': 'MATCHING',
      'items': [
        {
          'prompt': {'say': 'Which is the cat?'},
          'options': ['🐈', '🐕'],
          'answer': 0,
        },
      ],
    });

    final item = (content! as ChoiceContent).items.first;

    expect(item.options, hasLength(2));
    expect(item.options.first.glyph, '🐈');
  });

  test('a flash card can carry a picture', () {
    final content = ActivityContent.tryParse({
      'kind': 'FLASHCARD',
      'items': [
        {
          'title': 'Apple',
          'say': 'A is for apple.',
          'imageUrl': '/api/v1/catalogue/assets/apple_1',
        },
      ],
    });

    expect(content, isA<CardContent>());
    expect(
      (content! as CardContent).items.first.imagePath,
      '/catalogue/assets/apple_1',
    );
    expect(content.isScored, isFalse);
  });

  test('an activity says which book it came from', () {
    final activity = ActivityDefinition.fromJson({
      'id': 'act_1',
      'code': 'CIRCLE_A',
      'title': 'Circle the correct letter',
      'type': 'MATCHING',
      'skill': {'id': 's', 'name': 'Letter recognition'},
      'book': {'id': 'b', 'name': 'EVS Book'},
      'contentJson': {
        'kind': 'MATCHING',
        'items': [
          {
            'prompt': {'say': 'Which is A?'},
            'options': [
              {'glyph': 'A'},
              {'glyph': 'B'},
            ],
            'answer': 0,
          },
        ],
      },
    });

    // What the family recognises: a book they own, not a skill taxonomy.
    expect(activity.bookName, 'EVS Book');
    expect(activity.isPlayable, isTrue);
  });

  test('an activity the app cannot read is never offered', () {
    // The forward-compatibility gate: shipping a shape an older build does not
    // know must hide the activity rather than render something wrong.
    final activity = ActivityDefinition.fromJson({
      'id': 'act_2',
      'code': 'FUTURE',
      'title': 'Something new',
      'type': 'MATCHING',
      'skill': {'id': 's', 'name': 'Letters'},
      'contentJson': {
        'kind': 'SOMETHING_ELSE',
        'items': [{}],
      },
    });

    expect(activity.isPlayable, isFalse);
  });
}
