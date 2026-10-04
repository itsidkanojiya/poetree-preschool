import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// What a child is taught once a letter or number is traced, and what its
/// card in the letter grid shows.
///
/// "A" → "Apple", an apple, "A for Apple". "३" → "तीन", three stars, "तीन
/// तारे". All of it is data, in assets/tracing/lessons.json — the one content
/// mapping — so a letter, a number or a whole language is entries there and
/// pictures beside them, not a change to any screen.
///
/// Numbers teach quantity: the picture is that many things, the same for
/// every language, and only the number word changes. Letters teach a word in
/// their own language, with a picture only where one shows that word.
class TraceLesson {
  const TraceLesson({
    required this.glyph,
    required this.isNumber,
    required this.say,
    this.isPattern = false,
    this.language = '',
    this.word,
    this.label,
    this.phrase,
    this.count = 0,
    this.imagePath,
    this.audioPath,
    this.countWords = const [],
  });

  /// The letter or number itself.
  final String glyph;
  final bool isNumber;

  /// A pre-writing pattern (a zigzag, a bridge): named, not a letter "for"
  /// anything.
  final bool isPattern;

  /// "en", "hi" or "gu"; empty for a pattern or a glyph with no entry.
  final String language;

  /// Spoken once the lesson is shown: "A for Apple. Apple starts with A."
  final String say;

  /// The word a letter stands for, in its own language: "Apple", "अनार".
  /// A pattern's name.
  final String? word;

  /// The card's big word: a letter's [word], a number's name ("Three",
  /// "तीन", "ત્રણ").
  final String? label;

  /// The line under it: "A for Apple", "अ से अनार"; for a number, what the
  /// picture shows — "three stars", "तीन तारे".
  final String? phrase;

  /// How many things a number's picture shows.
  final int count;

  /// The picture, when the app has one: a number's quantity picture, or what
  /// a letter's word names. Null shows the word, or counting bubbles.
  final String? imagePath;

  /// A recording of [say], when one has been added. None yet: the voice
  /// reads [say] instead.
  final String? audioPath;

  /// "one", "two", … in this lesson's language, for counting aloud.
  final List<String> countWords;

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
  TraceLessons._(this._entries, this._assets)
    : _countWords = _wordsByLanguage(_entries);

  final Map<String, dynamic> _entries;
  final Set<String> _assets;
  final Map<String, List<String>> _countWords;

  static const _file = 'assets/tracing/lessons.json';

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

  /// Each language's number words in order, 1 first, taken from its numbers.
  static Map<String, List<String>> _wordsByLanguage(Map<String, dynamic> all) {
    final byCount = <String, Map<int, String>>{};
    for (final entry in all.values.whereType<Map<String, dynamic>>()) {
      if (entry['kind'] != 'number') continue;
      final count = (entry['count'] as num?)?.toInt() ?? 0;
      final label = entry['label'] as String?;
      if (count < 1 || label == null) continue;
      byCount.putIfAbsent(entry['language'] as String? ?? '', () => {})[count] =
          label;
    }
    return byCount.map(
      (language, words) =>
          MapEntry(language, [for (var n = 1; n <= 10; n++) words[n] ?? '$n']),
    );
  }

  /// Every letter of [language] the catalogue has, in its own order.
  Iterable<TraceLesson> lettersIn(String language) sync* {
    for (final MapEntry(:key, :value) in _entries.entries) {
      if (value is Map &&
          value['kind'] == 'letter' &&
          value['language'] == language) {
        yield forGlyph(key);
      }
    }
  }

  /// The lesson for [glyph]. A small English letter uses its capital's.
  TraceLesson forGlyph(String glyph) {
    final key = glyph.trim();
    final own = _entries[key] as Map?;
    final small = own == null && RegExp(r'^[a-z]$').hasMatch(key);
    final entry = own ?? (small ? _entries[key.toUpperCase()] as Map? : null);
    if (entry == null) return TraceLesson.plain(key);

    final kind = entry['kind'] as String?;
    final isNumber = kind == 'number';
    final isPattern = kind == 'pattern';
    final language = entry['language'] as String? ?? '';
    final word = entry['word'] as String?;

    // Only a picture really in the app; one named but not added yet is no
    // picture at all.
    final image = entry['image'] as String?;
    final audio = entry['audio'] as String?;

    // "a for apple" beside a small letter: the capital's words, written small.
    // English letters need no phrase in the data; the others carry their own
    // ("अ से अनार"), since "for" is not how they say it.
    final shown = small ? word?.toLowerCase() : word;
    final String? phrase = isPattern || word == null
        ? entry['phrase'] as String?
        : small
        ? '$key for $shown'
        : entry['phrase'] as String? ?? '$key for $word';

    return TraceLesson(
      glyph: key,
      isNumber: isNumber,
      isPattern: isPattern,
      language: language,
      say: entry['say'] as String? ?? key,
      word: shown,
      label: isNumber ? entry['label'] as String? : shown,
      phrase: phrase,
      count: (entry['count'] as num?)?.toInt() ?? 0,
      imagePath: image != null && _assets.contains(image) ? image : null,
      audioPath: audio != null && _assets.contains(audio) ? audio : null,
      countWords: _countWords[language] ?? const [],
    );
  }
}

/// A catalogue picture, PNG or SVG — whichever [path] names.
class ObjectPicture extends StatelessWidget {
  const ObjectPicture(this.path, {this.fit = BoxFit.contain, super.key});

  final String path;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) => path.endsWith('.svg')
      ? SvgPicture.asset(path, fit: fit)
      : Image.asset(path, fit: fit);
}
