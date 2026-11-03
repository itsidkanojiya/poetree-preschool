import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/core/config/policy_links.dart';
import 'package:poetree_school/core/push/push_service.dart';
import 'package:poetree_school/core/theme/theme_controller.dart';
import 'package:poetree_school/features/auth/auth_controller.dart';
import 'package:poetree_school/features/settings/settings_view.dart';

/// A family closing their account from Settings, and finding the privacy
/// policy there — the two things Google Play requires the app to offer.

class _Tokens implements TokenStore {
  String? access = 'access-1';
  String? refresh = 'refresh-1';

  @override
  Future<String?> get accessToken async => access;
  @override
  Future<String?> get refreshToken async => refresh;
  @override
  Future<void> save({required String access, required String refresh}) async {
    this.access = access;
    this.refresh = refresh;
  }

  @override
  Future<void> clear() async {
    access = null;
    refresh = null;
  }
}

/// The API: one right password, and a refresh that always succeeds — which is
/// what happens for real when a signed-in parent mistypes it.
class _Api implements HttpClientAdapter {
  final sent = <String>[];
  final passwords = <Object?>[];

  ResponseBody _json(Object body, int status) => ResponseBody.fromString(
    jsonEncode(body),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    sent.add('${options.method} ${options.path}');

    if (options.path == '/auth/refresh') {
      return _json({
        'accessToken': 'access-2',
        'refreshToken': 'refresh-2',
        'expiresIn': 900,
      }, 200);
    }
    if (options.path == '/auth/delete-account') {
      final password = (options.data as Map)['password'];
      passwords.add(password);
      return password == 'right-password'
          ? _json({
              'deleted': true,
              'schoolName': 'Sunrise Preschool',
              'registrationOnly': false,
            }, 200)
          : _json({
              'error': {
                'code': 'INVALID_CREDENTIALS',
                'message': 'That password is not right.',
              },
            }, 401);
    }
    return _json({
      'error': {'code': 'NOT_FOUND', 'message': 'Not found'},
    }, 404);
  }

  @override
  void close({bool force = false}) {}
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

Future<(_Api, _Tokens)> _openSettings(
  WidgetTester tester, {
  required String role,
}) async {
  await tester.binding.setSurfaceSize(const Size(420, 2000));
  addTearDown(() => tester.binding.setSurfaceSize(null));

  final api = _Api();
  final tokens = _Tokens();
  Get
    ..put<ApiService>(
      ApiService()
        ..client = ApiClient(
          tokens,
          dio: Dio()..httpClientAdapter = api,
          refreshDio: Dio()..httpClientAdapter = api,
        ),
    )
    ..put(PushService())
    ..put(ThemeController());
  Get.put(AuthController()).user.value = AppUser(
    id: 'u1',
    name: 'Meera Shah',
    role: role,
    mustChangePassword: false,
  );

  await tester.pumpWidget(
    GetMaterialApp(
      initialRoute: '/settings',
      getPages: [
        GetPage<void>(name: '/settings', page: () => const SettingsView()),
        GetPage<void>(
          name: '/login',
          page: () => Scaffold(
            body: Text('Sign in: ${(Get.arguments as Map?)?['reason']}'),
          ),
        ),
      ],
    ),
  );
  await _settle(tester);
  return (api, tokens);
}

void main() {
  tearDown(Get.reset);

  test('the privacy policy and deletion pages sit beside the API', () {
    expect(
      PolicyLinks.privacy.toString(),
      'https://school.poetreepublications.com/privacy',
    );
    expect(
      PolicyLinks.deleteAccount.toString(),
      'https://school.poetreepublications.com/delete-account',
    );
  });

  testWidgets('a parent finds the privacy policy and Delete account', (
    tester,
  ) async {
    await _openSettings(tester, role: 'PARENT');

    expect(find.text('Privacy and your account'), findsOneWidget);
    expect(find.text('Privacy policy'), findsOneWidget);
    expect(find.text('Delete account'), findsOneWidget);
  });

  testWidgets('a teacher has the policy, but no way to close a school '
      'account', (tester) async {
    await _openSettings(tester, role: 'TEACHER');

    expect(find.text('Privacy policy'), findsOneWidget);
    expect(find.text('Delete account'), findsNothing);
  });

  testWidgets('keeping the account deletes nothing', (tester) async {
    final (api, tokens) = await _openSettings(tester, role: 'PARENT');

    await tester.tap(find.text('Delete account'));
    await _settle(tester);
    expect(find.text('Delete your account?'), findsOneWidget);

    await tester.tap(find.text('Keep my account'));
    await _settle(tester);

    expect(find.text('Delete your account?'), findsNothing);
    expect(api.sent, isEmpty);
    expect(tokens.access, 'access-1');
  });

  testWidgets('asks for the password, says when it is wrong, and leaves for '
      'the sign-in screen when it is right', (tester) async {
    final (api, tokens) = await _openSettings(tester, role: 'PARENT');

    await tester.tap(find.text('Delete account'));
    await _settle(tester);

    // Nothing typed: nothing sent.
    await tester.tap(find.text('Delete my account'));
    await _settle(tester);
    expect(find.text('Type your password to confirm.'), findsOneWidget);
    expect(api.sent, isEmpty);

    // Wrong: the dialog stays, says why, and the family is still signed in.
    await tester.enterText(find.byType(TextField), 'wrong-password');
    await tester.tap(find.text('Delete my account'));
    await _settle(tester);
    expect(find.text('That password is not right.'), findsOneWidget);
    expect(find.text('Delete your account?'), findsOneWidget);
    expect(tokens.access, isNotNull);
    expect(Get.find<AuthController>().user.value, isNotNull);

    // Right: gone, signed out, and told so.
    await tester.enterText(find.byType(TextField), 'right-password');
    await tester.tap(find.text('Delete my account'));
    await _settle(tester);

    expect(api.passwords.last, 'right-password');
    expect(tokens.access, isNull);
    expect(tokens.refresh, isNull);
    expect(Get.find<AuthController>().user.value, isNull);
    expect(find.text('Sign in: deleted'), findsOneWidget);
    expect(find.text('Delete your account?'), findsNothing);
  });
}
