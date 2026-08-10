import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_service.dart';
import '../../core/push/push_service.dart';
import '../../core/session/session_scope.dart';
import '../notifications/inbox_controller.dart';
import '../parent/child_controller.dart';
import '../parent/children_controller.dart';
import '../teacher/register_controller.dart';

/// The signed-in person.
class AppUser {
  AppUser({
    required this.id,
    required this.name,
    required this.role,
    this.email,
    this.phone,
    this.schoolName,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) {
    final school = json['school'] as Map<String, dynamic>?;
    return AppUser(
      id: json['id'] as String,
      name: json['name'] as String,
      role: json['role'] as String,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      schoolName: school?['name'] as String?,
    );
  }

  final String id;
  final String name;
  final String role;
  final String? email;
  final String? phone;
  final String? schoolName;

  bool get isTeacher => role == 'TEACHER';
  bool get isParent => role == 'PARENT';
}

class AuthController extends GetxController {
  final user = Rxn<AppUser>();
  final isBusy = false.obs;
  final errorMessage = RxnString();

  /// Restores a session on cold start. Returns the route to open.
  Future<String> resolveStartRoute() async {
    final token = await api.tokens.accessToken;
    if (token == null) return '/login';

    try {
      final data = await api.get<Map<String, dynamic>>('/auth/me');
      user.value = AppUser.fromJson(data['user'] as Map<String, dynamic>);
      // FCM rotates tokens silently, so a returning user re-registers on every
      // cold start rather than only on the day they signed in.
      unawaited(Get.find<PushService>().start());
      return _homeFor(user.value!);
    } on DioException {
      // The interceptor already tried to refresh; if we are still here the
      // session is genuinely gone.
      await api.tokens.clear();
      return '/login';
    }
  }

  Future<void> signIn({
    required String identifier,
    required String password,
  }) async {
    isBusy.value = true;
    errorMessage.value = null;

    try {
      final data = await api.post<Map<String, dynamic>>(
        '/auth/login',
        body: {'identifier': identifier.trim(), 'password': password},
      );

      final signedIn = AppUser.fromJson(data['user'] as Map<String, dynamic>);

      // This app is for families and staff, not administration — and the check
      // must not depend on SchoolConfig being filled in, or an unconfigured
      // development build would silently admit school admins.
      if (!signedIn.isParent && !signedIn.isTeacher) {
        errorMessage.value =
            'This app is for parents and teachers. Administrators use the web portal.';
        return;
      }

      await api.tokens.save(
        access: data['accessToken'] as String,
        refresh: data['refreshToken'] as String,
      );
      user.value = signedIn;

      // After the token is stored, because registering a device attaches it to
      // whoever is signed in — and best-effort, because push failing must never
      // stop someone getting into the app.
      unawaited(Get.find<PushService>().start());

      await Get.offAllNamed<void>(_homeFor(signedIn));
    } on DioException catch (e) {
      errorMessage.value = _messageFor(e);
    } finally {
      isBusy.value = false;
    }
  }

  Future<void> signOut() async {
    // Before the session goes: revoking the device needs a live token, and a
    // handed-on phone must stop receiving another family's notifications.
    await Get.find<PushService>().stop();

    try {
      final refresh = await api.tokens.refreshToken;
      await api.post<dynamic>('/auth/logout', body: {'refreshToken': refresh});
    } on DioException {
      // Best effort: the browser-side token is what matters, and it is cleared
      // below whether or not the server call succeeded.
    }

    await api.tokens.clear();
    user.value = null;

    // Everything holding the signed-in person's data goes with them. GetX keeps
    // the first registration of a type, so the next sign-in would otherwise
    // reuse these — handing a second family the first family's children.
    SessionScope.clear<ChildController>();
    SessionScope.clear<ChildrenController>();
    SessionScope.clear<RegisterController>();
    SessionScope.clear<InboxController>();

    await Get.offAllNamed<void>('/login');
  }

  static String _homeFor(AppUser user) =>
      user.isTeacher ? '/teacher' : '/parent';

  static String _messageFor(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] is Map) {
      final error = data['error'] as Map;
      final code = error['code']?.toString();

      // A suspended school is not the parent's fault, so say what it is rather
      // than implying the password was wrong.
      if (code == ApiErrorCodes.schoolSuspended) {
        return error['message']?.toString() ??
            'Your school’s access is paused. Please contact the school.';
      }
      if (code == ApiErrorCodes.invalidCredentials) {
        return 'That email or phone and password do not match.';
      }
      return error['message']?.toString() ?? 'Sign-in failed.';
    }

    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.connectionError) {
      return 'Cannot reach the school right now. Check your connection.';
    }

    return 'Sign-in failed. Please try again.';
  }
}
