import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';

/// One chapter of a book, as a child meets it.
class ShelfChapter {
  ShelfChapter({
    required this.id,
    required this.name,
    required this.number,
    required this.isUnlocked,
    required this.pageCount,
    this.videoId,
    this.coverPath,
  });

  factory ShelfChapter.fromJson(Map<String, dynamic> json) {
    final animation = json['animation'] as Map<String, dynamic>?;
    final cover = json['coverUrl'] as String?;

    return ShelfChapter(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Chapter',
      number: (json['number'] as num?)?.toInt(),
      videoId: animation?['videoId'] as String?,
      // Our base URL already ends in /api/v1 — the same trim the shelf's covers
      // need, and the one that would otherwise 404 every picture here.
      coverPath: cover == null || cover.isEmpty
          ? null
          : cover.replaceFirst('/api/v1', ''),
      isUnlocked: json['isUnlocked'] as bool? ?? true,
      pageCount: 0,
    );
  }

  final String id;
  final String name;
  final int? number;

  /// The film that opens this chapter. Null when it has none, in which case
  /// the chapter was never locked.
  final String? videoId;

  /// The chapter's picture, and usually null — most chapters have none. The
  /// contents page draws its number in the chapter's own colour instead, so a
  /// book where only some chapters were illustrated still reads as one list.
  final String? coverPath;

  final bool isUnlocked;

  /// How many pages a child will find inside. Counted from the activity list
  /// rather than sent, because that is the list they will actually be offered.
  int pageCount;

  bool get hasFilm => videoId != null;
}

/// The chapters of one book, for one child.
///
/// A book opens onto its contents page rather than onto a heap of every page it
/// contains: "we're on chapter three" is how a book is talked about at home and
/// in class, and a film belongs to a chapter, so this is the level where the
/// watch-then-play loop actually lives.
class ChapterListController extends GetxController {
  ChapterListController({
    required this.studentId,
    required this.bookId,
    required this.bookName,
  });

  final String? studentId;
  final String? bookId;
  final String bookName;

  final chapters = <ShelfChapter>[].obs;
  final isLoading = true.obs;
  final error = RxnString();

  /// Pages in this book filed under no chapter at all.
  ///
  /// Not an error — a short book may have none — but they have to be reachable,
  /// or a page would exist that no child could ever open.
  final loosePages = 0.obs;

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
      final list = rows
          .whereType<Map<String, dynamic>>()
          .map(ShelfChapter.fromJson)
          .toList();

      // How many pages each chapter holds, and how many sit outside them all.
      final pages = await api.get<List<dynamic>>(
        '/progress/activities',
        query: {'studentId': studentId, 'bookId': bookId},
      );

      var loose = 0;
      final counts = <String, int>{};
      for (final page in pages.whereType<Map<String, dynamic>>()) {
        // A page with nothing authored in it is not offered to a child, so it
        // must not be counted into a chapter that then opens onto nothing.
        if (page['contentJson'] == null) continue;

        final chapter = page['chapter'] as Map<String, dynamic>?;
        final id = chapter?['id'] as String?;
        if (id == null) {
          loose += 1;
        } else {
          counts[id] = (counts[id] ?? 0) + 1;
        }
      }

      for (final chapter in list) {
        chapter.pageCount = counts[chapter.id] ?? 0;
      }

      chapters.value = list;
      loosePages.value = loose;
    } on DioException catch (e) {
      final payload = e.response?.data;
      error.value = payload is Map && payload['error'] is Map
          ? (payload['error'] as Map)['message']?.toString() ??
                'Could not open this book.'
          : 'Cannot reach the school right now.';
    } finally {
      isLoading.value = false;
    }
  }
}
