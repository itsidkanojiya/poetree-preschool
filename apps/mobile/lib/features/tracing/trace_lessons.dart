import 'dart:convert';

import 'package:flutter/services.dart';

/// What a child is taught once a letter or number is traced.
///
/// "A" → an apple, "Apple", "A for Apple". "3" → three stars, "Three stars".
/// All of it is data, in assets/tracing/lessons.json, so a new letter — or a
/// whole Hindi or Gujarati alphabet — is an entry there and a picture beside
/// it, not a change to the tracing screen.
class TraceLesson {
  const TraceLesson({
    required this.glyph,
    required this.isNumber,
    required this.say,
    this.isPattern = false,
    this.word,
    this.count = 0,
    this.countName,
    this.objectName,
    this.imagePath,
  });

  /// The letter or number itself.
  final String glyph;
  final bool isNumber;

  /// A pre-writing pattern (a zigzag, a bridge): named, not a letter "for"
  /// anything.
  final bool isPattern;

  /// Spoken once the lesson is shown: "A for Apple. Apple starts with A."
  final String say;

  /// The word a letter stands for: "Apple".
  final String? word;

  /// How many objects a number shows.
  final int count;

  /// The number in words: "three".
  final String? countName;

  /// What is being counted, plural: "stars".
  final String? objectName;

  /// The object's picture, when one has been added to the app. Null shows the
  /// word (for a letter) or counting bubbles (for a number) instead.
  final String? imagePath;

  /// The plain fallback for a glyph the catalogue has no entry for.
  factory TraceLesson.plain(String glyph) {
    final count = int.tryParse(glyph);
    return TraceLesson(
      glyph: glyph,
      isNumber: count != null,
      count: count ?? 0,
      say: count != null ? '$count.' : glyph,
    );
  }
}

/// The catalogue, loaded once.
class TraceLessons {
  TraceLessons._(this._entries, this._assets);

  final Map<String, dynamic> _entries;
  final Set<String> _assets;

  static const _file = 'assets/tracing/lessons.json';
  static const _objects = 'assets/tracing/objects';

  static Future<TraceLessons>? _loading;

  /// The catalogue from the app's own assets. Never throws: a catalogue that
  /// will not load gives every glyph its plain lesson rather than a broken page.
  static Future<TraceLessons> load([AssetBundle? bundle]) {
    return _loading ??= _read(bundle ?? rootBundle);
  }

  static Future<TraceLessons> _read(AssetBundle bundle) async {
    try {
      final raw = await bundle.loadString(_file);
      final json = jsonDecode(raw) as Map<String, dynamic>;
      final manifest = await AssetManifest.loadFromAssetBundle(bundle);
      return TraceLessons._(
        (json['glyphs'] as Map<String, dynamic>?) ?? const {},
        manifest.listAssets().toSet(),
      );
    } on Object {
      // Tried again next time rather than remembered as empty for good.
      _loading = null;
      return TraceLessons._(const {}, const {});
    }
  }

  /// Built from data already in hand — for tests.
  factory TraceLessons.from(Map<String, dynamic> glyphs, Set<String> assets) =>
      TraceLessons._(glyphs, assets);

  /// The lesson for [glyph]. A lowercase letter uses its capital's.
  TraceLesson forGlyph(String glyph) {
    final key = glyph.trim();
    final entry = (_entries[key] ?? _entries[key.toUpperCase()]) as Map?;
    if (entry == null) return TraceLesson.plain(key);

    final isNumber = entry['kind'] == 'number';
    final object = entry['object'] as String?;
    final path = object == null ? null : '$_objects/$object.png';
    final image = path != null && _assets.contains(path) ? path : null;
    final name = entry['name'] as String?;

    // A number without its picture shows counting bubbles, so the voice says
    // the number alone — "three stars" beside three bubbles would be wrong.
    final say = isNumber && image == null && name != null
        ? '${name.substring(0, 1).toUpperCase()}${name.substring(1)}.'
        : entry['say'] as String? ?? key;

    return TraceLesson(
      glyph: key,
      isNumber: isNumber,
      isPattern: entry['kind'] == 'pattern',
      say: say,
      word: entry['word'] as String?,
      count: (entry['count'] as num?)?.toInt() ?? 0,
      countName: name,
      objectName: entry['objectName'] as String?,
      imagePath: image,
    );
  }
}
