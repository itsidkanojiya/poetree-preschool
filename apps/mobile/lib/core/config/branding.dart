import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import 'school_config.dart';

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
class Branding {
  const Branding({
    required this.name,
    required this.primaryColor,
    required this.logoUrl,
  });

  factory Branding.fromJson(Map<String, dynamic> json) => Branding(
    name: json['name'] as String? ?? SchoolConfig.schoolName,
    primaryColor: _parseColour(json['primaryColor'] as String?),
    logoUrl: json['logoUrl'] as String?,
  );

  /// What the app shows before anything has been fetched: the values baked in
  /// at build time, which are right for a configured build and harmless for a
  /// development one.
  factory Branding.fallback() => Branding(
    name: SchoolConfig.schoolName,
    primaryColor: _parseColour(SchoolConfig.primaryColorHex),
    logoUrl: null,
  );

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
    final origin = SchoolConfig.apiBaseUrl.replaceFirst(
      RegExp(r'/api/v\d+/?$'),
      '',
    );
    return '$origin$path';
  }

  Map<String, dynamic> toJson() => {
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

/// Loads branding, cache first and network second.
class BrandingService {
  BrandingService({Dio? dio})
    : _dio = dio ?? Dio(BaseOptions(baseUrl: SchoolConfig.apiBaseUrl));

  final Dio _dio;

  static const _fileName = 'branding.json';

  /// What the app is currently painted with. Read before the first frame.
  static Branding current = Branding.fallback();

  /// Reads the cached copy, then refreshes from the API in the background.
  ///
  /// Deliberately never throws: a school with no signal at 8am still has to be
  /// able to open the app, and branding is the least important thing on it.
  Future<Branding> load() async {
    final cached = await _readCache();
    if (cached != null) current = cached;

    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/public/schools/${SchoolConfig.schoolCode}/branding',
      );
      final data = response.data;
      if (data != null) {
        current = Branding.fromJson(data);
        await _writeCache(current);
      }
    } on Object {
      // Keep whatever we had. Cached, or the build-time defaults.
    }

    return current;
  }

  Future<File> _cacheFile() async {
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
