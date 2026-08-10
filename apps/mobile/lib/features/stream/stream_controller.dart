import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';

class StreamPost {
  StreamPost({
    required this.id,
    required this.type,
    required this.title,
    required this.createdBy,
    required this.publishedAt,
    required this.attachmentCount,
    this.body,
  });

  factory StreamPost.fromJson(Map<String, dynamic> json) => StreamPost(
    id: json['id'] as String,
    type: json['type'] as String,
    title: json['title'] as String,
    body: json['body'] as String?,
    createdBy: json['createdBy'] as String? ?? '',
    publishedAt: json['publishedAt'] as String,
    attachmentCount: (json['attachmentCount'] as num?)?.toInt() ?? 0,
  );

  final String id;
  final String type;
  final String title;
  final String? body;
  final String createdBy;
  final String publishedAt;
  final int attachmentCount;

  bool get isMaterial => type == 'MATERIAL';
}

/// The class stream: announcements and materials, newest first.
///
/// Deliberately thin. Per the brief this is not social media — no comments, no
/// reactions, no threads. A small school cannot carry the moderation burden of
/// parent-authored content, so parents read and teachers write.
class ClassStreamController extends GetxController {
  ClassStreamController({required this.classroomId, required this.canPost});

  final String? classroomId;
  final bool canPost;

  final posts = <StreamPost>[].obs;
  final isLoading = true.obs;
  final isPosting = false.obs;
  final error = RxnString();

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> load() async {
    if (classroomId == null) {
      isLoading.value = false;
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      final data = await api.get<List<dynamic>>(
        '/classroom-posts',
        query: {'classroomId': classroomId},
      );
      posts.value = data
          .whereType<Map<String, dynamic>>()
          .map(StreamPost.fromJson)
          .toList();
    } on DioException catch (e) {
      final payload = e.response?.data;
      error.value = payload is Map && payload['error'] is Map
          ? (payload['error'] as Map)['message']?.toString() ??
                'Could not load the class stream.'
          : 'Cannot reach the school right now.';
    } finally {
      isLoading.value = false;
    }
  }

  /// Returns null on success, or a sentence to show the teacher.
  Future<String?> post({
    required String title,
    String? body,
    required bool isMaterial,
  }) async {
    if (classroomId == null) return 'No class selected.';

    isPosting.value = true;
    try {
      await api.post<Map<String, dynamic>>(
        '/classroom-posts',
        body: {
          'classroomId': classroomId,
          'type': isMaterial ? 'MATERIAL' : 'ANNOUNCEMENT',
          'title': title.trim(),
          if (body != null && body.trim().isNotEmpty) 'body': body.trim(),
        },
      );
      await load();
      return null;
    } on DioException catch (e) {
      final payload = e.response?.data;
      return payload is Map && payload['error'] is Map
          ? (payload['error'] as Map)['message']?.toString() ??
                'Could not post.'
          : 'Could not post. Check your connection.';
    } finally {
      isPosting.value = false;
    }
  }
}
