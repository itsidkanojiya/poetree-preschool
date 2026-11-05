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
import 'package:poetree_school/features/auth/choose_role_view.dart';
import 'package:poetree_school/features/auth/login_view.dart';
import 'package:poetree_school/features/auth/school_id_view.dart';

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

  /// Signs in someone who is both a parent and a teacher.
  bool bothRoles = false;

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
        'user': _user('PARENT'),
      }, 200);
    }
    if (options.path == '/auth/switch-role') {
      final role = (options.data as Map)['role'] as String;
      return _json({
        'accessToken': 'access-2',
        'refreshToken': 'refresh-2',
        'expiresIn': 900,
        'user': _user(role),
      }, 200);
    }
    return _json({
      'error': {'code': 'NOT_FOUND', 'message': 'Not found'},
    }, 404);
  }

  Map<String, dynamic> _user(String role) => {
    'id': 'u1',
    'name': 'Meera Shah',
    'role': role,
    'roles': bothRoles ? ['PARENT', 'TEACHER'] : [role],
    'mustChangePassword': false,
    'school': {'code': 'sunrise', 'name': 'Sunrise Preschool'},
  };

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
/// The app at [route], with every screen sign-in can lead to.
Future<(_Api, _Tokens)> _open(WidgetTester tester, String route) async {
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
      initialRoute: route,
      getPages: [
        GetPage<void>(name: '/school', page: () => const SchoolIdView()),
        GetPage<void>(name: '/login', page: () => const LoginView()),
        GetPage<void>(name: '/choose-role', page: () => const ChooseRoleView()),
        GetPage<void>(
          name: '/parent',
          page: () => const Scaffold(body: Text('Parent home')),
        ),
        GetPage<void>(
          name: '/teacher',
          page: () => const Scaffold(body: Text('Teacher home')),
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

/// A phone that has already been told its school.
void _remember() {
  BrandingService.current = Branding.fromJson({
    'code': 'sunrise',
    'name': 'Sunrise Preschool',
  });
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

  group('the School ID screen', () {
    setUp(() => BrandingService.current = Branding.fallback());

    testWidgets('needs a School ID', (tester) async {
      final (api, _) = await _open(tester, '/school');

      await tester.tap(find.text('Continue'));
      await _settle(tester);

      expect(find.text('Enter your School ID'), findsOneWidget);
      expect(api.sent, isEmpty);
    });

    testWidgets('says so when no school has it, and goes no further', (
      tester,
    ) async {
      final (api, _) = await _open(tester, '/school');

      await tester.enterText(_field('School ID'), 'nowhere');
      await tester.tap(find.text('Continue'));
      await _settle(tester);

      expect(
        find.text(
          'No school has the School ID “nowhere”. Please check it with your '
          'school office.',
        ),
        findsOneWidget,
      );
      expect(api.logins, isEmpty);
      expect(find.text('Sign in'), findsNothing);
    });

    testWidgets('opens that school’s sign-in, and remembers it', (
      tester,
    ) async {
      final (api, _) = await _open(tester, '/school');

      await tester.enterText(_field('School ID'), 'Sunrise');
      await tester.tap(find.text('Continue'));
      await _settle(tester);

      expect(api.sent, ['GET /public/schools/sunrise/branding']);
      expect(
        find.text('Sign in to see your child’s day at Sunrise Preschool'),
        findsOneWidget,
      );
      expect(find.text('School ID: sunrise'), findsOneWidget);
      expect(BrandingService.current.code, 'sunrise');
    });

    testWidgets('is where sign-in goes with no school chosen', (tester) async {
      await _open(tester, '/login');

      expect(find.text('Your School ID'), findsOneWidget);
      expect(find.text('Sign in'), findsNothing);
    });
  });

  group('signing in', () {
    setUp(_remember);
    tearDown(() => BrandingService.current = Branding.fallback());

    testWidgets('is at the school chosen first', (tester) async {
      final (api, tokens) = await _open(tester, '/login');

      expect(_field('School ID'), findsNothing);
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
    });

    testWidgets('can go back to choose another school', (tester) async {
      await _open(tester, '/login');

      await tester.tap(find.text('Change school'));
      await _settle(tester);

      expect(find.text('Your School ID'), findsOneWidget);
    });

    testWidgets('asks someone who is both which to open as', (tester) async {
      final (api, tokens) = await _open(tester, '/login');
      api.bothRoles = true;

      await tester.enterText(_field('Phone or email'), '+919820011001');
      await tester.enterText(_field('Password'), 'Family@2026');
      await tester.tap(find.text('Sign in').last);
      await _settle(tester);

      expect(find.text('Parent'), findsOneWidget);
      expect(find.text('Teacher'), findsOneWidget);

      await tester.tap(find.text('Teacher'));
      await _settle(tester);

      expect(api.sent.last, 'POST /auth/switch-role');
      expect(tokens.access, 'access-2');
      expect(find.text('Teacher home'), findsOneWidget);
      expect(Get.find<AuthController>().user.value?.role, 'TEACHER');
    });
  });

  group('registering', () {
    setUp(_remember);
    tearDown(() => BrandingService.current = Branding.fallback());

    testWidgets('opens for the school chosen first', (tester) async {
      await _open(tester, '/login');

      await tester.tap(find.text('Register with the school'));
      await _settle(tester);

      expect(find.text('Registering at Sunrise Preschool'), findsOneWidget);
    });
  });
}
