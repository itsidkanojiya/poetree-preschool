import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/assets/app_assets.dart';
import '../../core/routes/app_pages.dart';
import '../../core/theme/kid_icons.dart';
import '../../core/theme/play_palette.dart';
import '../../core/widgets/art.dart';
import '../activities/activity_models.dart';
import '../activities/activity_places.dart';
import 'film_controllers.dart';
import 'film_player_view.dart';
import 'film_widgets.dart';

/// One chapter: its video first, then its activities.
///
/// The first time a child opens a chapter the video plays straight away, and
/// the activities stay shut until it has been watched to the end. After that
/// — this visit or any other, on any day — the chapter opens onto its
/// activities, with the video there to watch again whenever they like. Each
/// activity shows whether it is done, part-way (and where), or still to do;
/// the chapter is finished when every one of them is done.
class FilmChapterView extends StatefulWidget {
  const FilmChapterView({
    required this.videos,
    required this.chapterId,
    this.autoPlay = true,
    super.key,
  });

  final FilmVideosController videos;
  final String chapterId;

  /// Plays the video on a first visit. Off only in tests, which have no
  /// video player to open.
  final bool autoPlay;

  @override
  State<FilmChapterView> createState() => _FilmChapterViewState();
}

class _FilmChapterViewState extends State<FilmChapterView> {
  FilmVideosController get _videos => widget.videos;

  @override
  void initState() {
    super.initState();
    final chapter = _videos.chapterById(widget.chapterId);
    // Video first: on a first visit there is nothing else to do yet.
    if (widget.autoPlay && chapter != null && !chapter.isWatched) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _play(chapter);
      });
    }
  }

  void _play(FilmChapter chapter) {
    final hasActivities = _videos.activitiesOf(chapter.id).isNotEmpty;
    Get.to<void>(
      () => FilmPlayerView(
        videos: _videos,
        playlist: [chapter],
        startIndex: 0,
        // The finished screen leads back here, to the activities it opened.
        onActivities: hasActivities ? () => Get.back<void>() : null,
      ),
      preventDuplicates: true,
    );
  }

  Future<void> _open(FilmChapter chapter, ActivityDefinition activity) async {
    if (!chapter.isWatched) {
      Get
        ..closeAllSnackbars()
        ..snackbar(
          'Watch the video first',
          'The activities open when the video has been watched to the end.',
          snackPosition: SnackPosition.BOTTOM,
          margin: const EdgeInsets.all(16),
        );
      return;
    }

    await Get.toNamed<void>(
      AppRoutes.activityPlay,
      arguments: {
        'activity': activity,
        'studentId': _videos.studentId,
        'startAt': _videos.places[activity.id],
        'onDone': () => _videos.markActivityDone(activity.id),
      },
    );
    // Where they left off, and the school's own word on what is done.
    await _videos.refreshPlaces();
    unawaited(_videos.loadActivities());
  }

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final chapter = _videos.chapterById(widget.chapterId);
      if (chapter == null) {
        return Scaffold(
          appBar: AppBar(),
          body: const Center(child: Text('This chapter is no longer here.')),
        );
      }

      final activities = _videos.activitiesOf(chapter.id);
      final done = _videos.doneIn(chapter.id);
      final complete = _videos.isComplete(chapter);
      final loading = _videos.activitiesLoading.value && activities.isEmpty;
      final problem = _videos.activitiesError.value;

      return Scaffold(
        appBar: AppBar(
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(chapter.name, maxLines: 1, overflow: TextOverflow.ellipsis),
              Text(
                _videos.bookNameOf(chapter.id),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
        body: RefreshIndicator(
          onRefresh: _videos.loadActivities,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              _VideoStep(chapter: chapter, onPlay: () => _play(chapter)),
              const SizedBox(height: 16),
              if (complete && activities.isNotEmpty) ...[
                const _ChapterComplete(),
                const SizedBox(height: 16),
              ],
              _StepTitle(
                step: 2,
                title: 'Activities',
                trailing: activities.isEmpty
                    ? null
                    : '$done of ${activities.length} done',
              ),
              if (activities.isNotEmpty) ...[
                const SizedBox(height: 8),
                FilmProgressBar(
                  done: done,
                  total: activities.length,
                  color: FilmColors.mint,
                ),
              ],
              const SizedBox(height: 12),
              if (loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (problem != null && activities.isEmpty)
                _Problem(message: problem, onRetry: _videos.loadActivities)
              else if (activities.isEmpty)
                const _NoActivities()
              else
                for (final (index, activity) in activities.indexed) ...[
                  _ActivityTile(
                    number: index + 1,
                    activity: activity,
                    locked: !chapter.isWatched,
                    place: _videos.places[activity.id],
                    onTap: () => _open(chapter, activity),
                  ),
                  const SizedBox(height: 10),
                ],
            ],
          ),
        ),
      );
    });
  }
}

