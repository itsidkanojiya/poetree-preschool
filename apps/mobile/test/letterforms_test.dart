import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/core/letterforms/letterforms.dart';

/// The school's letterforms, as the app ships them.
Letterforms shipped() => Letterforms.from(
  jsonDecode(File('assets/letterforms/letterforms.json').readAsStringSync())
      as Map<String, dynamic>,
);

void main() {
  test(
    'has every English letter and number, and the Hindi and Gujarati ones',
    () {
      final forms = shipped();
      for (final code
          in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
              .codeUnits) {
        expect(
          forms[String.fromCharCode(code)],
          isNotNull,
          reason: String.fromCharCode(code),
        );
      }
      for (final glyph in [
        'अ',
        'क',
        'क्ष',
        'ज्ञ',
        '१',
        '१०',
        'અ',
        'ક',
        'ક્ષ',
        '૧',
        '૧૦',
      ]) {
        expect(forms[glyph], isNotNull, reason: glyph);
      }
    },
  );

  test('has the patterns, with names a person would say', () {
    final forms = shipped();

    expect(forms['pattern-zigzag'], isNotNull);
    expect(forms.patternNames['pattern-zigzag'], 'Big zigzag');
  });

  test('builds a number from its digits when it is not on the sheet whole', () {
    final shapes = shipped().shapesFor('10');

    expect(shapes, hasLength(2));
    expect(shapes!.first.dots, hasLength(shipped()['1']!.dots.length));
  });

  test('takes a sheet key whole before splitting it', () {
    expect(shipped().shapesFor('क्ष'), hasLength(1));
    expect(shipped().shapesFor('१०'), hasLength(1));
  });

  test('leaves an emoji or an unknown script to the typeface', () {
    final forms = shipped();

    expect(forms.shapesFor('🍎'), isNull);
    expect(forms.shapesFor('அ'), isNull);
    expect(forms.shapesFor('   '), isNull);
  });

  test('joins neighbouring dots but not the dot of an i to its stem', () {
    final i = shipped()['i']!;
    final linked = <int>{
      for (final (a, b) in i.links) ...[a, b],
    };

    // Every dot but the one above is part of the stem.
    expect(i.dots.length - linked.length, 1);
  });

  test('lays characters out side by side on one line', () {
    final forms = shipped();
    final run = LetterformRun([forms['1']!, forms['0']!]);

    expect(run.bounds.width, greaterThan(forms['0']!.width));
    expect(run.dots.length, forms['1']!.dots.length + forms['0']!.dots.length);
  });
}
