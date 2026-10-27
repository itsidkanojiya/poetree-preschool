/// The shapes an activity can take, mirroring `activities.ts` in the shared
/// package. Kept as hand-written parsing rather than generated code: the shapes
/// change rarely, and a build_runner step in CI for this would cost more than
/// it saves.
library;

import 'dart:math' as math;

class ActivityDefinition {
  ActivityDefinition({
    required this.id,
    required this.code,
    required this.title,
    required this.type,
    required this.skillName,
    required this.bookName,
    required this.chapterName,
    required this.chapterId,
    required this.bookId,
    this.content,
    this.isDone = false,
  });

  factory ActivityDefinition.fromJson(Map<String, dynamic> json) {
    final skill = json['skill'] as Map<String, dynamic>?;
    final book = json['book'] as Map<String, dynamic>?;
    final chapter = json['chapter'] as Map<String, dynamic>?;
    return ActivityDefinition(
      id: json['id'] as String,
      code: json['code'] as String,
      title: json['title'] as String,
      type: json['type'] as String,
      skillName: skill?['name'] as String? ?? '',
      bookName: book?['name'] as String? ?? '',
      chapterName: chapter?['name'] as String? ?? '',
      chapterId: chapter?['id'] as String? ?? '',
      bookId: book?['id'] as String? ?? '',
      // Sent only when a child was named; anything else is not done yet.
      isDone: json['completedByChild'] == true,
      content: ActivityContent.tryParse(
        json['contentJson'] as Map<String, dynamic>?,
      ),
    );
  }

  final String id;
  final String code;
  final String title;
  final String type;
  final String skillName;

  /// The book this is a page of. Empty for older content filed under nothing.
  final String bookName;

  /// And the chapter within it, when the publisher has filed it.
  final String chapterName;

  /// The chapter whose film gates this page. Empty when it is in none.
  final String chapterId;

  final String bookId;

  /// Null when nobody has authored content for it yet. The app must not offer
  /// an activity it cannot render.
  final ActivityContent? content;

  bool get isPlayable => content != null && content!.itemCount > 0;

  /// Whether this child has finished it, scored or not. Mutable so finishing
  /// it shows at once, before the school's answer comes back.
  bool isDone;
}

/// Something to trace, to choose, to look at — or one of the shapes the
/// Pre-Primary books ask for: pairs to match, cards to sort, a number to
/// colour, gaps to fill, letters to find.
sealed class ActivityContent {
  const ActivityContent();

  static ActivityContent? tryParse(Map<String, dynamic>? json) {
    if (json == null) return null;

    final items = json['items'] as List<dynamic>? ?? const <dynamic>[];
    if (items.isEmpty) return null;

    return switch (json['kind'] as String?) {
      'TRACING' => TracingContent(
        items: items
            .whereType<Map<String, dynamic>>()
            .map(TracingItem.fromJson)
            .toList(),
      ),
      // Single choice and drag and drop hold the same thing as matching — a
      // prompt, some options and which one is right. Only the finger differs.
      'SINGLE_CHOICE' ||
      'ODD_ONE_OUT' ||
      'MATCHING' ||
      'COUNTING' ||
      'SORTING' ||
      'COLOURING' ||
      'DRAG_DROP' => ChoiceContent(
        kind: json['kind'] as String,
        items: items
            .whereType<Map<String, dynamic>>()
            .map(ChoiceItem.fromJson)
            .toList(),
      ),
      'MULTIPLE_CHOICE' => MultiChoiceContent(
        items: items
            .whereType<Map<String, dynamic>>()
            .map(MultiChoiceItem.fromJson)
            .toList(),
      ),
      'FLASHCARD' || 'RHYME' || 'STORY' => CardContent(
        kind: json['kind'] as String,
        items: items
            .whereType<Map<String, dynamic>>()
            .map(CardItem.fromJson)
            .toList(),
      ),
      'MATCH_PAIRS' => MatchPairsContent(
        items: items
            .whereType<Map<String, dynamic>>()
            .map(MatchPairsItem.fromJson)
            .toList(),
      ),
      'SORT_GROUPS' => SortGroupsContent(
        items: items
            .whereType<Map<String, dynamic>>()
            .map(SortGroupsItem.fromJson)
            .toList(),
      ),
      'COUNT_OUT' => CountOutContent(
        items: items
            .whereType<Map<String, dynamic>>()
            .map(CountOutItem.fromJson)
            .toList(),
      ),
      'FILL_GAP' => FillGapContent(
        items: items
            .whereType<Map<String, dynamic>>()
            .map(FillGapItem.fromJson)
            .toList(),
      ),
      'LETTER_HUNT' => LetterHuntContent(
        items: items
            .whereType<Map<String, dynamic>>()
            .map(LetterHuntItem.fromJson)
            .toList(),
      ),
      // An unknown kind means the app is older than the content. Better to
      // show nothing than to render something wrong to a child.
      _ => null,
    };
  }

