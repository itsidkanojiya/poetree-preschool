import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/core/api/api_client.dart';

/// The session logic, tested without a device.
///
/// These are the failure modes that cost a real user their session rather than
/// showing them an error: a cold start firing several requests at once and
/// spending several refresh tokens, or a suspended school being mistaken for an
/// expired token and retried forever.

class _MemoryTokenStore implements TokenStore {
  _MemoryTokenStore({this.access, this.refresh});

  String? access;
  String? refresh;
  int clearCount = 0;

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
    clearCount += 1;
  }
}

/// Answers requests from a script instead of the network.
class _ScriptedAdapter implements HttpClientAdapter {
  _ScriptedAdapter(this.respond);

  final Future<ResponseBody> Function(RequestOptions options) respond;
  final List<String> calls = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    calls.add(options.path);
    return respond(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Map<String, dynamic> body, int status) =>
    ResponseBody.fromString(
      _encode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

String _encode(Map<String, dynamic> body) {
  final entries = body.entries.map((e) {
    final value = e.value;
    if (value is Map) {
      return '"${e.key}":${_encode(Map<String, dynamic>.from(value))}';
    }
    return '"${e.key}":"$value"';
  });
  return '{${entries.join(',')}}';
}

void main() {
  group('token rotation', () {
    test('refreshes once when several requests fail together', () async {
      // A cold start fires four requests at once. The API rotates refresh
      // tokens and treats a reuse as theft, ending every session — so four
      // parallel refreshes would sign the user out of the app they just opened.
      final tokens = _MemoryTokenStore(
        access: 'stale',
        refresh: 'good-refresh',
      );

      var refreshCalls = 0;
      var authorised = false;

      final adapter = _ScriptedAdapter((options) async {
        if (authorised) return _json({'ok': 'yes'}, 200);
        return _json({
          'error': {'code': 'TOKEN_EXPIRED', 'message': 'expired'},
        }, 401);
      });

      final refreshAdapter = _ScriptedAdapter((options) async {
        refreshCalls += 1;
        authorised = true;
        return _json({
          'accessToken': 'fresh',
          'refreshToken': 'next-refresh',
        }, 200);
      });

      final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))
        ..httpClientAdapter = adapter;
      final refreshDio = Dio(BaseOptions(baseUrl: 'https://example.test'))
        ..httpClientAdapter = refreshAdapter;

      final client = ApiClient(tokens, dio: dio, refreshDio: refreshDio);

      await Future.wait([
        client.get<Map<String, dynamic>>('/students'),
        client.get<Map<String, dynamic>>('/notices'),
        client.get<Map<String, dynamic>>('/attendance'),
        client.get<Map<String, dynamic>>('/fees'),
      ]);

      expect(refreshCalls, 1);
      expect(await tokens.accessToken, 'fresh');
      expect(await tokens.refreshToken, 'next-refresh');
    });

    test(
      'gives up and clears the session when the refresh is rejected',
      () async {
        final tokens = _MemoryTokenStore(access: 'stale', refresh: 'revoked');

        final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))
          ..httpClientAdapter = _ScriptedAdapter((options) async {
            return _json({
              'error': {'code': 'TOKEN_EXPIRED', 'message': 'expired'},
            }, 401);
          });

        final refreshDio = Dio(BaseOptions(baseUrl: 'https://example.test'))
          ..httpClientAdapter = _ScriptedAdapter((options) async {
            return _json({
              'error': {'code': 'INVALID_REFRESH_TOKEN', 'message': 'reused'},
            }, 401);
          });

        var expired = 0;
        final client = ApiClient(tokens, dio: dio, refreshDio: refreshDio)
          ..onSessionExpired = () => expired += 1;

        await expectLater(
          client.get<Map<String, dynamic>>('/students'),
          throwsA(isA<DioException>()),
        );

        expect(expired, 1);
        expect(await tokens.accessToken, isNull);
        expect(await tokens.refreshToken, isNull);
      },
    );

    test('does not retry a request that already retried', () async {
      // Without this the client loops: refresh, retry, 401, refresh, forever.
      final tokens = _MemoryTokenStore(access: 'stale', refresh: 'good');

      final adapter = _ScriptedAdapter((options) async {
        return _json({
          'error': {'code': 'TOKEN_EXPIRED', 'message': 'expired'},
        }, 401);
      });

      var refreshCalls = 0;
      final refreshDio = Dio(BaseOptions(baseUrl: 'https://example.test'))
        ..httpClientAdapter = _ScriptedAdapter((options) async {
          refreshCalls += 1;
          return _json({'accessToken': 'fresh', 'refreshToken': 'next'}, 200);
        });

      final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))
        ..httpClientAdapter = adapter;

      final client = ApiClient(tokens, dio: dio, refreshDio: refreshDio);

      await expectLater(
        client.get<Map<String, dynamic>>('/students'),
        throwsA(isA<DioException>()),
      );

      // One original, one retry — and exactly one refresh behind them.
      expect(adapter.calls.length, 2);
      expect(refreshCalls, 1);
    });
  });

  group('suspended school', () {
    test('is terminal — no refresh is attempted', () async {
      // The API re-checks the plan on refresh, so retrying would fail anyway.
      // Treating it as a token problem would spend a refresh token and leave
      // the parent staring at a spinner instead of an explanation.
      final tokens = _MemoryTokenStore(access: 'valid', refresh: 'valid');

      var refreshCalls = 0;
      final refreshDio = Dio(BaseOptions(baseUrl: 'https://example.test'))
        ..httpClientAdapter = _ScriptedAdapter((options) async {
          refreshCalls += 1;
          return _json({'accessToken': 'a', 'refreshToken': 'b'}, 200);
        });

      final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))
        ..httpClientAdapter = _ScriptedAdapter((options) async {
          return _json({
            'error': {'code': 'SCHOOL_SUSPENDED', 'message': 'plan off'},
          }, 403);
        });

      var suspended = 0;
      final client = ApiClient(tokens, dio: dio, refreshDio: refreshDio)
        ..onSchoolSuspended = () => suspended += 1;

      await expectLater(
        client.get<Map<String, dynamic>>('/students'),
        throwsA(isA<DioException>()),
      );

      expect(suspended, 1);
      expect(refreshCalls, 0);
      expect(tokens.clearCount, 1);
    });
  });
}
