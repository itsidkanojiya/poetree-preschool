import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/features/tracing/trace_lessons.dart';

/// The catalogue as the app ships it.
Map<String, dynamic> shipped() {
  final json =
      jsonDecode(File('assets/tracing/lessons.json').readAsStringSync())
          as Map<String, dynamic>;
  return json['glyphs'] as Map<String, dynamic>;
}

void main() {
  test('every capital letter and every number 0 to 10 has a lesson', () {
    final glyphs = shipped();
    for (final code in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.codeUnits) {
      expect(glyphs, contains(String.fromCharCode(code)));
    }
    for (var n = 0; n <= 10; n++) {
      expect(glyphs, contains('$n'));
    }
  });

  test('A is for Apple, and says so', () {
    final lesson = TraceLessons.from(shipped(), const {}).forGlyph('A');

    expect(lesson.isNumber, isFalse);
    expect(lesson.word, 'Apple');
    expect(lesson.say, 'A for Apple. Apple starts with A.');
  });

  test('a small letter is taught with its capital', () {
    final lessons = TraceLessons.from(shipped(), const {});

    expect(lessons.forGlyph('b').word, 'Ball');
  });

  test('a picture is used only once it is really in the app', () {
    final without = TraceLessons.from(shipped(), const {}).forGlyph('A');
    final withIt = TraceLessons.from(shipped(), const {
      'assets/tracing/objects/apple.png',
    }).forGlyph('A');

    expect(without.imagePath, isNull);
    expect(withIt.imagePath, 'assets/tracing/objects/apple.png');
  });

  test('a number says what it shows: bubbles alone, or the objects', () {
    final bubbles = TraceLessons.from(shipped(), const {}).forGlyph('3');
    expect(bubbles.count, 3);
    expect(bubbles.say, 'Three.');

    final stars = TraceLessons.from(shipped(), const {
      'assets/tracing/objects/star.png',
    }).forGlyph('3');
    expect(stars.say, 'Three. Three stars.');
  });

  test('a letter with no lesson yet still has something to say', () {
    final lesson = TraceLessons.from(shipped(), const {}).forGlyph('अ');

    expect(lesson.glyph, 'अ');
    expect(lesson.isNumber, isFalse);
    expect(lesson.say, 'अ');
  });
}
