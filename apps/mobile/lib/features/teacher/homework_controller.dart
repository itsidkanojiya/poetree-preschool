import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import '../../core/models/attached_file.dart';

class TeacherHomework {
  TeacherHomework({
    required this.id,
    required this.title,
    required this.dueDate,
    required this.status,
    required this.assigned,
    required this.completed,
    required this.pending,
    required this.attachments,
    this.description,
  });

  factory TeacherHomework.fromJson(Map<String, dynamic> json) {
    final progress = json['progress'] as Map<String, dynamic>? ?? const {};
    return TeacherHomework(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      dueDate: json['dueDate'] as String,
      status: json['status'] as String? ?? 'DRAFT',
      assigned: (progress['total'] as num?)?.toInt() ?? 0,
      completed: (progress['completed'] as num?)?.toInt() ?? 0,
      pending: (progress['pending'] as num?)?.toInt() ?? 0,
      attachments: (json['attachments'] as List<dynamic>? ?? <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(AttachedFile.fromJson)
          .toList(),
    );
  }

  final String id;
  final String title;
  final String? description;
  final String dueDate;
  final String status;
  final int assigned;
  final int completed;
  final int pending;

  /// The worksheet the teacher set with it, which parents see on their card.
  final List<AttachedFile> attachments;

  bool get isPublished => status == 'PUBLISHED';
}

class Submission {
  Submission({
    required this.id,
    required this.studentId,
    required this.fullName,
    required this.status,
    required this.files,
    this.rollNo,
    this.note,
    this.teacherRemark,
    this.submittedOn,
  });

  factory Submission.fromJson(Map<String, dynamic> json) => Submission(
    id: json['id'] as String,
    studentId: json['studentId'] as String,
    fullName: json['fullName'] as String,
    rollNo: json['rollNo'] as String?,
    status: json['status'] as String,
    note: json['note'] as String?,
    teacherRemark: json['teacherRemark'] as String?,
    submittedOn: json['submittedOn'] as String?,
    files: (json['files'] as List<dynamic>? ?? <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(AttachedFile.fromJson)
        .toList(),
  );

  final String id;
  final String studentId;
  final String fullName;
  final String? rollNo;
  String status;
  final String? note;
  String? teacherRemark;
  final String? submittedOn;

  /// The photograph the family sent, which is what a preschool submission is.
  final List<AttachedFile> files;

  bool get isWaiting => status == 'SUBMITTED' || status == 'LATE';
  bool get isJudged => status == 'COMPLETED' || status == 'NOT_COMPLETED';
}

/// Setting work, and marking who has done it.
///
/// A teacher does this standing up between activities, so publishing is one
/// step from composing rather than a draft workflow — the draft state exists in
/// the API for the web portal, and a phone should not make someone visit it
/// twice.
class TeacherHomeworkController extends GetxController {
  TeacherHomeworkController({required this.classroomId});

  final String? classroomId;

  final items = <TeacherHomework>[].obs;
  final submissions = <Submission>[].obs;
  final isLoading = true.obs;
  final isSaving = false.obs;
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
      final data = await api.get<Map<String, dynamic>>(
        '/homework',
        query: {'classroomId': classroomId, 'pageSize': 30},
      );
      items.value = (data['items'] as List<dynamic>? ?? <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(TeacherHomework.fromJson)
          .toList();
    } on DioException catch (e) {
      error.value = _messageFor(e, 'Could not load homework.');
    } finally {
      isLoading.value = false;
    }
  }

  /// Creates and publishes in one step. Returns null on success.
  Future<String?> create({
    required String title,
    String? description,
    required DateTime dueDate,
    required bool allowsSubmission,
    List<String> worksheetPaths = const [],
  }) async {
    if (classroomId == null) return 'No class selected.';

    isSaving.value = true;
    try {
      // The worksheet goes up before the homework exists, so a rejected file
      // costs nothing — better than publishing work to thirty families and
      // then failing to attach the page they are meant to work from.
      final fileIds = <String>[];
      for (final path in worksheetPaths) {
        final uploaded = await api.upload<Map<String, dynamic>>('/files', path);
        fileIds.add(uploaded['id'] as String);
      }

      final created = await api.post<Map<String, dynamic>>(
        '/homework',
        body: {
          'classroomId': classroomId,
          'title': title.trim(),
          if (description != null && description.trim().isNotEmpty)
            'description': description.trim(),
          'dueDate': dueDate.toIso8601String().substring(0, 10),
          'allowsSubmission': allowsSubmission,
          if (fileIds.isNotEmpty) 'fileIds': fileIds,
        },
      );

      // Publishing is what materialises a submission row per enrolled child,
      // which is what makes "who has not done it" an indexed lookup later.
      await api.post<dynamic>('/homework/${created['id']}/publish');
      await load();
      return null;
    } on DioException catch (e) {
      return _messageFor(e, 'Could not set the homework.');
    } finally {
      isSaving.value = false;
    }
  }

  Future<void> openSubmissions(String homeworkId) async {
    submissions.clear();
    try {
      final data = await api.get<List<dynamic>>(
        '/homework/$homeworkId/submissions',
      );
      submissions.value = data
          .whereType<Map<String, dynamic>>()
          .map(Submission.fromJson)
          .toList();
    } on DioException catch (e) {
      error.value = _messageFor(e, 'Could not load who has done it.');
    }
  }

  /// Marks one child's work. Returns null on success.
  Future<String?> review(
    Submission submission,
    String status, {
    String? remark,
  }) async {
    final previous = submission.status;
    final previousRemark = submission.teacherRemark;
    submission.status = status;
    // Only when one was actually written: the request below omits an empty
    // remark, so clearing it here would show the teacher a change the server
    // never made.
    if (remark != null && remark.trim().isNotEmpty) {
      submission.teacherRemark = remark.trim();
    }
    submissions.refresh();

    try {
      await api.patch<dynamic>(
        '/homework/submissions/${submission.id}',
        body: {
          'status': status,
          if (remark != null && remark.trim().isNotEmpty)
            'teacherRemark': remark.trim(),
        },
      );
      return null;
    } on DioException catch (e) {
      // Put it back rather than leave the screen claiming something the server
      // does not agree with.
      submission.status = previous;
      submission.teacherRemark = previousRemark;
      submissions.refresh();
      return _messageFor(e, 'Could not save that.');
    }
  }

  static String _messageFor(DioException e, String fallback) {
    final payload = e.response?.data;
    if (payload is Map && payload['error'] is Map) {
      return (payload['error'] as Map)['message']?.toString() ?? fallback;
    }
    if (e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout) {
      return 'No connection. Try again when you have signal.';
    }
    return fallback;
  }
}
