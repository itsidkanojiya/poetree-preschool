import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import '../../core/assets/app_assets.dart';

/// One subject on a child's shelf — English, Maths, EVS — with how many books
/// and videos are inside it.
///
/// The Books screen and the 2D & 3D Animation screen both start here: the
/// same subjects, one opening onto books to read, the other onto videos.
class ShelfSubject {
  ShelfSubject({
    required this.id,
    required this.name,
    required this.icon,
    required this.bookCount,
    required this.filmCount,
    required this.filmsToWatch,
    this.picturePath,
  });

  factory ShelfSubject.fromJson(Map<String, dynamic> json) {
    final picture = json['pictureUrl'] as String?;
    return ShelfSubject(
      id: json['id'] as String?,
      name: json['name'] as String? ?? 'Books',
      icon: json['icon'] as String? ?? 'book',
      // Rooted at the domain, and our base URL already ends in /api/v1.
      picturePath: picture == null || picture.isEmpty
          ? null
          : picture.replaceFirst('/api/v1', ''),
      bookCount: (json['bookCount'] as num?)?.toInt() ?? 0,
      filmCount: (json['filmCount'] as num?)?.toInt() ?? 0,
      filmsToWatch: (json['filmsToWatch'] as num?)?.toInt() ?? 0,
    );
  }

  /// Null for "More books" — books the publisher has not filed under a
  /// subject yet. Asked for as `none`, so they are still reachable.
  final String? id;
  final String name;

  /// One of the shared contract's BOOK_SUBJECT_ICONS.
  final String icon;

  /// The picture the publisher uploaded, drawn in place of [icon]. Null for
  /// most subjects.
  final String? picturePath;
  final int bookCount;
  final int filmCount;
  final int filmsToWatch;

  int get filmsWatched => filmCount - filmsToWatch;

  /// The subject's picture, for anything inside it with none of its own.
  String get art => SubjectArt.forSubject(icon: icon, name: name);
}

/// A book's PDF, as the app fetches it.
class BookPdf {
  const BookPdf({
    required this.path,
    required this.sizeBytes,
    required this.version,
  });

  static BookPdf? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final url = json['url'] as String?;
    final version = json['version'] as String?;
    if (url == null || url.isEmpty || version == null) return null;
    return BookPdf(
      // Rooted at the domain, and our base URL already ends in /api/v1.
      path: url.replaceFirst('/api/v1', ''),
      sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
      version: version,
    );
  }

  final String path;
  final int sizeBytes;

  /// Changes when the publisher replaces the book, which is how a copy kept
  /// on the phone knows it is out of date.
  final String version;
}

/// One book on a child's shelf.
class ShelfBook {
  ShelfBook({
    required this.id,
    required this.name,
    required this.levelName,
    this.coverPath,
    this.subjectName,
    this.subjectIcon,
    this.pdf,
    this.activityCount = 0,
  });

  factory ShelfBook.fromJson(Map<String, dynamic> json) {
    final cover = json['coverUrl'] as String?;
    final level = json['classLevel'] as Map<String, dynamic>?;
    final subject = json['subject'] as Map<String, dynamic>?;

    return ShelfBook(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Book',
      levelName: level?['name'] as String? ?? '',
      // The API answers with a path rooted at the domain and our base URL
      // already ends in /api/v1 — the same trim every other file path needs,
      // and the one that would otherwise 404 every cover on the shelf.
      coverPath: cover == null || cover.isEmpty
          ? null
          : cover.replaceFirst('/api/v1', ''),
      subjectName: subject?['name'] as String?,
      subjectIcon: subject?['icon'] as String?,
      pdf: BookPdf.fromJson(json['pdf']),
      // Absent from an older school server: then only the PDF decides.
      activityCount: (json['activityCount'] as num?)?.toInt() ?? 0,
    );
  }

  final String id;
  final String name;
  final String levelName;

  /// Null until the publisher uploads a cover. The shelf draws a coloured card
  /// with the book's name instead, rather than a broken square.
  final String? coverPath;

  /// The subject it is filed under, when the publisher has filed it.
  final String? subjectName;
  final String? subjectIcon;

  /// The book to read. Null until the publisher uploads it, in which case the
  /// shelf says it is not ready rather than opening onto nothing.
  final BookPdf? pdf;

  bool get canRead => pdf != null;

  /// Activities filed in this book. A book with these opens onto them even
  /// before its PDF is uploaded.
  final int activityCount;

  bool get hasActivities => activityCount > 0;

  /// Nothing to read and nothing to play yet: the shelf says "Soon".
  bool get isEmpty => !canRead && !hasActivities;

  /// The picture drawn when there is no cover: the subject's own, or failing
  /// that whatever the book's name suggests.
  String get art => SubjectArt.forSubject(
    icon: subjectIcon ?? 'book',
    name: subjectName ?? name,
  );
}

String _problem(DioException e, String fallback) {
  final payload = e.response?.data;
  return payload is Map && payload['error'] is Map
      ? (payload['error'] as Map)['message']?.toString() ?? fallback
      : 'Cannot reach the school right now.';
}

/// The subjects this child's books fall under.
class SubjectsController extends GetxController {
  SubjectsController({required this.studentId, required this.childName});

  final String? studentId;
  final String childName;

  final subjects = <ShelfSubject>[].obs;
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
          .map(ShelfSubject.fromJson)
          .toList();
    } on DioException catch (e) {
      error.value = _problem(e, 'Could not load the subjects.');
    } finally {
      isLoading.value = false;
    }
  }
}

/// The books of one subject — a subject has several, one per term or level.
class BookShelfController extends GetxController {
  BookShelfController({
    required this.studentId,
    required this.subjectId,
    required this.subjectName,
  });

  final String? studentId;

  /// Null asks for the books filed under no subject ("More books").
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
