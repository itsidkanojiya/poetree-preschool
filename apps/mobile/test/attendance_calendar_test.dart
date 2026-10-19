import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/features/attendance/attendance_calendar_controller.dart';
import 'package:poetree_school/features/attendance/attendance_calendar_view.dart';
import 'package:poetree_school/features/attendance/school_day.dart';
import 'package:poetree_school/features/auth/auth_controller.dart';
import 'package:poetree_school/features/parent/child_controller.dart';
import 'package:poetree_school/features/parent/children_controller.dart';

/// The attendance calendar and a day's details, against a school whose today
/// is Tuesday 20 October 2026 — so that opening the 8th can be told apart from
/// showing today.

class _NoTokens implements TokenStore {
  @override
  Future<String?> get accessToken async => 'token';
  @override
  Future<String?> get refreshToken async => null;
  @override
  Future<void> save({required String access, required String refresh}) async {}
  @override
  Future<void> clear() async {}
}

class _Api implements HttpClientAdapter {
  _Api(this.respond);

  final Object? Function(String path, Map<String, dynamic> query) respond;
  final asked = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final query = options.queryParameters;
    asked.add('${options.path} ${query['from'] ?? ''}..${query['to'] ?? ''}');
    final answer = respond(options.path, query);
    final failed = answer == null || answer is int;
    return ResponseBody.fromString(
      jsonEncode(
        failed
            ? {
                'error': {'code': 'X', 'message': 'Something went wrong.'},
              }
            : answer,
      ),
      answer is int ? answer : (answer == null ? 404 : 200),
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Map<String, dynamic> _page(List<Map<String, dynamic>> items) => {
  'items': items,
  'total': items.length,
};

Map<String, dynamic> _homework(
  String id,
  String title,
  String due,
  String set,
) => {
  'id': id,
  'title': title,
  'description': 'About $title.',
  'dueDate': '${due}T00:00:00.000Z',
  'assignedOn': set,
  'allowsSubmission': true,
  'assignedBy': 'Ms Rao',
  'classroom': {'label': 'Nursery — A'},
};

Map<String, dynamic> _notice(String id, String title, String publishAt) => {
  'id': id,
  'title': title,
  'body': 'Details of $title.',
  'type': 'GENERAL',
  'publishAt': publishAt,
  'pinned': false,
  'readByMe': false,
};

/// October's register, homework and notices — each only when asked for by
/// the month, the way the calendar asks.
Object? _school(String path, Map<String, dynamic> query) {
  final from = query['from'] as String?;
  final october = from == '2026-10-01';
  final september = from == '2026-09-01';
  return switch (path) {
    '/me/children' => [
      {
        'id': 's1',
        'fullName': 'Aarav Shah',
        'admissionNo': 'A1',
        'classroom': {'id': 'c1', 'label': 'Nursery — A'},
      },
    ],
    '/attendance/children/s1' when october => {
      'days': [
        {'date': '2026-10-06', 'status': 'PRESENT'},
        {'date': '2026-10-08', 'status': 'ABSENT', 'remark': 'Fever'},
        {'date': '2026-10-13', 'status': 'LATE'},
        {'date': '2026-10-14', 'status': 'LEAVE'},
        {'date': '2026-10-17', 'status': 'HALF_DAY'},
        {'date': '2026-10-20', 'status': 'PRESENT'},
      ],
    },
    '/attendance/children/s1' when september => {
      'days': [
        {'date': '2026-09-15', 'status': 'PRESENT'},
      ],
    },
    '/attendance/children/s1' => {'days': <Object>[]},
    '/homework' when october => _page([
      // Set a week before, due on the 8th.
      _homework(
        'h1',
        'Counting worksheet',
        '2026-10-08',
        '2026-10-01T05:00:00Z',
      ),
      // Set at 23:30 on the 8th in India — 18:00 UTC.
      _homework('h2', 'Draw a leaf', '2026-10-12', '2026-10-08T18:00:00Z'),
      // Today's, which must not appear on the 8th.
      _homework('h3', 'Today’s rhyme', '2026-10-20', '2026-10-19T05:00:00Z'),
    ]),
    '/notices' when october => _page([
      // 23:30 on the 8th in India.
      _notice('n1', 'Sports day', '2026-10-08T18:00:00Z'),
      // 00:30 on the 9th in India, though UTC still calls it the 8th.
      _notice('n2', 'Rain holiday', '2026-10-08T19:00:00Z'),
      _notice('n3', 'Today’s note', '2026-10-20T04:00:00Z'),
    ]),
    // The parent pages' own recent lists: empty, so the day view is seen to
    // stand on the month it fetched rather than on these.
    '/homework' || '/notices' => _page(const []),
    _ => null,
  };
}

_Api _install(
  Object? Function(String path, Map<String, dynamic> query) respond,
) {
  final adapter = _Api(respond);
  Get.put<ApiService>(
    ApiService()
      ..client = ApiClient(
        _NoTokens(),
        dio: Dio()..httpClientAdapter = adapter,
      ),
  );
  return adapter;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i += 1) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

/// The calendar, opened for Aarav on 20 October 2026.
Future<_Api> _open(
  WidgetTester tester, {
  Object? Function(String, Map<String, dynamic>) respond = _school,
}) async {
  await tester.binding.setSurfaceSize(const Size(400, 2200));
  addTearDown(() => tester.binding.setSurfaceSize(null));

  final api = _install(respond);
  Get.put(AuthController());
  final children = Get.put(ChildrenController());
  final child = Get.put(ChildController(children));
  await tester.pumpWidget(const GetMaterialApp(home: SizedBox()));
  await _settle(tester);

  await tester.pumpWidget(
    GetMaterialApp(
      home: AttendanceCalendarView(child: child, today: DateTime(2026, 10, 20)),
    ),
  );
  await _settle(tester);
  return api;
}

int _monthRequests(_Api api, String path, String from) =>
    api.asked.where((line) => line.startsWith('$path $from')).length;

void main() {
  tearDown(Get.reset);

  group('school days', () {
    test('a timestamp belongs to its day in India, not in UTC', () {
      expect(schoolDayOf('2026-10-08T18:00:00Z'), '2026-10-08'); // 23:30 IST
      expect(schoolDayOf('2026-10-08T19:00:00Z'), '2026-10-09'); // 00:30 IST
      expect(schoolDayOf(null), isNull);
    });

    test('a date-only value keeps its date whatever zone it is read in', () {
      expect(dateOnly('2026-10-08T00:00:00.000Z'), '2026-10-08');
      expect(dateOnly('2026-10-08'), '2026-10-08');
    });

    test('the school’s today turns over at midnight in India', () {
      expect(
        schoolToday(DateTime.utc(2026, 10, 19, 18, 29)),
        DateTime(2026, 10, 19),
      );
      expect(
        schoolToday(DateTime.utc(2026, 10, 19, 18, 31)),
        DateTime(2026, 10, 20),
      );
    });
  });

  testWidgets('marks each day in its own status, and sums up the month', (
    tester,
  ) async {
    await _open(tester);

    expect(find.text('October 2026'), findsOneWidget);
    expect(
      find.bySemanticsLabel('8 October, Absent, homework, announcement'),
      findsOneWidget,
    );
    expect(find.bySemanticsLabel('13 October, Late'), findsOneWidget);
    expect(find.bySemanticsLabel('17 October, Half day'), findsOneWidget);
    // A day with no register is not an absence.
    expect(find.bySemanticsLabel('7 October, no register'), findsOneWidget);
    expect(
      find.bySemanticsLabel(RegExp(r'^20 October, today, Present')),
      findsOneWidget,
    );

    for (final count in [
      '2 Present',
      '1 Absent',
      '1 Late',
      '1 Leave',
      '1 Half day',
    ]) {
      expect(find.bySemanticsLabel(count), findsOneWidget, reason: count);
    }
  });

  testWidgets('opening the 8th shows the 8th — never today', (tester) async {
    final api = await _open(tester);

    await tester.tap(find.bySemanticsLabel(RegExp(r'^8 October, Absent')));
    await _settle(tester);

    expect(find.text('8 October 2026'), findsOneWidget);
    expect(find.text('Thursday'), findsOneWidget);
    expect(find.text('Marked absent on 8 October 2026.'), findsOneWidget);
    expect(find.text('Teacher’s note: “Fever”'), findsOneWidget);

    // Due that day, and set that night by India's clock.
    expect(find.text('Homework (2)'), findsOneWidget);
    expect(find.text('Counting worksheet'), findsOneWidget);
    expect(find.text('Due this day'), findsOneWidget);
    expect(find.text('Draw a leaf'), findsOneWidget);
    expect(find.text('Due 12 Oct'), findsOneWidget);
    expect(find.text('Today’s rhyme'), findsNothing);

    // Posted at 23:30 on the 8th; the one at 00:30 is the 9th's.
    expect(find.text('Notifications (1)'), findsOneWidget);
    expect(find.text('Sports day'), findsOneWidget);
    expect(find.text('11:30 PM'), findsOneWidget);
    expect(find.text('Rain holiday'), findsNothing);
    expect(find.text('Today’s note'), findsNothing);

    // Answered from the month already fetched: one request each, no more.
    expect(_monthRequests(api, '/homework', '2026-10-01'), 1);
    expect(_monthRequests(api, '/notices', '2026-10-01'), 1);
  });

  testWidgets('stepping on shows each day’s own, and says when there is none', (
    tester,
  ) async {
    await _open(tester);
    await tester.tap(find.bySemanticsLabel(RegExp(r'^8 October, Absent')));
    await _settle(tester);

    await tester.tap(find.bySemanticsLabel('Next day'));
    await _settle(tester);
    expect(find.text('9 October 2026'), findsOneWidget);
    expect(find.text('Attendance not recorded'), findsOneWidget);
    expect(find.text('No homework for this day'), findsOneWidget);
    expect(find.text('Rain holiday'), findsOneWidget);

    await tester.tap(find.bySemanticsLabel('Next day'));
    await _settle(tester);
    expect(find.text('10 October 2026'), findsOneWidget);
    expect(find.text('Attendance not recorded'), findsOneWidget);
    expect(find.text('No homework for this day'), findsOneWidget);
    expect(find.text('No notifications for this day'), findsOneWidget);

    // Back to a day of a different status.
    for (var i = 0; i < 5; i++) {
      await tester.tap(find.bySemanticsLabel('Next day'));
      await _settle(tester);
    }
    expect(find.text('15 October 2026'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Previous day'));
    await _settle(tester);
    expect(find.text('14 October 2026'), findsOneWidget);
    expect(find.text('On leave on 14 October 2026.'), findsOneWidget);
  });

  testWidgets('another month is fetched once, and kept', (tester) async {
    final api = await _open(tester);

    await tester.tap(find.bySemanticsLabel('Previous month'));
    await _settle(tester);
    expect(find.text('September 2026'), findsOneWidget);
    expect(find.bySemanticsLabel('15 September, Present'), findsOneWidget);
    expect(_monthRequests(api, '/attendance/children/s1', '2026-09-01'), 1);

    await tester.tap(find.bySemanticsLabel('Next month'));
    await _settle(tester);
    expect(find.text('October 2026'), findsOneWidget);
    // October was already here: not asked for again.
    expect(_monthRequests(api, '/attendance/children/s1', '2026-10-01'), 1);
    // And nothing beyond the school's today.
    expect(
      tester.getSemantics(find.bySemanticsLabel('Next month')),
      isSemantics(isButton: true, hasEnabledState: true, isEnabled: false),
    );
  });

  testWidgets('a month that will not load offers to try again', (tester) async {
    var failing = true;
    await _open(
      tester,
      respond: (path, query) =>
          failing &&
              path == '/attendance/children/s1' &&
              query['from'] == '2026-10-01'
          ? 500
          : _school(path, query),
    );

    expect(find.text('Try again'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'^8 October, Absent')), findsNothing);

    failing = false;
    await tester.tap(find.text('Try again'));
    await _settle(tester);
    expect(find.text('Try again'), findsNothing);
    expect(
      find.bySemanticsLabel(RegExp(r'^8 October, Absent')),
      findsOneWidget,
    );
  });

  test('a day is sorted from its month by the school’s clock', () {
    final month = MonthRecords(
      days: [
        AttendanceDay.fromJson({'date': '2026-10-08', 'status': 'LATE'}),
      ],
      homework: [
        HomeworkItem.fromJson(
          _homework('h2', 'Draw a leaf', '2026-10-12', '2026-10-08T18:00:00Z'),
        ),
      ],
      notices: [
        NoticeItem.fromJson(_notice('n2', 'Rain', '2026-10-08T19:00:00Z')),
      ],
    );

    final eighth = month.day('2026-10-08');
    expect(eighth.attendance?.status, 'LATE');
    expect(eighth.homework.map((h) => h.title), ['Draw a leaf']);
    expect(eighth.notices, isEmpty);

    final ninth = month.day('2026-10-09');
    expect(ninth.attendance, isNull);
    expect(ninth.homework, isEmpty);
    expect(ninth.notices.map((n) => n.title), ['Rain']);

    // Due on the 12th: that day too.
    expect(month.day('2026-10-12').homework, hasLength(1));
    expect(month.counts, {'LATE': 1});
  });
}
