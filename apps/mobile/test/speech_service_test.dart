import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/core/audio/speech_service.dart';

/// The voice must never be the reason a screen breaks.
///
/// These run with no platform plugins registered at all, which is exactly the
/// state of a cheap phone with no speech engine installed: every call into the
/// engine throws MissingPluginException. A child on that phone should lose the
/// sound and keep the app.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('starts up on a device with no speech engine', () async {
    final speech = SpeechService();

    // No throw, and a usable service on the other side.
    await speech.init();

    expect(speech.isOn.value, isTrue);
  });

  test('saying something on a device with no engine is silent, not fatal', () async {
    final speech = SpeechService();
    await speech.init();

    await speech.say('Trace the number one.');
    await speech.wellDone();
    await speech.stop();
  });

  test('turning it off is remembered in the value even when storage fails', () async {
    // Secure storage is also a plugin, and also missing here. The switch still
    // has to move — losing the preference is a smaller failure than a switch
    // that does nothing.
    final speech = SpeechService();
    await speech.init();

    await speech.setOn(false);
    expect(speech.isOn.value, isFalse);

    await speech.setOn(true);
    expect(speech.isOn.value, isTrue);
  });

  test('nothing is said while the sound is off', () async {
    final speech = SpeechService();
    await speech.init();
    await speech.setOn(false);

    // Nothing to assert but the absence of a crash: with no engine there is
    // nothing to observe. The value of this test is that `say` returns early
    // rather than reaching for an engine that is not there.
    await speech.say('Well done!');
    expect(speech.isOn.value, isFalse);
  });

  test('praise is varied, so it stays praise', () {
    // The same three words every time stops being encouragement and becomes a
    // noise the app makes.
    expect(SpeechService.praise.length, greaterThanOrEqualTo(4));
    expect(SpeechService.praise.toSet().length, SpeechService.praise.length);
    for (final phrase in SpeechService.praise) {
      expect(phrase.trim(), isNotEmpty);
    }
  });
}
