import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/features/activities/activity_controller.dart';
import 'package:poetree_school/features/activities/activity_models.dart';
import 'package:poetree_school/features/activities/activity_play_view.dart';
import 'package:poetree_school/features/activities/steps/step_kit.dart';

/// The activities made from the Pre-Primary books: read from what the API
/// serves, and played the way a child plays them.

class _NoTokens implements TokenStore {
  @override
  Future<String?> get accessToken async => 'token';
  @override
  Future<String?> get refreshToken async => null;
  @override
  Future<void> save({required String access, required String refresh}) async {}
  @override
  Future<void> clear() async {}
}

class _Api implements HttpClientAdapter {
  final sent = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    sent.add('${options.method} ${options.path}');
    return ResponseBody.fromString(
      jsonEncode({'ok': true}),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

ActivityDefinition _activity(Map<String, dynamic> content) =>
    ActivityDefinition.fromJson({
      'id': 'a1',
      'code': 'A1',
      'title': 'From the book',
      'type': content['kind'],
      'skill': {'name': 'Books'},
      'contentJson': content,
    });

/// The player on a phone-sized screen, with this content.
Future<ActivityPlayController> _play(
  WidgetTester tester,
  Map<String, dynamic> content,
) async {
  await tester.binding.setSurfaceSize(const Size(400, 800));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  Get.put<ApiService>(
    ApiService()
      ..client = ApiClient(_NoTokens(), dio: Dio()..httpClientAdapter = _Api()),
  );
  final play = Get.put(
    ActivityPlayController(activity: _activity(content), studentId: 's1'),
  );
  await tester.pumpWidget(const GetMaterialApp(home: ActivityPlayView()));
  await tester.pump();
  return play;
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.tap(finder);
  await tester.pump(const Duration(milliseconds: 500));
}

void main() {
  tearDown(Get.reset);

  group('reading what the API serves', () {
    test('pairs, with a shadow drawn from the picture', () {
      final content = ActivityContent.tryParse({
        'kind': 'MATCH_PAIRS',
        'items': [
          {
            'prompt': {'say': 'Match the shadow'},
            'pairs': [
              {
                'left': {'imageUrl': '/api/v1/catalogue/assets/deer'},
                'right': {
                  'imageUrl': '/api/v1/catalogue/assets/deer',
                  'silhouette': true,
                },
              },
              {
                'left': {'glyph': 'A'},
                'right': {'glyph': 'a'},
              },
            ],
          },
        ],
      });

      final item = (content! as MatchPairsContent).items.single;
      expect(item.prompt.say, 'Match the shadow');
      expect(item.pairs.first.right.silhouette, isTrue);
      expect(item.pairs.first.right.imagePath, '/catalogue/assets/deer');
      expect(item.pairs.last.left.silhouette, isFalse);
      expect(content.isScored, isTrue);
    });

    test('baskets and the cards that go in them', () {
      final item =
          (ActivityContent.tryParse({
                    'kind': 'SORT_GROUPS',
                    'items': [
                      {
                        'prompt': {'say': 'Sort'},
                        'groups': [
                          {'label': 'Healthy', 'glyph': '✓'},
                          {
                            'label': 'Junk',
                            'imageUrl': '/api/v1/catalogue/assets/x',
                          },
                        ],
                        'cards': [
                          {'glyph': '🍎', 'group': 0},
                          {'text': 'Chips', 'group': 1},
                        ],
                      },
                    ],
                  })!
                  as SortGroupsContent)
              .items
              .single;
      expect(item.groups.last.imagePath, '/catalogue/assets/x');
      expect(item.cards.last.media.text, 'Chips');
      expect(item.cards.last.group, 1);
    });

    test('a number to colour, a row with gaps, letters to find', () {
      final count =
          (ActivityContent.tryParse({
                    'kind': 'COUNT_OUT',
                    'items': [
                      {
                        'prompt': {'say': 'Colour 11'},
                        'target': 11,
                        'shown': 17,
                        'picture': {'glyph': '⚽'},
                      },
                    ],
                  })!
                  as CountOutContent)
              .items
              .single;
      expect((count.target, count.shown, count.picture.glyph), (11, 17, '⚽'));

      final gap =
          (ActivityContent.tryParse({
                    'kind': 'FILL_GAP',
                    'items': [
                      {
                        'prompt': {'say': 'Missing'},
                        'cells': [
                          {'value': '1', 'gap': false},
                          {'value': '2', 'gap': true},
                        ],
                        'choices': ['2', '3'],
                      },
                    ],
                  })!
                  as FillGapContent)
              .items
              .single;
      expect(gap.cells.last.gap, isTrue);
      expect(gap.choices, ['2', '3']);

      final hunt =
          (ActivityContent.tryParse({
                    'kind': 'LETTER_HUNT',
                    'items': [
                      {
                        'prompt': {'say': 'Find D'},
                        'cells': ['D', 'A', 'd', 'D'],
                        'targets': ['D', 'd'],
                      },
                    ],
                  })!
                  as LetterHuntContent)
              .items
              .single;
      expect(hunt.toFind, 3);
    });

    test('odd one out plays as a choice; a rhyme keeps its lines', () {
      expect(
        ActivityContent.tryParse({
          'kind': 'ODD_ONE_OUT',
          'items': [
            {
              'prompt': {'say': 'Which one is different?'},
              'options': [
                {'glyph': '🎒'},
                {'glyph': '📚'},
                {'glyph': '🎒'},
              ],
              'answer': 1,
            },
          ],
        }),
        isA<ChoiceContent>(),
      );

      final rhyme =
          ActivityContent.tryParse({
                'kind': 'RHYME',
                'items': [
                  {
                    'title': 'Twinkle',
                    'say': 'Twinkle',
                    'lines': ['Twinkle, twinkle, little star,'],
                  },
                ],
              })!
              as CardContent;
      expect(rhyme.items.single.lines, ['Twinkle, twinkle, little star,']);
    });
  });

  group('one more try', () {
    ActivityPlayController choice() => ActivityPlayController(
      activity: _activity({
        'kind': 'SINGLE_CHOICE',
        'items': [
          for (var i = 0; i < 3; i++)
            {
              'prompt': {'say': 'Which is D?'},
              'options': [
                {'glyph': 'A'},
                {'glyph': 'D'},
              ],
              'answer': 1,
            },
        ],
      }),
      studentId: 's1',
    )..onInit();

    test('a first wrong tap shakes and waits for another', () {
      final play = choice()..answer(0, 1);
      expect(play.chosen.value, isNull);
      expect(play.misses.value, 1);
      expect(play.shake.value?.option, 0);
    });

    test('right at the second try is shown, but not scored', () {
      final play = choice()
        ..answer(0, 1)
        ..answer(1, 1);
      expect(play.wasCorrect.value, isTrue);
      expect(play.correct.value, 0);
    });

    test('a second wrong tap shows the answer and moves on', () {
      final play = choice()
        ..answer(0, 1)
        ..answer(0, 1);
      expect(play.chosen.value, 0);
      expect(play.wasCorrect.value, isFalse);
      play.next();
      expect(play.misses.value, 0);
      // The next question starts with a clean slate.
      play.answer(1, 1);
      expect(play.correct.value, 1);
    });
  });

  group('playing', () {
    testWidgets('match the pairs: right pairs stay, a wrong one shakes', (
      tester,
    ) async {
      final play = await _play(tester, {
        'kind': 'MATCH_PAIRS',
        'items': [
          {
            'prompt': {'say': 'Match capital to small'},
            'pairs': [
              {
                'left': {'glyph': 'A'},
                'right': {'glyph': 'a'},
              },
              {
                'left': {'glyph': 'B'},
                'right': {'glyph': 'b'},
              },
            ],
          },
        ],
      });

      await _tap(tester, find.text('A').first);
      await _tap(tester, find.text('b').first);
      expect(find.text('Not that one. Try again!'), findsOneWidget);
      expect(play.chosen.value, isNull);

      await _tap(tester, find.text('A').first);
      await _tap(tester, find.text('a').first);
      await _tap(tester, find.text('b').first);
      await _tap(tester, find.text('B').first);

      expect(play.chosen.value, isNotNull);
      // One mistake on the way: shown done, not scored.
      expect(play.wasCorrect.value, isFalse);
      expect(find.text('Finish'), findsOneWidget);
    });

    testWidgets('sort into groups: each card into its basket', (tester) async {
      final play = await _play(tester, {
        'kind': 'SORT_GROUPS',
        'items': [
          {
            'prompt': {'say': 'Healthy or junk?'},
            'groups': [
              {'label': 'Healthy'},
              {'label': 'Junk'},
            ],
            'cards': [
              {'text': 'Milk', 'group': 0},
              {'text': 'Chips', 'group': 1},
            ],
          },
        ],
      });

      Finder onTop(String text) => find.descendant(
        of: find.byType(Draggable<int>),
        matching: find.text(text),
      );

      for (var card = 0; card < 2; card++) {
        final milk = onTop('Milk').evaluate().isNotEmpty;
        await _tap(tester, find.text(milk ? 'Healthy' : 'Junk'));
      }

      expect(play.wasCorrect.value, isTrue);
      expect(play.correct.value, 1);
      expect(find.text('Great job!'), findsOneWidget);
    });

    testWidgets('count and colour: exactly the number, checked on Done', (
      tester,
    ) async {
      final play = await _play(tester, {
        'kind': 'COUNT_OUT',
        'items': [
          {
            'prompt': {'say': 'Colour 3 stars'},
            'target': 3,
            'shown': 5,
            'picture': {'glyph': '⭐'},
          },
        ],
      });

      final tiles = find.byType(PlayTile);
      expect(tiles, findsNWidgets(5));
      await _tap(tester, tiles.at(0));
      await _tap(tester, tiles.at(1));
      await _tap(tester, find.text('Done'));
      expect(find.text('You coloured 2. Colour 3.'), findsOneWidget);

      await _tap(tester, tiles.at(4));
      await _tap(tester, find.text('Done'));
      expect(play.chosen.value, isNotNull);
      expect(play.wasCorrect.value, isFalse);
    });

    testWidgets('fill the gap: tiles go into the gaps in order', (
      tester,
    ) async {
      final play = await _play(tester, {
        'kind': 'FILL_GAP',
        'items': [
          {
            'prompt': {'say': 'Which numbers are missing?'},
            'cells': [
              {'value': '1', 'gap': false},
              {'value': '2', 'gap': false},
              {'value': '3', 'gap': true},
              {'value': '4', 'gap': false},
              {'value': '5', 'gap': true},
            ],
            'choices': ['3', '5', '6'],
          },
        ],
      });

      expect(find.text('?'), findsNWidgets(2));
      await _tap(tester, find.text('3').first);
      expect(find.text('?'), findsOneWidget);
      await _tap(tester, find.text('5').first);

      expect(play.wasCorrect.value, isTrue);
      expect(play.correct.value, 1);
    });

    testWidgets('find the letter: ends by itself when all are found', (
      tester,
    ) async {
      final play = await _play(tester, {
        'kind': 'LETTER_HUNT',
        'items': [
          {
            'prompt': {'say': 'Find every D and d'},
            'cells': ['D', 'A', 'd', 'D'],
            'targets': ['D', 'd'],
          },
        ],
      });

      await _tap(tester, find.text('A').first);
      expect(play.chosen.value, isNull);

      // Each letter is drawn twice — its white edge and its colour — so every
      // other match is a new cell.
      await _tap(tester, find.text('D').at(0));
      await _tap(tester, find.text('d').first);
      expect(play.chosen.value, isNull);
      await _tap(tester, find.text('D').at(2));

      expect(play.chosen.value, isNotNull);
      expect(play.wasCorrect.value, isFalse);
      expect(find.text('Finish'), findsOneWidget);
    });

    testWidgets('a rhyme shows its words a line at a time', (tester) async {
      await _play(tester, {
        'kind': 'RHYME',
        'items': [
          {
            'title': 'Twinkle Twinkle',
            'say': 'Twinkle Twinkle',
            'lines': [
              'Twinkle, twinkle, little star,',
              'How I wonder what you are.',
            ],
          },
        ],
      });

      expect(find.text('Twinkle Twinkle'), findsOneWidget);
      expect(find.text('How I wonder what you are.'), findsOneWidget);
      expect(find.text('Read it to me'), findsOneWidget);
    });
  });
}
