import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/features/gallery/gallery_media_view.dart';
import 'package:poetree_school/features/gallery/gallery_photo_view.dart';
import 'package:poetree_school/features/gallery/gallery_view.dart';

/// The gallery: photos kept in the school's own Google Drive and shown here as
/// small copies, and videos from the school's YouTube channel beside them.

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

/// Answers from a script and keeps what was asked for.
class _Api implements HttpClientAdapter {
  _Api(this.respond);

  final Object? Function(String path) respond;
  final asked = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    asked.add(options.path);
    // A photo or its small copy: a real picture, as the server sends one.
    if (options.path.startsWith('/files/')) {
      return ResponseBody.fromBytes(
        _tinyPng,
        200,
        headers: {
          Headers.contentTypeHeader: ['image/png'],
        },
      );
    }
    final answer = respond(options.path);
    return ResponseBody.fromString(
      jsonEncode(
        answer ??
            {
              'error': {'code': 'NOT_FOUND', 'message': 'Not found'},
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

_Api _install(Object? Function(String path) respond) {
  final adapter = _Api(respond);
  final service = ApiService()
    ..client = ApiClient(_NoTokens(), dio: Dio()..httpClientAdapter = adapter);
  Get.put<ApiService>(service);
  return adapter;
}

final _tinyPng = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
);

final Map<String, dynamic> _video = {
  'id': 'v1',
  'videoId': 'dQw4w9WgXcQ',
  'url': 'https://youtu.be/dQw4w9WgXcQ',
  'thumbnailUrl': 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  'caption': 'Our dance',
};

final Map<String, dynamic> _photo = {
  'id': 'p1',
  'url': '/api/v1/files/f1',
  'thumbUrl': '/api/v1/files/f1?variant=thumb',
  'caption': null,
};

final Map<String, dynamic> _event = {
  'id': 'e1',
  'name': 'Annual Day',
  'eventDate': '2026-10-10T00:00:00.000Z',
  'description': null,
  'visibleToAll': true,
  'classrooms': <Object>[],
  'photoCount': 1,
  'videoCount': 1,
  'cover': _photo,
  'coverVideo': _video,
  'createdAt': '2026-10-10T00:00:00.000Z',
  'photos': [_photo],
  'videos': [_video],
};

final Map<String, dynamic> _sports = {
  'id': 'e2',
  'name': 'Sports Day',
  'eventDate': null,
  'description': null,
  'visibleToAll': true,
  'classrooms': <Object>[],
  'photoCount': 0,
  'videoCount': 1,
  'cover': null,
  'coverVideo': {..._video, 'id': 'v2', 'caption': 'Races'},
  'createdAt': '2026-10-01T00:00:00.000Z',
  'photos': <Object>[],
  'videos': [
    {..._video, 'id': 'v2', 'caption': 'Races'},
  ],
};

void main() {
  tearDown(Get.reset);

  group('reading an event', () {
    test('a photo brings its small copy, a video its YouTube still', () {
      final event = GalleryEventItem.fromJson(_event);
      expect(event.photos.single.path, '/files/f1');
      expect(event.photos.single.thumbPath, '/files/f1?variant=thumb');
      expect(event.videos.single.videoId, 'dQw4w9WgXcQ');
      expect(event.videos.single.caption, 'Our dance');
      expect(event.coverVideo?.thumbnailUrl, contains('i.ytimg.com'));
      expect(event.videoCount, 1);
    });

    test('an event as the server sent it before videos still reads', () {
      final event = GalleryEventItem.fromJson({
        'id': 'e0',
        'name': 'Sports Day',
        'photoCount': 1,
        'cover': {'id': 'p9', 'url': '/api/v1/files/f9', 'caption': null},
        'photos': [
          {'id': 'p9', 'url': '/api/v1/files/f9', 'caption': null},
        ],
      });
      expect(event.photos.single.thumbPath, '/files/f9');
      expect(event.videos, isEmpty);
      expect(event.videoCount, 0);
      expect(event.coverVideo, isNull);
    });

    test('an event with only a video has a cover to show', () {
      final event = GalleryEventItem.fromJson({
        ..._event,
        'photoCount': 0,
        'cover': null,
        'photos': <Object>[],
      });
      expect(event.cover, isNull);
      expect(event.coverVideo?.videoId, 'dQw4w9WgXcQ');
    });
  });

  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 12; i += 1) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  Future<_Api> openEvent(WidgetTester tester) async {
    final api = _install((path) {
      if (path == '/me/children/s1/gallery') {
        return [
          _event,
          {..._sports, 'photos': null, 'videos': null},
        ];
      }
      if (path == '/me/children/s1/gallery/e1') return _event;
      if (path == '/me/children/s1/gallery/e2') return _sports;
      return null;
    });
    Get.put(GalleryEventController(studentId: 's1', eventId: 'e1'));
    await tester.pumpWidget(
      const GetMaterialApp(home: GalleryEventView(title: 'Annual Day')),
    );
    await settle(tester);
    return api;
  }

  testWidgets('the media grid counts each kind, and asks for small copies', (
    tester,
  ) async {
    final api = await openEvent(tester);

    expect(find.text('Annual Day'), findsOneWidget);
    expect(find.text('All (2)'), findsOneWidget);
    expect(find.text('Photos (1)'), findsOneWidget);
    expect(find.text('Videos (1)'), findsOneWidget);
    expect(find.text('October 2026'), findsOneWidget);

    // A parent scrolling an event downloads the small copies, not the photos.
    expect(api.asked, contains('/files/f1?variant=thumb'));
    expect(api.asked, isNot(contains('/files/f1')));
  });

  testWidgets('Videos is the video list; Photos with none is the empty state', (
    tester,
  ) async {
    await openEvent(tester);

    await tester.tap(find.text('Videos (1)'));
    await settle(tester);
    expect(find.text('Our dance'), findsOneWidget);
    expect(find.text('10 Oct 2026'), findsOneWidget);

    // The sports album has videos only: its Photos is empty, and says so.
    final controller = Get.find<GalleryEventController>();
    unawaited(controller.open('e2'));
    await settle(tester);
    await tester.tap(find.text('Photos (0)'));
    await settle(tester);
    expect(find.text('No photos yet'), findsOneWidget);
  });

  testWidgets(
    'the albums button lists every album and switches to the one chosen',
    (tester) async {
      await openEvent(tester);

      await tester.tap(find.bySemanticsLabel('Albums'));
      await settle(tester);
      expect(find.text('Albums'), findsOneWidget);
      expect(find.text('2 items'), findsOneWidget);
      expect(find.text('Sports Day'), findsOneWidget);

      await tester.tap(find.text('Sports Day'));
      await settle(tester);
      // Back on the media screen, now showing the album chosen.
      expect(find.text('Sports Day'), findsOneWidget);
      expect(find.text('All (1)'), findsOneWidget);
    },
  );

  testWidgets('a photo opens full screen with its place, Share and Download', (
    tester,
  ) async {
    final api = await openEvent(tester);

    await tester.tap(find.bySemanticsLabel('Photo 1'));
    await settle(tester);
    expect(find.byType(GalleryPhotoView), findsOneWidget);
    expect(find.text('1 / 1'), findsOneWidget);
    expect(find.text('Share'), findsOneWidget);
    expect(find.text('Download'), findsOneWidget);
    // Full screen is the photo itself, not the small copy.
    expect(api.asked, contains('/files/f1'));
  });
}
