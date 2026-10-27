import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/api/api_client.dart';
import 'package:poetree_school/core/api/api_service.dart';
import 'package:poetree_school/features/results/certificate_detail_view.dart';
import 'package:poetree_school/features/results/certificates_view.dart';
import 'package:poetree_school/features/results/results_models.dart';

/// A family's certificates: none yet, a list to sort by kind, and one to
/// print and share.

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
  _Api(this.answer, {this.status = 200});

  final Object answer;
  final int status;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async => ResponseBody.fromString(
    jsonEncode(answer),
    status,
    headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    },
  );

  @override
  void close({bool force = false}) {}
}

/// One white pixel, standing in for the drawn certificate.
final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
);

Map<String, dynamic> _award(
  String id,
  String title,
  String category, {
  String issuedOn = '2026-10-27',
}) => {
  'awardId': id,
  'title': title,
  'body': 'for always being kind',
  'design': 'CLASSIC',
  'category': category,
  'issuedOn': issuedOn,
  'number': 'CERT-00$id',
};

Future<void> _open(
  WidgetTester tester,
  Object answer, {
  int status = 200,
}) async {
  await tester.binding.setSurfaceSize(const Size(420, 900));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  Get.put<ApiService>(
    ApiService()
      ..client = ApiClient(
        _NoTokens(),
        dio: Dio()..httpClientAdapter = _Api(answer, status: status),
      ),
  );
  Get.put(CertificatesController(studentId: 's1', childName: 'Aarav'));
  await tester.pumpWidget(const GetMaterialApp(home: CertificatesView()));
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  tearDown(Get.reset);

  test('reads the kind, and calls an older certificate an achievement', () {
    expect(
      ChildCertificate.fromJson(_award('1', 'Best in EVS', 'TEST')).category,
      'TEST',
    );
    final older = _award('2', 'Star', 'ACHIEVEMENT')..remove('category');
    expect(ChildCertificate.fromJson(older).category, 'ACHIEVEMENT');
  });

  testWidgets('says so kindly when there are none yet', (tester) async {
    await _open(tester, <Object>[]);

    expect(find.text('No certificates yet'), findsOneWidget);
    expect(
      find.text(
        'When the school awards a certificate, it appears here to keep, '
        'share and print.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('sorts by kind, counting only what the child has', (
    tester,
  ) async {
    await _open(tester, [
      _award('1', 'Star of the Month', 'ACHIEVEMENT'),
      _award('2', 'Best in EVS', 'TEST', issuedOn: '2026-09-10'),
      _award('3', 'Sports Day Winner', 'ACHIEVEMENT', issuedOn: '2026-08-05'),
    ]);

    expect(find.text('All (3)'), findsOneWidget);
    expect(find.text('Achievements (2)'), findsOneWidget);
    expect(find.text('Tests (1)'), findsOneWidget);
    // No behaviour certificates, so no empty filter for them.
    expect(find.textContaining('Behaviour ('), findsNothing);
    expect(find.text('10 Sep 2026'), findsOneWidget);

    await tester.ensureVisible(find.text('Tests (1)'));
    await tester.tap(find.text('Tests (1)'));
    await tester.pump();
    expect(find.text('Best in EVS'), findsOneWidget);
    expect(find.text('Star of the Month'), findsNothing);

    await tester.ensureVisible(find.text('All (3)'));
    await tester.tap(find.text('All (3)'));
    await tester.pump();
    expect(find.text('Star of the Month'), findsOneWidget);
  });

  testWidgets('shows no filters when there is only one kind', (tester) async {
    await _open(tester, [
      _award('1', 'Star of the Month', 'ACHIEVEMENT'),
      _award('2', 'Sports Day Winner', 'ACHIEVEMENT'),
    ]);
    expect(find.textContaining('All ('), findsNothing);
    expect(find.text('Achievement'), findsNWidgets(2));
  });

  testWidgets('says what went wrong, with a way to try again', (tester) async {
    await _open(tester, {
      'error': {'code': 'X', 'message': 'The school could not be reached.'},
    }, status: 500);
    expect(find.text('The school could not be reached.'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('a card opens that certificate', (tester) async {
    await _open(tester, [_award('1', 'Star of the Month', 'ACHIEVEMENT')]);

    await tester.tap(find.text('Star of the Month'));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 60));
    }
    expect(find.byType(CertificateDetailView), findsOneWidget);
    expect(find.text('Presented to Aarav'), findsOneWidget);
  });

  testWidgets('the certificate prints and shares as the school drew it', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(420, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final pdf = Uint8List.fromList(utf8.encode('%PDF-1.4'));
    final asked = <String>[];
    final printed = <String>[];
    final shared = <String>[];

    await tester.pumpWidget(
      GetMaterialApp(
        home: CertificateDetailView(
          certificate: ChildCertificate.fromJson(
            _award('7', 'Star of the Month', 'BEHAVIOUR'),
          ),
          childName: 'Aarav',
          loadPdf: (path) async {
            asked.add(path);
            return pdf;
          },
          drawPage: (_) async => _png,
          printPdf: (bytes, name) async => printed.add(name),
          sharePdf: (bytes, name) async => shared.add(name),
        ),
      ),
    );
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(asked, ['/certificates/awards/7/pdf']);
    expect(find.text('Behaviour'), findsOneWidget);
    expect(find.text('27 October 2026'), findsOneWidget);
    expect(find.text('CERT-007'), findsOneWidget);

    await tester.tap(find.bySemanticsLabel('Print'));
    await tester.pump();
    expect(printed, ['Aarav Star of the Month.pdf']);

    await tester.tap(find.bySemanticsLabel('Share').last);
    await tester.pump();
    expect(shared, ['Aarav Star of the Month.pdf']);
  });
}
