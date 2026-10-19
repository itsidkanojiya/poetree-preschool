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
    expect(lesson.language, 'en');
    expect(lesson.word, 'Apple');
    expect(lesson.phrase, 'A for Apple');
    expect(lesson.say, 'A for Apple. Apple starts with A.');
  });

  test('a small letter is taught with its capital, written small', () {
    final lesson = TraceLessons.from(shipped(), const {}).forGlyph('b');

    expect(lesson.word, 'ball');
    expect(lesson.label, 'ball');
    expect(lesson.phrase, 'b for ball');
  });

  test('a picture is used only once it is really in the app', () {
    const apple = 'assets/letters/en/apple.webp';
    final without = TraceLessons.from(shipped(), const {}).forGlyph('A');
    final withIt = TraceLessons.from(shipped(), {apple}).forGlyph('A');

    expect(without.imagePath, isNull);
    expect(withIt.imagePath, apple);
  });

  test('every letter has its own picture from the book', () {
    final glyphs = shipped();
    final without = <String>[];
    for (final entry in glyphs.entries) {
      final value = entry.value as Map<String, dynamic>;
      if (value['kind'] != 'letter') continue;
      final image = value['image'] as String?;
      if (image == null) {
        without.add(entry.key);
        continue;
      }
      expect(File(image).existsSync(), isTrue, reason: entry.key);
      final name = image.split('/').last.split('.').first;
      if (value['language'] == 'en') {
        // English pictures are named after what they show: X-mas Tree is
        // xmas_tree.
        final word = (value['word'] as String).toLowerCase();
        expect(
          name,
          word.replaceAll('-', '').replaceAll(' ', '_'),
          reason: entry.key,
        );
      } else {
        // Hindi and Gujarati pictures are named after their letter's code
        // points, so one letter can never show another's picture.
        final points = entry.key.runes.map(
          (c) => c.toRadixString(16).padLeft(4, '0'),
        );
        expect(name, 'u${points.join('_')}', reason: entry.key);
      }
    }
    // The Hindi book has no picture for श्र.
    expect(without, ['श्र']);
  });

  test('a letter with no lesson still has something to say', () {
    final lesson = TraceLessons.from(shipped(), const {}).forGlyph('ङ');

    expect(lesson.glyph, 'ङ');
    expect(lesson.isNumber, isFalse);
    expect(lesson.say, 'ङ');
  });

  group('numbers teach quantity, the same picture in every language', () {
    String digits(int n, int zero) => String.fromCharCodes(
      n.toString().codeUnits.map((c) => zero + c - 0x30),
    );

    final languages = {
      'en': (0x30, 'One', 'Three', 'three stars'),
      'hi': (0x0966, 'एक', 'तीन', 'तीन तारे'),
      'gu': (0x0AE6, 'એક', 'ત્રણ', 'ત્રણ તારા'),
    };

    for (final MapEntry(key: language, value: data) in languages.entries) {
      test(language, () {
        final glyphs = shipped();
        final lessons = TraceLessons.from(glyphs, {
          for (final v in glyphs.values)
            if ((v as Map)['image'] != null) v['image'] as String,
        });
        final (zero, one, three, threeThings) = data;

        for (var n = 1; n <= 10; n++) {
          final lesson = lessons.forGlyph(digits(n, zero));
          expect(lesson.isNumber, isTrue);
          expect(lesson.language, language);
          expect(lesson.count, n);
          // The quantity picture is configured, never worked out from a word,
          // and it is the same one whatever the language.
          expect(lesson.imagePath, startsWith('assets/numbers/number_'));
          expect(
            lesson.imagePath,
            lessons.forGlyph('$n').imagePath,
            reason: 'one picture of $n things for every language',
          );
          // Nothing in English on a Hindi or Gujarati number.
          if (language != 'en') {
            for (final text in [lesson.label, lesson.phrase, lesson.say]) {
              expect(text, isNot(matches(RegExp('[A-Za-z]'))), reason: '$n');
            }
          }
        }

        expect(lessons.forGlyph(digits(1, zero)).label, one);
        expect(lessons.forGlyph(digits(3, zero)).label, three);
        expect(lessons.forGlyph(digits(3, zero)).phrase, threeThings);
        expect(lessons.forGlyph(digits(3, zero)).countWords.first, one);
      });
    }
  });

  test('Hindi and Gujarati letters stand for words in their own language', () {
    final lessons = TraceLessons.from(shipped(), const {});

    final hindi = lessons.forGlyph('अ');
    expect(hindi.language, 'hi');
    expect(hindi.word, 'अनानस');
    expect(hindi.phrase, 'अ से अनानस');

    final gujarati = lessons.forGlyph('અ');
    expect(gujarati.language, 'gu');
    expect(gujarati.word, 'અજગર');

    for (final glyph in [
      'अ',
      'आ',
      'इ',
      'ई',
      'उ',
      'ऊ',
      'અ',
      'આ',
      'ઇ',
      'ઈ',
      'ઉ',
      'ઊ',
    ]) {
      final lesson = lessons.forGlyph(glyph);
      expect(lesson.word, isNotNull, reason: glyph);
      expect(lesson.word, isNot(matches(RegExp('[A-Za-z]'))), reason: glyph);
    }
  });
}
