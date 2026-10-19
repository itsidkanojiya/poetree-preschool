import 'package:flutter/material.dart';
import 'package:get/get.dart';

import 'core/api/api_service.dart';
import 'core/config/branding.dart';
import 'core/offline/outbox.dart';
import 'core/push/push_service.dart';
import 'core/routes/app_pages.dart';
import 'core/audio/speech_service.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'features/auth/auth_controller.dart';
import 'features/splash/splash_view.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // The splash is on screen at once and start-up runs behind it; the app
  // takes over when both are done. Before, the phone showed a blank screen
  // for all of start-up.
  late String startRoute;
  final startUp = StartUp([
    // The API service outlives every route, so the session survives navigation.
    () => Get.putAsync<ApiService>(() => ApiService().init()),
    () async => Get.put<AuthController>(AuthController(), permanent: true),

    // Registers marked without signal go here and drain by themselves. Started
    // before the first screen so a queue left from yesterday reaches the school
    // whether or not the teacher opens the register screen again.
    () async => Get.put<Outbox>(Outbox(), permanent: true),
    () => Get.find<Outbox>().init(),

    // Registered here but not started: push attaches to a signed-in user, so
    // AuthController starts it after a successful sign-in and on session restore.
    () async => Get.put<PushService>(PushService(), permanent: true),

    // Before the first screen, so the app is never briefly the wrong colour: the
    // cached copy returns immediately and the network refresh follows.
    () => BrandingService().load(),

    // Same reason: the saved theme is read before anything is drawn, so a
    // family who chose dark never sees a flash of light on every launch.
    () => Get.putAsync<ThemeController>(
      () => ThemeController().init(),
      permanent: true,
    ),

    // The voice, for children who cannot read. Registered whether or not the
    // device has a speech engine — without one it is a no-op, and the app is the
    // same app minus the sound.
    () => Get.putAsync<SpeechService>(
      () => SpeechService().init(),
      permanent: true,
    ),

    // Resolve the session before the first screen, so a signed-in parent never
    // sees the login screen flash past on a cold start.
    () async =>
        startRoute = await Get.find<AuthController>().resolveStartRoute(),
  ]);

  runApp(
    SplashGate(
      startUp: startUp.run,
      app: (_) => PoetreeSchoolApp(initialRoute: startRoute),
    ),
  );
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
        // After the first frame, when there is a navigator to open a
        // notification with.
        onReady: Get.find<PushService>().appShown,
      ),
    );
  }
}
