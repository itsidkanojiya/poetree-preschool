import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import '../activities/book_shelf_controller.dart';

/// One subject on the films page — English, Maths, EVS — with how many films
/// are inside its books and how many this child has still to watch.
class FilmSubject {
  FilmSubject({
    required this.id,
    required this.name,
    required this.icon,
    required this.bookCount,
    required this.filmCount,
    required this.filmsToWatch,
  });

  factory FilmSubject.fromJson(Map<String, dynamic> json) => FilmSubject(
    id: json['id'] as String?,
    name: json['name'] as String? ?? 'Books',
    icon: json['icon'] as String? ?? 'book',
    bookCount: (json['bookCount'] as num?)?.toInt() ?? 0,
    filmCount: (json['filmCount'] as num?)?.toInt() ?? 0,
    filmsToWatch: (json['filmsToWatch'] as num?)?.toInt() ?? 0,
  );

  /// Null for "More books" — books the publisher has not filed under a
  /// subject yet. Asked for as `none`, so they are still reachable.
  final String? id;
  final String name;

  /// One of the shared contract's BOOK_SUBJECT_ICONS.
  final String icon;
  final int bookCount;
  final int filmCount;
  final int filmsToWatch;

  int get filmsWatched => filmCount - filmsToWatch;
}

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

/// The subjects this child's books fall under.
class FilmSubjectsController extends GetxController {
  FilmSubjectsController({required this.studentId, required this.childName});

  final String? studentId;
  final String childName;

  final subjects = <FilmSubject>[].obs;
  final isLoading = true.obs;
  final error = RxnString();

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
        '/catalogue/children/$studentId/subjects',
      );
      subjects.value = rows
          .whereType<Map<String, dynamic>>()
          .map(FilmSubject.fromJson)
          .toList();
    } on DioException catch (e) {
      error.value = _problem(e, 'Could not load the subjects.');
    } finally {
      isLoading.value = false;
    }
  }
}

/// The books of one subject — a subject has several, one per term or level.
class FilmBooksController extends GetxController {
  FilmBooksController({
    required this.studentId,
    required this.subjectId,
    required this.subjectName,
  });

  final String? studentId;

  /// Null asks for the books filed under no subject.
  final String? subjectId;
  final String subjectName;

  final books = <ShelfBook>[].obs;
  final isLoading = true.obs;
  final error = RxnString();

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
        '/catalogue/children/$studentId/books',
        query: {'subjectId': subjectId ?? 'none'},
      );
      books.value = rows
          .whereType<Map<String, dynamic>>()
          .map(ShelfBook.fromJson)
          .toList();
    } on DioException catch (e) {
      error.value = _problem(e, 'Could not load the books.');
    } finally {
      isLoading.value = false;
    }
  }
}

/// The chapters of one book, in the book's own order.
///
/// Also where "watched" lands: the player tells this controller the moment a
/// film ends, so the list behind the player is already ticked when the child
/// comes back to it, however many chapters they watched in a row.
class FilmChaptersController extends GetxController {
  FilmChaptersController({
    required this.studentId,
    required this.bookId,
    required this.bookName,
  });

  final String? studentId;
  final String? bookId;
  final String bookName;

  final chapters = <FilmChapter>[].obs;
  final isLoading = true.obs;
  final error = RxnString();

  /// Only the chapters with a film — the running order the player steps
  /// through with Previous and Next.
  List<FilmChapter> get withFilms => chapters.where((c) => c.hasFilm).toList();

  int get watchedCount =>
      chapters.where((c) => c.hasFilm && c.isWatched).length;

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> load() async {
    if (studentId == null || bookId == null) {
      isLoading.value = false;
      return;
    }

    isLoading.value = true;
    error.value = null;
    try {
      final rows = await api.get<List<dynamic>>(
        '/catalogue/children/$studentId/books/$bookId/chapters',
      );
      chapters.value = rows
          .whereType<Map<String, dynamic>>()
          .map(FilmChapter.fromJson)
          .toList();
    } on DioException catch (e) {
      error.value = _problem(e, 'Could not open this book.');
    } finally {
      isLoading.value = false;
    }
  }

  /// Ticks a chapter off without a round trip.
  void markWatched(String chapterId) {
    for (final chapter in chapters) {
      if (chapter.id == chapterId) chapter.isWatched = true;
    }
    chapters.refresh();
  }
}
