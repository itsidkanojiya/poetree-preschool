import 'package:flutter/material.dart';

import '../config/school_config.dart';

/// The school's own colour, baked in at build time, with Poetree navy as the
/// fallback for an unconfigured development build.
class AppTheme {
  const AppTheme._();

  static Color get brand {
    final hex = SchoolConfig.primaryColorHex.replaceAll('#', '');
    final value = int.tryParse(hex, radix: 16);
    if (value == null || hex.length != 6) return const Color(0xFF16307C);
    return Color(0xFF000000 | value);
  }

  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(seedColor: brand);

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      fontFamily: 'Poppins',
      scaffoldBackgroundColor: const Color(0xFFF6F7FA),
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        centerTitle: false,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.6)),
        ),
      ),
    );
  }
}
