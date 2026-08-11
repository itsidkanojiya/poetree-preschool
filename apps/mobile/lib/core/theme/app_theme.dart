import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../config/school_config.dart';

/// The app's visual language.
///
/// This was `ColorScheme.fromSeed` and nothing else, which is Material's own
/// look wearing a school's colour: grey-white cards on grey, 12px corners,
/// everything the same weight. Correct, and completely characterless — the
/// wrong register for something a parent opens to find out about their
/// four-year-old.
///
/// So the palette is built rather than derived. The school's own colour anchors
/// it, because each school gets its own build; everything around it is fixed so
/// the app holds together whatever colour that is. Warm paper instead of grey,
/// an apricot accent that sits beside any brand hue without fighting it, and
/// generous corners — a preschool app should feel closer to a picture book than
/// to a banking form.
class AppTheme {
  const AppTheme._();

  /// The school's colour, baked in at build time. Poetree navy when a build has
  /// not been configured yet.
  static Color get brand {
    final hex = SchoolConfig.primaryColorHex.replaceAll('#', '');
    final value = int.tryParse(hex, radix: 16);
    if (value == null || hex.length != 6) return const Color(0xFF16307C);
    return Color(0xFF000000 | value);
  }

  /// Fixed companions. Deliberately not derived from the school colour: a
  /// school with a red brand would otherwise get red "present" ticks and red
  /// encouragement, and every signal would read as an alarm.
  static const apricot = Color(0xFFE8A33D);
  static const apricotSoft = Color(0xFFFDF0DC);
  static const leaf = Color(0xFF2E9469);
  static const leafSoft = Color(0xFFDDF2E8);
  static const coral = Color(0xFFE05A47);
  static const coralSoft = Color(0xFFFCE4E0);
  static const sky = Color(0xFF3B93C4);
  static const skySoft = Color(0xFFE0F0F8);

  /// Warm paper rather than cool grey. The difference is small on a good screen
  /// and considerable on the cheap ones these apps actually run on.
  static const _paper = Color(0xFFFAF8F5);
  static const _card = Color(0xFFFFFFFF);
  static const _ink = Color(0xFF1E2230);
  static const _inkSoft = Color(0xFF525A6E);
  static const _hairline = Color(0xFFE9E4DC);

  static const _paperDark = Color(0xFF14161D);
  static const _cardDark = Color(0xFF1D2029);
  static const _inkDark = Color(0xFFF1EFEC);
  static const _inkSoftDark = Color(0xFFA6ACBC);
  static const _hairlineDark = Color(0xFF2C303B);

  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;

    // A deep brand colour is unreadable on a dark ground, so it is lifted for
    // dark mode rather than used as-is.
    final primary = isDark ? _lighten(brand, 0.42) : brand;
    final ground = isDark ? _paperDark : _paper;
    final card = isDark ? _cardDark : _card;
    final ink = isDark ? _inkDark : _ink;
    final inkSoft = isDark ? _inkSoftDark : _inkSoft;
    final hairline = isDark ? _hairlineDark : _hairline;

    final scheme =
        ColorScheme.fromSeed(seedColor: brand, brightness: brightness).copyWith(
          primary: primary,
          onPrimary: isDark ? const Color(0xFF10131A) : Colors.white,
          primaryContainer: isDark
              ? _mix(brand, _cardDark, 0.72)
              : _tint(brand, 0.92),
          onPrimaryContainer: isDark
              ? _lighten(brand, 0.55)
              : _darken(brand, 0.25),
          secondary: apricot,
          onSecondary: const Color(0xFF2A1B05),
          secondaryContainer: isDark ? const Color(0xFF3A2C13) : apricotSoft,
          onSecondaryContainer: isDark
              ? const Color(0xFFF6D6A4)
              : const Color(0xFF6B4508),
          tertiary: sky,
          tertiaryContainer: isDark ? const Color(0xFF17323F) : skySoft,
          onTertiaryContainer: isDark
              ? const Color(0xFFBEE1F2)
              : const Color(0xFF12455C),
          error: coral,
          errorContainer: isDark ? const Color(0xFF43201A) : coralSoft,
          onErrorContainer: isDark
              ? const Color(0xFFF8C4BB)
              : const Color(0xFF8A2417),
          surface: card,
          onSurface: ink,
          onSurfaceVariant: inkSoft,
          surfaceContainerHighest: isDark
              ? const Color(0xFF262A35)
              : const Color(0xFFF1EDE7),
          outline: inkSoft,
          outlineVariant: hairline,
        );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      fontFamily: 'Poppins',
      scaffoldBackgroundColor: ground,

