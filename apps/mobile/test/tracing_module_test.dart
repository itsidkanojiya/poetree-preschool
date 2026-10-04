import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/features/tracing/tracing_play.dart';
import 'package:poetree_school/features/tracing/trace_lessons.dart';
import 'package:poetree_school/features/tracing_module/learning_card.dart';
import 'package:poetree_school/features/tracing_module/letter_cards.dart';
import 'package:poetree_school/features/tracing_module/lesson_video.dart';
import 'package:poetree_school/features/tracing_module/tracing_lesson_view.dart';
import 'package:poetree_school/features/tracing_module/tracing_module_controllers.dart';
import 'package:poetree_school/features/tracing_module/tracing_module_models.dart';
import 'package:poetree_school/features/tracing_module/tracing_session_view.dart';

/// The tracing module's one rule: a letter's video comes before its tracing,
/// every time, and finishing a letter goes on to the next one's video.

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
      answer == null ? '' : jsonEncode(answer),
      answer == null ? 204 : 200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Map<String, dynamic> _item(String id, String glyph, {String? video}) => {
  'id': id,
  'glyph': glyph,
  'say': 'Trace the capital letter $glyph.',
  'strokes': [
    [
      {'x': 0.2, 'y': 0.2},
      {'x': 0.8, 'y': 0.8},
    ],
  ],
  'ordered': true,
  'video': video == null
      ? null
      : {'videoId': video, 'url': 'https://youtu.be/$video'},
  'videoWatched': false,
  'traced': false,
};

final _category = {
  'id': 'cat1',
  'key': 'capital',
  'name': 'Capital letters',
  'label': 'A B C',
  'items': [
    _item('iA', 'A', video: 'aaaaaaaaaaa'),
    _item('iB', 'B', video: 'bbbbbbbbbbb'),
  ],
};

