import 'package:flutter/material.dart';

import '../../core/theme/play_palette.dart';

/// The picture for a subject, from the publisher's choice of icon.
///
/// Hindi and Gujarati get their own first letter rather than an icon: a child
/// learning अ recognises अ, and no icon set has one.
class SubjectBadge extends StatelessWidget {
  const SubjectBadge({
    required this.icon,
    required this.tone,
    this.size = 56,
    super.key,
  });

  final String icon;
  final PlayTone tone;
  final double size;

  static const _letters = {'hindi': 'अ', 'gujarati': 'અ'};

  static const _icons = <String, IconData>{
    'abc': Icons.abc_rounded,
    'numbers': Icons.onetwothree_rounded,
    'globe': Icons.public_rounded,
    'bulb': Icons.lightbulb_rounded,
    'music': Icons.music_note_rounded,
    'phonics': Icons.record_voice_over_rounded,
    'book': Icons.menu_book_rounded,
  };

  @override
  Widget build(BuildContext context) {
    final letter = _letters[icon];

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(size * 0.32),
        boxShadow: [
          BoxShadow(
            color: tone.deep.withValues(alpha: 0.16),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      alignment: Alignment.center,
      child: letter != null
          ? Text(
              letter,
              style: TextStyle(
                fontSize: size * 0.5,
                fontWeight: FontWeight.w800,
                color: tone.ink,
                height: 1.1,
              ),
            )
          : Icon(
              _icons[icon] ?? Icons.menu_book_rounded,
              size: size * 0.58,
              color: tone.ink,
            ),
    );
  }
}

/// A chunky, rounded progress bar in a subject's own colour.
class FilmProgressBar extends StatelessWidget {
  const FilmProgressBar({
    required this.done,
    required this.total,
    required this.color,
    this.track,
    super.key,
  });

  final int done;
  final int total;
  final Color color;
  final Color? track;

  @override
  Widget build(BuildContext context) {
    final value = total == 0 ? 0.0 : (done / total).clamp(0.0, 1.0);
    return ClipRRect(
      borderRadius: BorderRadius.circular(99),
      child: LinearProgressIndicator(
        value: value,
        minHeight: 8,
        color: color,
        backgroundColor: track ?? Colors.white.withValues(alpha: 0.7),
      ),
    );
  }
}

/// The bright banner at the top of each animation screen.
class FilmBanner extends StatelessWidget {
  const FilmBanner({
    required this.title,
    required this.subtitle,
    required this.colors,
    this.trailing,
    this.icon = Icons.movie_filter_rounded,
    super.key,
  });

  final String title;
  final String subtitle;
  final List<Color> colors;
  final Widget? trailing;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: colors,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(26),
        boxShadow: [
          BoxShadow(
            color: colors.last.withValues(alpha: 0.3),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.22),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Icon(icon, color: Colors.white, size: 32),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: theme.textTheme.titleLarge?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: Colors.white.withValues(alpha: 0.92),
                  ),
                ),
                if (trailing != null) ...[
                  const SizedBox(height: 10),
                  trailing!,
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The small "2D" / "3D" tag on a chapter.
class FilmTag extends StatelessWidget {
  const FilmTag(this.label, {required this.color, super.key});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          color: color,
        ),
      ),
    );
  }
}

/// The colours the whole animation module is drawn in.
abstract final class FilmColors {
  static const violet = Color(0xFF7B5CF0);
  static const pink = Color(0xFFF0648C);
  static const sun = Color(0xFFFFB547);
  static const mint = Color(0xFF2EC4A0);
  static const sky = Color(0xFF3FA9F5);

  static const banner = [violet, pink];
}
