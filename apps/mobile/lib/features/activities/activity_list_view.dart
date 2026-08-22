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

        // By chapter, which is what a book is divided into and what a film
        // now introduces. The id travels with the heading so the film can sit
        // above exactly the pages it opens.
        final groups =
            <({String id, String title}), List<ActivityDefinition>>{};
        for (final activity in playable) {
          final book = activity.bookName.isNotEmpty
              ? activity.bookName
              : activity.skillName;

          // Inside one book the app bar already says which book it is, so the
          // heading is the chapter alone. Across the whole shelf it has to
          // carry both or the chapters run together.
          final title = controller.bookId != null
              ? (activity.chapterName.isEmpty
                    ? 'In this book'
                    : activity.chapterName)
              : (activity.chapterName.isEmpty
                    ? book
                    : '$book · ${activity.chapterName}');

          final key = (id: activity.chapterId, title: title);
          groups.putIfAbsent(key, () => []).add(activity);
        }

        final film = controller.film;

        return AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          // A chapter with a film and nothing written yet is not empty: the
          // film is the point of arriving here, and treating it as empty is
          // what left a child looking at "nothing to play" with a video sitting
          // one field away in the database.
          isEmpty: playable.isEmpty && film == null,
          onRetry: controller.load,
          emptyTitle: 'Nothing to play yet',
          emptyMessage:
              'Nothing from your school’s books yet. It will appear here.',
          builder: (context) => ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              // The film for this chapter, above everything it opens — which is
              // the order the chapter is meant to be used in.
              if (film != null) ...[
                _FilmCard(
                  title: film.chapterName,
                  watched: film.isUnlocked,
                  onPlay: () =>
                      controller.playAnimation(context, controller.chapterId!),
                ),
                if (playable.isEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
                    child: Text(
                      film.isUnlocked
                          ? 'Nothing to do in this chapter yet.'
                          : 'The things to do appear here once the film has been watched.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                  ),
              ],
              for (final entry in groups.entries) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 12, 4, 8),
                  child: Text(
                    entry.key.title,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: Theme.of(context).colorScheme.outline,
                    ),
                  ),
                ),

                // Across a whole book, each chapter's film sits above its own
                // pages. Inside one chapter the film is already at the top of
                // the screen, so it is not drawn twice.
                if (controller.chapterId == null &&
                    controller.films[entry.key.id] != null)
                  _FilmCard(
                    title: controller.films[entry.key.id]!.chapterName,
                    watched: controller.films[entry.key.id]!.isUnlocked,
                    onPlay: () =>
                        controller.playAnimation(context, entry.key.id),
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

/// The film that opens a chapter.
///
/// Two states, not one. Before it is watched it is an instruction — this comes
/// first, and the pages open after it. Afterwards it stays, quieter, because a
/// child who liked it wants it again and there is no other way back to it.
class _FilmCard extends StatelessWidget {
  const _FilmCard({
    required this.title,
    required this.watched,
    required this.onPlay,
  });

  final String title;
  final bool watched;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Material(
        color: watched
            ? colors.surfaceContainerHighest
            : colors.primaryContainer,
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
                    color: watched
                        ? colors.onSurfaceVariant.withValues(alpha: 0.12)
                        : colors.onPrimaryContainer.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                    watched ? Icons.replay_rounded : Icons.play_arrow_rounded,
                    size: 28,
                    color: watched
                        ? colors.onSurfaceVariant
                        : colors.onPrimaryContainer,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        watched ? 'Watch it again' : 'Watch this first',
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: watched
                              ? colors.onSurface
                              : colors.onPrimaryContainer,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        watched
                            ? 'The film for $title.'
                            : 'The film for $title. Everything below opens after it.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: watched
                              ? colors.onSurfaceVariant
                              : colors.onPrimaryContainer,
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
