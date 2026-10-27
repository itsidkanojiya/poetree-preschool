import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/audio/speech_service.dart';
import '../../core/theme/theme_controller.dart';
import '../../core/widgets/kid_sky.dart';

/// Settings: whether the app reads aloud, and how it looks.
///
/// Only what the app can actually do. Both settings are the app's own — the
/// voice is [SpeechService]'s, saved by it and obeyed by every activity that
/// speaks; the look is [ThemeController]'s, saved by it and restored before
/// the first frame — so this page only shows and changes them.

abstract final class SettingsArt {
  static const _dir = 'assets/announcements_settings_ui';
  static const gear = '$_dir/gear.svg';
  static const speaker = '$_dir/speaker.svg';
  static const sun = '$_dir/sun.svg';
  static const moon = '$_dir/moon.svg';
  static const phone = '$_dir/phone.svg';
  static const check = '$_dir/check.svg';
  static const star = '$_dir/star.svg';
}

const _orange = Color(0xFFF7A928);
const _blue = Color(0xFF3B82F6);
const _purple = Color(0xFF6D5BD0);

class SettingsView extends StatelessWidget {
  const SettingsView({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Get.find<ThemeController>();
    final voice = Get.isRegistered<SpeechService>()
        ? Get.find<SpeechService>()
        : null;

    return KidSkyPage(
      title: 'Settings',
      subtitle: 'Choose how the app sounds and looks.',
      badge: SettingsArt.gear,
      badgeColour: _blue,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
        children: [
          if (voice != null) ...[
            const _Section(
              icon: SettingsArt.speaker,
              colour: _orange,
              title: 'Sound',
              text:
                  'The app reads each activity out loud, for children who '
                  'cannot read it themselves.',
            ),
            const SizedBox(height: 10),
            Obx(() => _SoundCard(on: voice.isOn.value, onChanged: voice.setOn)),
            const SizedBox(height: 24),
          ],
          const _Section(
            icon: SettingsArt.sun,
            colour: _orange,
            title: 'Appearance',
            text:
                'The app opens light. Choose dark if you prefer it, or let '
                'your phone decide.',
          ),
          const SizedBox(height: 10),
          // Obx here rather than around a returned widget: the rows read
          // `mode`, so this is where the subscription has to be.
          Obx(
            () => KidCard(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(
                children: [
                  for (final option in Appearance.all)
                    _AppearanceRow(
                      option: option,
                      selected: theme.mode.value == option.mode,
                      onTap: () {
                        unawaited(theme.choose(option.mode));
                        unawaited(showAppearanceSheet(context));
                      },
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A section's heading: its picture, its name and what it is for.
class _Section extends StatelessWidget {
  const _Section({
    required this.icon,
    required this.colour,
    required this.title,
    required this.text,
  });

  final String icon;
  final Color colour;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    final palette = KidSkyPalette.of(context);
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: palette.wash(colour),
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: KidIconArt(icon, colour: colour, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    title,
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: palette.ink,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  text,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: palette.quiet,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Read activities aloud: on, or silent.
class _SoundCard extends StatelessWidget {
  const _SoundCard({required this.on, required this.onChanged});

  final bool on;
  final Future<void> Function(bool on) onChanged;

  @override
  Widget build(BuildContext context) {
    final palette = KidSkyPalette.of(context);
    final theme = Theme.of(context);
    return KidCard(
      onTap: () => onChanged(!on),
      child: Semantics(
        toggled: on,
        label: 'Read activities aloud',
        excludeSemantics: true,
        child: Row(
          children: [
            _IconTile(
              icon: SettingsArt.speaker,
              colour: on ? _blue : palette.quiet,
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Read activities aloud',
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: palette.ink,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    on
                        // Said plainly: a room of twenty phones all saying
                        // "well done" at once is a real place.
                        ? 'Turn this off in a classroom.'
                        : 'The app stays silent.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: palette.quiet,
                    ),
                  ),
                ],
              ),
            ),
            Switch(
              value: on,
              onChanged: onChanged,
              activeThumbColor: Colors.white,
              activeTrackColor: _orange,
            ),
          ],
        ),
      ),
    );
  }
}

class _IconTile extends StatelessWidget {
  const _IconTile({required this.icon, required this.colour});

  final String icon;
  final Color colour;

  @override
  Widget build(BuildContext context) {
    final palette = KidSkyPalette.of(context);
    return Container(
      width: 46,
      height: 46,
      decoration: BoxDecoration(
        color: palette.wash(colour),
        borderRadius: BorderRadius.circular(14),
      ),
      alignment: Alignment.center,
      child: KidIconArt(icon, colour: colour, size: 24),
    );
  }
}

/// One way the app can look: its name, a line about it, and its picture.
class Appearance {
  const Appearance._(
    this.mode,
    this.title,
    this.subtitle,
    this.icon,
    this.colour,
  );

  final ThemeMode mode;
  final String title;
  final String subtitle;
  final String icon;
  final Color colour;

  static const system = Appearance._(
    ThemeMode.system,
    'Match my phone',
    'Follows your phone’s setting',
    SettingsArt.phone,
    _blue,
  );
  static const light = Appearance._(
    ThemeMode.light,
    'Light',
    'Warm paper, the way it was drawn',
    SettingsArt.sun,
    _orange,
  );
  static const dark = Appearance._(
    ThemeMode.dark,
    'Dark',
    'Easier at bedtime',
    SettingsArt.moon,
    _purple,
  );

  /// In the order they are offered.
  static const all = [system, light, dark];
}

/// A row in the Appearance card: the chosen one tinted with a tick.
class _AppearanceRow extends StatelessWidget {
  const _AppearanceRow({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  final Appearance option;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = KidSkyPalette.of(context);
    final theme = Theme.of(context);
    return Semantics(
      button: true,
      selected: selected,
      label: '${option.title}. ${option.subtitle}',
      excludeSemantics: true,
      child: Material(
        color: selected ? palette.wash(_orange) : Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                SizedBox(
                  width: 32,
                  child: KidIconArt(
                    option.icon,
                    colour: option.colour,
                    size: 26,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        option.title,
                        style: theme.textTheme.titleSmall?.copyWith(
                          color: palette.ink,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        option.subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: palette.quiet,
                        ),
                      ),
                    ],
                  ),
                ),
                _Tick(selected: selected),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The orange tick on the chosen option; an empty ring on the others.
class _Tick extends StatelessWidget {
  const _Tick({required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    final palette = KidSkyPalette.of(context);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: selected ? _orange : Colors.transparent,
        border: Border.all(
          color: selected ? _orange : palette.quiet.withValues(alpha: 0.5),
          width: 2,
        ),
      ),
      alignment: Alignment.center,
      child: selected
          ? const KidIconArt(SettingsArt.check, colour: Colors.white, size: 18)
          : null,
    );
  }
}

/// The "Choose Appearance" sheet: each look as a card with its own little
/// picture. A choice applies at once, so the page behind shows it; Done
/// closes.
Future<void> showAppearanceSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    // The sheet paints itself, from the theme as it is now: choosing Dark
    // turns the open sheet dark too, which a colour fixed when it opened
    // would not.
    backgroundColor: Colors.transparent,
    elevation: 0,
    builder: (_) => const AppearanceSheet(),
  );
}

class AppearanceSheet extends StatelessWidget {
  const AppearanceSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Get.find<ThemeController>();
    final palette = KidSkyPalette.of(context);
    final text = Theme.of(context).textTheme;

    return Material(
      color: palette.card,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
          child: Obx(
            () => Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 40,
                  height: 5,
                  margin: const EdgeInsets.only(bottom: 18),
                  decoration: BoxDecoration(
                    color: palette.quiet.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
                Text(
                  'Choose Appearance',
                  style: text.titleLarge?.copyWith(
                    color: palette.ink,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'The app opens light. Choose dark if you prefer it, or let '
                  'your phone decide.',
                  textAlign: TextAlign.center,
                  style: text.bodyMedium?.copyWith(color: palette.quiet),
                ),
                const SizedBox(height: 16),
                for (final option in Appearance.all) ...[
                  _AppearanceCard(
                    option: option,
                    selected: theme.mode.value == option.mode,
                    onTap: () => theme.choose(option.mode),
                  ),
                  const SizedBox(height: 12),
                ],
                const SizedBox(height: 4),
                SizedBox(
                  width: double.infinity,
                  height: 54,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: _orange,
                      foregroundColor: Colors.white,
                      shape: const StadiumBorder(),
                      textStyle: text.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Done'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// One look, as a card in the sheet: its name and line, the tick, and a
/// small scene of it underneath.
class _AppearanceCard extends StatelessWidget {
  const _AppearanceCard({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  final Appearance option;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = KidSkyPalette.of(context);
    final text = Theme.of(context).textTheme;
    final tint = option.mode == ThemeMode.dark
        ? palette.wash(_purple)
        : selected
        ? palette.wash(_orange)
        : palette.card;

    return Semantics(
      button: true,
      selected: selected,
      label: '${option.title}. ${option.subtitle}',
      excludeSemantics: true,
      child: Material(
        type: MaterialType.transparency,
        child: Ink(
          decoration: BoxDecoration(
            color: tint,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: selected ? _orange : palette.line,
              width: selected ? 2 : 1,
            ),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(22),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
              child: Column(
                children: [
                  Row(
                    children: [
                      KidIconArt(option.icon, colour: option.colour, size: 28),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              option.title,
                              style: text.titleMedium?.copyWith(
                                color: palette.ink,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            Text(
                              option.subtitle,
                              style: text.bodySmall?.copyWith(
                                color: palette.quiet,
                              ),
                            ),
                          ],
                        ),
                      ),
                      _Tick(selected: selected),
                    ],
                  ),
                  const SizedBox(height: 6),
                  SizedBox(
                    height: 64,
                    width: double.infinity,
                    child: CustomPaint(painter: _Scene(option.mode)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The little picture under each look: two phones, a sunny meadow, a night
/// sky.
class _Scene extends CustomPainter {
  const _Scene(this.mode);

  final ThemeMode mode;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final centre = w / 2;

    void hill(Color colour, double top) {
      canvas.drawPath(
        Path()
          ..moveTo(centre - 110, h)
          ..quadraticBezierTo(centre - 55, top, centre, h * 0.72)
          ..quadraticBezierTo(centre + 60, top + 6, centre + 110, h)
          ..close(),
        Paint()..color = colour,
      );
    }

    switch (mode) {
      case ThemeMode.system:
        hill(const Color(0xFFD9F2E4), h * 0.5);
        for (final (dx, paper, glyph) in [
          (-30.0, const Color(0xFFFFF4D6), const Color(0xFFF7A928)),
          (30.0, const Color(0xFF2E3A7A), const Color(0xFFFFE08A)),
        ]) {
          final phone = RRect.fromRectAndRadius(
            Rect.fromCenter(
              center: Offset(centre + dx, h * 0.48),
              width: 34,
              height: 54,
            ),
            const Radius.circular(7),
          );
          canvas
            ..drawRRect(phone, Paint()..color = const Color(0xFF3B82F6))
            ..drawRRect(phone.deflate(3), Paint()..color = paper)
            ..drawCircle(
              Offset(centre + dx, h * 0.46),
              7,
              Paint()..color = glyph,
            );
        }
      case ThemeMode.light:
        hill(const Color(0xFF9BD873), h * 0.45);
        final sun = Offset(centre, h * 0.36);
        final rays = Paint()
          ..color = const Color(0xFFFFC83D)
          ..strokeWidth = 2.4
          ..strokeCap = StrokeCap.round;
        for (var i = 0; i < 8; i++) {
          final angle = i * math.pi / 4;
          final d = Offset(math.cos(angle), math.sin(angle));
          canvas.drawLine(sun + d * 16, sun + d * 22, rays);
        }
        canvas.drawCircle(sun, 13, Paint()..color = const Color(0xFFFFD84D));
      case ThemeMode.dark:
        final sky = RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset(centre, h * 0.5),
            width: 220,
            height: h,
          ),
          const Radius.circular(16),
        );
        canvas
          ..drawRRect(sky, Paint()..color = const Color(0xFF1E2A6B))
          ..save()
          ..clipRRect(sky);
        hill(const Color(0xFF1F6F5C), h * 0.6);
        canvas
          ..drawCircle(
            Offset(centre + 40, h * 0.32),
            12,
            Paint()..color = const Color(0xFFFFE08A),
          )
          ..drawCircle(
            Offset(centre + 46, h * 0.27),
            11,
            Paint()..color = const Color(0xFF1E2A6B),
          );
        for (final (x, y) in [
          (-70.0, 0.25),
          (-30.0, 0.15),
          (10.0, 0.3),
          (80.0, 0.2),
        ]) {
          canvas.drawCircle(
            Offset(centre + x, h * y),
            1.8,
            Paint()..color = Colors.white,
          );
        }
        canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_Scene oldDelegate) => oldDelegate.mode != mode;
}
