import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/features/games/game_content.dart';
import 'package:poetree_school/features/games/game_models.dart';
import 'package:poetree_school/features/games/game_play_view.dart';
import 'package:poetree_school/features/games/game_widgets.dart';
import 'package:poetree_school/features/games/games_controller.dart';
import 'package:poetree_school/features/tracing/trace_lessons.dart';

/// The games, from the content the app ships: every game makes a round in
/// every language, each round asks in its own language, and the play screen
/// lets a child try again until they find it.

Map<String, dynamic> _json(String path) =>
    jsonDecode(File(path).readAsStringSync()) as Map<String, dynamic>;

GameContent shipped() {
  final glyphs =
      _json('assets/tracing/lessons.json')['glyphs'] as Map<String, dynamic>;
  // Every picture the catalogue names, as if it were in the app.
  final assets = {
    for (final v in glyphs.values)
      if ((v as Map)['image'] != null) v['image'] as String,
  };
  return GameContent.from(
    _json('assets/games/games.json'),
    TraceLessons.from(glyphs, assets),
  );
}

final _latin = RegExp('[A-Za-z]');

/// Time in small steps, so animations actually run.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 80));
  }
}

void main() {
  final content = shipped();
  QuestionFactory factory([int seed = 1]) =>
      QuestionFactory(content, random: math.Random(seed));

  test('the five games, in order', () {
    expect(content.games.map((g) => g.kind), GameKind.values);
    for (final game in content.games) {
      expect(File(game.icon).existsSync(), isTrue, reason: game.icon);
    }
  });

  for (final kind in GameKind.values) {
    for (final language in GameLanguage.values) {
      test('${kind.key} makes a full round in ${language.code}', () {
        for (var seed = 0; seed < 5; seed++) {
          final round = factory(
            seed,
          ).round(kind, language, GameDifficulty.medium);
          expect(round, hasLength(content.questionsPerRound));
          for (final q in round) {
            expect(q.language, language);
            expect(q.answer, inInclusiveRange(0, q.options.length - 1));
            // No answer offered twice.
            expect(
              q.options.map((o) => o.id).toSet(),
              hasLength(q.options.length),
            );
            expect(q.prompt, isNotEmpty);
            expect(q.successSay, isNotEmpty);
            if (language != GameLanguage.en) {
              // Nothing in English on a Hindi or Gujarati question.
              for (final text in [
                q.prompt,
                q.say,
                q.successSay,
                ...q.options.map((o) => o.text ?? o.glyph ?? ''),
              ]) {
                expect(text, isNot(matches(_latin)), reason: '${q.id}: $text');
              }
            }
          }
        }
      });
    }
  }

  test('Letter Match: the right picture is the letter’s own word', () {
    for (final q in factory().round(
      GameKind.letterMatch,
      GameLanguage.hi,
      GameDifficulty.easy,
    )) {
      final lesson = content.lessons.forGlyph(q.target!);
      expect(q.options[q.answer].image, lesson.imagePath);
      expect(q.options, hasLength(4));
      expect(q.prompt, contains(q.target));
      expect(q.successSay, contains(lesson.phrase));
    }
  });

  test('Find the Letter: more to choose from as it gets harder', () {
    for (final (difficulty, n) in [
      (GameDifficulty.easy, 4),
      (GameDifficulty.medium, 6),
      (GameDifficulty.hard, 8),
    ]) {
      final round = factory().round(
        GameKind.findLetter,
        GameLanguage.gu,
        difficulty,
      );
      for (final q in round) {
        expect(q.options, hasLength(n));
        expect(q.options[q.answer].glyph, q.target);
      }
    }
  });

  test(
    'Complete the Sequence: the gap is the missing item, never the first',
    () {
      final lists = content.languages[GameLanguage.hi]!.lists.values;
      for (final q in factory().round(
        GameKind.completeSequence,
        GameLanguage.hi,
        GameDifficulty.hard,
      )) {
        final gap = q.sequence.indexOf(null);
        expect(gap, greaterThan(0));
        final answer = q.options[q.answer].glyph!;
        final filled = [for (final s in q.sequence) s ?? answer];
        // The completed row is a run straight out of one of the lists.
        expect(
          lists.any((list) {
            final start = list.indexOf(filled.first);
            return start >= 0 &&
                start + filled.length <= list.length &&
                listEquals(list.sublist(start, start + filled.length), filled);
          }),
          isTrue,
          reason: filled.join(' '),
        );
        // A wrong answer is never one already in the row.
        for (final (i, o) in q.options.indexed) {
          if (i != q.answer) expect(q.sequence, isNot(contains(o.glyph)));
        }
      }
    },
  );

  test(
    'Count & Choose: counts within the difficulty, in the language’s digits',
    () {
      for (final q in factory().round(
        GameKind.countChoose,
        GameLanguage.hi,
        GameDifficulty.hard,
      )) {
        expect(q.count, inInclusiveRange(1, 20));
        expect(q.countImage, isNotNull);
        expect(q.options, hasLength(3));
        expect(
          q.options[q.answer].glyph,
          content.languages[GameLanguage.hi]!.number(q.count),
        );
        expect(q.prompt, startsWith('कितने'));
      }
      for (final q in factory().round(
        GameKind.countChoose,
        GameLanguage.en,
        GameDifficulty.easy,
      )) {
        expect(q.count, inInclusiveRange(1, 5));
      }
    },
  );

  test('Listen & Match says the letter’s phrase, not the question', () {
    for (final q in factory().round(
      GameKind.listenMatch,
      GameLanguage.gu,
      GameDifficulty.easy,
    )) {
      final answer = q.options[q.answer];
      expect(q.say, isNot(q.prompt));
      expect(q.say, contains(answer.text));
    }
  });

  testWidgets('a wrong answer waits for another try; a right one goes on', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.625;
    addTearDown(tester.view.reset);

    final recorded = <(int, int, int)>[];
    final controller = GamePlayController(
      game: content.game(GameKind.findLetter)!,
      language: GameLanguage.en,
      difficulty: GameDifficulty.easy,
      factory: factory(),
      recorder: ({required total, required correct, required wrong}) async {
        recorded.add((total, correct, wrong));
        return true;
      },
    );
    await tester.pumpWidget(
      GetMaterialApp(home: GamePlayView(controller: controller)),
    );
    await tester.pump(const Duration(milliseconds: 300));

    final first = controller.question;
    final wrongIndex = (first.answer + 1) % first.options.length;

    // Wrong: the oops note, the same question, nothing to move on with.
    await tester.tap(find.byType(AnswerTile).at(wrongIndex));
    await settle(tester);
    expect(find.byType(OopsNote), findsOneWidget);
    expect(find.byType(SuccessCard), findsNothing);
    expect(controller.question, same(first));

    // Right: Great Job, and Next.
    await tester.tap(find.byType(AnswerTile).at(first.answer));
    await settle(tester);
    expect(find.byType(SuccessCard), findsOneWidget);
    expect(find.text('Great Job!'), findsOneWidget);
    expect(controller.correct.value, 0, reason: 'not right the first time');
    expect(controller.wrong.value, 1);

    // The rest right first time.
    for (var i = 1; i < controller.total; i++) {
      await tester.tap(find.text('Next'));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.byType(AnswerTile).at(controller.question.answer));
      await settle(tester);
    }
    await tester.tap(find.text('Finish'));
    await settle(tester);

    expect(find.byType(RoundComplete), findsOneWidget);
    expect(find.text('You got 9 / 10 correct'), findsOneWidget);
    expect(recorded, [(10, 9, 1)]);

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 3));
  });
}
