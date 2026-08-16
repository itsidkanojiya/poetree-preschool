import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';

/// One book on a child's shelf.
class ShelfBook {
  ShelfBook({
    required this.id,
    required this.name,
    required this.levelName,
    required this.isUnlocked,
    this.coverPath,
    this.videoId,
  });

  factory ShelfBook.fromJson(Map<String, dynamic> json) {
    final cover = json['coverUrl'] as String?;
    final animation = json['animation'] as Map<String, dynamic>?;
    final level = json['classLevel'] as Map<String, dynamic>?;

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
      videoId: animation?['videoId'] as String?,
      isUnlocked: json['isUnlocked'] as bool? ?? true,
    );
  }

  final String id;
  final String name;
  final String levelName;

  /// Null until the publisher uploads a cover. The shelf draws a coloured card
  /// with the book's name instead, rather than a broken square.
  final String? coverPath;

  /// The film that opens this book. Null when it has none, in which case the
  /// book was never locked.
  final String? videoId;
  final bool isUnlocked;

  bool get hasAnimation => videoId != null;
}

/// The books this child's school has bought.
///
/// The same endpoint the activity list already calls for its lock screen —
/// this keeps the cover and the unlocked ones, which that one throws away.
class BookShelfController extends GetxController {
  BookShelfController({required this.studentId, required this.childName});

  final String? studentId;
  final String childName;

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
      final data = await api.get<List<dynamic>>(
        '/catalogue/children/$studentId/books',
      );
      books.value = data
          .whereType<Map<String, dynamic>>()
          .map(ShelfBook.fromJson)
          .toList();
    } on DioException catch (e) {
      final payload = e.response?.data;
      error.value = payload is Map && payload['error'] is Map
          ? (payload['error'] as Map)['message']?.toString() ??
                'Could not load the books.'
          : 'Cannot reach the school right now.';
    } finally {
      isLoading.value = false;
    }
  }
}
