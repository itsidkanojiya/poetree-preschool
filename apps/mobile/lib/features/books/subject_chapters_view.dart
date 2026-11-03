import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/play_palette.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/authed_image.dart';
import '../../core/widgets/squish.dart';
import '../animation/film_chapter_view.dart';
import '../animation/film_controllers.dart';
import '../animation/film_widgets.dart';

/// A subject, opened in Learning: its chapters, in running order.
///
/// A subject is its book, so there is no shelf in between. Each chapter is a
/// card saying what it holds — a video, pages to read, activities and how many
/// are done — and opens onto all of them.
class SubjectChaptersView extends GetView<FilmVideosController> {
  const SubjectChaptersView({super.key});

  bool _isEmpty(FilmChapter chapter) =>
      !chapter.hasFilm &&
      !chapter.hasPdf &&
      controller.activitiesKnown &&
      controller.activitiesOf(chapter.id).isEmpty;

  void _open(FilmChapter chapter) {
    if (_isEmpty(chapter)) {
      Get
        ..closeAllSnackbars()
        ..snackbar(
          chapter.name,
          'Nothing in this chapter yet. It will appear here soon.',
          snackPosition: SnackPosition.BOTTOM,
          margin: const EdgeInsets.all(16),
        );
      return;
    }
    Get.to<void>(
      () => FilmChapterView(videos: controller, chapterId: chapter.id),
      preventDuplicates: true,
    );
  }

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
          emptyTitle: 'No chapters yet',
          emptyMessage: 'This subject’s chapters will appear here.',
          builder: (context) {
            final books = controller.books.toList();
            // One book is the subject itself and needs no heading. More than
            // one — older content filed twice — reads book by book.
            final headed = books.length > 1;
            // Read here so the cards tick as activities come in and get done.
            final activities = controller.activities;

            return RefreshIndicator(
              onRefresh: controller.load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                children: [
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
                    for (final (index, chapter) in book.chapters.indexed) ...[
                      _ChapterCard(
                        chapter: chapter,
                        number: chapter.number ?? index + 1,
                        activities: activities[chapter.id]?.length ?? 0,
                        done: controller.doneIn(chapter.id),
                        empty: _isEmpty(chapter),
                        onTap: () => _open(chapter),
                      ),
                      const SizedBox(height: 12),
                    ],
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

/// One chapter: its picture, and what is inside it.
class _ChapterCard extends StatelessWidget {
  const _ChapterCard({
    required this.chapter,
    required this.number,
    required this.activities,
    required this.done,
    required this.empty,
    required this.onTap,
  });

  final FilmChapter chapter;
  final int number;
  final int activities;
  final int done;

  /// Nothing in it yet: no video, no pages, no activities.
  final bool empty;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final tone = toneFor(chapter.name);
    final complete = activities > 0 && done == activities;

    return Opacity(
      opacity: empty ? 0.55 : 1,
      child: Squish(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: complete
                  ? FilmColors.mint.withValues(alpha: 0.6)
                  : colors.outlineVariant,
              width: complete ? 1.6 : 1,
            ),
          ),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: SizedBox(
                  width: 64,
                  height: 64,
                  child: chapter.coverPath != null
                      ? AuthedImage(path: chapter.coverPath!)
                      : ColoredBox(
                          color: tone.wash,
                          child: Center(
                            child: Text(
                              '$number',
                              style: theme.textTheme.headlineSmall?.copyWith(
                                color: tone.deep,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
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
                      'Chapter $number',
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
                          FilmTag(
                            chapter.isWatched ? 'Video watched' : 'Video',
                            color: chapter.isWatched
                                ? FilmColors.mint
                                : FilmColors.sky,
                          ),
                        if (chapter.hasPdf)
                          const FilmTag('Pages', color: FilmColors.sun),
                        if (activities > 0)
                          complete
                              ? const FilmTag(
                                  'Completed',
                                  color: FilmColors.mint,
                                )
                              : FilmTag(
                                  '$done/$activities activities',
                                  color: FilmColors.violet,
                                ),
                        if (empty)
                          FilmTag('Coming soon', color: colors.outline),
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
                  color: empty ? colors.outlineVariant : null,
                  gradient: empty
                      ? null
                      : LinearGradient(
                          colors: complete
                              ? const [FilmColors.mint, Color(0xFF1FA383)]
                              : FilmColors.banner,
                        ),
                ),
                child: Icon(
                  // What opening it starts with: the video until it has been
                  // watched, then the activities, else the pages.
                  empty
                      ? Icons.hourglass_top_rounded
                      : chapter.hasFilm && !chapter.isWatched
                      ? Icons.play_arrow_rounded
                      : activities > 0
                      ? Icons.extension_rounded
                      : chapter.hasPdf
                      ? Icons.menu_book_rounded
                      : Icons.replay_rounded,
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
