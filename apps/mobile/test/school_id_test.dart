import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/core/config/branding.dart';
import 'package:poetree_school/core/push/push_service.dart';
import 'package:poetree_school/features/auth/auth_controller.dart';
import 'package:poetree_school/features/auth/login_view.dart';

/// One Poetree Kids app for every school: the School ID typed at sign-in
/// chooses the school, the API checks it, and the phone remembers it.

class _Tokens implements TokenStore {
  String? access;
  String? refresh;

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

/// The API: one school, "sunrise", and one parent at it.
class _Api implements HttpClientAdapter {
  final sent = <String>[];
  final logins = <Map<dynamic, dynamic>>[];
  bool offline = false;

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
    if (offline) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'offline',
      );
    }
    sent.add('${options.method} ${options.path}');

    if (options.path == '/public/schools/sunrise/branding') {
      return _json({
        'id': 'school-1',
        'code': 'sunrise',
        'name': 'Sunrise Preschool',
        'primaryColor': '#B4451F',
        'logoUrl': null,
      }, 200);
    }
    if (options.path.startsWith('/public/schools/')) {
      return _json({
        'error': {'code': 'NOT_FOUND', 'message': 'School not found'},
      }, 404);
    }
    if (options.path == '/auth/login') {
      logins.add(options.data as Map);
      return _json({
        'accessToken': 'access-1',
        'refreshToken': 'refresh-1',
        'expiresIn': 900,
        'user': {
          'id': 'u1',
          'name': 'Meera Shah',
          'role': 'PARENT',
          'mustChangePassword': false,
          'school': {'code': 'sunrise', 'name': 'Sunrise Preschool'},
        },
      }, 200);
    }
    return _json({
      'error': {'code': 'NOT_FOUND', 'message': 'Not found'},
    }, 404);
  }

  @override
  void close({bool force = false}) {}
}

/// No disk: remembering fails quietly, as it would on a phone that is full,
/// and everything else must carry on.
BrandingService _brandingOver(_Api api) => BrandingService(
  dio: Dio(BaseOptions(baseUrl: 'https://example.test/api/v1'))
    ..httpClientAdapter = api,
  cacheFile: () async => throw const FileSystemException('no disk in tests'),
);

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

/// The sign-in screen, with stand-ins for where it leads.
Future<(_Api, _Tokens)> _openSignIn(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(420, 1600));
  addTearDown(() => tester.binding.setSurfaceSize(null));

  final api = _Api();
  final tokens = _Tokens();
  Get
    ..put<ApiService>(
      ApiService()
        ..client = ApiClient(tokens, dio: Dio()..httpClientAdapter = api),
    )
    ..put(PushService())
    ..put(AuthController(branding: _brandingOver(api)));

  await tester.pumpWidget(
    GetMaterialApp(
      initialRoute: '/login',
      getPages: [
        GetPage<void>(name: '/login', page: () => const LoginView()),
        GetPage<void>(
          name: '/parent',
          page: () => const Scaffold(body: Text('Parent home')),
        ),
        GetPage<void>(
          name: '/registration',
          page: () => Scaffold(
            body: Text('Registering at ${BrandingService.current.name}'),
          ),
        ),
      ],
    ),
  );
  await _settle(tester);
  return (api, tokens);
}

Finder _field(String label) => find.widgetWithText(TextFormField, label);

