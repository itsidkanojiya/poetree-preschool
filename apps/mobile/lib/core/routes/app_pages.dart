import 'package:get/get.dart';

import '../../features/auth/auth_controller.dart';
import '../../features/auth/login_view.dart';
import '../../features/parent/parent_home_view.dart';
import '../../features/shared/blocked_view.dart';
import '../../features/teacher/teacher_home_view.dart';

/// Controllers are registered through bindings rather than Get.put inside
/// widgets, so a route's dependencies are declared in one place and a rebuild
/// cannot quietly construct a second controller.
class AuthBinding extends Bindings {
  @override
  void dependencies() {
    Get.put<AuthController>(AuthController(), permanent: true);
  }
}

class AppRoutes {
  static const login = '/login';
  static const parent = '/parent';
  static const teacher = '/teacher';
  static const blocked = '/blocked';
}

final appPages = <GetPage<dynamic>>[
  GetPage<void>(
    name: AppRoutes.login,
    page: () => const LoginView(),
    binding: AuthBinding(),
  ),
  GetPage<void>(name: AppRoutes.parent, page: () => const ParentHomeView()),
  GetPage<void>(name: AppRoutes.teacher, page: () => const TeacherHomeView()),
  GetPage<void>(name: AppRoutes.blocked, page: () => const BlockedView()),
];
