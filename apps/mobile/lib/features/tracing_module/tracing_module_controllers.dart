import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import 'tracing_module_models.dart';

String _messageOf(DioException error, String fallback) {
  final payload = error.response?.data;
  if (payload is Map && payload['error'] is Map) {
    return (payload['error'] as Map)['message']?.toString() ?? fallback;
  }
  return error.response == null
      ? 'Cannot reach the school right now.'
      : fallback;
}

/// The categories: "A B C", "1 2 3", "a b c" and whatever else the publisher
/// has switched on.
class TracingHomeController extends GetxController {
  TracingHomeController({required this.studentId, required this.childName});

  final String studentId;
  final String childName;

  final categories = <TracingCategorySummary>[].obs;
  final enabled = true.obs;
  final isLoading = true.obs;
  final error = RxnString();

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> load() async {
    isLoading.value = true;
    error.value = null;
    try {
      final data = await api.get<Map<String, dynamic>>(
        '/tracing',
        query: {'studentId': studentId},
      );
      enabled.value = data['enabled'] == true;
      categories.value = (data['categories'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(TracingCategorySummary.fromJson)
          .toList();
    } on DioException catch (e) {
      error.value = _messageOf(e, 'Could not load tracing.');
    } finally {
      isLoading.value = false;
    }
  }
}

/// One category's letters, and the two things a child does with each: watch
/// its video, then trace it.
class TracingLettersController extends GetxController {
  TracingLettersController({
    required this.studentId,
    required this.categoryId,
    required this.title,
  });

  final String studentId;
  final String categoryId;
  final String title;

  final items = <TracingModuleItem>[].obs;
  final isLoading = true.obs;
  final error = RxnString();

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> load() async {
    isLoading.value = true;
    error.value = null;
    try {
      final data = await api.get<Map<String, dynamic>>(
        '/tracing/categories/$categoryId',
        query: {'studentId': studentId},
      );
      items.value = TracingCategoryDetail.fromJson(data).items;
    } on DioException catch (e) {
      error.value = _messageOf(e, 'Could not load the letters.');
    } finally {
      isLoading.value = false;
    }
  }

  /// Tells the school the video reached the end. Throws if it could not —
  /// the video screen stays open and offers to try again.
  Future<void> markWatched(TracingModuleItem item) async {
    await api.post<dynamic>(
      '/tracing/items/${item.id}/watched',
      body: {'studentId': studentId},
    );
    item.videoWatched = true;
    items.refresh();
  }

  /// Records the letter as traced. False when the record did not arrive; the
  /// child has still traced it and goes on.
  Future<bool> markTraced(TracingModuleItem item) async {
    item.traced = true;
    items.refresh();
    try {
      await api.post<dynamic>(
        '/tracing/items/${item.id}/traced',
        body: {'studentId': studentId},
      );
      return true;
    } on DioException {
      return false;
    }
  }
}
