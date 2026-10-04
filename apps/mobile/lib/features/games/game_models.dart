import 'dart:ui' show Color;

/// The learning games' shapes: which games, in which language, at which
/// difficulty, and one question as every game asks it.
///
/// A game screen never builds a question. Questions come from content data
/// ([GameContent]) through [QuestionFactory], so the same screen plays
/// English capitals, Hindi numbers or Gujarati letters.

enum GameKind {
  letterMatch('letter_match'),
  findLetter('find_letter'),
  completeSequence('complete_sequence'),
  countChoose('count_choose'),
  listenMatch('listen_match');

  const GameKind(this.key);

  /// The name the server and the content data use.
  final String key;

  static GameKind? fromKey(String key) {
    for (final kind in values) {
      if (kind.key == key) return kind;
    }
    return null;
  }
}

enum GameLanguage {
  en('en'),
  hi('hi'),
  gu('gu');

  const GameLanguage(this.code);
  final String code;

  static GameLanguage fromCode(String? code) =>
      values.firstWhere((l) => l.code == code, orElse: () => GameLanguage.en);
}

enum GameDifficulty {
  easy('Easy', findOptions: 4, countUpTo: 5, sequenceLength: 4),
  medium('Medium', findOptions: 6, countUpTo: 10, sequenceLength: 5),
  hard('Hard', findOptions: 8, countUpTo: 20, sequenceLength: 5);

  const GameDifficulty(
    this.label, {
    required this.findOptions,
    required this.countUpTo,
    required this.sequenceLength,
  });

  final String label;

  /// Letters to choose from in Find the Letter.
  final int findOptions;

  /// The most things Count & Choose shows.
  final int countUpTo;

  /// How long a Complete the Sequence row is.
  final int sequenceLength;

  static GameDifficulty fromName(String? name) => values.firstWhere(
    (d) => d.name == name,
    orElse: () => GameDifficulty.easy,
  );
}

/// A game as the hub lists it.
class GameDefinition {
  const GameDefinition({
    required this.kind,
    required this.name,
    required this.description,
    required this.icon,
    required this.paper,
    required this.accent,
  });

  final GameKind kind;
  final String name;
  final String description;

  /// The game's picture, an asset path.
  final String icon;
  final Color paper;
  final Color accent;
}

/// One answer a child can tap: a picture with its word, or a letter or number.
class GameOption {
  const GameOption({required this.id, this.text, this.image, this.glyph});

  final String id;

  /// The word under a picture: "Apple", "सेब".
  final String? text;

  /// A picture, an asset path.
  final String? image;

  /// A letter or number drawn big: "B", "अ", "૪".
  final String? glyph;
}

/// One question, whatever the game. Built from data; drawn by one screen.
class GameQuestion {
  const GameQuestion({
    required this.id,
    required this.kind,
    required this.language,
    required this.category,
    required this.difficulty,
    required this.prompt,
    required this.say,
    required this.options,
    required this.answer,
    required this.successTitle,
    required this.successSay,
    this.target,
    this.sequence = const [],
    this.countImage,
    this.count = 0,
    this.successImage,
    this.successGlyph,
  });

  final String id;
  final GameKind kind;
  final GameLanguage language;

  /// What it is drawn from: "capital", "small", "number", "vowel", "word"…
  final String category;
  final GameDifficulty difficulty;

  /// The question as written: "Which picture starts with A?".
  final String prompt;

  /// What the speaker says for it: the prompt, or in Listen & Match the
  /// thing to listen for ("A for Apple").
  final String say;

  /// The big letter shown above the answers, when there is one.
  final String? target;

  /// Complete the Sequence: the row, with null where the gap is.
  final List<String?> sequence;

  /// Count & Choose: what to count, and how many.
  final String? countImage;
  final int count;

  final List<GameOption> options;

  /// Which of [options] is right.
  final int answer;

  /// The "Great Job!" card: "A - Apple", the picture or the letter, and what
  /// is said — "Correct! A for Apple."
  final String successTitle;
  final String successSay;
  final String? successImage;
  final String? successGlyph;
}

/// How far a child has got with one game in one language.
class GameProgress {
  const GameProgress({
    required this.played,
    required this.bestCorrect,
    required this.bestTotal,
  });

  factory GameProgress.fromJson(Map<String, dynamic> json) => GameProgress(
    played: (json['played'] as num?)?.toInt() ?? 0,
    bestCorrect: (json['bestCorrect'] as num?)?.toInt() ?? 0,
    bestTotal: (json['bestTotal'] as num?)?.toInt() ?? 0,
  );

  final int played;
  final int bestCorrect;
  final int bestTotal;
}

/// Stars out of five for a round: right first time, out of the questions.
/// Whole fifths only — five stars is a perfect round, 8 of 10 is four.
int starRating(int correct, int total) =>
    total == 0 ? 0 : ((correct * 5) ~/ total).clamp(0, 5);
