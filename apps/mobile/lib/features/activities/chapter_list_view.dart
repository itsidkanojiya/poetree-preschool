import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/routes/app_pages.dart';
import '../../core/theme/kid_icons.dart';
import '../../core/theme/play_palette.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/authed_image.dart';
import '../../core/widgets/squish.dart';
import 'chapter_list_controller.dart';

/// A book's contents page, as a child sees it.
///
/// Tapping a book used to drop straight into every page it contains. A book is
/// taught a chapter at a time, and the film that opens a chapter belongs to
/// that chapter — so this is the step where a child chooses what they are
/// doing, and where the padlock actually means something.
class ChapterListView extends GetView<ChapterListController> {
  const ChapterListView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(controller.bookName)),
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty:
              controller.chapters.isEmpty && controller.loosePages.value == 0,
          onRetry: controller.load,
          emptyTitle: 'Nothing in this book yet',
          emptyMessage:
              'Your school’s books fill up over the year. Try again soon.',
          builder: (context) => ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              for (final (index, chapter) in controller.chapters.indexed)
                _ChapterCard(
                  chapter: chapter,
                  position: index + 1,
                  onTap: () => Get.toNamed<void>(
                    AppRoutes.activities,
                    arguments: {
                      'studentId': controller.studentId,
                      'bookId': controller.bookId,
                      'bookName': chapter.name,
                      'chapterId': chapter.id,
                    },
                  ),
                ),

              // Pages filed in the book but under no chapter. Reachable, or
              // they would exist and never be openable by anybody.
              if (controller.loosePages.value > 0)
                _ChapterCard(
                  position: controller.chapters.length + 1,
                  chapter: ShelfChapter(
                    id: '',
                    name: 'Everything else',
                    number: null,
                    isUnlocked: true,
                    pageCount: controller.loosePages.value,
                  ),
                  onTap: () => Get.toNamed<void>(
                    AppRoutes.activities,
                    arguments: {
                      'studentId': controller.studentId,
                      'bookId': controller.bookId,
                      'bookName': controller.bookName,
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChapterCard extends StatelessWidget {
  const _ChapterCard({
    required this.chapter,
    required this.position,
    required this.onTap,
  });

  final ShelfChapter chapter;

  /// Where it sits in the contents page.
  ///
  /// Shown instead of the stored number, which is null for every chapter
  /// written before numbering became automatic — those were rendering as a
  /// bullet, which tells a child nothing about which one comes first.
  final int position;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = toneFor(chapter.name);
    final locked = chapter.hasFilm && !chapter.isUnlocked;

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Squish(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            color: tone.wash,
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: tone.deep.withValues(alpha: 0.14),
                blurRadius: 12,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              // The chapter's picture when it has one, and its number when it
              // does not. Big enough either way to be the thing a child aims
              // at.
              _ChapterMark(
                chapter: chapter,
                position: position,
                tone: tone,
                locked: locked,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      chapter.name,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: tone.deep,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      locked
                          ? 'Watch the film to open this'
                          : [
                              // A chapter that has been opened still says it
                              // has a film: a child who liked it wants it
                              // again, and this is the way back to it.
                              if (chapter.hasFilm) 'Film',
                              if (chapter.pageCount > 0)
                                '${chapter.pageCount} to do'
                              else
                                'Nothing to do here yet',
                            ].join(' · '),
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: tone.ink,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: tone.ink),
            ],
          ),
        ),
      ),
    );
  }
}


/// The square at the front of a chapter row.
///
/// A picture if the publisher drew one, because that is what a child recognises
/// — the same reason the shelf shows covers rather than a list of titles. The
/// number stays either way, in a corner: it is how the chapter is referred to
/// out loud ("we're on chapter three"), and losing it to the artwork would make
/// the contents page unreadable to the adult sitting alongside.
///
/// When a film is still to be watched, the film wins the square. That is the
/// thing to do next, and it is the only state where the chapter is closed.
class _ChapterMark extends StatelessWidget {
  const _ChapterMark({
    required this.chapter,
    required this.position,
    required this.tone,
    required this.locked,
  });

  final ShelfChapter chapter;
  final int position;
  final PlayTone tone;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final number = '${chapter.number ?? position}';
    final cover = chapter.coverPath;

    return SizedBox(
      width: 56,
      height: 56,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Container(color: Colors.white.withValues(alpha: 0.85)),

            if (cover != null) AuthedImage(path: cover, fit: BoxFit.cover),

            if (locked)
              // Over the picture rather than instead of it: the chapter still
              // looks like itself while it says what has to happen first.
              Container(
                color: cover == null
                    ? Colors.transparent
                    : Colors.black.withValues(alpha: 0.35),
                alignment: Alignment.center,
                child: KidIcon(
                  KidGlyph.film,
                  size: 30,
                  color: cover == null ? tone.ink : Colors.white,
                ),
              )
            else if (cover == null)
              Center(
                child: Text(
                  number,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: tone.deep,
                  ),
                ),
              ),

            // Kept in the corner once there is a picture, so the running order
            // survives the artwork.
            if (cover != null)
              Positioned(
                left: 4,
                bottom: 4,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 1,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    number,
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: tone.deep,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
