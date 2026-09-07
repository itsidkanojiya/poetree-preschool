import 'dart:async';
import 'dart:math' as math;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:get/get.dart';

/// The app's voice.
///
/// The children this is for cannot read. Every prompt in the content already
/// carries a `say` sentence, written for the adult sitting beside them to read
/// out — this reads it when nobody is sitting beside them.
///
/// Synthesised rather than recorded. A recording per numeral is ten files, then
/// ten more for the letters, and a studio session every time somebody writes a
/// new activity; the voice covers whatever the content happens to say.
///
/// Every method is safe to call when there is no engine on the device. A phone
/// with no speech installed loses the voice and keeps the app: nothing here is
/// allowed to throw into a child's screen.
class SpeechService extends GetxService {
  SpeechService({FlutterTts? tts, FlutterSecureStorage? storage})
    : _tts = tts ?? FlutterTts(),
      _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'sounds_on';

  final FlutterTts _tts;
  final FlutterSecureStorage _storage;

  /// Whether the app speaks at all.
  ///
  /// On by default — the voice is the point — but a classroom of twenty phones
  /// all saying "well done" at once is a real place, so it can be turned off.
  final isOn = true.obs;

  bool _ready = false;

  Future<SpeechService> init() async {
    try {
      isOn.value = (await _storage.read(key: _key)) != 'off';
    } on Exception {
      isOn.value = true;
    }

    try {
      await _tts.setLanguage('en-IN');
      // Slower than an adult would speak. A three-year-old is still working out
      // where one word ends and the next starts.
      await _tts.setSpeechRate(0.42);
      await _tts.setPitch(1.05);
      await _tts.awaitSpeakCompletion(true);
      _ready = true;
    } on Exception {
      // No engine, or one that will not configure. The app goes on quietly.
      _ready = false;
    }

    return this;
  }

  Future<void> setOn(bool on) async {
    isOn.value = on;
    if (!on) await stop();
    try {
      await _storage.write(key: _key, value: on ? 'on' : 'off');
    } on Exception {
      // Applied for this run either way.
    }
  }

  /// Says one thing, cutting off whatever was being said.
  ///
  /// Interrupting on purpose: a child who taps ahead should hear the number
  /// they are looking at, not queue behind the one they left.
  Future<void> say(String text) async {
    if (!_ready || !isOn.value || text.trim().isEmpty) return;

    try {
      await _tts.stop();
      await _tts.speak(text);
    } on Exception {
      // A engine that fails mid-sentence is not worth a broken screen.
    }
  }

  Future<void> stop() async {
    if (!_ready) return;
    try {
      await _tts.stop();
    } on Exception {
      // Nothing to recover from.
    }
  }

  /// Said when a child gets it right.
  ///
  /// Varied on purpose. The same three words every time stops being praise and
  /// becomes a noise the app makes.
  static const praise = <String>[
    'Nice! Very good.',
    'Well done!',
    'That is it! Lovely.',
    'Brilliant!',
    'Perfect. Well done!',
  ];

  static final _random = math.Random();

  Future<void> wellDone() => say(praise[_random.nextInt(praise.length)]);
}
