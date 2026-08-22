import 'package:flutter/material.dart';

/// A colour for a thing that has no colour of its own.
///
/// A child who cannot read finds their book by its colour and its picture. That
/// only works if the colour never moves: the orange book has to be orange every
/// morning, on every phone, before and after somebody uploads a cover. So it is
/// derived from the name rather than assigned, stored or randomised.
///
/// Six pairs, all of them tested against the warm paper the app is drawn on,
/// and none of them the red that means "wrong" in the activities.
class PlayTone {
  const PlayTone(this.ink, this.wash, this.deep);

  /// For strokes and text on the wash.
  final Color ink;

  /// The tile behind it.
  final Color wash;

  /// For text that has to hold its own on white.
  final Color deep;
}

const _tones = <PlayTone>[
  PlayTone(Color(0xFFB4650F), Color(0xFFFDEBD2), Color(0xFF8C4E0B)), // apricot
  PlayTone(Color(0xFF1F7A55), Color(0xFFD9F2E6), Color(0xFF17583D)), // leaf
  PlayTone(Color(0xFF2A6E96), Color(0xFFDCEFF9), Color(0xFF1E5170)), // sky
  PlayTone(Color(0xFF6B4FB8), Color(0xFFE9E2FB), Color(0xFF4E3A88)), // violet
  PlayTone(Color(0xFFA8447A), Color(0xFFFBE1EF), Color(0xFF7E3259)), // plum
  PlayTone(Color(0xFF3F6B22), Color(0xFFE6F3D8), Color(0xFF2E4F19)), // moss
];

/// The tone for a name. The same name always comes back the same colour.
PlayTone toneFor(String name) {
  var hash = 0;
  for (final unit in name.codeUnits) {
    // A plain sum collides on anagrams — "Maths" and "Shatm" are not a real
    // risk, but two chapters called "Letters A" and "Letters B" differ by one
    // character and would otherwise sit next to each other in the same colour.
    hash = (hash * 31 + unit) % 100003;
  }
  return _tones[hash % _tones.length];
}
