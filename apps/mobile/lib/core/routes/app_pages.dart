import 'package:get/get.dart';

import '../../features/activities/activity_controller.dart';
import '../../features/activities/activity_list_view.dart';
import '../../features/activities/activity_models.dart';
import '../../features/activities/activity_play_view.dart';
import '../../features/auth/auth_controller.dart';
import '../../features/auth/change_password_view.dart';
import '../../features/auth/login_view.dart';
import '../../features/notifications/inbox_controller.dart';
import '../../features/notifications/inbox_view.dart';
import '../../features/parent/child_controller.dart';
import '../../features/parent/children_controller.dart';
import '../../features/parent/parent_home_view.dart';
import '../../features/shared/blocked_view.dart';
import '../../features/stream/stream_controller.dart';
import '../../features/stream/stream_view.dart';
import '../../features/timetable/timetable_controller.dart';
import '../../features/timetable/timetable_view.dart';
import '../../features/teacher/homework_controller.dart';
import '../../features/teacher/homework_view.dart';
import '../../features/teacher/register_controller.dart';
import '../../features/teacher/roster_controller.dart';
import '../../features/teacher/roster_view.dart';
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
    InboxBinding().dependencies();
  }
}

class TeacherBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut<RegisterController>(
      () => RegisterController(Get.find<Outbox>()),
      fenix: true,
    );
    InboxBinding().dependencies();
  }
}

/// The inbox belongs to whoever is signed in, not to a role, so it is
/// registered once and reached from both home screens.
class InboxBinding extends Bindings {
  @override
  void dependencies() {
    if (!Get.isRegistered<InboxController>()) {
      Get.put<InboxController>(InboxController(), permanent: true);
    }
  }
}

class AppRoutes {
  static const login = '/login';
  static const changePassword = '/change-password';
  static const parent = '/parent';
  static const teacher = '/teacher';
  static const register = '/teacher/register';
  static const inbox = '/messages';
  static const timetable = '/timetable';
  static const stream = '/stream';
  static const teacherHomework = '/teacher/homework';
  static const roster = '/teacher/class';
  static const activities = '/activities';
  static const activityPlay = '/activities/play';
  static const blocked = '/blocked';
}

class ActivityListBinding extends Bindings {
  @override
  void dependencies() {
    final args = Get.arguments as Map<String, dynamic>? ?? const {};
    Get.put<ActivityListController>(
      ActivityListController(studentId: args['studentId'] as String?),
    );
  }
}

/// Built fresh each time: an activity played twice is two attempts, and reusing
/// the controller would carry the first score into the second.
class ActivityPlayBinding extends Bindings {
  @override
  void dependencies() {
    final args = Get.arguments as Map<String, dynamic>? ?? const {};
    Get.put<ActivityPlayController>(
      ActivityPlayController(
        activity: args['activity'] as ActivityDefinition,
        studentId: args['studentId'] as String,
      ),
    );
  }
}

class RosterBinding extends Bindings {
  @override
  void dependencies() {
    final args = Get.arguments as Map<String, dynamic>? ?? const {};
    Get.put<RosterController>(
      RosterController(classroomId: args['classroomId'] as String?),
    );
  }
}

class TeacherHomeworkBinding extends Bindings {
  @override
  void dependencies() {
    final args = Get.arguments as Map<String, dynamic>? ?? const {};
    Get.put<TeacherHomeworkController>(
      TeacherHomeworkController(classroomId: args['classroomId'] as String?),
    );
  }
}

class StreamBinding extends Bindings {
  @override
  void dependencies() {
    final args = Get.arguments as Map<String, dynamic>? ?? const {};
    Get.put<ClassStreamController>(
      ClassStreamController(
        classroomId: args['classroomId'] as String?,
        // Parents read; only teachers write. Enforced server-side too — this
        // just keeps a button off a screen that would only be refused.
        canPost: args['canPost'] as bool? ?? false,
      ),
    );
  }
}

/// Built per visit rather than kept: a parent switching child needs a different
/// classroom's week, and a teacher's own week is a different endpoint entirely.
class TimetableBinding extends Bindings {
  @override
  void dependencies() {
    final args = Get.arguments as Map<String, dynamic>? ?? const {};
    Get.put<TimetableController>(
      TimetableController(
        classroomId: args['classroomId'] as String?,
        forTeacher: args['forTeacher'] as bool? ?? false,
      ),
    );
  }
}

final appPages = <GetPage<dynamic>>[
  GetPage<void>(
    name: AppRoutes.login,
    page: () => const LoginView(),
    binding: AuthBinding(),
  ),
  GetPage<void>(
    name: AppRoutes.changePassword,
    page: () => const ChangePasswordView(),
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
  GetPage<void>(
    name: AppRoutes.inbox,
    page: () => const InboxView(),
    binding: InboxBinding(),
  ),
  GetPage<void>(
    name: AppRoutes.timetable,
    page: () => const TimetableView(),
    binding: TimetableBinding(),
  ),
  GetPage<void>(
    name: AppRoutes.stream,
    page: () => const StreamView(),
    binding: StreamBinding(),
  ),
  GetPage<void>(
    name: AppRoutes.teacherHomework,
    page: () => const TeacherHomeworkView(),
    binding: TeacherHomeworkBinding(),
  ),
  GetPage<void>(
    name: AppRoutes.roster,
    page: () => const RosterView(),
    binding: RosterBinding(),
  ),
  GetPage<void>(
    name: AppRoutes.activities,
    page: () => const ActivityListView(),
    binding: ActivityListBinding(),
  ),
  GetPage<void>(
    name: AppRoutes.activityPlay,
    page: () => const ActivityPlayView(),
    binding: ActivityPlayBinding(),
  ),
  GetPage<void>(name: AppRoutes.blocked, page: () => const BlockedView()),
];