class _StepTitle extends StatelessWidget {
  const _StepTitle({required this.step, required this.title, this.trailing});

  final int step;
  final String title;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: const BoxDecoration(
            color: FilmColors.violet,
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: Text(
            '$step',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            title,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        if (trailing != null)
          Text(
            trailing!,
            style: theme.textTheme.labelLarge?.copyWith(
              color: FilmColors.mint,
              fontWeight: FontWeight.w800,
            ),
          ),
      ],
    );
  }
}

/// Step one: the video. A call to watch it on a first visit; afterwards a
/// tick, and the way to watch it again.
class _VideoStep extends StatelessWidget {
  const _VideoStep({required this.chapter, required this.onPlay});

  final FilmChapter chapter;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    final watched = chapter.isWatched;

    return Semantics(
      container: true,
      button: true,
      label: watched ? 'Watch the video again' : 'Watch the video',
      excludeSemantics: true,
      child: Material(
        borderRadius: BorderRadius.circular(24),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onPlay,
          child: Ink(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: watched
                    ? const [FilmColors.mint, Color(0xFF1FA383)]
                    : FilmColors.banner,
              ),
            ),
            padding: const EdgeInsets.all(18),
            child: Row(
              children: [
                Container(
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.25),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    watched ? Icons.replay_rounded : Icons.play_arrow_rounded,
                    color: Colors.white,
                    size: 36,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        watched
                            ? 'Step 1 · Video watched'
                            : 'Step 1 · Watch the video',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        watched
                            ? 'Watch it again any time — your activities are kept.'
                            : 'The activities open when it ends.',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.92),
                        ),
                      ),
                    ],
                  ),
                ),
                if (watched)
                  const Icon(Icons.check_circle_rounded, color: Colors.white),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ActivityTile extends StatelessWidget {
  const _ActivityTile({
    required this.number,
    required this.activity,
    required this.locked,
    required this.place,
    required this.onTap,
  });

  final int number;
  final ActivityDefinition activity;
  final bool locked;
  final SavedPlace? place;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final tone = toneFor(activity.title);
    final content = activity.content!;
    final saved = place;
    final inProgress = !activity.isDone && saved != null && saved.index > 0;

    final (status, statusColour) = locked
        ? ('Opens after the video', colors.outline)
        : activity.isDone
        ? ('Done · play again any time', const Color(0xFF15803D))
        : inProgress
        ? (
            'Carry on · ${content.isScored ? 'question' : 'card'} ${saved.index + 1} of ${content.itemCount}',
            const Color(0xFFB45309),
          )
        : (
            content.isScored
                ? '${content.itemCount} questions'
                : '${content.itemCount} cards to look at',
            tone.ink,
          );

    return Semantics(
      container: true,
      button: true,
      label: 'Activity $number, ${activity.title}, $status',
      excludeSemantics: true,
      child: Material(
        color: locked ? colors.surfaceContainerHighest : tone.wash,
        borderRadius: BorderRadius.circular(22),
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 54,
                  height: 54,
                  decoration: BoxDecoration(
                    color: locked
                        ? colors.surface
                        : Colors.white.withValues(alpha: 0.7),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  alignment: Alignment.center,
                  child: locked
                      ? Icon(Icons.lock_rounded, color: colors.outline)
                      : KidIcon(
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
                        'Activity $number',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: locked ? colors.outline : tone.deep,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        activity.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: locked ? colors.outline : tone.deep,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        status,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: statusColour,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                if (activity.isDone && !locked)
                  const Icon(
                    Icons.check_circle_rounded,
                    color: FilmColors.mint,
                    size: 30,
                  )
                else
                  Icon(
                    locked
                        ? Icons.lock_outline_rounded
                        : Icons.play_circle_fill_rounded,
                    color: locked ? colors.outline : tone.ink,
                    size: 30,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Every activity done: the chapter is finished.
class _ChapterComplete extends StatelessWidget {
  const _ChapterComplete();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFFFF4D6), Color(0xFFE6FBF4)],
        ),
        borderRadius: BorderRadius.circular(22),
      ),
      child: const Row(
        children: [
          Icon(Icons.emoji_events_rounded, color: FilmColors.sun, size: 44),
          SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Chapter completed!',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF15803D),
                  ),
                ),
                Text('The video and every activity are done. Well done!'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NoActivities extends StatelessWidget {
  const _NoActivities();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 20),
    child: Column(
      children: [
        const ArtIcon(AppIcons.storybook, size: 72),
        const SizedBox(height: 8),
        Text(
          'No activities in this chapter yet.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      ],
    ),
  );
}

class _Problem extends StatelessWidget {
  const _Problem({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 20),
    child: Column(
      children: [
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 10),
        FilledButton(onPressed: onRetry, child: const Text('Try again')),
      ],
    ),
  );
}
