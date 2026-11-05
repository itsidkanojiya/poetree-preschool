import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/core/config/branding.dart';
import 'package:poetree_school/features/auth/registration_controller.dart';
import 'package:poetree_school/features/parent/add_child_view.dart';

/// A family registering — both mobiles and the email proved, the class and the
/// address given — and a parent asking for another child from the app.

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
  final sent = <String>[];
  final bodies = <String, Map<dynamic, dynamic>>{};
  var otp = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final key = '${options.method} ${options.path}';
    sent.add(key);
    if (options.data is Map) bodies[key] = options.data as Map;

    final Object answer = switch (key) {
      'GET /public/schools/sunrise/standards' => [
        {'id': 'lvl-nursery', 'name': 'Nursery'},
        {'id': 'lvl-jkg', 'name': 'Junior KG'},
      ],
      'POST /public/schools/sunrise/otp/send' => {
        'challengeId': 'challenge-${++otp}',
        'expiresInSeconds': 600,
        'delivered': false,
        'codeLength': 4,
      },
      'POST /public/schools/sunrise/registrations' => {
        'status': 'PENDING',
        'message': 'Thank you.',
      },
      'GET /me/child-requests' => [
        {
          'id': 'r0',
          'studentName': 'Aarav Shah',
          'status': 'APPROVED',
          'classLevel': 'Junior KG',
        },
      ],
      'POST /me/child-requests' => {
        'id': 'r1',
        'studentName': 'Diya Shah',
        'status': 'PENDING',
        'classLevel': 'Nursery',
      },
      _ => const <String, Object>{},
    };
    return ResponseBody.fromString(
      jsonEncode(answer),
      key.startsWith('POST /me/') ? 201 : 200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

_Api _install() {
  final adapter = _Api();
  Get.put<ApiService>(
    ApiService()
      ..client = ApiClient(
        _NoTokens(),
        dio: Dio()..httpClientAdapter = adapter,
      ),
  );
  return adapter;
}

void main() {
  setUp(
    () => BrandingService.current = Branding.fromJson({
      'code': 'sunrise',
      'name': 'Sunrise Preschool',
    }),
  );
  tearDown(() {
    Get.reset();
    BrandingService.current = Branding.fallback();
  });

  test('registering proves both mobiles and the email, and sends the class '
      'and the second contact', () async {
    final api = _install();
    final registration = Get.put(RegistrationController());
    await registration.loadStandards();

    // The school's own standards, for the class.
    expect(registration.standards.map((s) => s.name), ['Nursery', 'Junior KG']);

    final sent = await registration.sendAllCodes(
      phone: '+919820011001',
      secondPhone: '+919820011002',
      email: 'family@example.test',
    );
    expect(sent, isTrue);
    expect(
      api.sent.where((k) => k.endsWith('/otp/send')).length,
      3,
      reason: 'the father’s mobile, the second mobile, and the email',
    );
    expect(registration.secondOtp.challengeId.value, 'challenge-2');

    await registration.submit(
      studentFirstName: 'Diya',
      studentMiddleName: 'Nikhil',
      studentLastName: 'Shah',
      studentDateOfBirth: DateTime(2022, 2, 2),
      classLevelId: 'lvl-nursery',
      guardianName: 'Nikhil Shah',
      phone: '+919820011001',
      motherPhone: '+919820011002',
      email: 'family@example.test',
      password: 'Family2026',
      confirmPassword: 'Family2026',
      address: '12 Lake Road, Pune',
      guardianInsteadOfMother: true,
      motherName: 'Kavita Rao',
      motherEmail: 'kavita@example.test',
    );

    final body = api.bodies['POST /public/schools/sunrise/registrations']!;
    expect(body['classLevelId'], 'lvl-nursery');
    expect(body['address'], '12 Lake Road, Pune');
    expect(body['secondContactRelation'], 'GUARDIAN');
    expect(body['motherName'], 'Kavita Rao');
    expect(body['motherPhoneChallengeId'], 'challenge-2');
    expect(body['motherEmail'], 'kavita@example.test');
    expect(registration.isSent.value, isTrue);
  });

  testWidgets('asking for another child sends it to the school, and lists '
      'what was sent before', (tester) async {
    await tester.binding.setSurfaceSize(const Size(420, 1400));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final api = _install();

    await tester.pumpWidget(const GetMaterialApp(home: AddChildView()));
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }

    // The earlier request, as the school decided it.
    expect(find.text('Aarav Shah'), findsOneWidget);
    expect(find.text('Added'), findsOneWidget);

    // Nothing is sent without a name, a birthday and a class.
    await tester.tap(find.text('Send to the school'));
    await tester.pump();
    expect(find.text('Enter your child’s name'), findsOneWidget);
    expect(api.sent, isNot(contains('POST /me/child-requests')));
  });
}
