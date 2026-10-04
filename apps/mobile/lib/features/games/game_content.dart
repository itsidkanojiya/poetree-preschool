import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/services.dart';

import '../tracing/trace_lessons.dart';
import 'game_models.dart';

/// One language's game content: its ordered lists, its prompts and spoken
/// feedback, and what the things to count are called.
class LanguageContent {
  LanguageContent._(this.language, Map<String, dynamic> json)
    : label = json['label'] as String? ?? language.code,
      lists = (json['lists'] as Map<String, dynamic>? ?? const {}).map(
        (key, value) =>
            MapEntry(key, (value as List<dynamic>).cast<String>().toList()),
      ),
      findFrom = (json['findFrom'] as List<dynamic>? ?? const [])
          .cast<String>()
          .toList(),
      sequenceFrom = (json['sequenceFrom'] as List<dynamic>? ?? const [])
          .cast<String>()
          .toList(),
      digits = json['digits'] as String? ?? '0123456789',
      _prompts = (json['prompts'] as Map<String, dynamic>? ?? const {})
          .cast<String, String>(),
      _feedback = (json['feedback'] as Map<String, dynamic>? ?? const {})
          .cast<String, String>(),
      _things = (json['things'] as Map<String, dynamic>? ?? const {})
          .cast<String, String>(),
      _thing = (json['thing'] as Map<String, dynamic>? ?? const {})
          .cast<String, String>();

  final GameLanguage language;

  /// "English", "हिंदी", "ગુજરાતી".
  final String label;

  /// Ordered lists: "capital", "small", "vowel", "consonant", "number".
  final Map<String, List<String>> lists;
  final List<String> findFrom;
  final List<String> sequenceFrom;

  /// The language's ten digits, 0 first: "०१२३४५६७८९".
  final String digits;

  final Map<String, String> _prompts;
  final Map<String, String> _feedback;
  final Map<String, String> _things;
  final Map<String, String> _thing;

  static String _fill(String template, Map<String, String> values) {
    var out = template;
    values.forEach((key, value) => out = out.replaceAll('{$key}', value));
    return out;
  }

  String prompt(String key, {String letter = '', String things = ''}) =>
      _fill(_prompts[key] ?? '', {'letter': letter, 'things': things});

  String get correct => _feedback['correct'] ?? 'Correct!';
  String get tryAgain => _feedback['tryAgain'] ?? 'Try again!';
  String thisIs(String letter) =>
      _fill(_feedback['thisIs'] ?? '{letter}', {'letter': letter});

  /// "apples", "सेब" — and one of them: "apple".
  String things(String object) => _things[object] ?? object;
  String thing(String object) => _thing[object] ?? object;

  /// [n] in this language's digits: 14 → "१४".
  String number(int n) =>
      n.toString().split('').map((d) => digits[int.parse(d)]).join();
}

/// All the games' content: the games, every language's content, the things
/// to count, and — for words and pictures — the tracing catalogue.
class GameContent {
  GameContent._(Map<String, dynamic> json, this.lessons)
    : questionsPerRound = (json['questionsPerRound'] as num?)?.toInt() ?? 10,
      games = [
        for (final game in (json['games'] as List<dynamic>? ?? const []))
          if (GameKind.fromKey((game as Map)['key'] as String) case final kind?)
            GameDefinition(
              kind: kind,
              name: game['name'] as String? ?? kind.key,
              description: game['description'] as String? ?? '',
              icon: game['icon'] as String? ?? '',
              paper: _colour(game['paper'] as String?, const Color(0xFFE6F0FF)),
              accent: _colour(
                game['accent'] as String?,
                const Color(0xFF2F6FED),
              ),
            ),
      ],
      countObjects = (json['countObjects'] as Map<String, dynamic>? ?? const {})
          .cast<String, String>(),
      languages = {
        for (final language in GameLanguage.values)
          if ((json['languages'] as Map<String, dynamic>?)?[language.code]
              case final Map<String, dynamic> data)
            language: LanguageContent._(language, data),
      };

  static const _file = 'assets/games/games.json';
  static Future<GameContent>? _loading;

  final int questionsPerRound;
  final List<GameDefinition> games;

  /// Things to count, by name, to their pictures.
  final Map<String, String> countObjects;
  final Map<GameLanguage, LanguageContent> languages;
  final TraceLessons lessons;

  static Color _colour(String? hex, Color fallback) {
    if (hex == null || !hex.startsWith('#') || hex.length != 7) return fallback;
    return Color(int.parse('FF${hex.substring(1)}', radix: 16));
  }