  int get itemCount;

  /// What the question at [index] says, for reading aloud.
  String sayAt(int index);

  /// Whether finishing this produces a score.
  ///
  /// Flashcards, rhymes and stories do not. Scoring a child for looking at a
  /// picture of a cow would put a number on something that is not a test, and
  /// a mastery figure built from it would mean nothing.
  bool get isScored;
}

/// One thing a child looks at: a picture, an emoji, or a word.
///
/// Options were bare strings while emoji were all the catalogue could hold.
/// A picture arrives as a path this API serves, which goes through AuthedImage
/// like every other authenticated image in the app.
class ActivityMedia {
  const ActivityMedia({
    this.glyph,
    this.text,
    this.imagePath,
    this.silhouette = false,
  });

  factory ActivityMedia.fromJson(Object? raw) {
    // A bare string is content written before pictures existed. Reading it is
    // free and means an older activity still plays.
    if (raw is String) return ActivityMedia(glyph: raw);

    if (raw is Map<String, dynamic>) {
      final url = raw['imageUrl'] as String?;
      return ActivityMedia(
        glyph: raw['glyph'] as String?,
        text: raw['text'] as String?,
        // The API answers with a path rooted at the domain and our base URL
        // already ends in /api/v1 — the same trim every other file path needs.
        imagePath: _path(url),
        silhouette: raw['silhouette'] == true,
      );
    }

    return const ActivityMedia();
  }

  final String? glyph;
  final String? text;
  final String? imagePath;

  /// Drawn as its shadow: "match the animal to its shadow".
  final bool silhouette;

  bool get isEmpty => glyph == null && text == null && imagePath == null;
}

class TracingContent extends ActivityContent {
  const TracingContent({required this.items});

  final List<TracingItem> items;

  @override
  int get itemCount => items.length;

  @override
  String sayAt(int index) => items[index].say;

  @override
  bool get isScored => true;
}

class TracingItem {
  TracingItem({
    required this.glyph,
    required this.say,
    required this.strokes,
    this.ordered = true,
  });