      // The status bar takes the page's colour rather than sitting in its own.
      appBarTheme: AppBarTheme(
        backgroundColor: ground,
        surfaceTintColor: Colors.transparent,
        foregroundColor: ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: 'Poppins',
          fontSize: 19,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.2,
          color: ink,
        ),
        systemOverlayStyle: isDark
            ? SystemUiOverlayStyle.light
            : SystemUiOverlayStyle.dark,
      ),

      textTheme: _typography(ink, inkSoft),

      // 22px corners throughout. Material's 12 reads administrative; this is
      // softer without tipping into novelty.
      cardTheme: CardThemeData(
        elevation: 0,
        color: card,
        surfaceTintColor: Colors.transparent,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: BorderSide(color: hairline),
        ),
      ),

      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        titleTextStyle: TextStyle(
          fontFamily: 'Poppins',
          fontSize: 15.5,
          fontWeight: FontWeight.w600,
          color: ink,
        ),
        subtitleTextStyle: TextStyle(
          fontFamily: 'Poppins',
          fontSize: 13,
          color: inkSoft,
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? const Color(0xFF23262F) : Colors.white,
        border: _field(hairline),
        enabledBorder: _field(hairline),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide(color: primary, width: 1.8),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 18,
        ),
        labelStyle: TextStyle(color: inkSoft, fontFamily: 'Poppins'),
      ),

      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(54),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          textStyle: const TextStyle(
            fontFamily: 'Poppins',
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: primary,
          textStyle: const TextStyle(
            fontFamily: 'Poppins',
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      chipTheme: ChipThemeData(
        side: BorderSide(color: hairline),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        labelStyle: TextStyle(
          fontFamily: 'Poppins',
          fontSize: 13,
          fontWeight: FontWeight.w500,
          color: ink,
        ),
        selectedColor: isDark ? _mix(brand, _cardDark, 0.7) : _tint(brand, 0.9),
      ),

      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: card,
        surfaceTintColor: Colors.transparent,
        indicatorColor: isDark
            ? _mix(brand, _cardDark, 0.66)
            : _tint(brand, 0.88),
        indicatorShape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
        height: 68,
        elevation: 0,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontFamily: 'Poppins',
            fontSize: 11.5,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w600
                : FontWeight.w400,
            color: states.contains(WidgetState.selected) ? primary : inkSoft,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: 23,
            color: states.contains(WidgetState.selected) ? primary : inkSoft,
          ),
        ),
      ),

      dividerTheme: DividerThemeData(color: hairline, thickness: 1, space: 1),

      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: ink,
        contentTextStyle: TextStyle(
          fontFamily: 'Poppins',
          color: ground,
          fontSize: 14,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),

      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: card,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
      ),

      dialogTheme: DialogThemeData(
        backgroundColor: card,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),

      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: primary,
        linearTrackColor: isDark
            ? const Color(0xFF2C303B)
            : const Color(0xFFEDE8E1),
        linearMinHeight: 7,
      ),
    );
  }

  static OutlineInputBorder _field(Color line) => OutlineInputBorder(
    borderRadius: BorderRadius.circular(18),
    borderSide: BorderSide(color: line),
  );

  /// Poppins across the board, but with the scale actually set. The default
  /// Material ramp puts a child's name at the same weight as a table label.
  static TextTheme _typography(Color ink, Color inkSoft) => TextTheme(
    displaySmall: TextStyle(
      fontSize: 32,
      height: 1.12,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.8,
      color: ink,
    ),
    headlineMedium: TextStyle(
      fontSize: 26,
      height: 1.18,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.5,
      color: ink,
    ),
    headlineSmall: TextStyle(
      fontSize: 22,
      height: 1.2,
      fontWeight: FontWeight.w600,
      letterSpacing: -0.3,
      color: ink,
    ),
    titleLarge: TextStyle(
      fontSize: 19,
      height: 1.25,
      fontWeight: FontWeight.w600,
      letterSpacing: -0.2,
      color: ink,
    ),
    titleMedium: TextStyle(
      fontSize: 16,
      height: 1.3,
      fontWeight: FontWeight.w600,
      color: ink,
    ),
    titleSmall: TextStyle(
      fontSize: 14,
      height: 1.3,
      fontWeight: FontWeight.w600,
      color: ink,
    ),
    bodyLarge: TextStyle(fontSize: 16, height: 1.5, color: ink),
    bodyMedium: TextStyle(fontSize: 14.5, height: 1.5, color: ink),
    bodySmall: TextStyle(fontSize: 12.5, height: 1.45, color: inkSoft),
    labelLarge: TextStyle(
      fontSize: 14,
      fontWeight: FontWeight.w600,
      color: ink,
    ),
    // Uppercase eyebrows need the tracking or they read as a mistake.
    labelSmall: TextStyle(
      fontSize: 11,
      fontWeight: FontWeight.w700,
      letterSpacing: 1.1,
      color: inkSoft,
    ),
  );

  static Color _tint(Color c, double amount) =>
      Color.lerp(c, Colors.white, amount)!;
  static Color _darken(Color c, double amount) =>
      Color.lerp(c, Colors.black, amount)!;
  static Color _lighten(Color c, double amount) =>
      Color.lerp(c, Colors.white, amount)!;
  static Color _mix(Color a, Color b, double t) => Color.lerp(a, b, t)!;
}
