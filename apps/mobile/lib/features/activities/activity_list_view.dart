import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/routes/app_pages.dart';
import '../../core/theme/kid_icons.dart';
import '../../core/theme/play_palette.dart';
import '../../core/widgets/squish.dart';
import '../../core/widgets/async_view.dart';
import 'activity_controller.dart';
import 'activity_models.dart';

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
      appBar: AppBar(
        title: Text(
          controller.bookName ??
              (controller.type == 'TRACING' ? 'Tracing' : 'Things to do'),
        ),
      ),
      body: Obx(() {
        final playable = controller.playable;

        // By chapter, which is what a book is divided into.
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
              for (final entry in groups.entries) ...[
                // Only when several chapters are on screen at once. Inside one
                // chapter the app bar already says which it is, and a heading
                // repeating it is a line of furniture.
                if (controller.chapterId == null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 12, 4, 8),
                    child: Text(
                      entry.key.title,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                  ),
                ...entry.value.map(
                  (activity) => _PageTile(
                    activity: activity,
                    onTap: () => Get.toNamed<void>(
                      AppRoutes.activityPlay,
                      arguments: {
                        'activity': activity,
                        'studentId': controller.studentId,
                      },
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

/// One thing to do, drawn to be aimed at.
///
/// This was a ListTile with a 24px Material icon in a grey circle — the same
/// row a settings screen uses, at the size an adult reads. What the page is
/// matters more than what it is called here: a child who cannot read the title
/// can still tell tracing from counting by the picture, so the picture leads
/// and it is drawn rather than borrowed.
class _PageTile extends StatelessWidget {
  const _PageTile({required this.activity, required this.onTap});

  final ActivityDefinition activity;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = toneFor(activity.title);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Squish(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            // The activity's own colour, not the theme's paper.
            //
            // This card was hardcoded white while its title took `onSurface`
            // from the theme — which is near-white in dark mode, so the titles
            // vanished into the card. Mixing a fixed colour with a theme one on
            // the same surface is the whole bug.
            //
            // A pastel wash with its own dark ink is readable whatever the
            // theme, because neither half depends on it — the same pairing the
            // shelf and the chapter list already use.
            color: tone.wash,
            borderRadius: BorderRadius.circular(22),
            boxShadow: [
              BoxShadow(
                color: tone.deep.withValues(alpha: 0.10),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(
                width: 54,
                height: 54,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.7),
                  borderRadius: BorderRadius.circular(18),
                ),
                alignment: Alignment.center,
                child: KidIcon(
                  glyphForActivity(activity.type),
                  size: 30,
                  color: tone.ink,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      activity.title,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        // Stated, never inherited — see the card colour above.
                        color: tone.deep,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      activity.content!.isScored
                          ? '${activity.content!.itemCount} questions'
                          : '${activity.content!.itemCount} cards to look at',
                      style: theme.textTheme.bodySmall?.copyWith(
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
