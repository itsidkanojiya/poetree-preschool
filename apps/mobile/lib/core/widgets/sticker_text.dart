import 'package:flutter/material.dart';

import '../letterforms/glyph_text.dart';

/// A number or letter as the tracing lesson draws it: a fat, bright sticker,
/// coloured, with a thick white edge and a soft shadow.
///
/// The activities use it wherever a child is shown a number or a letter —
/// counting answers, lettered and numbered tiles, the question they are on,
/// their score — so a "3" looks the same in every module as it does on the
/// page where they learnt to write it. The tracing lesson keeps its own copy;
/// this one follows it exactly.
///
/// Hindi and Gujarati are drawn from the school's letterforms on a white
/// tile, as the lesson draws them; anything else (an emoji, a word) is not a
/// sticker, and [fits] says so.
class StickerText extends StatelessWidget {
  const StickerText(this.text, {required this.size, this.colour, super.key});

  final String text;

  /// The height of the character.
  final double size;

  /// The lesson's colour for this kind of character when null.
  final Color? colour;

  static final _latin = RegExp(r'^[A-Za-z0-9]+$');
  static final _indic = RegExp(r'^[ऀ-ॿ઀-૿]+$');
  static final _digits = RegExp(r'^[0-9०-९૦-૯]+$');

  /// Whether [text] is a single number or letter — what is drawn as a
  /// sticker. Numbers of any length; letters one or two at a time, as the
  /// lesson does. A word stays a word.
  static bool fits(String text) =>
      _digits.hasMatch(text) ||
      RegExp(r'^[A-Za-z]{1,2}$').hasMatch(text) ||
      (_indic.hasMatch(text) && text.characters.length <= 2);

  /// The lesson's colours: numbers coral, small letters green, the rest blue.
  static Color colourFor(String text) => _digits.hasMatch(text)
      ? const Color(0xFFFF4D66)
      : RegExp(r'^[a-z]+$').hasMatch(text)
      ? const Color(0xFF22B07D)
      : const Color(0xFF4C7FF0);

  @override
  Widget build(BuildContext context) {
    final ink = colour ?? colourFor(text);

    if (!_latin.hasMatch(text)) {
      return Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.9),
          borderRadius: BorderRadius.circular(size * 0.22),
        ),
        child: GlyphText(text, size: size * 0.62, color: ink, weight: 1.6),
      );
    }

    final style = TextStyle(
      fontSize: size,
      fontWeight: FontWeight.w800,
      height: 1,
    );
    return Stack(
      children: [
        // The edge is drawing, not words: read out once, not twice.
        ExcludeSemantics(
          child: Text(
            text,
            style: style.copyWith(
              foreground: Paint()
                ..style = PaintingStyle.stroke
                ..strokeWidth = size * 0.09
                ..strokeJoin = StrokeJoin.round
                ..color = Colors.white,
              shadows: [
                Shadow(
                  color: Colors.black.withValues(alpha: 0.18),
                  blurRadius: 10,
                  offset: const Offset(0, 5),
                ),
              ],
            ),
          ),
        ),
        Text(text, style: style.copyWith(color: ink)),
      ],
    );
  }
}
