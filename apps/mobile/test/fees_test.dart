import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/features/auth/auth_controller.dart';
import 'package:poetree_school/features/fees/fee_details_view.dart';
import 'package:poetree_school/features/fees/fee_models.dart';
import 'package:poetree_school/features/fees/fee_plan_view.dart';
import 'package:poetree_school/features/fees/fees_view.dart';
import 'package:poetree_school/features/parent/child_controller.dart';
import 'package:poetree_school/features/parent/children_controller.dart';
import 'package:poetree_school/features/parent/parent_home_view.dart';

/// Settings, Fees, Fee Details and choosing an installment plan, against a
/// scripted school: ₹12,000 a year in four quarterly installments.

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

class _Refusal {
  const _Refusal(this.status, this.message);
  final int status;
  final String message;
}

class _Api implements HttpClientAdapter {
  _Api(this.respond);

  final Object? Function(String method, String path) respond;
  final sent = <(String, String)>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    sent.add((options.method, options.path));
    final answer = respond(options.method, options.path);
    final refusal = answer is _Refusal
        ? answer
        : answer == null
        ? const _Refusal(404, 'Not found')
        : null;
    return ResponseBody.fromString(
      jsonEncode(
        refusal != null
            ? {
                'error': {'code': 'X', 'message': refusal.message},
              }
            : answer,
      ),
      refusal?.status ?? 200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

_Api _install(Object? Function(String method, String path) respond) {
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

Map<String, dynamic> _entry(
  String id,
  String label,
  String due,
  String state, {
  String year = 'y1',
  String yearName = '2026-27',
  int paid = 0,
}) => {
  'id': id,
  'invoiceNo': 'INV-000$id',
  'periodLabel': label,
  'academicYearId': year,
  'academicYearName': yearName,
  'dueDate': due,
  'netInPaise': 300000,
  'paidInPaise': paid,
  'outstandingInPaise': 300000 - paid,
  'status': paid >= 300000 ? 'PAID' : 'ISSUED',
  'state': state,
  'overdue': state == 'OVERDUE',
};

final Map<String, dynamic> _ledger = {
  'invoices': [
    _entry('1', 'Q1', '2026-10-31', 'DUE_SOON'),
    _entry('2', 'Q2', '2027-01-31', 'UPCOMING'),
    _entry('3', 'Q3', '2027-04-30', 'UPCOMING'),
    _entry('4', 'Q4', '2027-07-31', 'UPCOMING'),
    _entry(
      '9',
      'Annual',
      '2026-03-31',
      'PAID',
      year: 'y0',
      yearName: '2025-26',
      paid: 300000,
    ),
  ],
  'payments': <Object>[],
  'totals': {'billed': 1500000, 'paid': 300000, 'outstanding': 1200000},
  'years': [
    {'id': 'y1', 'name': '2026-27', 'isCurrent': true},
    {'id': 'y0', 'name': '2025-26', 'isCurrent': false},
  ],
};

Map<String, dynamic> _choice({bool chosen = false}) => {
  'academicYearId': 'y1',
  'academicYearName': '2026-27',
  'yearInPaise': 1200000,
  'paidInPaise': 0,
  'remainingInPaise': 1200000,
  'current': chosen
      ? {
          'planId': 'quarterly',
          'planName': 'Quarterly',
          'chosenAt': '2026-10-14T00:00:00Z',
          'byFamily': true,
        }
      : null,
  'canChoose': !chosen,
  'reason': chosen ? 'Your installment plan is set for this year.' : null,
  'options': [
    {
      'id': 'annual',
      'name': 'Annual',
      'installments': [
        {'label': 'Annual', 'dueDate': '2026-10-31', 'amountInPaise': 1200000},
      ],
    },
    {
      'id': 'quarterly',
      'name': 'Quarterly',
      'installments': [
        for (final (i, due) in [
          '2026-10-31',
          '2027-01-31',
          '2027-04-30',
          '2027-07-31',
        ].indexed)
          {'label': 'Q${i + 1}', 'dueDate': due, 'amountInPaise': 300000},
      ],
    },
  ],
};

final Map<String, dynamic> _detail = {
  'id': '1',
  'invoiceNo': 'INV-00039',
  'periodLabel': 'Q1',
  'academicYearId': 'y1',
  'academicYearName': '2026-27',
  'issuedOn': '2026-10-01',
  'dueDate': '2026-10-31',
  'status': 'ISSUED',
  'state': 'DUE_SOON',
  'grossInPaise': 300000,
  'discountInPaise': 0,
  'netInPaise': 300000,
  'paidInPaise': 0,
  'outstandingInPaise': 300000,
  'lines': [
    {
      'description': 'Tuition Fee',
      'amountInPaise': 250000,
      'discountInPaise': 0,
    },
    {
      'description': 'Activity Fee',
      'amountInPaise': 37500,
      'discountInPaise': 0,
    },
    {
      'description': 'Transport Fee',
      'amountInPaise': 12500,
      'discountInPaise': 0,
    },
  ],
  'payments': <Object>[],
  'plan': {'name': 'Quarterly', 'position': 1, 'count': 4},
};

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i += 1) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

Future<void> _phone(WidgetTester tester, Size size) async {
  await tester.binding.setSurfaceSize(size);
  addTearDown(() => tester.binding.setSurfaceSize(null));
}

void main() {
  tearDown(Get.reset);

  group('money', () {
    test('reads in Indian grouping, with paise only when there are some', () {
      expect(rupees(1200000), '₹12,000');
      expect(rupees(12345670), '₹1,23,456.70');
      expect(rupees(0), '₹0');
      expect(rupees(99), '₹0.99');
    });
  });

  group('the fees screen', () {
    Future<void> open(WidgetTester tester, {bool chosen = false}) async {
      _install(
        (method, path) => switch (path) {
          '/fees/students/s1/ledger' => _ledger,
          '/me/children/s1/fee-plan' => _choice(chosen: chosen),
          _ => null,
        },
      );
      Get.put(FeesController(studentId: 's1', childName: 'Aarav'));
      await tester.pumpWidget(const GetMaterialApp(home: FeesView()));
      await _settle(tester);
    }

    testWidgets('shows what is owed, billed and paid, and every installment', (
      tester,
    ) async {
      await _phone(tester, const Size(400, 1600));
      await open(tester);

      expect(find.text('Outstanding Amount'), findsOneWidget);
      expect(find.text('₹12,000'), findsOneWidget); // outstanding, all years
      expect(find.text('₹15,000'), findsOneWidget); // billed
      expect(find.text('₹3,000'), findsWidgets); // paid, and each quarter
      for (final label in ['Q1', 'Q2', 'Q3', 'Q4', 'Annual']) {
        expect(find.text(label), findsOneWidget);
      }
      expect(find.text('Due'), findsOneWidget);
      expect(find.text('Upcoming'), findsNWidgets(3));
      expect(find.text('Stay on Track!'), findsOneWidget);
      expect(find.text('Choose an installment plan'), findsOneWidget);
    });

    testWidgets('has no Pay button anywhere', (tester) async {
      await _phone(tester, const Size(400, 1600));
      await open(tester);
      expect(
        find.textContaining(RegExp('pay now', caseSensitive: false)),
        findsNothing,
      );
      expect(find.widgetWithText(FilledButton, 'Pay'), findsNothing);
    });

    testWidgets('narrows to one year with the year filter', (tester) async {
      await _phone(tester, const Size(400, 1600));
      await open(tester);

      await tester.tap(find.text('All Years'));
      await _settle(tester);
      await tester.tap(find.text('2025-26').last);
      await _settle(tester);

      expect(find.text('Annual'), findsOneWidget);
      expect(find.text('Q1'), findsNothing);
      // Nothing owed that year.
      expect(find.text('₹0'), findsOneWidget);
    });

    testWidgets('names the chosen plan, and offers no other', (tester) async {
      await _phone(tester, const Size(400, 1600));
      await open(tester, chosen: true);
      expect(find.text('Quarterly installment plan'), findsOneWidget);
      expect(find.text('Choose an installment plan'), findsNothing);
    });

    testWidgets('fits a small phone', (tester) async {
      await _phone(tester, const Size(320, 640));
      await open(tester);
      expect(tester.takeException(), isNull);
    });
  });

  group('one installment', () {
    Future<void> open(WidgetTester tester, Map<String, dynamic> detail) async {
      _install((method, path) => path == '/fees/invoices/1' ? detail : null);
      Get.put(FeeDetailsController(invoiceId: '1'));
      await tester.pumpWidget(const GetMaterialApp(home: FeeDetailsView()));
      await _settle(tester);
    }

    testWidgets('itemises it, offers the invoice, and says no payments yet', (
      tester,
    ) async {
      await _phone(tester, const Size(400, 1400));
      await open(tester, _detail);

      expect(find.text('Q1 Fee'), findsOneWidget);
      expect(find.text('INV-00039'), findsOneWidget);
      expect(find.text('Due on 31 Oct 2026'), findsOneWidget);
      expect(find.text('Tuition Fee'), findsOneWidget);
      expect(find.text('₹2,500'), findsOneWidget);
      expect(find.text('Total Amount'), findsOneWidget);
      expect(find.text('Download Invoice (PDF)'), findsOneWidget);
      expect(find.text('No payments yet'), findsOneWidget);
    });

    testWidgets('lists what was paid, and what is left', (tester) async {
      await _phone(tester, const Size(400, 1400));
      await open(tester, {
        ..._detail,
        'state': 'PARTIAL',
        'paidInPaise': 100000,
        'outstandingInPaise': 200000,
        'payments': [
          {
            'id': 'p1',
            'receiptNo': 'RCP-2026-0007',
            'paidOn': '2026-10-20',
            'method': 'UPI',
            'reference': 'UPI 6142',
            'amountInPaise': 100000,
            'status': 'RECORDED',
          },
        ],
      });

      expect(find.text('RCP-2026-0007'), findsOneWidget);
      expect(find.text('Partially paid'), findsOneWidget);
      expect(find.text('Balance'), findsOneWidget);
      expect(find.text('₹2,000'), findsOneWidget);
      expect(find.text('No payments yet'), findsNothing);
    });

    testWidgets('fits a small phone', (tester) async {
      await _phone(tester, const Size(320, 640));
      await open(tester, _detail);
      expect(tester.takeException(), isNull);
    });
  });

  group('choosing a plan', () {
    Future<_Api> open(WidgetTester tester, {Object? answer}) async {
      final api = _install(
        (method, path) => method == 'POST' && path == '/me/children/s1/fee-plan'
            ? answer ?? _choice(chosen: true)
            : null,
      );
      await tester.pumpWidget(
        GetMaterialApp(
          home: FeePlanView(
            studentId: 's1',
            childName: 'Aarav',
            initial: FeePlanChoice.fromJson(_choice()),
          ),
        ),
      );
      await _settle(tester);
      return api;
    }

    testWidgets(
      'shows each plan priced, and confirms once however often tapped',
      (tester) async {
        await _phone(tester, const Size(400, 1400));
        final api = await open(tester);

        expect(find.text('Total annual fee'), findsOneWidget);
        expect(find.text('4 installments of ₹3,000'), findsOneWidget);
        expect(find.text('One payment of ₹12,000'), findsOneWidget);

        // Nothing to confirm until a plan is picked.
        final confirm = find.byType(FilledButton);
        expect(tester.widget<FilledButton>(confirm).onPressed, isNull);

        await tester.tap(find.text('Quarterly'));
        await _settle(tester);
        expect(find.text('Confirm Quarterly plan'), findsOneWidget);

        await tester.tap(find.text('Confirm Quarterly plan'));
        await _settle(tester);
        expect(
          find.textContaining('only the school office can change'),
          findsOneWidget,
        );

        await tester.tap(find.text('Confirm'));
        await tester.tap(find.text('Confirm'), warnIfMissed: false);
        await _settle(tester);

        expect(api.sent.where((s) => s.$1 == 'POST'), hasLength(1));
      },
    );

    testWidgets('says why, when the school refuses', (tester) async {
      await _phone(tester, const Size(400, 1400));
      await open(
        tester,
        answer: const _Refusal(
          409,
          'Your installment plan is already set for this year.',
        ),
      );
      await tester.tap(find.text('Annual'));
      await _settle(tester);
      await tester.tap(find.text('Confirm Annual plan'));
      await _settle(tester);
      await tester.tap(find.text('Confirm'));
      await _settle(tester);
      expect(
        find.text('Your installment plan is already set for this year.'),
        findsOneWidget,
      );
    });

    testWidgets('fits a small phone', (tester) async {
      await _phone(tester, const Size(320, 640));
      await open(tester);
      expect(tester.takeException(), isNull);
    });
  });

  group('settings', () {
    testWidgets('lists everything a family looks up, and signing out', (
      tester,
    ) async {
      await _phone(tester, const Size(390, 1400));
      _install(
        (method, path) => switch (path) {
          '/me/children' => [
            {
              'id': 's1',
              'fullName': 'Aarav Shah',
              'admissionNo': 'A1',
              'classroom': {'id': 'c1', 'label': 'Nursery — A'},
            },
          ],
          // What the parent screens load alongside, all empty but real.
          '/attendance/children/s1' => <String, dynamic>{'days': <Object>[]},
          '/homework' || '/notices' => <String, dynamic>{'items': <Object>[]},
          '/fees/students/s1/ledger' => _ledger,
          '/progress/students/s1' => <String, dynamic>{'skills': <Object>[]},
          _ => null,
        },
      );
      Get.put(AuthController());
      final children = Get.put(ChildrenController());
      Get.put(ChildController(children));
      children.tab.value = ChildrenController.settingsTab;

      await tester.pumpWidget(const GetMaterialApp(home: ParentHomeView()));
      await _settle(tester);

      for (final label in [
        'Settings',
        'Aarav Shah',
        'Fees',
        'Announcements',
        'Timetable',
        'Class Stream',
        'ID Card',
        'Certificates',
        'App Settings',
        'Sign Out',
      ]) {
        expect(find.text(label), findsWidgets, reason: label);
      }
      expect(tester.takeException(), isNull);
    });
  });
}
