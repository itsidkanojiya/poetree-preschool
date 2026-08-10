import 'package:get/get.dart';

import '../../features/auth/auth_controller.dart';
import '../../features/auth/login_view.dart';
import '../../features/parent/child_controller.dart';
import '../../features/parent/children_controller.dart';
import '../../features/parent/parent_home_view.dart';
import '../../features/shared/blocked_view.dart';
import '../../features/teacher/register_controller.dart';
import '../../features/teacher/register_view.dart';
import '../../features/teacher/teacher_home_view.dart';
import '../offline/outbox.dart';

/// Controllers are registered through bindings rather than Get.put inside
/// widgets, so a route's dependencies are declared in one place and a rebuild
/// cannot quietly construct a second controller.
class AuthBinding extends Bindings {
  @override
  void dependencies() {
    Get.put<AuthController>(AuthController(), permanent: true);
  }
}

/// The child list and the selected child's data.
///
/// `permanent` because the selection has to survive moving between screens —
/// a parent who picks their second child should not find the first one selected
/// again on the next tab.
class ParentBinding extends Bindings {
  @override
  void dependencies() {
    final children = Get.put<ChildrenController>(
      ChildrenController(),
      permanent: true,
    );
    Get.put<ChildController>(ChildController(children), permanent: true);
  }
}

class TeacherBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<RegisterController>(
      () => RegisterController(Get.find<Outbox>()),
      fenix: true,
    );
  }
}

class AppRoutes {
  static const login = '/login';
  static const parent = '/parent';
  static const teacher = '/teacher';
  static const register = '/teacher/register';
  static const blocked = '/blocked';
}

final appPages = <GetPage<dynamic>>[
  GetPage<void>(
    name: AppRoutes.login,
    page: () => const LoginView(),
    binding: AuthBinding(),
  ),
  GetPage<void>(
    name: AppRoutes.parent,
    page: () => const ParentHomeView(),
    binding: ParentBinding(),
  ),
  GetPage<void>(
    name: AppRoutes.teacher,
    page: () => const TeacherHomeView(),
    binding: TeacherBinding(),
  ),
  GetPage<void>(
    name: AppRoutes.register,
    page: () => const RegisterView(),
    binding: TeacherBinding(),
  ),
  GetPage<void>(name: AppRoutes.blocked, page: () => const BlockedView()),
];
