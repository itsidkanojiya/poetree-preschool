import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/features/tracing/tracing_play.dart';
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

  testWidgets(
    'the video comes first, cannot be skipped, and leads to tracing',
    (tester) async {
      final api = _install();
      final controller = TracingLettersController(
        studentId: 's1',
        categoryId: 'cat1',
        title: 'Capital letters',
      );
      await tester.runAsync(controller.load);
      expect(controller.items, hasLength(2));

      final played = <String>[];
      var finishVideo = false;
      await tester.pumpWidget(
        GetMaterialApp(
          home: TracingSessionView(
            controller: controller,
            startAt: 0,
            playVideo: (context, item) async {
              played.add(item.glyph);
              if (!finishVideo) return false;
              await controller.markWatched(item);
              return true;
            },
          ),
        ),
      );
      await tester.pump();
      await tester.pump();

      // Backed out of A's video: still on the gate, nothing to trace.
      expect(played, ['A']);
      expect(find.byType(VideoGate), findsOneWidget);
      expect(find.byType(TracingPlay), findsNothing);

      // Watched to the end this time: A's tracing opens.
      finishVideo = true;
      await tester.runAsync(() async {
        await tester.tap(find.text('Play the video'));
        await Future<void>.delayed(const Duration(milliseconds: 50));
      });
      await tester.pump();
      expect(played, ['A', 'A']);
      expect(api.sent, contains('POST /tracing/items/iA/watched'));
      expect(find.byType(TracingPlay), findsOneWidget);
      final play = tester.widget<TracingPlay>(find.byType(TracingPlay));
      expect(play.finishLabel, 'Next letter');

      // A traced: recorded, and B's video starts — not B's tracing.
      await tester.runAsync(() async {
        play.controller.traceAccepted();
        play.controller.next();
        await Future<void>.delayed(const Duration(milliseconds: 50));
      });
      await tester.pump();
      await tester.pump();
      expect(api.sent, contains('POST /tracing/items/iA/traced'));
      expect(controller.items.first.traced, isTrue);
      expect(played, ['A', 'A', 'B']);
      expect(find.text('2 / 2'), findsOneWidget);

      // Leave the page, so its timers stop with it.
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 1));
    },
  );
}