_Api _install() {
  final adapter = _Api(
    (method, path) => path == '/tracing/categories/cat1' ? _category : null,
  );
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
  tearDown(Get.reset);

  test('reads a category, with each letter’s video and shape', () {
    final detail = TracingCategoryDetail.fromJson(_category);
    expect(detail.items.map((i) => i.glyph), ['A', 'B']);
    expect(detail.items.first.videoId, 'aaaaaaaaaaa');
    expect(detail.items.first.shape.strokes, hasLength(1));
    expect(detail.items.first.kind, 'letter');

    final seven = TracingModuleItem.fromJson(_item('i7', '7'));
    expect(seven.hasVideo, isFalse);
    expect(seven.kind, 'number');
    expect(TracingModuleItem.fromJson(_item('h', '३')).kind, 'number');
  });

  test('a first watch cannot be dragged past what has been seen', () {
    final video = LessonVideoController(videoId: 'x', freeSeek: false)
      ..handle('tick:5.00:30.00:0:0');
    expect(video.started, isTrue);
    expect(video.furthest, 5);

    video.seek(28);
    expect(video.position, 5);

    var ended = 0;
    video
      ..onEnded = (() => ended++)
      ..handle('ended')
      ..handle('ended');
    expect(ended, 1);
    expect(video.ended, isTrue);

    // Watching again, anywhere goes.
    final again = LessonVideoController(videoId: 'x', freeSeek: true)
      ..handle('tick:5.00:30.00:0:0')
      ..seek(28);
    expect(again.position, 28);
  });

  Future<TracingLettersController> openLetters(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.625;
    addTearDown(tester.view.reset);
    final controller = TracingLettersController(
      studentId: 's1',
      categoryId: 'cat1',
      title: 'Capital letters',
      categoryKey: 'capital',
    );
    await tester.runAsync(controller.load);
    return controller;
  }

  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  testWidgets('first visit: the video unlocks tracing, then on to the next', (
    tester,
  ) async {
    final api = _install();
    final controller = await openLetters(tester);

    LessonVideoController? video;
    await tester.pumpWidget(
      GetMaterialApp(
        home: TracingSessionView(
          controller: controller,
          startAt: 0,
          videoSurface: (v, onTap) {
            video = v;
            return const ColoredBox(color: Color(0xFF000000));
          },
        ),
      ),
    );
    await settle(tester);

    // A's lesson, with tracing locked.
    expect(find.byType(TracingLessonView), findsOneWidget);
    expect(find.text('Watch the video to unlock tracing'), findsOneWidget);
    expect(find.byType(TracingPlay), findsNothing);

    // Played to its end: recorded, celebrated, unlocked.
    await tester.runAsync(() async {
      video!
        ..handle('tick:10.00:32.00:0:0')
        ..handle('ended');
      await Future<void>.delayed(const Duration(milliseconds: 100));
    });
    await settle(tester);
    expect(api.sent, contains('POST /tracing/items/iA/watched'));
    expect(find.text('Great Job!'), findsOneWidget);
    expect(find.text('Start Tracing'), findsOneWidget);

    await tester.tap(find.text('Start Tracing'));
    await settle(tester);
    expect(find.byType(TracingPlay), findsOneWidget);
    expect(find.text('Watch again'), findsOneWidget);
    final play = tester.widget<TracingPlay>(find.byType(TracingPlay));
    expect(play.finishLabel, 'Next letter');

    // A traced: recorded, and B — never watched — opens on its lesson.
    await tester.runAsync(() async {
      play.controller.traceAccepted();
      play.controller.next();
      await Future<void>.delayed(const Duration(milliseconds: 100));
    });
    await settle(tester);
    expect(api.sent, contains('POST /tracing/items/iA/traced'));
    expect(controller.items.first.traced, isTrue);
    expect(find.byType(TracingLessonView), findsOneWidget);
    expect(find.text('Watch the video to unlock tracing'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('a letter whose video was watched goes straight to tracing', (
    tester,
  ) async {
    _install();
    final controller = await openLetters(tester);
    controller.items.first.videoWatched = true;

    await tester.pumpWidget(
      GetMaterialApp(
        home: TracingSessionView(
          controller: controller,
          startAt: 0,
          videoSurface: (v, onTap) =>
              const ColoredBox(color: Color(0xFF000000)),
        ),
      ),
    );
    await settle(tester);

    expect(find.byType(TracingLessonView), findsNothing);
    expect(find.byType(TracingPlay), findsOneWidget);

    // Watching again opens the lesson unlocked, and comes back to tracing.
    await tester.tap(find.text('Watch again'));
    await settle(tester);
    expect(find.byType(TracingLessonView), findsOneWidget);
    expect(find.text('Back to tracing'), findsOneWidget);
    await tester.tap(find.text('Back to tracing'));
    await settle(tester);
    expect(find.byType(TracingLessonView), findsNothing);
    expect(find.byType(TracingPlay), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('cards show each language its own words, and stay open', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.625;
    addTearDown(tester.view.reset);

    TracingModuleItem item(String glyph, {bool traced = false}) =>
        TracingModuleItem.fromJson(_item(glyph, glyph))..traced = traced;
    final lessons = TraceLessons.from(
      {
        'A': {
          'kind': 'letter',
          'language': 'en',
          'word': 'Apple',
          'say': 'A for Apple.',
        },
        '३': {
          'kind': 'number',
          'language': 'hi',
          'count': 3,
          'label': 'तीन',
          'phrase': 'तीन तारे',
          'image': 'assets/numbers/number_03_stars.png',
          'say': 'तीन। तीन तारे।',
        },
      },
      const {'assets/numbers/number_03_stars.png'},
    );

    final cards = [
      LearningCard.from(item('A', traced: true), lessons.forGlyph('A')),
      LearningCard.from(item('a'), lessons.forGlyph('a')),
      LearningCard.from(item('३'), lessons.forGlyph('३')),
    ];

    // What the speaker says, per card.
    expect(cards.map((c) => c.spoken), [
      'A... Apple',
      'a... apple',
      '३... तीन',
    ]);
    expect(cards[2].type, LearningCardType.number);
    expect(cards[2].imageAsset, 'assets/numbers/number_03_stars.png');

    final picked = <int>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Row(
            children: [
              for (final (i, card) in cards.indexed)
                SizedBox(
                  width: 130,
                  height: 190,
                  child: LetterCard(
                    card: card,
                    tone: (
                      paper: const Color(0xFFFFE9EC),
                      ink: const Color(0xFFE8455B),
                    ),
                    onTap: () => picked.add(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('Apple'), findsOneWidget);
    expect(find.text('apple'), findsOneWidget);
    // The Hindi number: its own word and what the picture shows — no Apple,
    // no "three".
    expect(find.text('तीन'), findsOneWidget);
    expect(find.text('तीन तारे'), findsOneWidget);
    expect(find.text('Learned'), findsOneWidget);

    // Learned is not locked: tapping it opens it again.
    await tester.tap(find.text('Apple'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(picked, [0]);
  });
}
