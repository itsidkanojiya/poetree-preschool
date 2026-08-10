import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'core/api/api_service.dart';
import 'core/config/school_config.dart';
import 'core/routes/app_pages.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/auth_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // The API service outlives every route, so the session survives navigation.
  await Get.putAsync<ApiService>(() => ApiService().init());
  Get.put<AuthController>(AuthController(), permanent: true);

  // Resolve the session before the first frame, so a signed-in parent never
  // sees the login screen flash past on a cold start.
  final startRoute = await Get.find<AuthController>().resolveStartRoute();

  runApp(PoetreeSchoolApp(initialRoute: startRoute));
}

class PoetreeSchoolApp extends StatelessWidget {
  const PoetreeSchoolApp({required this.initialRoute, super.key});

  final String initialRoute;

  @override
  Widget build(BuildContext context) {
    return GetMaterialApp(
      title: SchoolConfig.schoolName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      initialRoute: initialRoute,
      getPages: appPages,
    );
  }
}
