import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/routes/app_pages.dart';
import '../../core/theme/kid_icons.dart';
import '../../core/theme/play_palette.dart';
import '../../core/widgets/async_view.dart';
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
              // The chapter's number, or a film badge when the film comes
              // first. Big enough to be the thing a child aims at.
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.85),
                  borderRadius: BorderRadius.circular(18),
                ),
                alignment: Alignment.center,
                child: locked
                    ? KidIcon(KidGlyph.film, size: 30, color: tone.ink)
                    : Text(
                        '${chapter.number ?? position}',
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w900,
                          color: tone.deep,
                        ),
                      ),
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
