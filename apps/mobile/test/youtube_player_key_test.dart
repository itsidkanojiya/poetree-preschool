import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/features/activities/animation_view.dart';

/// The player's channel name is pasted unquoted into JavaScript by the package,
/// so it has to be a valid identifier. A hyphen in a YouTube id used to make it
/// one that could not be parsed — the whole player script died and a family got
/// a black rectangle with no error on it.
void main() {
  test('a hyphen in a video id never reaches the JavaScript', () {
    // The real id from the school's own film, which is how this was found.
    expect(youtubePlayerKey('a-3kJzYn_Bo'), 'a3kJzYn_Bo');
  });

  test('leaves an id that is already an identifier alone', () {
    expect(youtubePlayerKey('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    // Underscores are fine in an identifier and carry no risk.
    expect(youtubePlayerKey('abc_DEF123'), 'abc_DEF123');
  });

  test('what comes out can always be pasted into JavaScript', () {
    // `Youtube` is prepended by the package, so the name always starts with a
    // letter; every remaining character has to be one an identifier can hold.
    for (final id in ['a-3kJzYn_Bo', '--1234', 'a.b c', '9lives-4']) {
      expect(
        RegExp(r'^[A-Za-z0-9_]*$').hasMatch(youtubePlayerKey(id)),
        isTrue,
        reason: '$id produced ${youtubePlayerKey(id)}',
      );
    }
  });
}
