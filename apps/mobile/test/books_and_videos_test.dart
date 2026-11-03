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

/// Learning and 2D & 3D both start from a subject: Learning opens a subject
/// onto its chapters — each a video, pages and activities — and 2D & 3D onto
/// its videos. Against a school with EVS (three chapters, three videos) and
/// Maths (one chapter, no videos yet).

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
    final query = options.queryParameters;
    asked.add('${options.path}?${query['subjectId'] ?? query['bookId'] ?? ''}');
    final answer = switch (options.path) {
      '/catalogue/children/s1/subjects' => _subjects,
      '/catalogue/children/s1/chapters' => _chapters,
      '/catalogue/children/s1/films' => _films,
      '/progress/activities' => _activities,
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
    'bookCount': 1,
    'chapterCount': 3,
    'filmCount': 3,
    'filmsToWatch': 2,
  },
  {
    'id': 'maths',
    'name': 'Maths',
    'icon': 'numbers',
    'bookCount': 1,
    'chapterCount': 1,
    'filmCount': 0,
    'filmsToWatch': 0,
  },
];

/// EVS in Learning: one book, which is the subject — a chapter with a video
/// and its pages, one with activities alone, and one with nothing yet.
final _chapters = [
  {
    'id': 'b1',
    'name': 'EVS Book',
    'coverUrl': null,
    'chapters': [
      {
        ..._video('c1', 'Leaves', watched: true),
        'number': 1,
        'pdf': {
          'url': '/api/v1/catalogue/children/s1/chapters/c1/pdf',
          'sizeBytes': 2048,
          'version': 'f1',
        },
      },
      {'id': 'c2', 'name': 'Look and Learn', 'number': 2},
      {'id': 'c3', 'name': 'Stories', 'number': 3},
    ],
  },
];

Map<String, dynamic> _page(
  String id,
  String title,
  String chapterId, {
  bool done = false,
}) => {
  'id': id,
  'code': id.toUpperCase(),
  'title': title,
  'type': 'MATCHING',
  'skill': {'name': 'Shapes'},
  'book': {'id': 'b1', 'name': 'EVS Book'},
  'chapter': {'id': chapterId, 'name': 'Chapter'},
  'completedByChild': done,
  'contentJson': {
    'kind': 'MATCHING',
    'items': [
      {
        'prompt': {'say': 'Find the circle.'},
        'options': ['🔺', '⭕'],
        'answer': 1,
      },
    ],
  },
};

final _activities = [
  _page('a1', 'Match the leaf', 'c1', done: true),
  _page('a2', 'Match the shadow', 'c2', done: true),
  _page('a3', 'Odd one out', 'c2'),
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

  testWidgets('Learning: a subject opens onto its chapters, and a chapter '
      'onto its video, pages and activities', (tester) async {
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

    // Every subject the child has, videos or not — EVS wearing the picture
    // the publisher uploaded, Maths still its icon.
    expect(api.asked, contains('/catalogue/assets/p1?'));
    expect(find.text('EVS'), findsOneWidget);
    expect(find.text('3 chapters'), findsOneWidget);
    expect(find.text('1 chapter'), findsOneWidget);

    await tester.tap(find.text('EVS'));
    await _settle(tester);

    // No shelf of books in between: the subject is its book.
    expect(Get.currentRoute, AppRoutes.subjectChapters);
    expect(api.asked, contains('/catalogue/children/s1/chapters?evs'));
    expect(find.text('EVS Book'), findsNothing);
    expect(find.text('Leaves'), findsOneWidget);
    expect(find.text('Video watched'), findsOneWidget);
    expect(find.text('Pages'), findsOneWidget);
    expect(find.text('Completed'), findsOneWidget);
    expect(find.text('Look and Learn'), findsOneWidget);
    expect(find.text('1/2 activities'), findsOneWidget);
    expect(find.text('Coming soon'), findsOneWidget);

    // A chapter with nothing in it yet says so, rather than opening empty.
    await tester.tap(find.text('Stories'));
    await _settle(tester);
    expect(find.textContaining('Nothing in this chapter yet'), findsOneWidget);
    await tester.pump(const Duration(seconds: 4));
    await _settle(tester);

    // A chapter opens onto its video, its pages and its activities.
    await tester.tap(find.text('Leaves'));
    await _settle(tester);
    expect(find.text('Step 1 · Video watched'), findsOneWidget);
    expect(find.text('Step 2 · Read the pages'), findsOneWidget);
    expect(find.text('Match the leaf'), findsOneWidget);
    expect(find.text('Match the shadow'), findsNothing);
    Get.back<void>();
    await _settle(tester);

    // One with no video opens its activities at once.
    await tester.tap(find.text('Look and Learn'));
    await _settle(tester);
    expect(find.textContaining('Watch the video'), findsNothing);
    expect(find.text('Match the shadow'), findsOneWidget);
    expect(find.text('Odd one out'), findsOneWidget);
    expect(find.text('Opens after the video'), findsNothing);
  });

  testWidgets('2D & 3D: a subject opens straight onto its chapters’ videos', (
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

    // The subject's videos — older content filed in two books reads book by
    // book. Tapping one plays it; the activities are Learning's.
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
