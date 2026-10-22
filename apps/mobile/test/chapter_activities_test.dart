import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/features/activities/activity_controller.dart';
import 'package:poetree_school/features/activities/activity_models.dart';
import 'package:poetree_school/features/activities/activity_places.dart';
import 'package:poetree_school/features/animation/film_chapter_view.dart';
import 'package:poetree_school/features/animation/film_controllers.dart';

/// A 2D & 3D chapter: its video first, then its activities — each child's own
/// progress kept, and the chapter finished only when every activity is done.

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

  final Object? Function(String method, String path) respond;
  final sent = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    sent.add('${options.method} ${options.path}');
    final answer = respond(options.method, options.path);
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

Map<String, dynamic> _matching(int items) => {
  'kind': 'MATCHING',
  'items': [
    for (var i = 0; i < items; i++)
      {
        'prompt': {'say': 'Find the circle.'},
        'options': ['🔺', '⭕'],
        'answer': 1,
      },
  ],
};

Map<String, dynamic> _activity(
  String id,
  String title, {
  bool done = false,
  Map<String, dynamic>? content,
}) => {
  'id': id,
  'code': id.toUpperCase(),
  'title': title,
  'type': content?['kind'] ?? 'MATCHING',
  'skill': {'name': 'Shapes'},
  'book': {'id': 'b1', 'name': 'EVS Book 1'},
  'chapter': {'id': 'c1', 'name': 'Shapes'},
  'completedByChild': done,
  'contentJson': content ?? _matching(4),
};

