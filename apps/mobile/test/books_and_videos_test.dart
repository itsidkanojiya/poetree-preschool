import 'dart:async';

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/core/routes/app_pages.dart';
import 'package:poetree_school/features/books/book_subjects_view.dart';

/// Books and videos both start from a subject: a subject's books open to read,
/// a subject's videos play — against a school with EVS (two books, three
/// videos) and Maths (one book, no videos yet).

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
  final asked = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    asked.add('${options.path}?${options.queryParameters['subjectId'] ?? ''}');
    final answer = switch (options.path) {
      '/catalogue/children/s1/subjects' => _subjects,
      '/catalogue/children/s1/books' => _books,
      '/catalogue/children/s1/films' => _films,
      '/progress/activities' => const <Object>[],
      _ => null,
    };
    return ResponseBody.fromString(
      jsonEncode(
        answer ??
            {
              'error': {'code': 'X', 'message': 'Not found'},
            },
      ),
      answer == null ? 404 : 200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

const _subjects = [
  {
    'id': 'evs',
    'name': 'EVS',
    'icon': 'globe',
    'pictureUrl': '/api/v1/catalogue/assets/p1',
    'bookCount': 2,
    'filmCount': 3,
    'filmsToWatch': 2,
  },
  {
    'id': 'maths',
    'name': 'Maths',
    'icon': 'numbers',
    'bookCount': 1,
    'filmCount': 0,
    'filmsToWatch': 0,
  },
];

const _books = [
  {
    'id': 'b1',
    'name': 'EVS Book 1',
    'classLevel': {'name': 'Nursery'},
    'subject': {'id': 'evs', 'name': 'EVS', 'icon': 'globe'},
    'pdf': {
      'url': '/api/v1/catalogue/children/s1/books/b1/pdf',
      'sizeBytes': 1024,
      'version': 'f1',
    },
    'activityCount': 4,
  },
  {
    'id': 'b2',
    'name': 'EVS Book 2',
    'classLevel': {'name': 'Nursery'},
    'subject': {'id': 'evs', 'name': 'EVS', 'icon': 'globe'},
    'pdf': null,
    'activityCount': 0,
  },
  {
    'id': 'b3',
    'name': 'Sample book',
    'classLevel': {'name': 'Nursery'},
    'subject': {'id': 'evs', 'name': 'EVS', 'icon': 'globe'},
    'pdf': null,
    'activityCount': 29,
  },
];

Map<String, dynamic> _video(String id, String name, {bool watched = false}) => {
  'id': id,
  'name': name,
  'number': null,
  'animation': {'videoId': 'aaaaaaaaaaa', 'url': 'https://youtu.be/a'},
  'animation3d': null,
  'coverUrl': null,
  'isWatched': watched,
};

final _films = [
  {
    'id': 'b1',
    'name': 'EVS Book 1',
    'coverUrl': null,
    'films': [_video('c1', 'Leaves', watched: true), _video('c2', 'Roots')],
  },
  {
    'id': 'b2',
    'name': 'EVS Book 2',
    'coverUrl': null,
    'films': [_video('c3', 'Rain')],
  },
];

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

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i += 1) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

Future<void> _phone(WidgetTester tester) async {
  await tester.binding.setSurfaceSize(const Size(400, 1400));
  addTearDown(() => tester.binding.setSurfaceSize(null));
}

void main() {
  tearDown(Get.reset);

  testWidgets(
    'Books: a subject opens its books, which say if they can be read',
    (tester) async {
      await _phone(tester);
      final api = _install();

      await tester.pumpWidget(
        GetMaterialApp(
          getPages: appPages,
          home: const Scaffold(
            body: BookSubjectsEmbedded(studentId: 's1', childName: 'Aarav'),
          ),
        ),
      );
      await _settle(tester);

      // Every subject the child has books in, videos or not — EVS wearing
      // the picture the publisher uploaded, Maths still its icon.
      expect(api.asked, contains('/catalogue/assets/p1?'));
      expect(find.text('EVS'), findsOneWidget);
      expect(find.text('2 books'), findsOneWidget);
      expect(find.text('Maths'), findsOneWidget);

      await tester.tap(find.text('EVS'));
      await _settle(tester);

      expect(api.asked, contains('/catalogue/children/s1/books?evs'));
      expect(find.text('EVS Book 1'), findsOneWidget);
      expect(find.text('EVS Book 2'), findsOneWidget);
      expect(find.text('Sample book'), findsOneWidget);
      expect(find.text('Read'), findsOneWidget);
      expect(find.text('Soon'), findsOneWidget);
      // No PDF yet, but activities to play: not "Soon".
      expect(find.text('Play'), findsOneWidget);

      // A book with neither says so, rather than opening onto nothing.
      await tester.tap(find.text('EVS Book 2'));
      await _settle(tester);
      expect(find.textContaining('not ready yet'), findsOneWidget);
      await tester.pump(const Duration(seconds: 4));
      await _settle(tester);

      // A book with both asks which.
      await tester.tap(find.text('EVS Book 1'));
      await _settle(tester);
      expect(find.text('Read the book'), findsOneWidget);
      expect(find.text('Play the 4 activities'), findsOneWidget);
      Get.back<void>();
      await _settle(tester);

      // A book with only activities opens straight onto them.
      await tester.tap(find.text('Sample book'));
      await _settle(tester);
      expect(api.asked, contains('/progress/activities?'));
      expect(Get.currentRoute, AppRoutes.activities);
      expect(find.text('Sample book'), findsOneWidget);
    },
  );

  testWidgets('2D & 3D: a subject opens straight onto its videos, by book', (
    tester,
  ) async {
    await _phone(tester);
    final api = _install();

    await tester.pumpWidget(
      GetMaterialApp(getPages: appPages, home: const SizedBox()),
    );
    unawaited(
      Get.toNamed<void>(
        AppRoutes.filmSubjects,
        arguments: {'studentId': 's1', 'childName': 'Aarav'},
      ),
    );
    await _settle(tester);

    // Only subjects with something to watch: Maths has no videos yet.
    expect(find.text('EVS'), findsOneWidget);
    expect(find.text('Maths'), findsNothing);
    expect(find.text('3 videos'), findsOneWidget);
    expect(find.text('1 of 3 watched'), findsOneWidget);

    await tester.tap(find.text('EVS'));
    await _settle(tester);

    // No books or chapters in between: the subject's videos, under each book.
    expect(api.asked, contains('/catalogue/children/s1/films?evs'));
    for (final title in [
      'EVS Book 1',
      'EVS Book 2',
      'Leaves',
      'Roots',
      'Rain',
    ]) {
      await tester.scrollUntilVisible(find.text(title), 200);
      expect(find.text(title), findsOneWidget, reason: title);
    }
    expect(find.text('Watched'), findsOneWidget);
  });
}
