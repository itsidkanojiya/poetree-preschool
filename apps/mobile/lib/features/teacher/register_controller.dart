import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import '../../core/offline/outbox.dart';

class Classroom {
  Classroom({
    required this.id,
    required this.label,
    required this.studentCount,
  });

  factory Classroom.fromJson(Map<String, dynamic> json) => Classroom(
    id: json['id'] as String,
    label: json['label'] as String,
    studentCount: (json['studentCount'] as num?)?.toInt() ?? 0,
  );

  final String id;
  final String label;
  final int studentCount;
}

/// One child on the register.
class RegisterRow {
  RegisterRow({
    required this.studentId,
    required this.fullName,
    required this.admissionNo,
    required this.status,
    this.rollNo,
    this.remark,
  });

  factory RegisterRow.fromJson(Map<String, dynamic> json) => RegisterRow(
    studentId: json['studentId'] as String,
    fullName: json['fullName'] as String,
    admissionNo: json['admissionNo'] as String,
    rollNo: json['rollNo'] as String?,
    status: json['status'] as String? ?? 'PRESENT',
    remark: json['remark'] as String?,
  );

  final String studentId;
  final String fullName;
  final String admissionNo;
  final String? rollNo;
  String status;
  String? remark;
}

/// Today's register.
///
/// The whole screen is built around one measurement: a teacher marks a class of
/// twenty-five in under thirty seconds, on a phone, while teaching. That is why
/// everyone starts present and only absentees are tapped, why the date is not
/// asked for unless it is wanted, and why saving never blocks on the network.
class RegisterController extends GetxController {
  RegisterController(this._outbox);

  final Outbox _outbox;

  final classrooms = <Classroom>[].obs;
  final selectedClassroomId = RxnString();
  final date = DateTime.now().obs;

  final rows = <RegisterRow>[].obs;
  final isLoading = false.obs;
  final isSaving = false.obs;
  final error = RxnString();

  final classroomLabel = ''.obs;
  final isHoliday = false.obs;
  final holidayTitle = RxnString();
  final alreadyMarked = false.obs;
  final markedByName = RxnString();
  final editable = true.obs;

  /// Set when the last save went to the outbox rather than the server.
  final queuedLocally = false.obs;

  int get pendingCount => _outbox.pendingCount;

  String get dateKey => date.value.toIso8601String().substring(0, 10);

  int get presentCount => rows.where((r) => r.status == 'PRESENT').length;
  int get absentCount => rows.where((r) => r.status == 'ABSENT').length;

  @override
  void onInit() {
    super.onInit();
    unawaited(loadClassrooms());
  }

  Future<void> loadClassrooms() async {
    isLoading.value = true;
    error.value = null;

    try {
      final data = await api.get<List<dynamic>>('/me/classrooms');
      classrooms.value = data
          .whereType<Map<String, dynamic>>()
          .map(Classroom.fromJson)
          .toList();

      if (classrooms.isEmpty) {
        isLoading.value = false;
        return;
      }

      // A teacher with one class should never have to choose it.
      selectedClassroomId.value ??= classrooms.first.id;
      await loadSheet();
    } on DioException catch (e) {
      error.value = _messageFor(e);
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> selectClassroom(String classroomId) async {
    selectedClassroomId.value = classroomId;
    await loadSheet();
  }

  Future<void> selectDate(DateTime value) async {
    date.value = value;
    await loadSheet();
  }

  Future<void> loadSheet() async {
    final classroomId = selectedClassroomId.value;
    if (classroomId == null) return;

    isLoading.value = true;
    error.value = null;
    queuedLocally.value = false;

    try {
      final data = await api.get<Map<String, dynamic>>(
        '/attendance/sheet',
        query: {'classroomId': classroomId, 'date': dateKey},
      );

      classroomLabel.value = data['classroomLabel'] as String? ?? '';
      isHoliday.value = data['isHoliday'] as bool? ?? false;
      holidayTitle.value = data['holidayTitle'] as String?;
      alreadyMarked.value = data['alreadyMarked'] as bool? ?? false;
      markedByName.value = data['markedByName'] as String?;
      editable.value = data['editable'] as bool? ?? false;

      rows.value = (data['rows'] as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(RegisterRow.fromJson)
          .toList();
    } on DioException catch (e) {
      error.value = _messageFor(e);
    } finally {
      isLoading.value = false;
    }
  }

  /// Cycles a child through the statuses a preschool actually uses.
  ///
  /// Tapping rather than choosing from a menu: five options behind a dialog
  /// would cost more taps than the whole register is allowed.
  void cycle(int index) {
    if (!editable.value) return;

    const order = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'HALF_DAY'];
    final current = rows[index].status;
    final next = order[(order.indexOf(current) + 1) % order.length];

    rows[index].status = next;
    rows.refresh();
  }

  void setStatus(int index, String status) {
    if (!editable.value) return;
    rows[index].status = status;
    rows.refresh();
  }

  /// Saves the register. Never fails for want of a signal.
  ///
  /// Returns a sentence for the teacher: either it is with the school office, or
  /// it is held on the phone and will go by itself.
  Future<String> save() async {
    final classroomId = selectedClassroomId.value;
    if (classroomId == null) return 'Choose a class first.';

    isSaving.value = true;

    try {
      final register = PendingRegister(
        classroomId: classroomId,
        date: dateKey,
        records: rows
            .map(
              (row) => <String, dynamic>{
                'studentId': row.studentId,
                'status': row.status,
                if (row.remark != null && row.remark!.isNotEmpty)
                  'remark': row.remark,
              },
            )
            .toList(),
      );

      final delivered = await _outbox.submit(register);
      queuedLocally.value = !delivered;
      alreadyMarked.value = true;

      return delivered
          ? 'Register saved.'
          : 'Saved on this phone. It will reach the school when you have signal.';
    } finally {
      isSaving.value = false;
    }
  }

  static String _messageFor(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] is Map) {
      return (data['error'] as Map)['message']?.toString() ??
          'Something went wrong.';
    }
    if (e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout) {
      return 'No connection. Marked registers are kept on the phone until there is.';
    }
    return 'Something went wrong.';
  }
}