  /// Loaded once from the app's assets.
  static Future<GameContent> load([AssetBundle? bundle]) {
    return _loading ??= () async {
      try {
        final raw = await (bundle ?? rootBundle).loadString(_file);
        final lessons = await TraceLessons.load(bundle);
        return GameContent._(jsonDecode(raw) as Map<String, dynamic>, lessons);
      } on Object {
        _loading = null;
        rethrow;
      }
    }();
  }

  /// Built from data already in hand — for tests.
  factory GameContent.from(Map<String, dynamic> json, TraceLessons lessons) =>
      GameContent._(json, lessons);

  GameDefinition? game(GameKind kind) {
    for (final game in games) {
      if (game.kind == kind) return game;
    }
    return null;
  }
}

/// Makes a round of questions for a game, in a language, at a difficulty,
/// from the content. Never from anything written in a widget.
class QuestionFactory {
  QuestionFactory(this.content, {math.Random? random})
    : _random = random ?? math.Random();

  final GameContent content;
  final math.Random _random;

  List<GameQuestion> round(
    GameKind kind,
    GameLanguage language,
    GameDifficulty difficulty,
  ) {
    final words = content.languages[language];
    if (words == null) return const [];
    final count = content.questionsPerRound;
    return switch (kind) {
      GameKind.letterMatch => _pictureRound(kind, words, difficulty, count),
      GameKind.listenMatch => _pictureRound(kind, words, difficulty, count),
      GameKind.findLetter => _findRound(words, difficulty, count),
      GameKind.completeSequence => _sequenceRound(words, difficulty, count),
      GameKind.countChoose => _countRound(words, difficulty, count),
    };
  }

  /// [n] items drawn from [pool], none twice in a row.
  List<T> _deal<T>(List<T> pool, int n) {
    final out = <T>[];
    var deck = <T>[];
    while (out.length < n && pool.isNotEmpty) {
      if (deck.isEmpty) deck = List.of(pool)..shuffle(_random);
      final next = deck.removeLast();
      if (out.isNotEmpty && pool.length > 1 && next == out.last) {
        deck.insert(0, next);
        continue;
      }
      out.add(next);
    }
    return out;
  }

  /// [n] items from [pool] other than [except], in random order.
  List<T> _others<T>(List<T> pool, T except, int n) =>
      (pool.where((e) => e != except).toList()..shuffle(_random))
          .take(n)
          .toList();

  /// Letter Match and Listen & Match: a letter's picture among others.
  List<GameQuestion> _pictureRound(
    GameKind kind,
    LanguageContent words,
    GameDifficulty difficulty,
    int count,
  ) {
    final language = words.language;
    final pool = content.lessons
        .lettersIn(language.code)
        .where((l) => l.imagePath != null && l.word != null)
        .toList();
    if (pool.length < 4) return const [];

    final picks = _deal(pool, count);
    return [
      for (final (i, pick) in picks.indexed)
        () {
          // English alternates capital and small: "A" and "a" both mean apple.
          final small = language == GameLanguage.en && _random.nextBool();
          final lesson = small
              ? content.lessons.forGlyph(pick.glyph.toLowerCase())
              : pick;
          final choices = [pick, ..._others(pool, pick, 3)]..shuffle(_random);
          final options = [
            for (final c in choices)
              GameOption(
                id: c.glyph,
                text: small ? c.word!.toLowerCase() : c.word,
                image: c.imagePath,
              ),
          ];
          final letter = lesson.glyph;
          final prompt = kind == GameKind.letterMatch
              ? words.prompt('letter_match', letter: letter)
              : words.prompt('listen_match');
          return GameQuestion(
            id: '${kind.key}-$i-$letter',
            kind: kind,
            language: language,
            category: language == GameLanguage.en
                ? (small ? 'small' : 'capital')
                : 'letter',
            difficulty: difficulty,
            prompt: prompt,
            // Listen & Match says the thing to find; Letter Match reads the
            // question.
            say: kind == GameKind.listenMatch
                ? (lesson.phrase ?? lesson.word ?? letter)
                : prompt,
            target: kind == GameKind.letterMatch ? letter : null,
            options: options,
            answer: choices.indexOf(pick),
            successTitle: '$letter - ${lesson.word}',
            successSay: '${words.correct} ${lesson.phrase ?? lesson.word}.',
            successImage: pick.imagePath,
          );
        }(),
    ];
  }

