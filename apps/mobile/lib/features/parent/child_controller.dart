import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import 'children_controller.dart';

/// Everything the parent screens read about the selected child.
///
/// One controller rather than five, because every screen asks the same two
/// questions first — which child, and is the answer loaded — and because
/// switching child must invalidate all of it at once.
class ChildController extends GetxController {
  ChildController(this._children);

  final ChildrenController _children;

  final attendance = Rxn<ChildAttendance>();
  final homework = <HomeworkItem>[].obs;
  final notices = <NoticeItem>[].obs;
  final ledger = Rxn<Ledger>();
  final skills = <SkillProgress>[].obs;

  final isLoading = true.obs;
  final error = RxnString();

  Child? get child => _children.selected;

  @override
  void onInit() {
    super.onInit();
    // Reload whenever the parent taps a different face.
    ever<String?>(_children.selectedId, (_) => unawaited(load()));
    unawaited(load());
  }

  Future<void> load() async {
    final selected = child;
    if (selected == null) {
      isLoading.value = false;
      return;
    }

    isLoading.value = true;
    error.value = null;

    final to = DateTime.now();
    final from = DateTime(to.year, to.month - 2, to.day);
    String day(DateTime d) => d.toIso8601String().substring(0, 10);

    try {
      // Fired together: on a slow connection, five sequential requests is the
      // difference between a screen that appears and one a parent gives up on.
      final results = await Future.wait<Object?>([
        api.get<Map<String, dynamic>>(
          '/attendance/children/${selected.id}',
          query: {'from': day(from), 'to': day(to)},
        ),
        if (selected.classroomId != null)
          api.get<Map<String, dynamic>>(
            '/homework',
            query: {
              'classroomId': selected.classroomId,
              // Named so each row carries this child's own submission —
              // "have we done this" is not answerable from the class totals.
              'studentId': selected.id,
              'pageSize': 20,
            },
          )
        else
          Future<Map<String, dynamic>>.value(<String, dynamic>{'items': []}),
        api.get<Map<String, dynamic>>('/notices', query: {'pageSize': 20}),
        api.get<Map<String, dynamic>>('/fees/students/${selected.id}/ledger'),
        api.get<Map<String, dynamic>>('/progress/students/${selected.id}'),
      ]);

      attendance.value = ChildAttendance.fromJson(
        results[0]! as Map<String, dynamic>,
      );

      homework.value =
          ((results[1]! as Map<String, dynamic>)['items'] as List<dynamic>? ??
                  <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(HomeworkItem.fromJson)
              .toList();

      notices.value =
          ((results[2]! as Map<String, dynamic>)['items'] as List<dynamic>? ??
                  <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(NoticeItem.fromJson)
              .toList();

      ledger.value = Ledger.fromJson(results[3]! as Map<String, dynamic>);

      skills.value =
          ((results[4]! as Map<String, dynamic>)['skills'] as List<dynamic>? ??
                  <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(SkillProgress.fromJson)
              .toList();
    } on DioException catch (e) {
      final data = e.response?.data;
      error.value = data is Map && data['error'] is Map
          ? (data['error'] as Map)['message']?.toString() ??
                'Could not load this page.'
          : 'Cannot reach the school right now. Check your connection.';
    } finally {
      isLoading.value = false;
    }
  }
}

extension HomeworkSubmissions on ChildController {
  /// Marks a piece of homework done for the selected child.
  ///
  /// Returns null on success, or a sentence to show the parent. The status is
  /// the server's to decide — a parent says "we did this", and whether that
  /// counts is the teacher's judgement.
  Future<String?> submitHomework(HomeworkItem item, {String? note}) async {
    final selected = child;
    if (selected == null) return 'No child selected.';

    try {
      await api.post<dynamic>(
        '/homework/${item.id}/submit',
        body: {
          'studentId': selected.id,
          if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        },
      );

      item.myStatus = 'SUBMITTED';
      homework.refresh();
      return null;
    } on DioException catch (e) {
      final payload = e.response?.data;
      return payload is Map && payload['error'] is Map
          ? (payload['error'] as Map)['message']?.toString() ??
                'Could not mark it done.'
          : 'Could not reach the school. Try again when you have signal.';
    }
  }
}

extension NoticeReceipts on ChildController {
  /// Records that this parent has seen a notice.
  ///
  /// The API keeps read receipts so a school can answer "who has not seen
  /// this" — the actual question for an emergency notice, and unanswerable
  /// unless the app says something. Fire and forget: a failed receipt must
  /// never stop a parent reading the notice in front of them.
  Future<void> markNoticeRead(NoticeItem notice) async {
    if (notice.readByMe) return;

    notice.readByMe = true;
    notices.refresh();

    try {
      await api.post<dynamic>('/notices/${notice.id}/read');
    } on DioException {
      // The next load re-reads the server's view.
    }
  }
}

class ChildAttendance {
  ChildAttendance({
    required this.present,
    required this.absent,
    required this.markedDays,
    required this.percentage,
    required this.days,
  });

  factory ChildAttendance.fromJson(Map<String, dynamic> json) =>
      ChildAttendance(
        present: (json['present'] as num?)?.toInt() ?? 0,
        absent: (json['absent'] as num?)?.toInt() ?? 0,
        markedDays: (json['markedDays'] as num?)?.toInt() ?? 0,
        percentage: (json['percentage'] as num?)?.toInt() ?? 0,
        days: (json['days'] as List<dynamic>? ?? <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(AttendanceDay.fromJson)
            .toList(),
      );

  final int present;
  final int absent;
  final int markedDays;
  final int percentage;
  final List<AttendanceDay> days;
}

class AttendanceDay {
  AttendanceDay({required this.date, required this.status, this.remark});

  factory AttendanceDay.fromJson(Map<String, dynamic> json) => AttendanceDay(
    date: json['date'] as String,
    status: json['status'] as String,
    remark: json['remark'] as String?,
  );

  final String date;
  final String status;
  final String? remark;
}

class HomeworkItem {
  HomeworkItem({
    required this.id,
    required this.title,
    required this.dueDate,
    required this.allowsSubmission,
    this.description,
    this.subject,
    this.myStatus,
    this.teacherRemark,
  });

  factory HomeworkItem.fromJson(Map<String, dynamic> json) {
    final mine = json['mySubmission'] as Map<String, dynamic>?;
    return HomeworkItem(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      dueDate: json['dueDate'] as String,
      allowsSubmission: json['allowsSubmission'] as bool? ?? false,
      subject: (json['subject'] as Map<String, dynamic>?)?['name'] as String?,
      myStatus: mine?['status'] as String?,
      teacherRemark: mine?['teacherRemark'] as String?,
    );
  }

  final String id;
  final String title;
  final String? description;
  final String dueDate;
  final bool allowsSubmission;
  final String? subject;

  /// This child's own submission status, not the class's.
  String? myStatus;
  String? teacherRemark;

  bool get isDone =>
      myStatus == 'SUBMITTED' || myStatus == 'COMPLETED' || myStatus == 'LATE';

  /// Once a teacher has judged it, a parent resubmitting would undo that.
  bool get isJudged => myStatus == 'COMPLETED' || myStatus == 'NOT_COMPLETED';

  bool get canSubmit => allowsSubmission && !isDone && !isJudged;
}

class NoticeItem {
  NoticeItem({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    required this.publishAt,
    required this.pinned,
    required this.readByMe,
  });

  factory NoticeItem.fromJson(Map<String, dynamic> json) => NoticeItem(
    id: json['id'] as String,
    title: json['title'] as String,
    body: json['body'] as String,
    type: json['type'] as String,
    publishAt: json['publishAt'] as String,
    pinned: json['pinned'] as bool? ?? false,
    readByMe: json['readByMe'] as bool? ?? false,
  );

  final String id;
  final String title;
  final String body;
  final String type;
  final String publishAt;
  final bool pinned;

  /// Mutable: set optimistically when the parent opens it, so the tick appears
  /// without waiting for the round trip.
  bool readByMe;

  bool get isEmergency => type == 'EMERGENCY';
}

class Ledger {
  Ledger({
    required this.billedInPaise,
    required this.paidInPaise,
    required this.outstandingInPaise,
    required this.invoices,
  });

  factory Ledger.fromJson(Map<String, dynamic> json) => Ledger(
    billedInPaise: (json['billedInPaise'] as num?)?.toInt() ?? 0,
    paidInPaise: (json['paidInPaise'] as num?)?.toInt() ?? 0,
    outstandingInPaise: (json['outstandingInPaise'] as num?)?.toInt() ?? 0,
    invoices: (json['invoices'] as List<dynamic>? ?? <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(Invoice.fromJson)
        .toList(),
  );

  final int billedInPaise;
  final int paidInPaise;
  final int outstandingInPaise;
  final List<Invoice> invoices;
}

class Invoice {
  Invoice({
    required this.invoiceNo,
    required this.period,
    required this.dueDate,
    required this.status,
    required this.netInPaise,
    required this.paidInPaise,
  });

  factory Invoice.fromJson(Map<String, dynamic> json) => Invoice(
    invoiceNo: json['invoiceNo'] as String? ?? '',
    period: json['periodLabel'] as String? ?? json['period'] as String? ?? '',
    dueDate: json['dueDate'] as String? ?? '',
    status: json['status'] as String? ?? '',
    netInPaise: (json['netInPaise'] as num?)?.toInt() ?? 0,
    paidInPaise: (json['paidInPaise'] as num?)?.toInt() ?? 0,
  );

  final String invoiceNo;
  final String period;
  final String dueDate;
  final String status;
  final int netInPaise;
  final int paidInPaise;

  int get outstandingInPaise => netInPaise - paidInPaise;
}

class SkillProgress {
  SkillProgress({
    required this.skillId,
    required this.skillName,
    required this.masteryPercent,
    required this.attemptsCount,
    required this.basis,
  });

  factory SkillProgress.fromJson(Map<String, dynamic> json) => SkillProgress(
    skillId: json['skillId'] as String,
    skillName: json['skillName'] as String,
    masteryPercent: (json['masteryPercent'] as num?)?.toInt() ?? 0,
    attemptsCount: (json['attemptsCount'] as num?)?.toInt() ?? 0,
    basis: json['basis'] as String? ?? '',
  );

  final String skillId;
  final String skillName;
  final int masteryPercent;
  final int attemptsCount;

  /// "8 of 10 questions across 2 attempts" — the percentage never travels
  /// without it, so a parent and a teacher can discuss the same thing.
  final String basis;
}