  factory TracingItem.fromJson(Map<String, dynamic> json) => TracingItem(
    glyph: json['glyph'] as String? ?? '',
    say: json['say'] as String? ?? '',
    strokes: (json['strokes'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<List<dynamic>>()
        .map(
          (stroke) => stroke
              .whereType<Map<String, dynamic>>()
              .map(
                (point) => (
                  x: (point['x'] as num).toDouble(),
                  y: (point['y'] as num).toDouble(),
                ),
              )
              .toList(),
        )
        .toList(),
    ordered: json['ordered'] as bool? ?? true,
  );

  final String glyph;
  final String say;

  /// Normalised 0–1 coordinates, so one definition renders on any screen.
  final List<List<({double x, double y})>> strokes;

  /// False when the strokes may be traced in any order and either way round
  /// (the Hindi and Gujarati letters, whose order is not taught yet).
  final bool ordered;
}

class ChoiceContent extends ActivityContent {
  const ChoiceContent({required this.kind, required this.items});

  final String kind;
  final List<ChoiceItem> items;

  @override
  int get itemCount => items.length;

  @override
  String sayAt(int index) => items[index].say;

  @override
  bool get isScored => true;
}

class ChoiceItem {
  ChoiceItem({
    required this.say,
    required this.options,
    required this.answer,
    this.glyph,
    this.imagePath,
  });

  factory ChoiceItem.fromJson(Map<String, dynamic> json) {
    final prompt = json['prompt'] as Map<String, dynamic>? ?? const {};
    final promptImage = prompt['imageUrl'] as String?;

    return ChoiceItem(
      say: prompt['say'] as String? ?? '',
      glyph: prompt['glyph'] as String?,
      imagePath: promptImage == null || promptImage.isEmpty
          ? null
          : promptImage.replaceFirst('/api/v1', ''),
      options: (json['options'] as List<dynamic>? ?? const <dynamic>[])
          .map(ActivityMedia.fromJson)
          .toList(),
      answer: (json['answer'] as num?)?.toInt() ?? 0,
    );
  }

  final String say;
  final String? glyph;

  /// A picture above the choices, when the question needs one.
  final String? imagePath;
  final List<ActivityMedia> options;
  final int answer;
}

/// More than one right answer, tapped together.
class MultiChoiceContent extends ActivityContent {
  const MultiChoiceContent({required this.items});

  final List<MultiChoiceItem> items;

  @override
  int get itemCount => items.length;

  @override
  String sayAt(int index) => items[index].say;

  @override
  bool get isScored => true;
}

class MultiChoiceItem {
  MultiChoiceItem({
    required this.say,
    required this.options,
    required this.answers,
    this.glyph,
    this.imagePath,
  });

  factory MultiChoiceItem.fromJson(Map<String, dynamic> json) {
    final prompt = json['prompt'] as Map<String, dynamic>? ?? const {};
    final promptImage = prompt['imageUrl'] as String?;

    return MultiChoiceItem(
      say: prompt['say'] as String? ?? '',
      glyph: prompt['glyph'] as String?,
      imagePath: promptImage == null || promptImage.isEmpty
          ? null
          : promptImage.replaceFirst('/api/v1', ''),
      options: (json['options'] as List<dynamic>? ?? const <dynamic>[])
          .map(ActivityMedia.fromJson)
          .toList(),
      answers: (json['answers'] as List<dynamic>? ?? const <dynamic>[])
          .map((value) => (value as num).toInt())
          .toSet(),
    );
  }

  final String say;
  final String? glyph;
  final String? imagePath;
  final List<ActivityMedia> options;

  /// Every index that counts as right. A set, because order is not an answer.
  final Set<int> answers;
}

class CardContent extends ActivityContent {
  const CardContent({required this.kind, required this.items});

  final String kind;
  final List<CardItem> items;

  @override
  int get itemCount => items.length;

  @override
  String sayAt(int index) => items[index].say;

  @override
  bool get isScored => false;
}

class CardItem {
  CardItem({
    required this.title,
    required this.say,
    this.glyph,
    this.imagePath,
    this.lines = const [],
  });

  factory CardItem.fromJson(Map<String, dynamic> json) {
    final url = json['imageUrl'] as String?;
    return CardItem(
      title: json['title'] as String? ?? '',
      say: json['say'] as String? ?? '',
      glyph: json['glyph'] as String?,
      imagePath: url == null || url.isEmpty
          ? null
          : url.replaceFirst('/api/v1', ''),
      lines: (json['lines'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<String>()
          .toList(),
    );
  }

  final String title;
  final String say;
  final String? glyph;
  final String? imagePath;

  /// A rhyme or story a line at a time, lit up as it is read. Empty on a card.
  final List<String> lines;
}

/// A path the API serves, without the /api/v1 our base URL already ends in.
String? _path(String? url) =>
    url == null || url.isEmpty ? null : url.replaceFirst('/api/v1', '');

/// What a question asks, and the picture or letter shown above it.
class ActivityPrompt {
  const ActivityPrompt({required this.say, this.glyph, this.imagePath});

  factory ActivityPrompt.fromJson(Object? raw) {
    final json = raw is Map<String, dynamic> ? raw : const <String, dynamic>{};
    return ActivityPrompt(
      say: json['say'] as String? ?? '',
      glyph: json['glyph'] as String?,
      imagePath: _path(json['imageUrl'] as String?),
    );
  }

  final String say;
  final String? glyph;
  final String? imagePath;
}

/// Join each one to its partner: an animal to its shadow, a picture to its
/// letter, fingers to a number.
class MatchPairsContent extends ActivityContent {
  const MatchPairsContent({required this.items});

  final List<MatchPairsItem> items;

  @override
  int get itemCount => items.length;

  @override
  String sayAt(int index) => items[index].prompt.say;

  @override
  bool get isScored => true;
}

class MatchPairsItem {
  MatchPairsItem({required this.prompt, required this.pairs});

  factory MatchPairsItem.fromJson(Map<String, dynamic> json) => MatchPairsItem(
    prompt: ActivityPrompt.fromJson(json['prompt']),
    pairs: (json['pairs'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(
          (pair) => (
            left: ActivityMedia.fromJson(pair['left']),
            right: ActivityMedia.fromJson(pair['right']),
          ),
        )
        .toList(),
  );

  final ActivityPrompt prompt;

  /// In the author's order: left `i` belongs with right `i`. The screen
  /// shuffles the right column, never this list.
  final List<({ActivityMedia left, ActivityMedia right})> pairs;
}

/// Put each card in its basket: healthy or junk, day or night.
class SortGroupsContent extends ActivityContent {
  const SortGroupsContent({required this.items});

  final List<SortGroupsItem> items;

  @override
  int get itemCount => items.length;

  @override
  String sayAt(int index) => items[index].prompt.say;

  @override
  bool get isScored => true;
}

class SortGroup {
  const SortGroup({required this.label, this.glyph, this.imagePath});

  final String label;
  final String? glyph;
  final String? imagePath;
}

class SortGroupsItem {
  SortGroupsItem({
    required this.prompt,
    required this.groups,
    required this.cards,
  });

  factory SortGroupsItem.fromJson(Map<String, dynamic> json) => SortGroupsItem(
    prompt: ActivityPrompt.fromJson(json['prompt']),
    groups: (json['groups'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(
          (group) => SortGroup(
            label: group['label'] as String? ?? '',
            glyph: group['glyph'] as String?,
            imagePath: _path(group['imageUrl'] as String?),
          ),
        )
        .toList(),
    cards: (json['cards'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(
          (card) => (
            media: ActivityMedia.fromJson(card),
            group: (card['group'] as num?)?.toInt() ?? 0,
          ),
        )
        .toList(),
  );

  final ActivityPrompt prompt;
  final List<SortGroup> groups;
  final List<({ActivityMedia media, int group})> cards;
}

/// Colour exactly [CountOutItem.target] of the pictures shown.
class CountOutContent extends ActivityContent {
  const CountOutContent({required this.items});

  final List<CountOutItem> items;

  @override
  int get itemCount => items.length;

  @override
  String sayAt(int index) => items[index].say;

  @override
  bool get isScored => true;
}

class CountOutItem {
  CountOutItem({
    required this.say,
    required this.target,
    required this.shown,
    required this.picture,
  });

  factory CountOutItem.fromJson(Map<String, dynamic> json) {
    final target = (json['target'] as num?)?.toInt() ?? 1;
    return CountOutItem(
      say: ActivityPrompt.fromJson(json['prompt']).say,
      target: target,
      shown: math.max((json['shown'] as num?)?.toInt() ?? target, target),
      picture: ActivityMedia.fromJson(json['picture']),
    );
  }

  final String say;
  final int target;
  final int shown;
  final ActivityMedia picture;
}

/// One car of a Fill the Gap row.
class GapCell {
  const GapCell({required this.value, required this.gap});

  final String value;
  final bool gap;
}

/// Complete the row: missing numbers, the alphabet train, a word's first
/// letter.
class FillGapContent extends ActivityContent {
  const FillGapContent({required this.items});

  final List<FillGapItem> items;

  @override
  int get itemCount => items.length;

  @override
  String sayAt(int index) => items[index].prompt.say;

  @override
  bool get isScored => true;
}

class FillGapItem {
  FillGapItem({
    required this.prompt,
    required this.cells,
    required this.choices,
  });

  factory FillGapItem.fromJson(Map<String, dynamic> json) => FillGapItem(
    prompt: ActivityPrompt.fromJson(json['prompt']),
    cells: (json['cells'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(
          (cell) => GapCell(
            value: cell['value'] as String? ?? '',
            gap: cell['gap'] == true,
          ),
        )
        .toList(),
    choices: (json['choices'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<String>()
        .toList(),
  );

  final ActivityPrompt prompt;
  final List<GapCell> cells;
  final List<String> choices;
}

/// Find every one of these in the grid.
class LetterHuntContent extends ActivityContent {
  const LetterHuntContent({required this.items});

  final List<LetterHuntItem> items;

  @override
  int get itemCount => items.length;

  @override
  String sayAt(int index) => items[index].say;

  @override
  bool get isScored => true;
}

class LetterHuntItem {
  LetterHuntItem({
    required this.say,
    required this.cells,
    required this.targets,
  });

  factory LetterHuntItem.fromJson(Map<String, dynamic> json) => LetterHuntItem(
    say: ActivityPrompt.fromJson(json['prompt']).say,
    cells: (json['cells'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<String>()
        .toList(),
    targets: (json['targets'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<String>()
        .toSet(),
  );

  final String say;
  final List<String> cells;
  final Set<String> targets;

  /// How many there are to find.
  int get toFind => cells.where(targets.contains).length;
}
