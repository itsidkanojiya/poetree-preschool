import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:get/get.dart';

/// Which theme the family chose, remembered between launches.
///
/// The app followed the phone, which meant a parent with their phone in dark
/// mode opened a near-black app for their four-year-old — charcoal cards, grey
/// paper, every picture-book colour drained out of it. Following the phone is a
/// reasonable default for a banking app and the wrong one here.
///
/// So it is a choice, and the choice defaults to light. Somebody who wants dark
/// at bedtime can still have it, and somebody who wants the phone to decide can
/// have that too — but nobody is given a dark nursery app without asking.
///
/// Stored in the same secure store the session uses. It is not a secret, but it
/// is the only key-value store this app ships with, and a preference is not
/// worth a second storage dependency.
class ThemeController extends GetxController {
  ThemeController({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'theme_mode';

  final FlutterSecureStorage _storage;

  /// Light until told otherwise, including on the very first launch.
  final mode = ThemeMode.light.obs;

  /// Reads the saved choice. Awaited before the first frame so the app is never
  /// briefly the wrong colour.
  Future<ThemeController> init() async {
    try {
      mode.value = _parse(await _storage.read(key: _key));
    } on Exception {
      // A storage that will not open is not a reason to fail to start; the
      // default is a perfectly good app.
      mode.value = ThemeMode.light;
    }
    return this;
  }

  Future<void> choose(ThemeMode next) async {
    mode.value = next;
    try {
      await _storage.write(key: _key, value: next.name);
    } on Exception {
      // Applied for this run either way. Losing the preference is a smaller
      // failure than refusing to change the theme.
    }
  }

  /// What the setting says on screen.
  String get label => switch (mode.value) {
    ThemeMode.light => 'Light',
    ThemeMode.dark => 'Dark',
    ThemeMode.system => 'Match my phone',
  };

  static ThemeMode _parse(String? stored) => switch (stored) {
    'dark' => ThemeMode.dark,
    'system' => ThemeMode.system,
    _ => ThemeMode.light,
  };
}
