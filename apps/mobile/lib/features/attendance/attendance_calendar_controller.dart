import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import '../parent/child_controller.dart';
import 'school_day.dart';

/// What the calendar knows about one day: its register, and the homework and
/// notices that belong to it.
class DayRecords {
  const DayRecords({
    required this.key,
    required this.attendance,
    required this.homework,
    required this.notices,
  });

  /// `YYYY-MM-DD`.
  final String key;

  /// Null when no register was taken — never shown as an absence.
  final AttendanceDay? attendance;
  final List<HomeworkItem> homework;
  final List<NoticeItem> notices;
}

/// One month of a child's school life, fetched once and sorted into days.
class MonthRecords {
  MonthRecords({
    required List<AttendanceDay> days,
    required this.homework,
    required this.notices,
  }) : _days = {for (final day in days) dateOnly(day.date) ?? day.date: day};

  final Map<String, AttendanceDay> _days;
  final List<HomeworkItem> homework;
  final List<NoticeItem> notices;

  /// A day's homework is what was set that day or is due that day — the same
  /// rule the API filters the month by.
  bool _homeworkOn(HomeworkItem item, String key) =>
      dateOnly(item.dueDate) == key || schoolDayOf(item.setOn) == key;

  DayRecords day(String key) => DayRecords(
    key: key,
    attendance: _days[key],
    homework: homework.where((item) => _homeworkOn(item, key)).toList(),
    notices: notices.where((n) => schoolDayOf(n.publishAt) == key).toList(),
  );

  String? statusOn(String key) => _days[key]?.status;
  bool hasHomeworkOn(String key) =>
      homework.any((item) => _homeworkOn(item, key));
  bool hasNoticeOn(String key) =>
      notices.any((n) => schoolDayOf(n.publishAt) == key);

  /// How many days had each status this month.
  Map<String, int> get counts {
    final counts = <String, int>{};
    for (final day in _days.values) {
      counts[day.status] = (counts[day.status] ?? 0) + 1;
    }
    return counts;
  }

  int get markedDays => _days.length;
}

/// The attendance calendar's data, a month at a time.
///
/// Three requests per month — the register, the homework and the notices for
/// those dates — and nothing more: choosing a day, or stepping from day to day
/// within the month, is answered from what is already here. The calendar and
/// a day's details share one controller, so neither fetches what the other
/// already has.
class AttendanceCalendarController extends GetxController {
  AttendanceCalendarController({
    required this.studentId,
    required this.classroomId,
    required this.childName,
    DateTime? today,
  }) : today = today ?? schoolToday();

  final String studentId;
  final String? classroomId;
  final String childName;

  /// The school's today, fixed when the calendar opens.
  final DateTime today;

  /// The month on screen, as its first day.
  late final month = DateTime(today.year, today.month).obs;

  /// The day last opened, highlighted when the parent comes back to the month.
  final selected = RxnString();

  final _months = <String, MonthRecords>{}.obs;
  final _loading = <String>{}.obs;
  final _errors = <String, String>{}.obs;

  /// How far back the calendar goes: a school year and a little.
  static const monthsBack = 14;

  DateTime get earliestMonth =>
      DateTime(today.year, today.month - monthsBack + 1);
  DateTime get latestMonth => DateTime(today.year, today.month);

  bool get canGoBack => month.value.isAfter(earliestMonth);
  bool get canGoForward => month.value.isBefore(latestMonth);

  static String keyOf(DateTime month) =>
      dayKey(DateTime(month.year, month.month)).substring(0, 7);

  MonthRecords? recordsFor(DateTime month) => _months[keyOf(month)];
  bool isLoading(DateTime month) => _loading.contains(keyOf(month));
  String? errorFor(DateTime month) => _errors[keyOf(month)];

  /// The day's records, or null while its month is still on its way.
  DayRecords? dayRecords(DateTime date) => recordsFor(date)?.day(dayKey(date));

  @override
  void onInit() {
    super.onInit();
    unawaited(ensure(month.value));
  }

  void showMonth(DateTime value) {
    final target = DateTime(value.year, value.month);
    if (target.isBefore(earliestMonth) || target.isAfter(latestMonth)) return;
    month.value = target;
    unawaited(ensure(target));
  }

  /// Fetches a month unless it is here already or on its way.
  Future<void> ensure(DateTime month) async {
    final key = keyOf(month);
    if (_months.containsKey(key) || _loading.contains(key)) return;
    await _load(DateTime(month.year, month.month));
  }

  /// Fetches a month again, after a failure or a pull to refresh.
  Future<void> reload(DateTime month) async {
    final key = keyOf(month);
    if (_loading.contains(key)) return;
    _errors.remove(key);
    await _load(DateTime(month.year, month.month));
  }

  Future<void> _load(DateTime first) async {
    final key = keyOf(first);
    final last = DateTime(first.year, first.month + 1, 0);
    final from = dayKey(first);
    final to = dayKey(last);

    _loading.add(key);
    _errors.remove(key);
    try {
      final results = await Future.wait<Object>([
        api.get<Map<String, dynamic>>(
          '/attendance/children/$studentId',
          query: {'from': from, 'to': to},
        ),
        if (classroomId != null)
          _everyPage('/homework', {
            'classroomId': classroomId,
            // Named so each row carries this child's own submission.
            'studentId': studentId,
            'from': from,
            'to': to,
          })
        else
          Future<List<Map<String, dynamic>>>.value(const []),
        _everyPage('/notices', {'from': from, 'to': to}),
      ]);

      final attendance = ChildAttendance.fromJson(
        results[0] as Map<String, dynamic>,
      );
      _months[key] = MonthRecords(
        days: attendance.days,
        homework: (results[1] as List<Map<String, dynamic>>)
            .map(HomeworkItem.fromJson)
            .toList(),
        notices: (results[2] as List<Map<String, dynamic>>)
            .map(NoticeItem.fromJson)
            .toList(),
      );
    } on DioException catch (e) {
      final payload = e.response?.data;
      _errors[key] = payload is Map && payload['error'] is Map
          ? (payload['error'] as Map)['message']?.toString() ??
                'Could not load this month.'
          : 'Cannot reach the school right now. Check your connection.';
    } finally {
      _loading.remove(key);
    }
  }

  /// Every row of a list, a hundred at a time. A month rarely needs a second
  /// page, but a day that silently lost its homework to page one would be
  /// wrong in a way nobody could see.
  Future<List<Map<String, dynamic>>> _everyPage(
    String path,
    Map<String, dynamic> query,
  ) async {
    const pageSize = 100;
    final rows = <Map<String, dynamic>>[];
    for (var page = 1; page <= 10; page++) {
      final data = await api.get<Map<String, dynamic>>(
        path,
        query: {...query, 'page': page, 'pageSize': pageSize},
      );
      final items = (data['items'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList();
      rows.addAll(items);
      final total = (data['total'] as num?)?.toInt() ?? rows.length;
      if (items.length < pageSize || rows.length >= total) break;
    }
    return rows;
  }
}
