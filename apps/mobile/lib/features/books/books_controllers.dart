import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import '../../core/assets/app_assets.dart';

/// One subject on a child's shelf — English, Maths, EVS — with how many
/// chapters and videos are inside it.
///
/// A subject is its book. Learning and 2D & 3D Animation both start here: the
/// same subjects, one opening onto its chapters — each a video, activities and
/// pages to read — the other onto its videos.
class ShelfSubject {
  ShelfSubject({
    required this.id,
    required this.name,
    required this.icon,
    required this.bookCount,
    required this.filmCount,
    this.chapterCount = 0,
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
      chapterCount: (json['chapterCount'] as num?)?.toInt() ?? 0,
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

  /// Chapters across the subject's book, with a video or without.
  final int chapterCount;
  final int filmCount;
  final int filmsToWatch;

  int get filmsWatched => filmCount - filmsToWatch;

  /// The subject's picture, for anything inside it with none of its own.
  String get art => SubjectArt.forSubject(icon: icon, name: name);
}

/// A PDF to read — a chapter's pages — as the app fetches it.
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

  /// Changes when the publisher replaces it, which is how a copy kept on the
  /// phone knows it is out of date.
  final String version;
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
