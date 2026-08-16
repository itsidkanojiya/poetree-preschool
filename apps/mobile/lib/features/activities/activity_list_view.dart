import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/routes/app_pages.dart';
import '../../core/widgets/async_view.dart';
import 'activity_controller.dart';
import 'activity_models.dart';

IconData _iconFor(String type) => switch (type) {
  'TRACING' => Icons.gesture,
  'MATCHING' => Icons.extension_outlined,
  'COUNTING' => Icons.pin_outlined,
  'SORTING' => Icons.category_outlined,
  'COLOURING' => Icons.palette_outlined,
  'FLASHCARD' => Icons.style_outlined,
  'RHYME' => Icons.music_note_outlined,
  _ => Icons.auto_stories_outlined,
};

/// What a child can play, grouped by the book it comes from.
///
/// By book because that is what a family recognises: the EVS book is a thing
/// they own, on a shelf, with the same pictures in it. Anything not filed under
/// a book falls back to the skill it builds, which is what the whole screen used
/// to be grouped by.
class ActivityListView extends GetView<ActivityListController> {
  const ActivityListView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(controller.bookName ?? 'Things to do')),
      body: Obx(() {
        final playable = controller.playable;

        // Book first, then the chapter within it — the two things printed on
        // the cover and the contents page, which is what a family recognises.
        final byBook = <String, List<ActivityDefinition>>{};
        for (final activity in playable) {
          final book = activity.bookName.isNotEmpty
              ? activity.bookName
              : activity.skillName;
          // Inside one book the app bar already says which book it is, so the
          // heading is the chapter alone. Across the whole shelf it has to
          // carry both or the chapters run together.
          final heading = controller.bookId != null
              ? (activity.chapterName.isEmpty
                    ? 'In this book'
                    : activity.chapterName)
              : (activity.chapterName.isEmpty
                    ? book
                    : '$book · ${activity.chapterName}');
          byBook.putIfAbsent(heading, () => []).add(activity);
        }

        return AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: playable.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'Nothing to play yet',
          emptyMessage:
              'Nothing from your school’s books yet. It will appear here.',
          builder: (context) => ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              // The film first, which is the order the book is meant to be
              // used in. Before this it was only met by tapping something
              // locked, which is a strange way to be introduced to it.
              if (controller.pendingAnimation != null)
                _WatchFirstCard(
                  title: controller.pendingAnimation!.bookName,
                  onPlay: () =>
                      controller.playAnimation(context, controller.bookId!),
                ),
              for (final entry in byBook.entries) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 12, 4, 8),
                  child: Text(
                    entry.key,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: Theme.of(context).colorScheme.outline,
                    ),
                  ),
                ),
                ...entry.value.map(
                  (activity) => Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor: activity.isLocked
                            ? Theme.of(
                                context,
                              ).colorScheme.surfaceContainerHighest
                            : Theme.of(context).colorScheme.primaryContainer,
                        child: Icon(
                          activity.isLocked
                              ? Icons.play_circle_outline_rounded
                              : _iconFor(activity.type),
                          color: activity.isLocked
                              ? Theme.of(context).colorScheme.outline
                              : Theme.of(
                                  context,
                                ).colorScheme.onPrimaryContainer,
                        ),
                      ),
                      title: Text(activity.title),
                      subtitle: Text(
                        activity.isLocked
                            // Not "locked": a four-year-old is being told what
                            // to do next, not refused.
                            ? 'Watch the film first'
                            : activity.content!.isScored
                            ? '${activity.content!.itemCount} questions'
                            : '${activity.content!.itemCount} cards to look at',
                      ),
                      trailing: Icon(
                        activity.isLocked
                            ? Icons.movie_outlined
                            : Icons.play_arrow_rounded,
                      ),
                      onTap: () => activity.isLocked
                          ? controller.openAnimation(context, activity)
                          : Get.toNamed<void>(
                              AppRoutes.activityPlay,
                              arguments: {
                                'activity': activity,
                                'studentId': controller.studentId,
                              },
                            ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        );
      }),
    );
  }
}

/// The film that opens a book, at the top of it.
class _WatchFirstCard extends StatelessWidget {
  const _WatchFirstCard({required this.title, required this.onPlay});

  final String title;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Material(
        color: colors.primaryContainer,
        borderRadius: BorderRadius.circular(22),
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: onPlay,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: colors.onPrimaryContainer.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                    Icons.play_arrow_rounded,
                    size: 28,
                    color: colors.onPrimaryContainer,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Watch this first',
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: colors.onPrimaryContainer,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        'The film for $title. Everything below opens after it.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: colors.onPrimaryContainer,
                        ),
                      ),
                    ],
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
