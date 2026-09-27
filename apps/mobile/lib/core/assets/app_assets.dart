/// Every picture in the Student/Parent app's asset pack, named once.
///
/// Widgets ask for `AppIcons.homework`, never for a path: a file renamed or a
/// folder moved is one line here rather than a hunt through every screen.
abstract final class AppIcons {
  static const _dir = 'assets/images/icons';

  // The home page.
  static const game = '$_dir/game.png';
  static const animation = '$_dir/animation.png';
  static const subjects = '$_dir/subjects.png';
  static const tracing = '$_dir/tracing.png';
  static const homework = '$_dir/homework.png';
  static const announcement = '$_dir/announcement.png';
  static const gallery = '$_dir/gallery.png';
  static const attendance = '$_dir/attendance.png';
  static const fees = '$_dir/fees.png';
  static const notifications = '$_dir/notifications.png';

  // Subjects and categories.
  static const englishAlphabet = '$_dir/english_alphabet.png';
  static const mathsNumbers = '$_dir/maths_numbers.png';
  static const evsGk = '$_dir/evs_gk.png';
  static const rhymes = '$_dir/rhymes.png';
  static const phonics = '$_dir/phonics.png';
  static const hindi = '$_dir/hindi.png';
  static const gujarati = '$_dir/gujarati.png';
  static const generalKnowledge = '$_dir/general_knowledge.png';
  static const alphabetBlocks = '$_dir/alphabet_blocks.png';
  static const numberBlocks = '$_dir/number_blocks.png';
  static const moralStories = '$_dir/moral_stories.png';
  static const shapes = '$_dir/shapes.png';
  static const storybook = '$_dir/storybook.png';
  static const generalAwareness = '$_dir/general_awareness.png';
  static const festivalsSeasons = '$_dir/festivals_seasons.png';
}

abstract final class AppBanners {
  static const _dir = 'assets/images/banners';

  static const game = '$_dir/game_banner.png';
  static const animation2d = '$_dir/2d_animation_banner.png';
  static const animation3d = '$_dir/3d_animation_banner.png';
  static const animation2d3d = '$_dir/2d_3d_animation_banner.png';

  /// Width over height of every banner in the pack (867 × 424).
  static const aspectRatio = 867 / 424;
}

/// The picture for a subject.
///
/// The publisher chooses a picture key for each subject on the web (the shared
/// contract's BOOK_SUBJECT_ICONS), and that key is the answer. A subject left on
/// the plain "book" picture is matched by its name instead, so "Moral Stories"
/// still gets the lion and the elephant rather than a generic book.
abstract final class SubjectArt {
  static const _byKey = <String, String>{
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

  /// Checked in order, so "General Knowledge" is not caught by "general".
  static const _byName = <(String, String)>[
    ('english', AppIcons.englishAlphabet),
    ('alphabet', AppIcons.englishAlphabet),
    ('math', AppIcons.mathsNumbers),
    ('number', AppIcons.mathsNumbers),
    ('evs', AppIcons.evsGk),
    ('environment', AppIcons.evsGk),
    ('knowledge', AppIcons.generalKnowledge),
    ('gk', AppIcons.generalKnowledge),
    ('awareness', AppIcons.generalAwareness),
    ('rhyme', AppIcons.rhymes),
    ('song', AppIcons.rhymes),
    ('phonic', AppIcons.phonics),
    ('hindi', AppIcons.hindi),
    ('gujarati', AppIcons.gujarati),
    ('moral', AppIcons.moralStories),
    ('shape', AppIcons.shapes),
    ('festival', AppIcons.festivalsSeasons),
    ('season', AppIcons.festivalsSeasons),
    ('story', AppIcons.storybook),
    ('stories', AppIcons.storybook),
  ];

  static String forSubject({required String icon, required String name}) {
    final byKey = icon == 'book' ? null : _byKey[icon];
    if (byKey != null) return byKey;

    final lower = name.toLowerCase();
    for (final (word, path) in _byName) {
      if (lower.contains(word)) return path;
    }
    return AppIcons.storybook;
  }
}
