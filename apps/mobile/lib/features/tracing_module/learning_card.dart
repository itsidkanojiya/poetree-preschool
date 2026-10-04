import '../tracing/trace_lessons.dart';
import 'tracing_module_models.dart';

enum LearningCardType { number, alphabet, pattern }

/// One card in a letter or number grid, in any language — everything the
/// card shows, and nothing it has to work out for itself.
///
/// Built from the item (what is traced, and whether it has been) and its
/// lesson in the content mapping (assets/tracing/lessons.json). The card
/// widget draws this and only this, so English, Hindi, Gujarati and any
/// language added later are the same widget with different data.
class LearningCard {
  const LearningCard({
    required this.id,
    required this.language,
    required this.type,
    required this.character,
    required this.spoken,
    required this.learned,
    this.label,
    this.caption,
    this.imageAsset,
    this.audioAsset,
  });

  factory LearningCard.from(TracingModuleItem item, TraceLesson lesson) {
    final type = lesson.isNumber
        ? LearningCardType.number
        : lesson.isPattern
        ? LearningCardType.pattern
        : LearningCardType.alphabet;
    final label = lesson.label ?? lesson.word;

    return LearningCard(
      id: item.id,
      language: lesson.language,
      type: type,
      character: item.glyph,
      label: label,
      // A number says what its picture shows — "three stars", "तीन तारे";
      // a letter's word is already its label.
      caption: type == LearningCardType.number ? lesson.phrase : null,
      imageAsset: lesson.imagePath,
      audioAsset: lesson.audioPath,
      spoken: switch (type) {
        LearningCardType.pattern => label ?? '',
        _ => label == null ? item.glyph : '${item.glyph}... $label',
      },
      learned: item.traced,
    );
  }

  final String id;

  /// "en", "hi", "gu" — empty for a pattern.
  final String language;
  final LearningCardType type;

  /// The letter or numeral: "A", "अ", "૩".
  final String character;

  /// The word under it: "Apple", "अनार", "Three", "ત્રણ".
  final String? label;

  /// A number's quantity line: "three stars", "तीन तारे".
  final String? caption;

  /// The picture: what a letter's word names, or a number's quantity. Null
  /// when the app has no picture that matches — never a stand-in.
  final String? imageAsset;

  /// A recording to play for the speaker button, when one exists.
  final String? audioAsset;

  /// What the speaker button says: "A... Apple", "३... तीन".
  final String spoken;

  /// Traced at least once. Never locks the card.
  final bool learned;
}
