import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/assets/app_assets.dart';
import '../../core/theme/play_palette.dart';
import '../../core/widgets/art.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/authed_image.dart';
import '../../core/widgets/squish.dart';
import 'film_controllers.dart';
import 'film_player_view.dart';
import 'film_widgets.dart';

/// The chapters of one book, each with its film.
///
/// Straight from the book's own contents in the publisher's order, so a new
/// chapter the publisher adds appears here without an app update.
class FilmChaptersView extends GetView<FilmChaptersController> {
  const FilmChaptersView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(controller.bookName)),
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.chapters.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'No chapters yet',
          emptyMessage: 'This book’s chapters will appear here.',
          builder: (context) {
            final chapters = controller.chapters.toList();
            final films = controller.withFilms.length;
            final watched = controller.watchedCount;

            return RefreshIndicator(
              onRefresh: controller.load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                children: [
                  // The 2D banner, or the 2D & 3D one when this book has
                  // chapters in both.
                  ArtBanner(
                    chapters.any((c) => c.has3d)
                        ? AppBanners.animation2d3d
                        : AppBanners.animation2d,
                    semanticLabel: '${controller.bookName} films',
                  ),
                  const SizedBox(height: 14),
                  FilmProgressCard(
                    title: controller.bookName,
                    done: watched,
                    total: films,
                    emptyText: 'No films in this book yet',
                  ),
                  const SizedBox(height: 16),
                  for (final (index, chapter) in chapters.indexed) ...[
                    _ChapterCard(
                      chapter: chapter,
                      position: index + 1,
                      art: controller.art,
                      onPlay: chapter.hasFilm
                          ? () => openFilm(controller, chapter.id)
                          : null,
                    ),
                    const SizedBox(height: 12),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

/// Opens the player at one chapter of the book the controller holds.
void openFilm(FilmChaptersController chapters, String chapterId) {
  final list = chapters.withFilms;
  final index = list.indexWhere((c) => c.id == chapterId);
  if (index < 0 || chapters.studentId == null) return;

  Get.to<void>(
    () => FilmPlayerView(chapters: chapters, playlist: list, startIndex: index),
  );
}

class _ChapterCard extends StatelessWidget {
  const _ChapterCard({
    required this.chapter,
    required this.position,
    required this.art,
    required this.onPlay,
  });

  final FilmChapter chapter;
  final int position;

  /// The subject's picture, for a chapter with none of its own.
  final String art;
  final VoidCallback? onPlay;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = toneFor(chapter.name);
    final colors = theme.colorScheme;

    return Squish(
      onTap: onPlay,
      child: Opacity(
        opacity: chapter.hasFilm ? 1 : 0.55,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: chapter.isWatched
                  ? FilmColors.mint.withValues(alpha: 0.6)
                  : colors.outlineVariant,
              width: chapter.isWatched ? 1.6 : 1,
            ),
          ),
          child: Row(
            children: [
              // The chapter's picture when it has one, otherwise its number
              // in its own colour.
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: SizedBox(
                  width: 64,
                  height: 64,
                  child: chapter.coverPath != null
                      ? AuthedImage(path: chapter.coverPath!)
                      // No picture of its own: the subject's, with the
                      // chapter's number on it.
                      : ColoredBox(
                          color: tone.wash,
                          child: Stack(
                            children: [
                              Center(child: ArtIcon(art, size: 50)),
                              Positioned(
                                right: 4,
                                bottom: 4,
                                child: Container(
                                  constraints: const BoxConstraints(
                                    minWidth: 22,
                                  ),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 5,
                                    vertical: 1,
                                  ),
                                  decoration: BoxDecoration(
                                    color: tone.ink,
                                    borderRadius: BorderRadius.circular(99),
                                  ),
                                  child: Text(
                                    '${chapter.number ?? position}',
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Chapter ${chapter.number ?? position}',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: tone.deep,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      chapter.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        height: 1.15,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        if (chapter.hasFilm)
                          const FilmTag('2D', color: FilmColors.sky),
                        if (chapter.has3d)
                          const FilmTag('3D', color: FilmColors.violet),
                        if (!chapter.hasFilm)
                          FilmTag('No film yet', color: colors.outline),
                        if (chapter.isWatched)
                          const FilmTag('Watched', color: FilmColors.mint),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (chapter.hasFilm)
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      colors: chapter.isWatched
                          ? const [FilmColors.mint, Color(0xFF1FA383)]
                          : FilmColors.banner,
                    ),
                  ),
                  child: Icon(
                    chapter.isWatched
                        ? Icons.replay_rounded
                        : Icons.play_arrow_rounded,
                    color: Colors.white,
                    size: 28,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
