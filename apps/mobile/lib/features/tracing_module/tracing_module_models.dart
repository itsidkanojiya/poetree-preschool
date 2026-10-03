import '../activities/activity_models.dart';

/// The tracing module as the API sends it. Mirrors
/// packages/shared/src/schemas/tracing.ts.

class TracingCategorySummary {
  TracingCategorySummary({
    required this.id,
    required this.key,
    required this.name,
    required this.label,
    required this.itemCount,
    required this.tracedCount,
  });

  factory TracingCategorySummary.fromJson(Map<String, dynamic> json) =>
      TracingCategorySummary(
        id: json['id'] as String,
        key: json['key'] as String? ?? '',
        name: json['name'] as String? ?? '',
        label: json['label'] as String? ?? '',
        itemCount: (json['itemCount'] as num?)?.toInt() ?? 0,
        tracedCount: (json['tracedCount'] as num?)?.toInt() ?? 0,
      );

  final String id;

  /// "capital", "number", "small", … — picks the card's colour.
  final String key;
  final String name;

  /// What the card shows a child who cannot read: "A B C".
  final String label;
  final int itemCount;
  final int tracedCount;
}

/// One letter, number or pattern: its shape, its video, and how far this
/// child has got with it.
class TracingModuleItem {
  TracingModuleItem({
    required this.id,
    required this.glyph,
    required this.say,
    required this.strokes,
    required this.ordered,
    required this.videoId,
    required this.videoWatched,
    required this.traced,
  });

  factory TracingModuleItem.fromJson(Map<String, dynamic> json) {
    final video = json['video'] as Map<String, dynamic>?;
    final shape = TracingItem.fromJson(json);
    return TracingModuleItem(
      id: json['id'] as String,
      glyph: shape.glyph,
      say: shape.say,
      strokes: shape.strokes,
      ordered: shape.ordered,
      videoId: video?['videoId'] as String?,
      videoWatched: json['videoWatched'] == true,
      traced: json['traced'] == true,
    );
  }

  final String id;
  final String glyph;
  final String say;
  final List<List<({double x, double y})>> strokes;
  final bool ordered;

  /// Null when the publisher has not given it a video yet; the tracing then
  /// opens straight away.
  final String? videoId;
  bool videoWatched;
  bool traced;

  bool get hasVideo => videoId != null;

  /// The shape alone, as the tracing screen takes it.
  TracingItem get shape =>
      TracingItem(glyph: glyph, say: say, strokes: strokes, ordered: ordered);

  /// "letter", "number" or "pattern", for the button that goes on to the next.
  String get kind {
    if (glyph.startsWith('pattern-')) return 'pattern';
    if (int.tryParse(glyph) != null) return 'number';
    // Hindi and Gujarati numerals are digits too, just not ASCII ones.
    final code = glyph.runes.first;
    if ((code >= 0x0966 && code <= 0x096F) ||
        (code >= 0x0AE6 && code <= 0x0AEF)) {
      return 'number';
    }
    return 'letter';
  }
}

class TracingCategoryDetail {
  TracingCategoryDetail({
    required this.id,
    required this.key,
    required this.name,
    required this.label,
    required this.items,
  });

  factory TracingCategoryDetail.fromJson(Map<String, dynamic> json) =>
      TracingCategoryDetail(
        id: json['id'] as String,
        key: json['key'] as String? ?? '',
        name: json['name'] as String? ?? '',
        label: json['label'] as String? ?? '',
        items: (json['items'] as List<dynamic>? ?? const <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(TracingModuleItem.fromJson)
            .where((item) => item.strokes.isNotEmpty)
            .toList(),
      );

  final String id;
  final String key;
  final String name;
  final String label;
  final List<TracingModuleItem> items;
}
