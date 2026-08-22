import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/routes/app_pages.dart';
import '../../core/widgets/async_view.dart';
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
              for (final chapter in controller.chapters)
                _ChapterCard(
                  chapter: chapter,
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
  const _ChapterCard({required this.chapter, required this.onTap});

  final ShelfChapter chapter;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final locked = chapter.hasFilm && !chapter.isUnlocked;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: locked ? colors.primaryContainer : colors.surface,
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: locked
                        ? colors.onPrimaryContainer.withValues(alpha: 0.12)
                        : colors.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  alignment: Alignment.center,
                  child: locked
                      // A play badge, not a padlock: the child is being offered
                      // something, not refused.
                      ? Icon(
                          Icons.play_arrow_rounded,
                          size: 28,
                          color: colors.onPrimaryContainer,
                        )
                      : Text(
                          chapter.number?.toString() ?? '•',
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: colors.onSurfaceVariant,
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
                          fontWeight: FontWeight.w700,
                          color: locked ? colors.onPrimaryContainer : null,
                        ),
                      ),
                      Text(
                        locked
                            ? 'Watch the film to open this'
                            : chapter.pageCount == 0
                            ? 'Nothing to do here yet'
                            : '${chapter.pageCount} to do',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: locked
                              ? colors.onPrimaryContainer
                              : colors.outline,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  color: locked ? colors.onPrimaryContainer : colors.outline,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