void main() {
  setUp(() => BrandingService.current = Branding.fallback());
  tearDown(Get.reset);

  group('a School ID', () {
    test('is read however it was typed', () {
      expect(BrandingService.normalise('  Sunrise '), 'sunrise');
      expect(BrandingService.looksLikeSchoolId('sunrise01'), isTrue);
      expect(BrandingService.looksLikeSchoolId('s'), isFalse);
      expect(BrandingService.looksLikeSchoolId('1sunrise'), isFalse);
      expect(BrandingService.looksLikeSchoolId('sun rise'), isFalse);
    });

    test('before any is given, the app is Poetree Kids', () {
      final none = Branding.fallback();
      expect(none.code, isNull);
      expect(none.name, 'Poetree Kids');
    });

    test('is remembered with the school it names', () {
      final restored = Branding.fromJson(
        Branding.fromJson({
          'code': 'sunrise',
          'name': 'Sunrise Preschool',
        }).toJson(),
      );
      expect(restored.code, 'sunrise');
      expect(restored.name, 'Sunrise Preschool');
    });

    test('is checked with the API, which names the school', () async {
      final api = _Api();
      final school = await _brandingOver(api).choose(' SUNRISE ');

      expect(api.sent, ['GET /public/schools/sunrise/branding']);
      expect(school.code, 'sunrise');
      expect(school.name, 'Sunrise Preschool');
      expect(BrandingService.current.code, 'sunrise');
    });

    test('that no school has is refused, and changes nothing', () async {
      final api = _Api();
      await expectLater(
        _brandingOver(api).choose('nowhere'),
        throwsA(isA<SchoolNotFound>()),
      );
      expect(BrandingService.current.code, isNull);
    });

    test('that cannot be a school is refused without asking', () async {
      final api = _Api();
      await expectLater(
        _brandingOver(api).choose('sun rise!'),
        throwsA(isA<SchoolNotFound>()),
      );
      expect(api.sent, isEmpty);
    });

    test(
      'is not mistaken for unknown when the API cannot be reached',
      () async {
        final api = _Api()..offline = true;
        await expectLater(
          _brandingOver(api).choose('sunrise'),
          throwsA(isA<DioException>()),
        );
      },
    );
  });

  group('signing in', () {
    testWidgets('asks for the School ID', (tester) async {
      final (api, _) = await _openSignIn(tester);

      expect(_field('School ID'), findsOneWidget);
      await tester.enterText(_field('Phone or email'), '+919820011001');
      await tester.enterText(_field('Password'), 'Family@2026');
      await tester.tap(find.text('Sign in').last);
      await _settle(tester);

      expect(find.text('Enter your School ID'), findsOneWidget);
      expect(api.sent, isEmpty);
    });

    testWidgets('signs in to the school the School ID names', (tester) async {
      final (api, tokens) = await _openSignIn(tester);

      await tester.enterText(_field('School ID'), 'Sunrise');
      await tester.enterText(_field('Phone or email'), '+919820011001');
      await tester.enterText(_field('Password'), 'Family@2026');
      await tester.tap(find.text('Sign in').last);
      await _settle(tester);

      expect(api.sent, [
        'GET /public/schools/sunrise/branding',
        'POST /auth/login',
      ]);
      expect(api.logins.single['schoolCode'], 'sunrise');
      expect(tokens.access, 'access-1');
      expect(find.text('Parent home'), findsOneWidget);
      // Remembered, so next time it is already filled in.
      expect(BrandingService.current.code, 'sunrise');
    });

    testWidgets('says so when no school has the School ID', (tester) async {
      final (api, tokens) = await _openSignIn(tester);

      await tester.enterText(_field('School ID'), 'nowhere');
      await tester.enterText(_field('Phone or email'), '+919820011001');
      await tester.enterText(_field('Password'), 'Family@2026');
      await tester.tap(find.text('Sign in').last);
      await _settle(tester);

      expect(
        find.text(
          'No school has the School ID “nowhere”. Please check it with your '
          'school office.',
        ),
        findsOneWidget,
      );
      // Never asked to sign in to a school that does not exist.
      expect(api.logins, isEmpty);
      expect(tokens.access, isNull);
    });

    testWidgets('fills in the School ID it remembers', (tester) async {
      BrandingService.current = Branding.fromJson({
        'code': 'sunrise',
        'name': 'Sunrise Preschool',
      });
      await _openSignIn(tester);

      final field = tester.widget<TextFormField>(_field('School ID'));
      expect(field.controller?.text, 'sunrise');
      expect(
        find.text('Sign in to see your child’s day at Sunrise Preschool'),
        findsOneWidget,
      );
    });
  });

  group('registering', () {
    testWidgets('needs the School ID first', (tester) async {
      final (api, _) = await _openSignIn(tester);

      await tester.tap(find.text('Register with the school'));
      await _settle(tester);

      expect(
        find.text('Enter your School ID first. Your school gives it to you.'),
        findsOneWidget,
      );
      expect(api.sent, isEmpty);
    });

    testWidgets('opens for the school the School ID names', (tester) async {
      await _openSignIn(tester);

      await tester.enterText(_field('School ID'), 'sunrise');
      await tester.tap(find.text('Register with the school'));
      await _settle(tester);

      expect(find.text('Registering at Sunrise Preschool'), findsOneWidget);
    });
  });
}
