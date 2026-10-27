import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/features/timetable/timetable_controller.dart';
import 'package:poetree_school/features/timetable/timetable_style.dart';
import 'package:poetree_school/features/timetable/timetable_view.dart';

/// The timetable a family and a teacher read: a day at a time, breaks where
/// the school put them, every lesson with its time and teacher.

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
  _Api(this.answer, {this.status = 200});

  final Object answer;
  final int status;
  final asked = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    asked.add(options.path);
    return ResponseBody.fromString(
      jsonEncode(answer),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Map<String, dynamic> _period(
  String id,
  String name,
  String start,
  String end, {
  bool isBreak = false,
}) => {
  'id': id,
  'name': name,
  'startTime': start,
  'endTime': end,
  'isBreak': isBreak,
};

Map<String, dynamic> _entry(
  int day,
  String period,
  String subjectId,
  String subject,
  String teacher,
) => {
  'dayOfWeek': day,
  'periodId': period,
  'subject': {'id': subjectId, 'name': subject},
  'teacher': {'id': 't-$teacher', 'name': teacher},
};

final _week = {
  'periods': [
    _period('p1', 'Period 1', '09:00', '09:30'),
    _period('p2', 'Period 2', '09:45', '10:25'),
    _period('b1', 'Snack', '10:25', '10:50', isBreak: true),
    _period('p3', 'Period 3', '10:50', '11:30'),
    _period('p4', 'Period 4', '11:30', '12:10'),
  ],
  'entries': [
    _entry(2, 'p1', 's-hin', 'Hindi', 'Anita Deshmukh'),
    _entry(2, 'p2', 's-guj', 'Gujarati', 'Rahul Kulkarni'),
    _entry(2, 'p3', 's-mat', 'Maths', 'Anita Deshmukh'),
    _entry(3, 'p1', 's-mat', 'Maths', 'Anita Deshmukh'),
  ],
};

Future<_Api> _open(
  WidgetTester tester,
  Object answer, {
  bool forTeacher = false,
  int status = 200,
}) async {
  await tester.binding.setSurfaceSize(const Size(420, 1400));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final api = _Api(answer, status: status);
  Get.put<ApiService>(
    ApiService()
      ..client = ApiClient(_NoTokens(), dio: Dio()..httpClientAdapter = api),
  );
  Get.put(
    TimetableController(
      classroomId: forTeacher ? null : 'c1',
      forTeacher: forTeacher,
    ),
  );
  await tester.pumpWidget(const GetMaterialApp(home: TimetableView()));
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
  return api;
}

Future<void> _pick(WidgetTester tester, String day) async {
  await tester.tap(find.bySemanticsLabel(day));
  await tester.pump();
}

void main() {
  tearDown(Get.reset);

  group('the picture for a subject', () {
    test('is chosen from its name', () {
      expect(SubjectPicture.of('Maths'), SubjectPicture.numbers);
      expect(SubjectPicture.of('Number Work'), SubjectPicture.numbers);
      expect(SubjectPicture.of('Hindi'), SubjectPicture.book);
      expect(SubjectPicture.of('English Phonics'), SubjectPicture.book);
      expect(SubjectPicture.of('EVS'), SubjectPicture.globe);
      expect(SubjectPicture.of('Social'), SubjectPicture.globe);
      expect(SubjectPicture.of('GK'), SubjectPicture.globe);
      expect(SubjectPicture.of('PE'), SubjectPicture.ball);
      expect(SubjectPicture.of('Free Play'), SubjectPicture.ball);
      // The "pe" in "speaking" is not PE.
      expect(SubjectPicture.of('Speaking'), SubjectPicture.letter);
      expect(SubjectPicture.of('Art'), SubjectPicture.letter);
    });
  });

  testWidgets(
    'a child’s day: lessons, the snack where it falls, a free period',
    (tester) async {
      final api = await _open(tester, _week);
      await _pick(tester, 'Tue');

      expect(find.text('Timetable'), findsOneWidget);
      expect(
        find.text('Here’s your child’s daily class schedule'),
        findsOneWidget,
      );
      // Only days with lessons are offered.
      expect(find.bySemanticsLabel('Mon'), findsNothing);
      expect(find.bySemanticsLabel('Wed'), findsOneWidget);

      expect(find.text('Hindi'), findsOneWidget);
      expect(find.text('09:00 – 09:30'), findsOneWidget);
      expect(find.text('Rahul Kulkarni'), findsOneWidget);
      expect(find.bySemanticsLabel('Snack, 10:25 – 10:50'), findsOneWidget);
      expect(find.bySemanticsLabel('Free, 11:30 – 12:10'), findsOneWidget);

      // The snack sits between Gujarati and Maths, as the school's day does.
      final gujarati = tester.getTopLeft(find.text('Gujarati')).dy;
      final snack = tester
          .getTopLeft(find.bySemanticsLabel('Snack, 10:25 – 10:50'))
          .dy;
      final maths = tester.getTopLeft(find.text('Maths')).dy;
      expect(gujarati < snack && snack < maths, isTrue);

      // Another day is the same week, not another request.
      await _pick(tester, 'Wed');
      expect(find.text('Hindi'), findsNothing);
      expect(find.text('Maths'), findsOneWidget);
      expect(api.asked, ['/timetable/classrooms/c1']);
    },
  );

  testWidgets('a subject keeps its colour from day to day', (tester) async {
    await _open(tester, _week);
    await _pick(tester, 'Tue');
    final tuesday = tester.widget<SubjectCard>(
      find.ancestor(of: find.text('Maths'), matching: find.byType(SubjectCard)),
    );
    final hindi = tester.widget<SubjectCard>(
      find.ancestor(of: find.text('Hindi'), matching: find.byType(SubjectCard)),
    );
    await _pick(tester, 'Wed');
    final wednesday = tester.widget<SubjectCard>(
      find.ancestor(of: find.text('Maths'), matching: find.byType(SubjectCard)),
    );
    expect(wednesday.colours, same(tuesday.colours));
    expect(hindi.colours, isNot(same(tuesday.colours)));
  });

  testWidgets('a teacher sees their own classes, day by day', (tester) async {
    await _open(tester, [
      {
        'dayOfWeek': 1,
        'subject': 'Maths',
        'room': 'Room 2',
        'classroomLabel': 'Nursery A',
        'period': {
          'name': 'Period 1',
          'startTime': '09:00',
          'endTime': '09:30',
        },
      },
    ], forTeacher: true);
    await _pick(tester, 'Mon');

    expect(find.text('Your classes, day by day'), findsOneWidget);
    expect(find.text('Nursery A'), findsOneWidget);
    expect(find.text('Maths'), findsOneWidget);
    expect(find.text('Room 2'), findsOneWidget);
  });

  testWidgets('says so when the school has not filled in the week', (
    tester,
  ) async {
    await _open(tester, {'periods': <Object>[], 'entries': <Object>[]});
    expect(find.text('No timetable yet'), findsOneWidget);
    expect(find.text('The school has not filled in the week.'), findsOneWidget);
  });

  testWidgets('says what went wrong, with a way to try again', (tester) async {
    await _open(tester, {
      'error': {'code': 'X', 'message': 'The school could not be reached.'},
    }, status: 500);
    expect(find.text('Could not load the timetable'), findsOneWidget);
    expect(find.text('The school could not be reached.'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });
}
