import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_service.dart';
import '../../core/config/branding.dart';
import '../../core/push/push_service.dart';
import '../../core/routes/app_pages.dart';
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
    required this.mustChangePassword,
    this.email,
    this.phone,
    this.schoolName,
    this.schoolCode,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) {
    final school = json['school'] as Map<String, dynamic>?;
    return AppUser(
      id: json['id'] as String,
      name: json['name'] as String,
      role: json['role'] as String,
      mustChangePassword: json['mustChangePassword'] as bool? ?? false,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      schoolName: school?['name'] as String?,
      schoolCode: school?['code'] as String?,
    );
  }

  final String id;
  final String name;
  final String role;

  /// Signed in with a password the school office chose. The API refuses
  /// everything but changing it, so the app must not open a normal screen.
  final bool mustChangePassword;

  final String? email;
  final String? phone;
  final String? schoolName;

  /// The School ID of the school this session belongs to.
  final String? schoolCode;

  bool get isTeacher => role == 'TEACHER';
  bool get isParent => role == 'PARENT';
}

class AuthController extends GetxController {
  AuthController({BrandingService? branding})
    : _branding = branding ?? BrandingService();

  /// Checks School IDs and remembers the one that signed in.
  final BrandingService _branding;

  final user = Rxn<AppUser>();
  final isBusy = false.obs;
  final errorMessage = RxnString();

  /// Whether [errorMessage] is a status rather than a mistake.
  ///
  /// A family waiting on the school has typed everything correctly and has
  /// nothing to try again. Shown in the sign-in screen's own colours instead of
  /// the red that means "you got that wrong".
  final isAwaitingSchool = false.obs;

  /// Restores a session on cold start. Returns the route to open.
  Future<String> resolveStartRoute() async {
    final token = await api.tokens.accessToken;
    if (token == null) return '/login';

    try {
      final data = await api.get<Map<String, dynamic>>('/auth/me');
      final signedIn = AppUser.fromJson(data['user'] as Map<String, dynamic>);
      user.value = signedIn;

      // The session is the authority on which school this is. A phone whose
      // remembered School ID disagrees — or has none, after an update —
      // takes the session's, so the next sign-in starts from it.
      final schoolCode = signedIn.schoolCode;
      if (schoolCode != null && schoolCode != BrandingService.current.code) {
        unawaited(
          _branding.choose(schoolCode).then<void>((_) {}, onError: (_) {}),
        );
      }

      // FCM rotates tokens silently, so a returning user re-registers on every
      // cold start rather than only on the day they signed in.
      unawaited(Get.find<PushService>().start());
      return _routeFor(signedIn);
    } on DioException {
      // The interceptor already tried to refresh; if we are still here the
      // session is genuinely gone.
      await api.tokens.clear();
      return '/login';
    }
  }

  Future<void> signIn({
    required String schoolId,
    required String identifier,
    required String password,
  }) async {
    isBusy.value = true;
    errorMessage.value = null;
    isAwaitingSchool.value = false;

    try {
      // The School ID first. It decides whose records the sign-in is checked
      // against, and one that names no school deserves to be told so — not
      // "wrong password" to somebody who typed their password correctly.
      final school = await _branding.choose(schoolId);

      final data = await api.post<Map<String, dynamic>>(
        '/auth/login',
        body: {
          'identifier': identifier.trim(),
          'password': password,
          // Only accounts at this school are considered. That is what makes
          // the answer unambiguous for a parent whose phone number also exists
          // at another school, and the session the API issues is bound to this
          // school alone — every request after it sees only this school's data.
          'schoolCode': school.code,
        },
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

      await Get.offAllNamed<void>(_routeFor(signedIn));
    } on SchoolNotFound catch (e) {
      errorMessage.value = _unknownSchool(e);
    } on DioException catch (e) {
      errorMessage.value = _messageFor(e);
      isAwaitingSchool.value = _isAboutRegistration(e);
    } finally {
      isBusy.value = false;
    }
  }

  /// Opens registration for the school whose ID has been typed.
  ///
  /// A family registers with one school, so the School ID is checked before
  /// the form opens — finding out at the end of four screens that it was
  /// mistyped would waste all of them.
  Future<void> startRegistration(String schoolId) async {
    errorMessage.value = null;
    isAwaitingSchool.value = false;

    if (schoolId.trim().isEmpty) {
      errorMessage.value =
          'Enter your School ID first. Your school gives it to you.';
      return;
    }

    isBusy.value = true;
    try {
      await _branding.choose(schoolId);
      await Get.toNamed<void>(AppRoutes.registration);
    } on SchoolNotFound catch (e) {
      errorMessage.value = _unknownSchool(e);
    } on DioException catch (e) {
      errorMessage.value = _messageFor(e);
    } finally {
      isBusy.value = false;
    }
  }

  static String _unknownSchool(SchoolNotFound e) =>
      'No school has the School ID “${e.schoolId}”. Please check it with '
      'your school office.';

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

    await _endSession();
  }

  /// Closes the signed-in parent's account for good, then leaves as signing
  /// out does — with the sign-in screen saying what happened.
  ///
  /// Throws the [DioException] when the API refuses, a wrong password most
  /// often, so the dialog that asked for it can say why and stay open.
  Future<void> deleteAccount(String password) async {
    await api.post<dynamic>(
      '/auth/delete-account',
      body: {'password': password},
    );

    // The server has already dropped the account's sessions and devices, so
    // only what is on this phone is left to clear.
    await Get.find<PushService>().forget();
    await _endSession(reason: 'deleted');
  }

  Future<void> _endSession({String? reason}) async {
    await api.tokens.clear();
    user.value = null;

    // Everything holding the signed-in person's data goes with them. GetX keeps
    // the first registration of a type, so the next sign-in would otherwise
    // reuse these — handing a second family the first family's children.
    SessionScope.clear<ChildController>();
    SessionScope.clear<ChildrenController>();
    SessionScope.clear<RegisterController>();
    SessionScope.clear<InboxController>();

    await Get.offAllNamed<void>(
      '/login',
      arguments: reason == null ? null : {'reason': reason},
    );
  }

  /// Re-reads who is signed in. Used after changing a password, which clears
  /// the flag that is keeping the app on one screen.
  Future<void> reload() async {
    final data = await api.get<Map<String, dynamic>>('/auth/me');
    user.value = AppUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<void> goHome() async {
    final signedIn = user.value;
    if (signedIn != null) await Get.offAllNamed<void>(_routeFor(signedIn));
  }

  static String _routeFor(AppUser user) =>
      user.mustChangePassword ? '/change-password' : _homeFor(user);

  static String _homeFor(AppUser user) =>
      user.isTeacher ? '/teacher' : '/parent';

  /// True when the reply is about a registration rather than a sign-in.
  static bool _isAboutRegistration(DioException e) {
    final data = e.response?.data;
    if (data is! Map || data['error'] is! Map) return false;

    final code = (data['error'] as Map)['code']?.toString();
    return code == ApiErrorCodes.registrationPending ||
        code == ApiErrorCodes.registrationRejected;
  }

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
      // Neither of these is a failed sign-in. The family typed everything
      // correctly and there is nothing to try again, so the screen says so in
      // its own colour rather than in the red one that means "you got it
      // wrong".
      if (code == ApiErrorCodes.registrationPending ||
          code == ApiErrorCodes.registrationRejected) {
        return error['message']?.toString() ??
            'Your registration is with the school.';
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
