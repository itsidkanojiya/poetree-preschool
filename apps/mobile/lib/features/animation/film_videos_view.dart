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

/// A subject's videos, book by book.
///
/// Straight from the books' own contents in the publisher's order, so a video
/// the publisher adds appears here without an app update. Under each book's
/// name when the subject has more than one book; one plain list when it has
/// one.
class FilmVideosView extends GetView<FilmVideosController> {
  const FilmVideosView({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(controller.subjectName)),
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.books.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'No videos yet',
          emptyMessage: 'This subject’s videos will appear here.',
          builder: (context) {
            final books = controller.books.toList();
            final videos = controller.withFilms;
            final headed = books.length > 1;

            return RefreshIndicator(
              onRefresh: controller.load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                children: [
                  // The 2D banner, or the 2D & 3D one when this subject has
                  // videos in both.
                  ArtBanner(
                    videos.any((c) => c.has3d)
                        ? AppBanners.animation2d3d
                        : AppBanners.animation2d,
                    semanticLabel: '${controller.subjectName} videos',
                  ),
                  const SizedBox(height: 14),
                  FilmProgressCard(
                    title: controller.subjectName,
                    done: controller.watchedCount,
                    total: videos.length,
                    emptyText: 'No videos in this subject yet',
                  ),
                  const SizedBox(height: 16),
                  for (final book in books) ...[
                    if (headed)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(4, 4, 4, 10),
                        child: Text(
                          book.name,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: theme.colorScheme.outline,
                          ),
                        ),
                      ),
                    for (final (index, chapter) in book.films.indexed) ...[
                      _ChapterCard(
                        chapter: chapter,
                        position: index + 1,
                        art: controller.art,
                        onPlay: () => openFilm(controller, chapter.id),
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (headed) const SizedBox(height: 8),
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

/// Opens the player at one video of the subject the controller holds.
void openFilm(FilmVideosController videos, String chapterId) {
  final list = videos.withFilms;
  final index = list.indexWhere((c) => c.id == chapterId);
  if (index < 0 || videos.studentId == null) return;

  Get.to<void>(
    () => FilmPlayerView(videos: videos, playlist: list, startIndex: index),
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
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = toneFor(chapter.name);
    final colors = theme.colorScheme;

    return Squish(
      onTap: onPlay,
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
                                constraints: const BoxConstraints(minWidth: 22),
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
                      const FilmTag('2D', color: FilmColors.sky),
                      if (chapter.has3d)
                        const FilmTag('3D', color: FilmColors.violet),
                      if (chapter.isWatched)
                        const FilmTag('Watched', color: FilmColors.mint),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
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
    );
  }
}
