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
      appBar: AppBar(title: const Text('Things to do')),
      body: Obx(() {
        final playable = controller.playable;

        final byBook = <String, List<ActivityDefinition>>{};
        for (final activity in playable) {
          final heading = activity.bookName.isNotEmpty
              ? activity.bookName
              : activity.skillName;
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
                        backgroundColor: Theme.of(
                          context,
                        ).colorScheme.primaryContainer,
                        child: Icon(
                          _iconFor(activity.type),
                          color: Theme.of(
                            context,
                          ).colorScheme.onPrimaryContainer,
                        ),
                      ),
                      title: Text(activity.title),
                      subtitle: Text(
                        activity.content!.isScored
                            ? '${activity.content!.itemCount} questions'
                            : '${activity.content!.itemCount} cards to look at',
                      ),
                      trailing: const Icon(Icons.play_arrow_rounded),
                      onTap: () => Get.toNamed<void>(
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
