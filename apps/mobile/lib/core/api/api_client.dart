import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config/school_config.dart';

/// Error codes the API returns. Clients branch on these, never on the message.
class ApiErrorCodes {
  static const schoolSuspended = 'SCHOOL_SUSPENDED';
  static const invalidCredentials = 'INVALID_CREDENTIALS';
  static const tokenExpired = 'TOKEN_EXPIRED';
  static const invalidRefreshToken = 'INVALID_REFRESH_TOKEN';
  static const portalAccessDenied = 'PORTAL_ACCESS_DENIED';
  static const wrongSchoolApp = 'WRONG_SCHOOL_APP';
}

class ApiException implements Exception {
  ApiException(this.statusCode, this.code, this.message);

  final int statusCode;
  final String code;
  final String message;

  @override
  String toString() => 'ApiException($statusCode, $code): $message';
}

/// Where the session lives.
///
/// An interface rather than a concrete class so the rotation logic below can be
/// tested without a Keystore, which needs a real device. The only shipping
/// implementation is [SecureTokenStore].
abstract class TokenStore {
  Future<String?> get accessToken;
  Future<String?> get refreshToken;
  Future<void> save({required String access, required String refresh});
  Future<void> clear();
}

/// Keystore on Android, Keychain on iOS — never SharedPreferences, which is
/// world-readable on a rooted device.
class SecureTokenStore implements TokenStore {
  SecureTokenStore(this._storage);

  final FlutterSecureStorage _storage;

  static const _access = 'poetree_access_token';
  static const _refresh = 'poetree_refresh_token';

  @override
  Future<String?> get accessToken => _storage.read(key: _access);

  @override
  Future<String?> get refreshToken => _storage.read(key: _refresh);

  @override
  Future<void> save({required String access, required String refresh}) async {
    await _storage.write(key: _access, value: access);
    await _storage.write(key: _refresh, value: refresh);
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _access);
    await _storage.delete(key: _refresh);
  }
}

/// The HTTP client, with silent token rotation.
///
/// Access tokens last fifteen minutes, so a parent who opens the app twice a day
/// will always arrive with an expired one. Rotation happens here rather than in
/// each screen, and concurrent 401s share a single refresh so a cold start that
/// fires four requests does not spend four refresh tokens — the API revokes a
/// reused one and would end the session.
class ApiClient {
  /// [refreshDio] is separate on purpose: the interceptor below must never run
  /// on its own refresh call, or a failed refresh would try to refresh itself.
  ApiClient(this._tokens, {Dio? dio, Dio? refreshDio})
    : _dio = dio ?? Dio(),
      _refreshDio =
          refreshDio ?? Dio(BaseOptions(baseUrl: SchoolConfig.apiBaseUrl)) {
    _dio.options
      ..baseUrl = SchoolConfig.apiBaseUrl
      ..connectTimeout = const Duration(seconds: 15)
      ..receiveTimeout = const Duration(seconds: 20)
      ..headers['content-type'] = 'application/json';

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _tokens.accessToken;
          if (token != null) options.headers['authorization'] = 'Bearer $token';
          handler.next(options);
        },
        onError: (error, handler) async {
          final response = error.response;
          final code = _codeOf(response);

          // A suspended school is terminal, not a token problem. Refreshing
          // would fail anyway — the API re-checks the plan on refresh.
          if (code == ApiErrorCodes.schoolSuspended) {
            await _tokens.clear();
            onSchoolSuspended?.call();
            return handler.next(error);
          }

          final isAuthFailure = response?.statusCode == 401;
          final alreadyRetried = error.requestOptions.extra['retried'] == true;
          final isRefreshCall = error.requestOptions.path.contains(
            '/auth/refresh',
          );

          if (!isAuthFailure || alreadyRetried || isRefreshCall) {
            return handler.next(error);
          }

          final refreshed = await _refreshOnce();
          if (!refreshed) {
            await _tokens.clear();
            onSessionExpired?.call();
            return handler.next(error);
          }

          try {
            final options = error.requestOptions;
            options.extra['retried'] = true;
            options.headers['authorization'] =
                'Bearer ${await _tokens.accessToken}';
            final retried = await _dio.fetch<dynamic>(options);
            return handler.resolve(retried);
          } on DioException catch (e) {
            return handler.next(e);
          }
        },
      ),
    );
  }

  final Dio _dio;
  final Dio _refreshDio;
  final TokenStore _tokens;

  /// Called when the school's plan is switched off mid-session.
  void Function()? onSchoolSuspended;

  /// Called when the session cannot be recovered and the user must sign in.
  void Function()? onSessionExpired;

  Future<bool>? _inFlightRefresh;

  static String _codeOf(Response<dynamic>? response) {
    final data = response?.data;
    if (data is Map && data['error'] is Map) {
      return (data['error'] as Map)['code']?.toString() ?? '';
    }
    return '';
  }

  /// Collapses concurrent refreshes into one. The API rotates refresh tokens and
  /// treats a reuse as theft, ending every session — so two parallel refreshes
  /// would log the user out.
  Future<bool> _refreshOnce() {
    return _inFlightRefresh ??= _doRefresh().whenComplete(() {
      _inFlightRefresh = null;
    });
  }

  Future<bool> _doRefresh() async {
    final refresh = await _tokens.refreshToken;
    if (refresh == null) return false;

    try {
      final response = await _refreshDio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': refresh},
      );

      final data = response.data;
      if (data == null) return false;

      await _tokens.save(
        access: data['accessToken'] as String,
        refresh: data['refreshToken'] as String,
      );
      return true;
    } on DioException {
      return false;
    }
  }

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) async {
    final response = await _dio.get<T>(path, queryParameters: query);
    return response.data as T;
  }

  Future<T> post<T>(String path, {Object? body}) async {
    final response = await _dio.post<T>(path, data: body);
    return response.data as T;
  }

  Future<T> put<T>(String path, {Object? body}) async {
    final response = await _dio.put<T>(path, data: body);
    return response.data as T;
  }

  TokenStore get tokens => _tokens;
}
