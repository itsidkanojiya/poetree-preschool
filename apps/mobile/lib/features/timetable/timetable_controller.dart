import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';

class Period {
  Period({
    required this.id,
    required this.name,
    required this.startTime,
    required this.endTime,
    required this.isBreak,
  });

  factory Period.fromJson(Map<String, dynamic> json) => Period(
    id: json['id'] as String,
    name: json['name'] as String,
    startTime: json['startTime'] as String? ?? '',
    endTime: json['endTime'] as String? ?? '',
    isBreak: json['isBreak'] as bool? ?? false,
  );

  final String id;
  final String name;
  final String startTime;
  final String endTime;
  final bool isBreak;
}

class Slot {
  Slot({
    required this.dayOfWeek,
    required this.periodId,
    this.subject,
    this.teacher,
    this.room,
    this.classroomLabel,
    this.periodName,
    this.startTime,
    this.endTime,
  });

  /// A classroom's grid: `{dayOfWeek, periodId, subject:{name}, ...}`.
  factory Slot.fromGrid(Map<String, dynamic> json) => Slot(
    dayOfWeek: (json['dayOfWeek'] as num).toInt(),
    periodId: json['periodId'] as String,
    subject: (json['subject'] as Map<String, dynamic>?)?['name'] as String?,
    teacher: (json['teacher'] as Map<String, dynamic>?)?['name'] as String?,
    room: (json['room'] as Map<String, dynamic>?)?['name'] as String?,
  );

  /// A teacher's own week, which carries the period inline and names the class
  /// rather than the teacher.
  factory Slot.fromTeacherWeek(Map<String, dynamic> json) {
    final period = json['period'] as Map<String, dynamic>? ?? const {};
    return Slot(
      dayOfWeek: (json['dayOfWeek'] as num).toInt(),
      periodId: '${json['dayOfWeek']}-${period['name']}',
      subject: json['subject'] as String?,
      room: json['room'] as String?,
      classroomLabel: json['classroomLabel'] as String?,
      periodName: period['name'] as String?,
      startTime: period['startTime'] as String?,
      endTime: period['endTime'] as String?,
    );
  }

  final int dayOfWeek;
  final String periodId;
  final String? subject;
  final String? teacher;
  final String? room;
  final String? classroomLabel;
  final String? periodName;
  final String? startTime;
  final String? endTime;
}

/// The week, for whoever is looking at it.
///
/// A parent sees their child's class; a teacher sees their own week assembled
/// across every class they take. Two different questions, so two endpoints —
/// and the teacher's is the one that answers "where am I meant to be now".
class TimetableController extends GetxController {
  TimetableController({required this.classroomId, required this.forTeacher});

  /// Null for a teacher, who has no single classroom.
  final String? classroomId;
  final bool forTeacher;

  final periods = <Period>[].obs;
  final slots = <Slot>[].obs;
  final isLoading = true.obs;
  final error = RxnString();

  /// Monday-first, and Sunday is dropped — a preschool does not run on it.
  static const days = <int, String>{
    1: 'Mon',
    2: 'Tue',
    3: 'Wed',
    4: 'Thu',
    5: 'Fri',
    6: 'Sat',
  };

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> load() async {
    isLoading.value = true;
    error.value = null;

    try {
      if (forTeacher) {
        final data = await api.get<List<dynamic>>('/timetable/me');
        slots.value = data
            .whereType<Map<String, dynamic>>()
            .map(Slot.fromTeacherWeek)
            .toList();
        periods.clear();
      } else if (classroomId != null) {
        final data = await api.get<Map<String, dynamic>>(
          '/timetable/classrooms/$classroomId',
        );
        periods.value = (data['periods'] as List<dynamic>? ?? <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(Period.fromJson)
            .toList();
        slots.value = (data['entries'] as List<dynamic>? ?? <dynamic>[])
            .whereType<Map<String, dynamic>>()
            .map(Slot.fromGrid)
            .toList();
      } else {
        periods.clear();
        slots.clear();
      }
    } on DioException catch (e) {
      final payload = e.response?.data;
      error.value = payload is Map && payload['error'] is Map
          ? (payload['error'] as Map)['message']?.toString() ??
                'Could not load the timetable.'
          : 'Cannot reach the school right now.';
    } finally {
      isLoading.value = false;
    }
  }

  Slot? slotAt(int dayOfWeek, String periodId) => slots.firstWhereOrNull(
    (s) => s.dayOfWeek == dayOfWeek && s.periodId == periodId,
  );

  /// A teacher's slots for one day, in period order.
  List<Slot> teacherDay(int dayOfWeek) =>
      slots.where((s) => s.dayOfWeek == dayOfWeek).toList()
        ..sort((a, b) => (a.startTime ?? '').compareTo(b.startTime ?? ''));

  /// Days that actually have something on them, so an empty Saturday does not
  /// take up a third of a phone screen.
  List<int> get activeDays =>
      days.keys.where((d) => slots.any((s) => s.dayOfWeek == d)).toList();
}
