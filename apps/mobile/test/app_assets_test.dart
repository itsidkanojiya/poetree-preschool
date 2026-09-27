import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/core/assets/app_assets.dart';

void main() {
  test('every named picture is a file the app actually ships', () {
    const paths = [
      AppIcons.game,
      AppIcons.animation,
      AppIcons.subjects,
      AppIcons.tracing,
      AppIcons.homework,
      AppIcons.announcement,
      AppIcons.gallery,
      AppIcons.attendance,
      AppIcons.fees,
      AppIcons.notifications,
      AppIcons.englishAlphabet,
      AppIcons.mathsNumbers,
      AppIcons.evsGk,
      AppIcons.rhymes,
      AppIcons.phonics,
      AppIcons.hindi,
      AppIcons.gujarati,
      AppIcons.generalKnowledge,
      AppIcons.alphabetBlocks,
      AppIcons.numberBlocks,
      AppIcons.moralStories,
      AppIcons.shapes,
      AppIcons.storybook,
      AppIcons.generalAwareness,
      AppIcons.festivalsSeasons,
      AppBanners.game,
      AppBanners.animation2d,
      AppBanners.animation3d,
      AppBanners.animation2d3d,
    ];

    for (final path in paths) {
      expect(File(path).existsSync(), isTrue, reason: '$path is missing');
    }
  });

  test('every subject picture key the publisher can choose has a picture', () {
    // The shared contract's BOOK_SUBJECT_ICONS.
    const keys = {
      'abc': AppIcons.englishAlphabet,
      'numbers': AppIcons.mathsNumbers,
      'globe': AppIcons.evsGk,
      'hindi': AppIcons.hindi,
      'gujarati': AppIcons.gujarati,
      'bulb': AppIcons.generalKnowledge,
      'music': AppIcons.rhymes,
      'phonics': AppIcons.phonics,
      'stories': AppIcons.moralStories,
      'shapes': AppIcons.shapes,
      'festivals': AppIcons.festivalsSeasons,
      'awareness': AppIcons.generalAwareness,
      'abc_blocks': AppIcons.alphabetBlocks,
      'number_blocks': AppIcons.numberBlocks,
      'storybook': AppIcons.storybook,
    };

    keys.forEach((key, path) {
      expect(SubjectArt.forSubject(icon: key, name: 'Anything'), path);
    });
  });

  test('a subject left on the plain book is matched by its name', () {
    String art(String name) => SubjectArt.forSubject(icon: 'book', name: name);

    expect(art('English'), AppIcons.englishAlphabet);
    expect(art('Maths'), AppIcons.mathsNumbers);
    expect(art('General Knowledge'), AppIcons.generalKnowledge);
    expect(art('Moral Stories'), AppIcons.moralStories);
    expect(art('Festivals & Seasons'), AppIcons.festivalsSeasons);
    expect(art('Rhymes'), AppIcons.rhymes);
    // Nothing to go on: the storybook, never an empty square.
    expect(art('More books'), AppIcons.storybook);
  });

  test('a key an old app does not know still draws something', () {
    expect(
      SubjectArt.forSubject(icon: 'something_new', name: 'Science'),
      AppIcons.storybook,
    );
  });
}
