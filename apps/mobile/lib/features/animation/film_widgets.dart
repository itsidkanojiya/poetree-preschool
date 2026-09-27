import 'package:flutter/material.dart';

import '../../core/assets/app_assets.dart';
import '../../core/theme/play_palette.dart';
import '../../core/widgets/art.dart';

/// The picture for a subject, from the asset pack, on a white tile.
///
/// Which picture is [SubjectArt]'s decision: the publisher's chosen key, or
/// the subject's name when they left it on the plain book.
class SubjectBadge extends StatelessWidget {
  const SubjectBadge({
    required this.icon,
    required this.name,
    required this.tone,
    this.size = 56,
    super.key,
  });

  final String icon;
  final String name;
  final PlayTone tone;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.08),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(size * 0.3),
        boxShadow: [
          BoxShadow(
            color: tone.deep.withValues(alpha: 0.16),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ArtIcon(
        SubjectArt.forSubject(icon: icon, name: name),
        size: size * 0.84,
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

/// How far through the films a child is — the card under each banner.
class FilmProgressCard extends StatelessWidget {
  const FilmProgressCard({
    required this.title,
    required this.done,
    required this.total,
    this.emptyText = 'Watch the story, then play.',
    super.key,
  });

  final String title;
  final int done;
  final int total;
  final String emptyText;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final allDone = total > 0 && done >= total;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: FilmColors.violet.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (total > 0)
                Text(
                  '$done / $total',
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: allDone ? FilmColors.mint : FilmColors.violet,
                    fontWeight: FontWeight.w800,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            total == 0
                ? emptyText
                : allDone
                ? 'All $total films watched — well done!'
                : '$done of $total films watched',
            style: theme.textTheme.bodySmall,
          ),
          if (total > 0) ...[
            const SizedBox(height: 10),
            FilmProgressBar(
              done: done,
              total: total,
              color: allDone ? FilmColors.mint : FilmColors.violet,
              track: FilmColors.violet.withValues(alpha: 0.12),
            ),
          ],
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
