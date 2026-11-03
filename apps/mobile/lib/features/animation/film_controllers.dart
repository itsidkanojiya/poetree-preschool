import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import '../../core/assets/app_assets.dart';
import '../activities/activity_models.dart';
import '../activities/activity_places.dart';
import '../books/books_controllers.dart';

/// One film, as the animation screens use it.
class FilmVideo {
  const FilmVideo({required this.videoId, required this.url});

  static FilmVideo? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final id = json['videoId'] as String?;
    if (id == null || id.isEmpty) return null;
    return FilmVideo(videoId: id, url: json['url'] as String? ?? '');
  }

  final String videoId;
  final String url;
}

/// One chapter of a book, as the films see it.
class FilmChapter {
  FilmChapter({
    required this.id,
    required this.name,
    required this.number,
    required this.isWatched,
    this.film2d,
    this.film3d,
    this.coverPath,
    this.pdf,
  });

  factory FilmChapter.fromJson(Map<String, dynamic> json) {
    final cover = json['coverUrl'] as String?;
    return FilmChapter(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Chapter',
      number: (json['number'] as num?)?.toInt(),
      film2d: FilmVideo.fromJson(json['animation']),
      film3d: FilmVideo.fromJson(json['animation3d']),
      coverPath: cover == null || cover.isEmpty
          ? null
          : cover.replaceFirst('/api/v1', ''),
      isWatched: json['isWatched'] as bool? ?? false,
      pdf: BookPdf.fromJson(json['pdf']),
    );
  }

  final String id;
  final String name;
  final int? number;

  /// The chapter's film. The API sends the 3D one here when a chapter has
  /// only that, so this is null only for a chapter with no film at all.
  final FilmVideo? film2d;

  /// The 3D version, present only when the chapter has both.
  final FilmVideo? film3d;
  final String? coverPath;
  bool isWatched;

  /// The chapter's pages to read. Null until the publisher uploads them.
  final BookPdf? pdf;

  bool get hasFilm => film2d != null;
  bool get has3d => film3d != null;
  bool get hasPdf => pdf != null;

  String get label => number == null ? name : 'Chapter $number · $name';
}

String _problem(DioException e, String fallback) {
  final payload = e.response?.data;
  return payload is Map && payload['error'] is Map
      ? (payload['error'] as Map)['message']?.toString() ?? fallback
      : 'Cannot reach the school right now.';
}

/// One book's chapters, in a subject's list.
class FilmBookGroup {
  FilmBookGroup({
    required this.id,
    required this.name,
    required this.films,
    List<FilmChapter>? chapters,
  }) : chapters = chapters ?? films;

  /// Read from a subject's videos (`films`) or from its chapters
  /// (`chapters`), which also carries those without a video.
  factory FilmBookGroup.fromJson(Map<String, dynamic> json) {
    final chapters =
        ((json['chapters'] ?? json['films']) as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(FilmChapter.fromJson)
            .toList();
    return FilmBookGroup(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Book',
      chapters: chapters,
      films: chapters.where((chapter) => chapter.hasFilm).toList(),
    );
  }

  final String id;
  final String name;

  /// The chapters with a video, which is what the player steps through.
  final List<FilmChapter> films;

  /// Every chapter, with a video or without — what Learning lists.
  final List<FilmChapter> chapters;
}

/// A subject's chapters, and each chapter's activities.
///
/// Two ways in. 2D & 3D lists the subject's videos and plays them. Learning
/// ([learning]) lists every chapter — its video, its activities and its pages
/// to read — and opens each onto all three.
///
/// The list is also the running order: Next from the last video of one book
/// goes on to the first of the next. And it is where "watched" and "done"
/// land — the player and the activities tell this controller the moment they
/// end, so the screens behind are already ticked when the child comes back.
///
/// A chapter is watched, then its activities are done: the video opens the
/// activities the first time, and the chapter is finished when every one of
/// them is done. Both are kept by the school for each child.
class FilmVideosController extends GetxController {
  FilmVideosController({
    required this.studentId,
    required this.subjectId,
    required this.subjectName,
    this.art = AppIcons.storybook,
    this.learning = false,
  });

  final String? studentId;

  /// Learning's list: every chapter, and its activities. Otherwise 2D & 3D's,
  /// which is the videos alone.
  final bool learning;

  /// Null asks for the videos in books filed under no subject.
  final String? subjectId;
  final String subjectName;

  /// The subject's picture, for videos with no picture of their own.
  final String art;

  final books = <FilmBookGroup>[].obs;
  final isLoading = true.obs;
  final error = RxnString();

  /// Each chapter's activities, in the book's order, with whether this child
  /// has finished each. Keyed by chapter id.
  final activities = <String, List<ActivityDefinition>>{}.obs;
  final activitiesLoading = false.obs;
  final activitiesError = RxnString();