  /// Find the Letter: the letter among others from the same list.
  List<GameQuestion> _findRound(
    LanguageContent words,
    GameDifficulty difficulty,
    int count,
  ) {
    final lists = [
      for (final name in words.findFrom)
        if ((words.lists[name] ?? const <String>[]).length >= 2)
          (name, words.lists[name]!),
    ];
    if (lists.isEmpty) return const [];

    return [
      for (var i = 0; i < count; i++)
        () {
          final (category, list) = lists[i % lists.length];
          final target = list[_random.nextInt(list.length)];
          final n = math.min(difficulty.findOptions, list.length);
          final choices = [target, ..._others(list, target, n - 1)]
            ..shuffle(_random);
          return GameQuestion(
            id: 'find_letter-$i-$target',
            kind: GameKind.findLetter,
            language: words.language,
            category: category,
            difficulty: difficulty,
            prompt: words.prompt(
              category == 'number' ? 'find_number' : 'find_letter',
            ),
            say: words.prompt('find_say', letter: target),
            target: target,
            options: [for (final c in choices) GameOption(id: c, glyph: c)],
            answer: choices.indexOf(target),
            successTitle: target,
            successSay: '${words.correct} ${words.thisIs(target)}',
            successGlyph: target,
          );
        }(),
    ];
  }

  /// Complete the Sequence: a run from an ordered list with one gap.
  List<GameQuestion> _sequenceRound(
    LanguageContent words,
    GameDifficulty difficulty,
    int count,
  ) {
    final lists = [
      for (final name in words.sequenceFrom)
        if ((words.lists[name] ?? const <String>[]).length >= 4)
          (name, words.lists[name]!),
    ];
    if (lists.isEmpty) return const [];

    return [
      for (var i = 0; i < count; i++)
        () {
          final (category, list) = lists[i % lists.length];
          final length = math.min(difficulty.sequenceLength, list.length);
          final start = _random.nextInt(list.length - length + 1);
          final run = list.sublist(start, start + length);
          // Never the first: a child needs somewhere to start counting from.
          final gap = 1 + _random.nextInt(length - 1);
          final answer = run[gap];
          final others = difficulty == GameDifficulty.easy ? 2 : 3;
          // Wrong answers from outside the row, so none of them is also
          // sitting in it.
          final outside = list.where((e) => !run.contains(e)).toList();
          final choices = [
            answer,
            ..._others(outside.isEmpty ? list : outside, answer, others),
          ]..shuffle(_random);
          return GameQuestion(
            id: 'complete_sequence-$i-$answer',
            kind: GameKind.completeSequence,
            language: words.language,
            category: category,
            difficulty: difficulty,
            prompt: words.prompt('complete_sequence'),
            say: words.prompt('complete_sequence'),
            sequence: [for (final (j, e) in run.indexed) j == gap ? null : e],
            options: [for (final c in choices) GameOption(id: c, glyph: c)],
            answer: choices.indexOf(answer),
            successTitle: run.join('  '),
            successSay: '${words.correct} ${run.join(', ')}.',
            successGlyph: answer,
          );
        }(),
    ];
  }

  /// Count & Choose: that many things, and three numbers to choose from.
  List<GameQuestion> _countRound(
    LanguageContent words,
    GameDifficulty difficulty,
    int count,
  ) {
    final objects = content.countObjects.keys.toList();
    if (objects.isEmpty) return const [];
    final most = difficulty.countUpTo;
    final dealt = _deal(objects, count);

    return [
      for (final (i, object) in dealt.indexed)
        () {
          final n = 1 + _random.nextInt(most);
          // Neighbours make the choice about counting, not guessing.
          final near = <int>{
            for (final d in [-2, -1, 1, 2])
              if (n + d >= 1 && n + d <= math.max(most, 3)) n + d,
          }.toList()..shuffle(_random);
          final choices = [n, ...near.take(2)]..shuffle(_random);
          final name = n == 1 ? words.thing(object) : words.things(object);
          // The number in words when the catalogue has it ("Four", "चार").
          final word = n <= 10
              ? content.lessons.forGlyph(words.number(n)).label
              : null;
          final spoken = word ?? words.number(n);
          return GameQuestion(
            id: 'count_choose-$i-$object-$n',
            kind: GameKind.countChoose,
            language: words.language,
            category: 'number',
            difficulty: difficulty,
            prompt: words.prompt('count_choose', things: words.things(object)),
            say: words.prompt('count_choose', things: words.things(object)),
            countImage: content.countObjects[object],
            count: n,
            options: [
              for (final c in choices)
                GameOption(id: '$c', glyph: words.number(c)),
            ],
            answer: choices.indexOf(n),
            successTitle: '${words.number(n)} - $spoken',
            successSay: '${words.correct} $spoken $name.',
            successImage: content.countObjects[object],
          );
        }(),
    ];
  }
}
