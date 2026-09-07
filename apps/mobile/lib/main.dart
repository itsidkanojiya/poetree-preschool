import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'core/api/api_service.dart';
import 'core/config/branding.dart';
import 'core/offline/outbox.dart';
import 'core/push/push_service.dart';
import 'core/routes/app_pages.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'features/auth/auth_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // The API service outlives every route, so the session survives navigation.
  await Get.putAsync<ApiService>(() => ApiService().init());
  Get.put<AuthController>(AuthController(), permanent: true);

  // Registers marked without signal go here and drain by themselves. Started
  // before the first frame so a queue left from yesterday reaches the school
  // whether or not the teacher opens the register screen again.
  final outbox = Get.put<Outbox>(Outbox(), permanent: true);
  await outbox.init();

  // Registered here but not started: push attaches to a signed-in user, so
  // AuthController starts it after a successful sign-in and on session restore.
  Get.put<PushService>(PushService(), permanent: true);

  // Before the first frame, so the app is never briefly the wrong colour: the
  // cached copy returns immediately and the network refresh follows.
  await BrandingService().load();

  // Same reason: the saved theme is read before anything is drawn, so a
  // family who chose dark never sees a flash of light on every launch.
  await Get.putAsync<ThemeController>(() => ThemeController().init(),
      permanent: true);

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
    final theme = Get.find<ThemeController>();

    // Obx around the whole app so choosing a theme in Settings takes effect on
    // the tap rather than on the next launch.
    return Obx(
      () => GetMaterialApp(
        title: BrandingService.current.name,
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        // Light unless the family said otherwise — never the phone's setting by
        // default. A parent with a dark phone was being handed a near-black app
        // for their four-year-old, which nobody chose.
        themeMode: theme.mode.value,
        initialRoute: initialRoute,
        getPages: appPages,
      ),
    );
  }
}
