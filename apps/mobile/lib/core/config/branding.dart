import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import 'app_config.dart';

/// The school's name, colour and logo, fetched rather than baked in.
///
/// These used to be compile-time constants, which meant the office could change
/// the school's colour in the portal and nothing happened until somebody built
/// a new APK. Now the Super Admin sets them and every phone picks them up.
///
/// Fetched from the public branding route because the first screen that needs
/// them is the sign-in screen, where there is no token to send. Cached to disk
/// so a cold start on a bad connection still opens looking like the school
/// rather than like a default, and so the very first frame is never unbranded.
///
/// The same route is how a School ID is checked: Poetree Kids is one app for
/// every school, and the school a phone belongs to is the one whose ID was
/// last typed at sign-in and recognised — [code] here.
class Branding {
  const Branding({
    required this.name,
    required this.primaryColor,
    required this.logoUrl,
    this.code,
  });

  factory Branding.fromJson(Map<String, dynamic> json) => Branding(
    name: json['name'] as String? ?? appName,
    primaryColor: _parseColour(json['primaryColor'] as String?),
    logoUrl: json['logoUrl'] as String?,
    code: json['code'] as String?,
  );

  /// What the app shows before anyone has given a School ID: Poetree Kids
  /// itself, in the Poetree navy.
  factory Branding.fallback() =>
      Branding(name: appName, primaryColor: _parseColour(null), logoUrl: null);

  /// The app's own name, for when it belongs to no school yet.
  static const appName = 'Poetree Kids';

  /// The School ID this phone signs in to — the school's code, as the API
  /// knows it. Null until someone has typed one that the API recognised.
  final String? code;

  final String name;
  final Color primaryColor;

  /// A path on the API, not a full URL — [absoluteLogoUrl] joins it. Null when
  /// the school has not uploaded one.
  final String? logoUrl;

  /// Usable by Image.network: the logo route is the one image in this system
  /// that needs no bearer token, precisely so the sign-in screen can show it.
  String? get absoluteLogoUrl {
    final path = logoUrl;
    if (path == null) return null;

    // The stored path is rooted at the domain (/api/v1/...) while the client's
    // base URL already ends in /api/v1, so the two are joined by hand rather
    // than concatenated into /api/v1/api/v1.
    final origin = AppConfig.apiBaseUrl.replaceFirst(
      RegExp(r'/api/v\d+/?$'),
      '',
    );
    return '$origin$path';
  }

  Map<String, dynamic> toJson() => {
    'code': code,
    'name': name,
    // ignore: deprecated_member_use — .value is the stable int for storage;
    // toARGB32() is not available on the Flutter version this targets.
    'primaryColor':
        '#${primaryColor.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}',
    'logoUrl': logoUrl,
  };

  static Color _parseColour(String? hex) {
    const poetreeNavy = Color(0xFF16307C);
    if (hex == null) return poetreeNavy;

    final cleaned = hex.replaceAll('#', '');
    if (cleaned.length != 6) return poetreeNavy;

    final value = int.tryParse(cleaned, radix: 16);
    return value == null ? poetreeNavy : Color(0xFF000000 | value);
  }
}

/// A School ID that no school has.
class SchoolNotFound implements Exception {
  const SchoolNotFound(this.schoolId);

  /// As the person typed it, to show it back to them.
  final String schoolId;

  @override
  String toString() => 'SchoolNotFound($schoolId)';
}

/// The school this phone belongs to — its School ID, name, colour and logo —
/// remembered on the phone, cache first and network second.
class BrandingService {
  /// [cacheFile] stands in for the file in the app's support directory —
  /// tests pass one, because real disk I/O never finishes inside a widget
  /// test's fake clock.
  BrandingService({Dio? dio, Future<File> Function()? cacheFile})
    : _dio = dio ?? Dio(BaseOptions(baseUrl: AppConfig.apiBaseUrl)),
      _cacheFileOverride = cacheFile;

  final Dio _dio;
  final Future<File> Function()? _cacheFileOverride;

  static const _fileName = 'branding.json';

  /// What the app is currently painted with. Read before the first frame.
  static Branding current = Branding.fallback();

  /// Reads the remembered school, then refreshes it from the API.
  ///
  /// Deliberately never throws: a school with no signal at 8am still has to be
  /// able to open the app, and branding is the least important thing on it.
  /// A phone that has never been given a School ID stays Poetree Kids.
  Future<Branding> load() async {
    final cached = await _readCache();
    if (cached != null) current = cached;

    final code = current.code;
    if (code == null) return current;

    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/public/schools/$code/branding',
      );
      final data = response.data;
      if (data != null) {
        current = Branding.fromJson({'code': code, ...data});
        await _writeCache(current);
      }
    } on Object {
      // Keep whatever we had: the remembered school, or Poetree Kids.
    }

    return current;
  }

  /// Checks a School ID with the API and, when it names a school, makes it
  /// the one this phone signs in to — remembered for next time, and painted
  /// on the sign-in screen from then on.
  ///
  /// Throws [SchoolNotFound] for an ID no school has, and the [DioException]
  /// when the API cannot be reached, so the caller can tell the two apart.
  Future<Branding> choose(String schoolId) async {
    final code = normalise(schoolId);
    if (!looksLikeSchoolId(code)) throw SchoolNotFound(schoolId.trim());

    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/public/schools/$code/branding',
      );
      current = Branding.fromJson({'code': code, ...?response.data});
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) throw SchoolNotFound(code);
      rethrow;
    }

    await _writeCache(current);
    return current;
  }

  /// A School ID however it was typed: " Sunrise " is "sunrise".
  static String normalise(String schoolId) => schoolId.trim().toLowerCase();

  /// The API's own rule for a school code: a letter, then letters and digits,
  /// two to thirty in all. Anything else cannot be a school, and asking the
  /// server about it would only cost a round trip.
  static bool looksLikeSchoolId(String code) =>
      RegExp(r'^[a-z][a-z0-9]{1,29}$').hasMatch(code);

  Future<File> _cacheFile() async {
    final override = _cacheFileOverride;
    if (override != null) return override();
    final directory = await getApplicationSupportDirectory();
    return File('${directory.path}/$_fileName');
  }

  Future<Branding?> _readCache() async {
    try {
      final file = await _cacheFile();
      if (!file.existsSync()) return null;
      return Branding.fromJson(
        jsonDecode(await file.readAsString()) as Map<String, dynamic>,
      );
    } on Object {
      return null;
    }
  }

  Future<void> _writeCache(Branding branding) async {
    try {
      final file = await _cacheFile();
      await file.writeAsString(jsonEncode(branding.toJson()));
    } on Object {
      // A cache that will not write is not worth a crash on startup.
    }
  }
}
