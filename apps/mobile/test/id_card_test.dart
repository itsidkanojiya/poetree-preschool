import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/features/parent/id_card_view.dart';

/// The ID card in the app: the child's photograph and the school's logo are
/// fetched from the paths the API gives, without doubling /api/v1.

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

/// One white pixel.
final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
);

class _Api implements HttpClientAdapter {
  final asked = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    asked.add(options.path);
    if (options.path.startsWith('/files/')) {
      return ResponseBody.fromBytes(
        _png,
        200,
        headers: {
          Headers.contentTypeHeader: ['image/png'],
        },
      );
    }
    final card = options.path == '/me/children/s1/id-card';
    return ResponseBody.fromString(
      jsonEncode(
        card
            ? {
                'layout': 'CLASSIC',
                'schoolName': 'Sunrise Preschool',
                'schoolLogoUrl': '/api/v1/files/logo1',
                'primaryColor': '#16307C',
                'name': 'Aarav Shah',
                'admissionNo': 'A1',
                'photoUrl': '/api/v1/files/photo1',
              }
            : {
                'error': {'code': 'X', 'message': 'Not found'},
              },
      ),
      card ? 200 : 404,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  tearDown(Get.reset);

  testWidgets('shows the child’s photograph and the school’s logo', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(420, 1400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final api = _Api();
    Get.put<ApiService>(
      ApiService()
        ..client = ApiClient(_NoTokens(), dio: Dio()..httpClientAdapter = api),
    );
    Get.put(IdCardController(studentId: 's1', childName: 'Aarav'));

    await tester.pumpWidget(const GetMaterialApp(home: IdCardView()));
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(api.asked, contains('/files/photo1'));
    expect(api.asked, contains('/files/logo1'));
    // Never the doubled path that answered 404 and showed "Tap to retry".
    expect(api.asked.where((path) => path.contains('/api/v1')), isEmpty);
    expect(find.text('Tap to retry'), findsNothing);
  });
}
