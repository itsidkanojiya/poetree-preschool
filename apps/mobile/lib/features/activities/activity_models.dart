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
    this.content,
  });

  factory ActivityDefinition.fromJson(Map<String, dynamic> json) {
    final skill = json['skill'] as Map<String, dynamic>?;
    return ActivityDefinition(
      id: json['id'] as String,
      code: json['code'] as String,
      title: json['title'] as String,
      type: json['type'] as String,
      skillName: skill?['name'] as String? ?? '',
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
      'MATCHING' || 'COUNTING' || 'SORTING' || 'COLOURING' => ChoiceContent(
        kind: json['kind'] as String,
        items: items
            .whereType<Map<String, dynamic>>()
            .map(ChoiceItem.fromJson)
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
  });

  factory ChoiceItem.fromJson(Map<String, dynamic> json) {
    final prompt = json['prompt'] as Map<String, dynamic>? ?? const {};
    return ChoiceItem(
      say: prompt['say'] as String? ?? '',
      glyph: prompt['glyph'] as String?,
      options: (json['options'] as List<dynamic>? ?? const <dynamic>[])
          .map((e) => e.toString())
          .toList(),
      answer: (json['answer'] as num?)?.toInt() ?? 0,
    );
  }

  final String say;
  final String? glyph;
  final List<String> options;
  final int answer;
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
  CardItem({required this.title, required this.say, this.glyph});

  factory CardItem.fromJson(Map<String, dynamic> json) => CardItem(
    title: json['title'] as String? ?? '',
    say: json['say'] as String? ?? '',
    glyph: json['glyph'] as String?,
  );

  final String title;
  final String say;
  final String? glyph;
}