Map<String, dynamic> _films({required bool watched}) => {
  'id': 'b1',
  'name': 'EVS Book 1',
  'films': [
    {
      'id': 'c1',
      'name': 'Shapes',
      'animation': {'videoId': 'aaaaaaaaaaa', 'url': 'https://youtu.be/a'},
      'isWatched': watched,
    },
  ],
};

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i += 1) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  tearDown(Get.reset);

  late Directory dir;
  setUp(() async => dir = await Directory.systemTemp.createTemp('places_'));
  tearDown(() async {
    if (await dir.exists()) await dir.delete(recursive: true);
  });

  ActivityPlaces places(String studentId) =>
      ActivityPlaces(studentId, directory: () async => dir);

  group('a place in an activity', () {
    test('is kept for each child, and survives the app closing', () async {
      await places('s1').save('a1', const SavedPlace(index: 2, correct: 1));
      await places('s2').save('a1', const SavedPlace(index: 3, correct: 3));

      // A new store is what the app has after a restart.
      final again = await places('s1').read('a1');
      expect(again?.index, 2);
      expect(again?.correct, 1);
      // Another child sharing the phone has their own.
      expect((await places('s2').read('a1'))?.index, 3);

      await places('s1').clear('a1');
      expect(await places('s1').read('a1'), isNull);
      expect(await places('s2').read('a1'), isNotNull);
    });
  });

  group('playing an activity', () {
    ActivityDefinition activity({Map<String, dynamic>? content}) =>
        ActivityDefinition.fromJson(
          _activity('a1', 'Circles', content: content),
        );

    test(
      'saves the place on moving on, and carries on from it later',
      () async {
        _install((method, path) => {'ok': true});
        final store = places('s1');

        final first = ActivityPlayController(
          activity: activity(),
          studentId: 's1',
          places: store,
        )..onInit();
        first
          ..answer(1, 1)
          ..next()
          ..answer(0, 1)
          ..next();
        // Answered the third, then left before moving on: not counted yet.
        first.answer(1, 1);
        await Future<void>.delayed(const Duration(milliseconds: 50));

        final place = await store.read('a1');
        expect(place?.index, 2);
        expect(place?.correct, 1);

        final later = ActivityPlayController(
          activity: activity(),
          studentId: 's1',
          places: store,
        )..onInit();
        await Future<void>.delayed(const Duration(milliseconds: 50));
        expect(later.index.value, 2);
        expect(later.correct.value, 1);
      },
    );

    test('starts at once from a place the opener already has', () {
      final play = ActivityPlayController(
        activity: activity(),
        studentId: 's1',
        startAt: const SavedPlace(index: 3, correct: 2),
      )..onInit();

      expect(play.index.value, 3);
      expect(play.correct.value, 2);
    });

    test(
      'finishing forgets the place, says so at once, and records it',
      () async {
        final api = _install((method, path) => {'ok': true});
        final store = places('s1');
        await store.save('a1', const SavedPlace(index: 3, correct: 3));
        var told = false;

        final play = ActivityPlayController(
          activity: activity(),
          studentId: 's1',
          places: store,
          startAt: const SavedPlace(index: 3, correct: 3),
          onDone: () => told = true,
        )..onInit();
        play
          ..answer(1, 1)
          ..next();
        await Future<void>.delayed(const Duration(milliseconds: 50));

        expect(play.isFinished.value, isTrue);
        expect(told, isTrue);
        expect(await store.read('a1'), isNull);
        expect(api.sent, contains('POST /progress/attempts'));
      },
    );

    test('flashcards say they were finished, with no score', () async {
      final api = _install((method, path) => {'completed': true});
      final play = ActivityPlayController(
        activity: activity(
          content: {
            'kind': 'FLASHCARD',
            'items': [
              {'title': 'Cow', 'say': 'A cow says moo.'},
            ],
          },
        ),
        studentId: 's1',
      )..onInit();
      play
        ..seen()
        ..next();
      await Future<void>.delayed(const Duration(milliseconds: 50));

      expect(api.sent, contains('POST /progress/activities/a1/completed'));
      expect(api.sent, isNot(contains('POST /progress/attempts')));
    });
  });

  group('a chapter', () {
    Future<FilmVideosController> open(
      WidgetTester tester, {
      required bool watched,
      required List<Map<String, dynamic>> activities,
    }) async {
      await tester.binding.setSurfaceSize(const Size(400, 1400));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      _install(
        (method, path) => switch (path) {
          '/catalogue/children/s1/films' => [_films(watched: watched)],
          '/progress/activities' => activities,
          _ => null,
        },
      );
      final videos = Get.put(
        FilmVideosController(
          studentId: 's1',
          subjectId: 'evs',
          subjectName: 'EVS',
        ),
      );
      await tester.pumpWidget(const GetMaterialApp(home: SizedBox()));
      await _settle(tester);
      await tester.pumpWidget(
        GetMaterialApp(
          home: FilmChapterView(
            videos: videos,
            chapterId: 'c1',
            autoPlay: false,
          ),
        ),
      );
      await _settle(tester);
      return videos;
    }

    testWidgets('keeps its activities shut until the video is watched', (
      tester,
    ) async {
      final videos = await open(
        tester,
        watched: false,
        activities: [_activity('a1', 'Circles'), _activity('a2', 'Squares')],
      );

      expect(find.text('Step 1 · Watch the video'), findsOneWidget);
      expect(find.text('Opens after the video'), findsNWidgets(2));

      await tester.tap(find.text('Circles'));
      await _settle(tester);
      expect(find.text('Watch the video first'), findsOneWidget);
      await tester.pump(const Duration(seconds: 4));
      await _settle(tester);

      // The video reaches its end.
      videos.markWatched('c1');
      await _settle(tester);
      expect(find.text('Step 1 · Video watched'), findsOneWidget);
      expect(find.text('Opens after the video'), findsNothing);
      expect(find.text('4 questions'), findsNWidgets(2));
    });

    testWidgets('opens straight onto the activities on a return visit', (
      tester,
    ) async {
      final videos = await open(
        tester,
        watched: true,
        activities: [
          _activity('a1', 'Circles', done: true),
          _activity('a2', 'Squares'),
        ],
      );
      // The phone's own store is not reachable in a test; hand it the place.
      videos.places['a2'] = const SavedPlace(index: 2, correct: 1);
      await _settle(tester);

      expect(find.text('Step 1 · Video watched'), findsOneWidget);
      expect(find.text('1 of 2 done'), findsOneWidget);
      expect(find.text('Done · play again any time'), findsOneWidget);
      expect(find.text('Carry on · question 3 of 4'), findsOneWidget);
      expect(find.text('Chapter completed!'), findsNothing);
    });

    testWidgets('never holds a tracing page — tracing is a module of its own', (
      tester,
    ) async {
      final videos = await open(
        tester,
        watched: true,
        activities: [
          _activity('a1', 'Circles', done: true),
          _activity(
            't1',
            'Trace the I',
            content: {
              'kind': 'TRACING',
              'items': [
                {
                  'glyph': 'I',
                  'say': 'Trace the letter I.',
                  'strokes': [
                    [
                      {'x': 0.5, 'y': 0.1},
                      {'x': 0.5, 'y': 0.9},
                    ],
                  ],
                },
              ],
            },
          ),
        ],
      );

      expect(find.text('Trace the I'), findsNothing);
      expect(videos.activitiesOf('c1').map((a) => a.id), ['a1']);
      // Not waiting on it: the one activity there is, is done.
      expect(find.text('1 of 1 done'), findsOneWidget);
      expect(videos.isComplete(videos.chapterById('c1')!), isTrue);
    });

    testWidgets('is finished only when every activity is done', (tester) async {
      final videos = await open(
        tester,
        watched: true,
        activities: [
          _activity('a1', 'Circles', done: true),
          _activity('a2', 'Squares'),
        ],
      );
      expect(find.text('Chapter completed!'), findsNothing);

      videos.markActivityDone('a2');
      await _settle(tester);
      expect(find.text('2 of 2 done'), findsOneWidget);
      expect(find.text('Chapter completed!'), findsOneWidget);
      expect(videos.isComplete(videos.chapterById('c1')!), isTrue);
    });
  });
}
