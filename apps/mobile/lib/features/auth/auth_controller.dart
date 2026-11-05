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
    List<String>? roles,
    this.email,
    this.phone,
    this.schoolName,
    this.schoolCode,
  }) : roles = roles ?? [role];

  factory AppUser.fromJson(Map<String, dynamic> json) {
    final school = json['school'] as Map<String, dynamic>?;
    final role = json['role'] as String;
    return AppUser(
      id: json['id'] as String,
      name: json['name'] as String,
      role: role,
      // An older server sends only the one role; that is all there is then.
      roles:
          (json['roles'] as List<dynamic>?)?.whereType<String>().toList() ??
          [role],
      mustChangePassword: json['mustChangePassword'] as bool? ?? false,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      schoolName: school?['name'] as String?,
      schoolCode: school?['code'] as String?,
    );
  }

  final String id;
  final String name;

  /// The role this session acts as — what the app is showing.
  final String role;

  /// Every role the person holds at the school: both, for a parent who also
  /// teaches there.
  final List<String> roles;

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

  /// A parent who is also a teacher here — offered a switch between the two.
  bool get canSwitch => roles.contains('TEACHER') && roles.contains('PARENT');

  /// Whether the person may use this app at all: families and teachers.
  bool get usesApp => roles.contains('PARENT') || roles.contains('TEACHER');
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

  /// Where someone who is not signed in starts: their school's sign-in, or —
  /// on a phone that has never been told one — the School ID screen.
  static String get _signedOutRoute => BrandingService.current.code == null
      ? AppRoutes.schoolId
      : AppRoutes.login;

  /// Restores a session on cold start. Returns the route to open.
  Future<String> resolveStartRoute() async {
    final token = await api.tokens.accessToken;
    if (token == null) return _signedOutRoute;

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
      return _signedOutRoute;
    }
  }

  /// The School ID screen's Continue: checked with the API, remembered, and
  /// then — only then — the school's sign-in.
  Future<void> chooseSchool(String schoolId) async {
    errorMessage.value = null;
    isAwaitingSchool.value = false;

    if (schoolId.trim().isEmpty) {
      errorMessage.value = 'Enter your School ID. Your school gives it to you.';
      return;
    }

    isBusy.value = true;
    try {
      await _branding.choose(schoolId);
      // Not awaited: the future only ends when the new screen does, and the
      // busy flag below would stay on — spinning the sign-in button.
      unawaited(Get.offAllNamed<void>(AppRoutes.login));
    } on SchoolNotFound catch (e) {
      errorMessage.value = _unknownSchool(e);
    } on DioException catch (e) {
      errorMessage.value = _messageFor(e);
    } finally {
      isBusy.value = false;
    }
  }

  /// Back to the School ID screen, for a phone signing in to another school.
  /// The remembered school stays until a new one is accepted.
  Future<void> changeSchool() async {
    errorMessage.value = null;
    isAwaitingSchool.value = false;
    await Get.offAllNamed<void>(AppRoutes.schoolId);
  }

  Future<void> signIn({
    required String identifier,
    required String password,
  }) async {
    final schoolId = BrandingService.current.code;
    // Nobody signs in without a school: the School ID screen comes first.
    if (schoolId == null) {
      await changeSchool();
      return;
    }

    isBusy.value = true;
    errorMessage.value = null;
    isAwaitingSchool.value = false;

    try {
      // Checked again, so a school that has gone since this phone last saw it
      // is said plainly — not "wrong password" to somebody who typed their
      // password correctly.
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
      if (!signedIn.usesApp) {
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

      // Someone who is both a parent and a teacher here says which, first.
      unawaited(
        Get.offAllNamed<void>(
          signedIn.canSwitch && !signedIn.mustChangePassword
              ? AppRoutes.chooseRole
              : _routeFor(signedIn),
        ),
      );
    } on SchoolNotFound catch (e) {
      errorMessage.value = _unknownSchool(e);
    } on DioException catch (e) {
      errorMessage.value = _messageFor(e);
      isAwaitingSchool.value = _isAboutRegistration(e);
    } finally {
      isBusy.value = false;
    }
  }

  /// Opens registration for the school this phone has chosen.
  ///
  /// A family registers with one school, so the School ID is checked again
  /// before the form opens — finding out at the end of four screens that the
  /// school had gone would waste all of them.
  Future<void> startRegistration() async {
    errorMessage.value = null;
    isAwaitingSchool.value = false;

    final schoolId = BrandingService.current.code;
    if (schoolId == null) {
      await changeSchool();
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

  /// The choice after signing in, for someone who is both: carry on as the
  /// role they signed in as, or become the other.
  Future<void> continueAs(String role) async {
    final signedIn = user.value;
    if (signedIn == null) return;
    if (signedIn.role == role) {
      await goHome();
      return;
    }
    await switchTo(role);
  }

  /// Becoming the other of parent and teacher.
  ///
  /// A new session acting as that role — the server ends the old one, so the
  /// two are never open together — and everything the old role had loaded is
  /// put away before the new home opens.
  Future<void> switchTo(String role) async {
    isBusy.value = true;
    try {
      final data = await api.post<Map<String, dynamic>>(
        '/auth/switch-role',
        body: {'role': role},
      );
      await api.tokens.save(
        access: data['accessToken'] as String,
        refresh: data['refreshToken'] as String,
      );
      final switched = AppUser.fromJson(data['user'] as Map<String, dynamic>);
      _clearSessionControllers();
      user.value = switched;
      unawaited(Get.offAllNamed<void>(_routeFor(switched)));
    } on DioException catch (e) {
      Get
        ..closeAllSnackbars()
        ..snackbar(
          'Could not switch',
          _messageFor(e),
          snackPosition: SnackPosition.BOTTOM,
        );
    } finally {
      isBusy.value = false;
    }
  }

  /// Everything holding the signed-in person's data. GetX keeps the first
  /// registration of a type, so the next sign-in — or the other role — would
  /// otherwise reuse these, handing a second family the first family's
  /// children, or a teacher's register to their parent view.
  void _clearSessionControllers() {
    SessionScope.clear<ChildController>();
    SessionScope.clear<ChildrenController>();
    SessionScope.clear<RegisterController>();
    SessionScope.clear<InboxController>();
  }

  Future<void> _endSession({String? reason}) async {
    await api.tokens.clear();
    user.value = null;
    _clearSessionControllers();

    await Get.offAllNamed<void>(
      _signedOutRoute,
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
