/// The shapes an activity can take, mirroring `activities.ts` in the shared
/// package. Kept as hand-written parsing rather than generated code: there are
/// three shapes, they change rarely, and a build_runner step in CI for this
/// would cost more than it saves.
library;

class ActivityDefinition {
  ActivityDefinition({
    required this.id,
    required this.code,
    required this.title,
    required this.type,
    required this.skillName,
    required this.bookName,
    required this.chapterName,
    required this.bookId,
    required this.isLocked,
    this.content,
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
      bookId: book?['id'] as String? ?? '',
      isLocked: json['isLocked'] as bool? ?? false,
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

  final String bookId;

  /// True while this child still has the book's animation to watch. Locked
  /// activities are still listed — a book that vanished until a video had been
  /// watched would look like a book with nothing in it.
  final bool isLocked;

  /// Null when nobody has authored content for it yet. The app must not offer
  /// an activity it cannot render.
  final ActivityContent? content;

  bool get isPlayable => content != null && content!.itemCount > 0;
}

/// One of three shapes: something to trace, something to choose, or something
/// to look at.
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
      // An unknown kind means the app is older than the content. Better to
      // show nothing than to render something wrong to a child.
      _ => null,
    };
  }

  int get itemCount;

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
  const ActivityMedia({this.glyph, this.text, this.imagePath});

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
        imagePath: url == null || url.isEmpty
            ? null
            : url.replaceFirst('/api/v1', ''),
      );
    }

    return const ActivityMedia();
  }

  final String? glyph;
  final String? text;
  final String? imagePath;

  bool get isEmpty => glyph == null && text == null && imagePath == null;
}

class TracingContent extends ActivityContent {
  const TracingContent({required this.items});

  final List<TracingItem> items;

  @override
  int get itemCount => items.length;

  @override
  bool get isScored => true;
}

class TracingItem {
  TracingItem({required this.glyph, required this.say, required this.strokes});

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
  );

  final String glyph;
  final String say;

  /// Normalised 0–1 coordinates, so one definition renders on any screen.
  final List<List<({double x, double y})>> strokes;
}

class ChoiceContent extends ActivityContent {
  const ChoiceContent({required this.kind, required this.items});

  final String kind;
  final List<ChoiceItem> items;

  @override
  int get itemCount => items.length;

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
  bool get isScored => false;
}

class CardItem {
  CardItem({
    required this.title,
    required this.say,
    this.glyph,
    this.imagePath,
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
    );
  }

  final String title;
  final String say;
  final String? glyph;
  final String? imagePath;
}