  /// Where this child left activities part-way, by activity id.
  final places = <String, SavedPlace>{}.obs;

  late final ActivityPlaces? _places = studentId == null
      ? null
      : ActivityPlaces(studentId!);

  /// Whether the activities have been asked for and answered.
  bool get activitiesKnown =>
      !activitiesLoading.value && activitiesError.value == null;

  List<ActivityDefinition> activitiesOf(String chapterId) =>
      activities[chapterId] ?? const [];

  int doneIn(String chapterId) =>
      activitiesOf(chapterId).where((a) => a.isDone).length;

  /// The video watched, when there is one, and every activity done.
  bool isComplete(FilmChapter chapter) =>
      (chapter.isWatched || !chapter.hasFilm) &&
      activitiesOf(chapter.id).every((a) => a.isDone);

  FilmChapter? chapterById(String chapterId) =>
      allChapters.firstWhereOrNull((c) => c.id == chapterId);

  /// Every video in the subject, in the order the player steps through them.
  List<FilmChapter> get withFilms => [for (final book in books) ...book.films];

  /// Every chapter in the subject, in running order.
  List<FilmChapter> get allChapters => [
    for (final book in books) ...book.chapters,
  ];

  int get watchedCount => withFilms.where((c) => c.isWatched).length;

  /// The book a video is from, for the player's title.
  String bookNameOf(String chapterId) => books
      .firstWhere(
        (book) => book.chapters.any((c) => c.id == chapterId),
        orElse: () => FilmBookGroup(id: '', name: subjectName, films: []),
      )
      .name;

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> load() async {
    if (studentId == null) {
      isLoading.value = false;
      return;
    }

    isLoading.value = true;
    error.value = null;
    try {
      final rows = await api.get<List<dynamic>>(
        learning
            ? '/catalogue/children/$studentId/chapters'
            : '/catalogue/children/$studentId/films',
        query: {'subjectId': subjectId ?? 'none'},
      );
      books.value = rows
          .whereType<Map<String, dynamic>>()
          .map(FilmBookGroup.fromJson)
          .where(
            (book) =>
                learning ? book.chapters.isNotEmpty : book.films.isNotEmpty,
          )
          .toList();
    } on DioException catch (e) {
      error.value = _problem(
        e,
        learning
            ? 'Could not load the chapters.'
            : 'Could not load the videos.',
      );
    } finally {
      isLoading.value = false;
    }
    // 2D & 3D only plays the videos; the activities are Learning's.
    if (error.value == null && learning) await loadActivities();
  }

  /// Each book's activities for this child, sorted into its chapters.
  ///
  /// One request per book in the subject — usually one or two — answering
  /// every chapter at once, with whether this child has finished each.
  Future<void> loadActivities() async {
    if (studentId == null || books.isEmpty) return;
    activitiesLoading.value = true;
    activitiesError.value = null;
    try {
      final chapterIds = {for (final c in allChapters) c.id};
      final lists = await Future.wait([
        for (final book in books)
          api.get<List<dynamic>>(
            '/progress/activities',
            query: {'studentId': studentId, 'bookId': book.id},
          ),
      ]);
      final byChapter = <String, List<ActivityDefinition>>{};
      for (final rows in lists) {
        for (final row in rows.whereType<Map<String, dynamic>>()) {
          final activity = ActivityDefinition.fromJson(row);
          // Only what the app can play, and only in a chapter on this list.
          // Tracing is a module of its own, not one of a chapter's activities:
          // a chapter never waits on, or counts, a tracing page.
          if (!activity.isPlayable ||
              activity.type == 'TRACING' ||
              !chapterIds.contains(activity.chapterId)) {
            continue;
          }
          final list = byChapter.putIfAbsent(activity.chapterId, () => []);
          if (list.every((a) => a.id != activity.id)) list.add(activity);
        }
      }
      activities.value = byChapter;
    } on DioException catch (e) {
      activitiesError.value = _problem(e, 'Could not load the activities.');
    } finally {
      activitiesLoading.value = false;
    }
    // After, not before, the list is shown: where the child left off is read
    // from the phone's storage, and the chapters need not wait for it.
    places.value = await _places?.all() ?? {};
  }

  /// Shows an activity done at once, before the school's answer comes back.
  void markActivityDone(String activityId) {
    for (final list in activities.values) {
      for (final activity in list) {
        if (activity.id == activityId) activity.isDone = true;
      }
    }
    places.remove(activityId);
    activities.refresh();
  }

  /// Re-reads where the child left off, after they come back from one.
  Future<void> refreshPlaces() async {
    places.value = await _places?.all() ?? {};
  }

  /// Ticks a video off without a round trip.
  void markWatched(String chapterId) {
    for (final chapter in withFilms) {
      if (chapter.id == chapterId) chapter.isWatched = true;
    }
    books.refresh();
  }
}
