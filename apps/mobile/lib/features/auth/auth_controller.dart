import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_service.dart';
import '../../core/config/school_config.dart';

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
      return _homeFor(user.value!);
    } on DioException {
      // The interceptor already tried to refresh; if we are still here the
      // session is genuinely gone.
      await api.tokens.clear();
      return '/login';
    }
  }

  Future<void> signIn({required String identifier, required String password}) async {
    isBusy.value = true;
    errorMessage.value = null;

    try {
      final data = await api.post<Map<String, dynamic>>(
        '/auth/login',
        body: {'identifier': identifier.trim(), 'password': password},
      );

      final signedIn = AppUser.fromJson(data['user'] as Map<String, dynamic>);

      // This binary belongs to one school. The API enforces it too, but failing
      // here gives a clearer message than a generic rejection.
      if (SchoolConfig.isConfigured && !signedIn.isParent && !signedIn.isTeacher) {
        errorMessage.value = 'This app is for parents and teachers.';
        return;
      }

      await api.tokens.save(
        access: data['accessToken'] as String,
        refresh: data['refreshToken'] as String,
      );
      user.value = signedIn;

      await Get.offAllNamed<void>(_homeFor(signedIn));
    } on DioException catch (e) {
      errorMessage.value = _messageFor(e);
    } finally {
      isBusy.value = false;
    }
  }

  Future<void> signOut() async {
    try {
      final refresh = await api.tokens.refreshToken;
      await api.post<dynamic>('/auth/logout', body: {'refreshToken': refresh});
    } on DioException {
      // Best effort: the browser-side token is what matters, and it is cleared
      // below whether or not the server call succeeded.
    }

    await api.tokens.clear();
    user.value = null;
    await Get.offAllNamed<void>('/login');
  }

  static String _homeFor(AppUser user) => user.isTeacher ? '/teacher' : '/parent';

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
