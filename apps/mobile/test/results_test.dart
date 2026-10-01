import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/features/results/report_entry_controller.dart';
import 'package:poetree_school/features/results/report_entry_view.dart';
import 'package:poetree_school/features/results/results_models.dart';

/// Report cards: what a family is shown, and a teacher filling in a class one
/// child at a time against a scripted API.

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

/// Answers from a script and keeps what was sent.
class _Api implements HttpClientAdapter {
  _Api(this.respond);

  final Object? Function(String method, String path, Object? body) respond;
  final sent = <(String, String, Object?)>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final body = options.data;
    sent.add((options.method, options.path, body));
    final answer = respond(options.method, options.path, body);
    final status = answer is _Refusal ? answer.status : 200;
    return ResponseBody.fromString(
      jsonEncode(
        answer is _Refusal
            ? {
                'error': {'code': 'X', 'message': answer.message},
              }
            : answer,
      ),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _Refusal {
  _Refusal(this.status, this.message);
  final int status;
  final String message;
}

Map<String, dynamic> _term(String id, String name, {String? startsOn}) => {
  'id': id,
  'academicYearId': 'y1',
  'academicYearName': '2026–27',
  'name': name,
  'sortOrder': 0,
  'startsOn': startsOn,
  'endsOn': null,
  'isActive': true,
};

Map<String, dynamic> _child(
  String id,
  String name, {
  String status = 'NOT_STARTED',
  Map<String, String?> grades = const {},
}) => {
  'studentId': id,
  'fullName': name,
  'rollNo': null,
  'reportCardId': status == 'NOT_STARTED' ? null : 'rc-$id',
  'status': status,
  'remarks': null,
  'grades': grades,
  'graded': grades.values.where((g) => g != null).length,
};

Map<String, dynamic> _grid(List<Map<String, dynamic>> children) => {
  'classroom': {'id': 'k1', 'label': 'Nursery — A', 'classLevelId': 'l1'},
  'term': _term('t1', 'Term 1', startsOn: '2026-06-01T00:00:00.000Z'),
  'areas': [
    {
      'id': 'a1',
      'classLevelId': 'l1',
      'group': 'Development',
      'name': 'Fine motor skills',
      'sortOrder': 0,
      'isActive': true,
    },
    {
      'id': 'a2',
      'classLevelId': 'l1',
      'group': 'Development',
      'name': 'Music & movement',
      'sortOrder': 1,
      'isActive': true,
    },
  ],
  'scale': [
    {'id': 'g1', 'label': 'Excellent', 'description': null, 'sortOrder': 0},
    {'id': 'g2', 'label': 'Good', 'description': null, 'sortOrder': 1},
  ],
  'children': children,
  'counts': {'notStarted': 0, 'draft': 0, 'submitted': 0, 'published': 0},
};

_Api _install(
  Object? Function(String method, String path, Object? body) respond,
) {
  final adapter = _Api(respond);
  final service = ApiService()
    ..client = ApiClient(_NoTokens(), dio: Dio()..httpClientAdapter = adapter);
  Get.put<ApiService>(service);
  return adapter;
}

void main() {
  tearDown(Get.reset);

  group('what a family reads', () {
    final card = ReportCard.fromJson({
      'id': 'rc1',
      'status': 'PUBLISHED',
      'term': 'Term 1',
      'academicYear': '2026–27',
      'student': {
        'id': 's1',
        'fullName': 'Dishan Patel',
        'admissionNo': 'A1',
        'rollNo': '4',
        'dateOfBirth': '2022-01-01',
      },
      'classroom': 'Nursery — A',
      'groups': [
        {
          'group': 'Development',
          'rows': [
            {'area': 'Fine motor skills', 'grade': 'Excellent'},
            {'area': 'Music & movement', 'grade': null},
          ],
        },
      ],
      'scale': [
        {'label': 'Excellent', 'description': 'Confident'},
        {'label': 'Good', 'description': null},
        {'label': 'Needs practice', 'description': null},
      ],
      'remarks': 'A joy to teach.',
      'classTeacher': 'Asha',
      'principal': null,
      'publishedAt': '2026-10-01T10:00:00.000Z',
    });

    test('keeps the grades as they were sent, ungraded rows included', () {
      expect(card.groups.single.rows.map((r) => r.grade), ['Excellent', null]);
      expect(card.rollNo, '4');
      expect(card.principal, isNull);
    });

    test('knows where a grade sits on the school’s own scale', () {
      expect(card.standing('Excellent'), 0);
      expect(card.standing('Good'), 0.5);
      expect(card.standing('Needs practice'), 1);
      // A grade the scale no longer has is not ranked at all.
      expect(card.standing('Outstanding'), isNull);
      expect(card.standing(null), isNull);
    });

    test('reads a certificate', () {
      final certificate = ChildCertificate.fromJson({
        'awardId': 'w1',
        'title': 'Star of the Month',
        'body': '',
        'design': 'STARS',
        'issuedOn': '2026-10-01T00:00:00.000Z',
        'number': 'CERT-0001',
      });
      expect(certificate.design, 'STARS');
      expect(certificate.number, 'CERT-0001');
    });
  });

  test('picks the term a school is in: the latest started, else the first', () {
    final terms = [
      Term.fromJson(
        _term('t1', 'Term 1', startsOn: '2026-06-01T00:00:00.000Z'),
      ),
      Term.fromJson(
        _term('t2', 'Term 2', startsOn: '2026-10-15T00:00:00.000Z'),
      ),
      Term.fromJson(
        _term('t3', 'Term 3', startsOn: '2099-01-01T00:00:00.000Z'),
      ),
    ];
    final current = Term.current(terms)!;
    expect(
      current.id,
      DateTime.now().isBefore(DateTime.utc(2026, 10, 15)) ? 't1' : 't2',
    );

    final none = [
      Term.fromJson(_term('t9', 'Later', startsOn: '2099-01-01T00:00:00.000Z')),
    ];
    expect(Term.current(none)!.id, 't9');
    expect(Term.current(const []), isNull);
  });

  test('a card with the office is no longer the teacher’s to change', () {
    expect(GridChild.fromJson(_child('s1', 'A')).editable, isTrue);
    expect(
      GridChild.fromJson(_child('s1', 'A', status: 'DRAFT')).editable,
      isTrue,
    );
    expect(
      GridChild.fromJson(_child('s1', 'A', status: 'SUBMITTED')).editable,
      isFalse,
    );
    expect(
      GridChild.fromJson(_child('s1', 'A', status: 'PUBLISHED')).editable,
      isFalse,
    );
  });

  testWidgets('a teacher grades one child, saves, and moves to the next', (
    tester,
  ) async {
    var saved = <String, dynamic>{};
    final api = _install((method, path, body) {
      if (path == '/results/terms') {
        return [_term('t1', 'Term 1', startsOn: '2026-06-01T00:00:00.000Z')];
      }
      if (path == '/results/classrooms/k1/terms/t1') {
        return _grid([_child('s1', 'Aarav Shah'), _child('s2', 'Meera Rao')]);
      }
      if (method == 'PUT' && path == '/results/report-cards') {
        saved = body! as Map<String, dynamic>;
        final grades = {
          for (final g in saved['grades'] as List)
            (g as Map)['areaId'] as String: g['gradeLevelId'] as String?,
        };
        return _child(
          saved['studentId'] as String,
          'Aarav Shah',
          status: 'DRAFT',
          grades: grades,
        );
      }
      return _Refusal(404, 'Not found');
    });

    // Not put into GetX: that would start a second load from onInit, inside
    // the test's fake clock.
    final controller = ReportEntryController(
      classroomId: 'k1',
      classroomLabel: 'Nursery — A',
    );
    await tester.runAsync(() => controller.load());
    expect(controller.grid.value!.children, hasLength(2));

    await tester.pumpWidget(
      GetMaterialApp(
        home: ReportChildEntryView(controller: controller, startAt: 0),
      ),
    );
    expect(find.text('Aarav Shah'), findsOneWidget);
    expect(find.text('1 of 2'), findsOneWidget);

    // Excellent for fine motor skills: the first chip on the page.
    await tester.tap(find.widgetWithText(ChoiceChip, 'Excellent').first);
    await tester.pump();
    await tester.enterText(find.byType(TextField), '  Loves to paint.  ');
    await tester.pump();

    await tester.runAsync(() async {
      await tester.tap(find.text('Save & next'));
      await Future<void>.delayed(const Duration(milliseconds: 50));
    });
    await tester.pumpAndSettle();

    expect(saved['termId'], 't1');
    expect(saved['studentId'], 's1');
    expect(saved['remarks'], 'Loves to paint.');
    expect(saved['grades'], [
      {'areaId': 'a1', 'gradeLevelId': 'g1'},
    ]);
    expect(api.sent.where((s) => s.$1 == 'PUT'), hasLength(1));

    // On to the next child, with the first one's card updated in the list.
    expect(find.text('Meera Rao'), findsOneWidget);
    expect(find.text('2 of 2'), findsOneWidget);
    expect(controller.grid.value!.children.first.status, 'DRAFT');
    expect(controller.grid.value!.children.first.graded, 1);
  });

  testWidgets('a card already with the office cannot be changed', (
    tester,
  ) async {
    _install((method, path, body) {
      if (path == '/results/terms') return [_term('t1', 'Term 1')];
      return _grid([
        _child('s1', 'Aarav Shah', status: 'SUBMITTED', grades: {'a1': 'g2'}),
      ]);
    });

    // Not put into GetX: that would start a second load from onInit, inside
    // the test's fake clock.
    final controller = ReportEntryController(
      classroomId: 'k1',
      classroomLabel: 'Nursery — A',
    );
    await tester.runAsync(() => controller.load());

    await tester.pumpWidget(
      GetMaterialApp(
        home: ReportChildEntryView(controller: controller, startAt: 0),
      ),
    );

    expect(find.textContaining('with the office'), findsOneWidget);
    final chip = tester.widget<ChoiceChip>(
      find.widgetWithText(ChoiceChip, 'Good').first,
    );
    expect(chip.selected, isTrue);
    expect(chip.onSelected, isNull);
    expect(find.text('Done'), findsOneWidget);
  });
}
