import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import '../../core/assets/app_assets.dart';

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

  bool get hasFilm => film2d != null;
  bool get has3d => film3d != null;

  String get label => number == null ? name : 'Chapter $number · $name';
}

String _problem(DioException e, String fallback) {
  final payload = e.response?.data;
  return payload is Map && payload['error'] is Map
      ? (payload['error'] as Map)['message']?.toString() ?? fallback
      : 'Cannot reach the school right now.';
}

/// One book's videos, in a subject's list.
class FilmBookGroup {
  FilmBookGroup({required this.id, required this.name, required this.films});

  factory FilmBookGroup.fromJson(Map<String, dynamic> json) => FilmBookGroup(
    id: json['id'] as String,
    name: json['name'] as String? ?? 'Book',
    films: (json['films'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(FilmChapter.fromJson)
        .where((chapter) => chapter.hasFilm)
        .toList(),
  );

  final String id;
  final String name;
  final List<FilmChapter> films;
}

/// A subject's videos, book by book.
///
/// The list is also the running order: Next from the last video of one book
/// goes on to the first of the next. And it is where "watched" lands — the
/// player tells this controller the moment a video ends, so the list behind
/// the player is already ticked when the child comes back to it.
class FilmVideosController extends GetxController {
  FilmVideosController({
    required this.studentId,
    required this.subjectId,
    required this.subjectName,
    this.art = AppIcons.storybook,
  });

  final String? studentId;

  /// Null asks for the videos in books filed under no subject.
  final String? subjectId;
  final String subjectName;

  /// The subject's picture, for videos with no picture of their own.
  final String art;

  final books = <FilmBookGroup>[].obs;
  final isLoading = true.obs;
  final error = RxnString();

  /// Every video in the subject, in the order the player steps through them.
  List<FilmChapter> get withFilms => [for (final book in books) ...book.films];

  int get watchedCount => withFilms.where((c) => c.isWatched).length;

  /// The book a video is from, for the player's title.
  String bookNameOf(String chapterId) => books
      .firstWhere(
        (book) => book.films.any((c) => c.id == chapterId),
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
        '/catalogue/children/$studentId/films',
        query: {'subjectId': subjectId ?? 'none'},
      );
      books.value = rows
          .whereType<Map<String, dynamic>>()
          .map(FilmBookGroup.fromJson)
          .where((book) => book.films.isNotEmpty)
          .toList();
    } on DioException catch (e) {
      error.value = _problem(e, 'Could not load the videos.');
    } finally {
      isLoading.value = false;
    }
  }

  /// Ticks a video off without a round trip.
  void markWatched(String chapterId) {
    for (final chapter in withFilms) {
      if (chapter.id == chapterId) chapter.isWatched = true;
    }
    books.refresh();
  }
}
