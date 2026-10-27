import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/core/audio/speech_service.dart';
import 'package:poetree_school/core/theme/theme_controller.dart';
import 'package:poetree_school/features/announcements/announcements_view.dart';
import 'package:poetree_school/features/parent/child_controller.dart';
import 'package:poetree_school/features/parent/children_controller.dart';
import 'package:poetree_school/features/settings/settings_view.dart';

/// Announcements and Settings, as a family uses them.

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

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    sent.add('${options.method} ${options.path}');
    return ResponseBody.fromString(
      jsonEncode({'ok': true}),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

NoticeItem _notice(
  String id,
  String title,
  String type, {
  bool read = false,
  List<String> classes = const [],
}) => NoticeItem.fromJson({
  'id': id,
  'title': title,
  'body': 'Details of $title, with everything a parent needs to know.',
  'type': type,
  'publishAt': '2026-08-10T04:00:00Z',
  'pinned': false,
  'readByMe': read,
  'classroomLabels': classes,
  'attachmentCount': 0,
});

/// The child controller with these notices, without loading anything else.
ChildController _child(List<NoticeItem> notices) {
  final child = ChildController(ChildrenController())
    ..notices.value = notices
    ..isLoading.value = false;
  return child;
}

_Api _install() {
  final api = _Api();
  Get.put<ApiService>(
    ApiService()
      ..client = ApiClient(_NoTokens(), dio: Dio()..httpClientAdapter = api),
  );
  return api;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

void main() {
  tearDown(Get.reset);

  group('announcements', () {
    test('read the classes they were for', () {
      final notice = _notice(
        'n1',
        'Sports day',
        'EVENT',
        classes: ['Nursery A'],
      );
      expect(notice.classroomLabels, ['Nursery A']);
      expect(AnnouncementKind.of('EVENT').label, 'Event');
      expect(AnnouncementKind.of('SOMETHING NEW'), AnnouncementKind.general);
    });

    testWidgets('list each one, marking the unread New', (tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 1200));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      _install();
      final child = _child([
        _notice('n1', 'Sports day', 'EVENT'),
        _notice('n2', 'School holiday', 'HOLIDAY', read: true),
      ]);

      await tester.pumpWidget(
        GetMaterialApp(home: AnnouncementsView(child: child)),
      );
      await _settle(tester);

      expect(find.text('Announcements'), findsOneWidget);
      expect(
        find.text(
          'Stay updated with the latest news from your child’s school.',
        ),
        findsOneWidget,
      );
      expect(find.text('Sports day'), findsOneWidget);
      expect(find.text('School holiday'), findsOneWidget);
      expect(find.text('New'), findsOneWidget);
      expect(find.text('10 Aug 2026'), findsNWidgets(2));
    });

    testWidgets('open to the whole message, and tell the school it was seen', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(420, 1200));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final api = _install();
      final notice = _notice(
        'n1',
        'Sports day',
        'EVENT',
        classes: ['Nursery A'],
      );
      final child = _child([notice]);

      await tester.pumpWidget(
        GetMaterialApp(home: AnnouncementsView(child: child)),
      );
      await _settle(tester);
      await tester.tap(find.text('Sports day'));
      await _settle(tester);

      expect(find.byType(AnnouncementDetailView), findsOneWidget);
      expect(
        find.text(
          'Details of Sports day, with everything a parent needs to know.',
        ),
        findsOneWidget,
      );
      expect(find.text('For Nursery A'), findsOneWidget);
      // Still says it was new when it was opened.
      expect(find.text('New'), findsOneWidget);
      expect(api.sent, contains('POST /notices/n1/read'));
      expect(notice.readByMe, isTrue);
    });

    testWidgets('say so kindly when there are none', (tester) async {
      _install();
      await tester.pumpWidget(
        GetMaterialApp(home: AnnouncementsView(child: _child(const []))),
      );
      await _settle(tester);
      expect(find.text('No announcements yet'), findsOneWidget);
    });

    testWidgets('say what went wrong, with a way to try again', (tester) async {
      _install();
      final child = _child(const [])
        ..error.value = 'The school could not be reached.';
      await tester.pumpWidget(
        GetMaterialApp(home: AnnouncementsView(child: child)),
      );
      await _settle(tester);
      expect(find.text('Could not load the announcements'), findsOneWidget);
      expect(find.text('The school could not be reached.'), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
    });
  });

  group('settings', () {
    Future<(ThemeController, SpeechService)> open(WidgetTester tester) async {
      await tester.binding.setSurfaceSize(const Size(420, 1400));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final theme = Get.put(ThemeController());
      final voice = Get.put(SpeechService());
      await tester.pumpWidget(
        Obx(
          () => GetMaterialApp(
            themeMode: theme.mode.value,
            theme: ThemeData.light(),
            darkTheme: ThemeData.dark(),
            home: const SettingsView(),
          ),
        ),
      );
      await _settle(tester);
      return (theme, voice);
    }

    testWidgets('turns reading aloud off and on', (tester) async {
      final (_, voice) = await open(tester);
      expect(find.text('Read activities aloud'), findsOneWidget);
      expect(find.text('Turn this off in a classroom.'), findsOneWidget);

      await tester.tap(find.byType(Switch));
      await _settle(tester);
      expect(voice.isOn.value, isFalse);
      expect(find.text('The app stays silent.'), findsOneWidget);

      await tester.tap(find.byType(Switch));
      await _settle(tester);
      expect(voice.isOn.value, isTrue);
    });

    testWidgets('chooses how the app looks, in the sheet too', (tester) async {
      final (theme, _) = await open(tester);
      expect(theme.mode.value, ThemeMode.light);

      await tester.tap(find.bySemanticsLabel('Dark. Easier at bedtime'));
      await _settle(tester);
      expect(theme.mode.value, ThemeMode.dark);
      expect(find.text('Choose Appearance'), findsOneWidget);

      // The sheet's own cards choose as well.
      await tester.tap(
        find
            .bySemanticsLabel('Match my phone. Follows your phone’s setting')
            .last,
      );
      await _settle(tester);
      expect(theme.mode.value, ThemeMode.system);

      await tester.tap(find.text('Done'));
      await _settle(tester);
      expect(find.text('Choose Appearance'), findsNothing);
      expect(theme.mode.value, ThemeMode.system);
    });
  });
}
