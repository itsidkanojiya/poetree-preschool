import 'dart:async';

import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

import '../api/api_service.dart';
import '../routes/app_pages.dart';

/// Push notifications.
///
/// The durable message is the Notification row the API already writes; a push
/// is only the tap on the shoulder. Everything here is therefore best-effort:
/// no failure in this file may stop the app working, because an app that will
/// not open is a far worse outcome than a missed notification.
class PushService extends GetxService {
  bool _started = false;

  /// Registers this device and starts listening.
  ///
  /// Called after sign-in rather than at startup: the token belongs to a user,
  /// and registering before we know who they are would attach a parent's phone
  /// to nobody.
  Future<void> start() async {
    if (_started) return;

    try {
      await Firebase.initializeApp();
    } on Object catch (error) {
      // A build without google-services.json - every developer build, and any
      // school whose Firebase project is not set up yet. The app is fully
      // usable without push, so this is a log line and not a failure.
      debugPrint('Push disabled: Firebase did not initialise ($error)');
      return;
    }

    _started = true;

    final messaging = FirebaseMessaging.instance;

    try {
      // Android 13+ and every iOS version need this. A refusal is a legitimate
      // answer, not an error.
      await messaging.requestPermission();

      final token = await messaging.getToken();
      if (token != null) await _register(token);

      // FCM rotates tokens without saying which one it replaced, which is why
      // the API's registration endpoint is idempotent and why this re-registers
      // rather than trying to update in place.
      messaging.onTokenRefresh.listen((refreshed) {
        unawaited(_register(refreshed));
      });

      FirebaseMessaging.onMessageOpenedApp.listen(_openFrom);

      // A notification that launched the app from cold.
      final initial = await messaging.getInitialMessage();
      if (initial != null) _openFrom(initial);
    } on Object catch (error) {
      debugPrint('Push setup failed, continuing without it: $error');
    }
  }

  /// Revokes this device on sign-out, so a shared or handed-on phone stops
  /// receiving another family's notifications.
  Future<void> stop() async {
    if (!_started) return;

    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await api.delete('/notifications/devices', body: {'token': token});
      }
      await FirebaseMessaging.instance.deleteToken();
    } on Object catch (error) {
      debugPrint('Could not revoke the push token: $error');
    }
  }

  Future<void> _register(String token) async {
    try {
      await api.post<dynamic>(
        '/notifications/devices',
        body: {'token': token, 'platform': 'ANDROID'},
      );
    } on DioException catch (error) {
      // Worth a log and nothing more: the inbox in the app still shows every
      // message whether or not the push channel is working.
      debugPrint('Device registration failed: ${error.message}');
    }
  }

  /// Sends the user where the notification points.
  ///
  /// The API puts the entity in the data payload precisely so the body never
  /// has to - a push about a child appears on a lock screen, and no child's
  /// name or detail belongs there.
  void _openFrom(RemoteMessage message) {
    final entity = message.data['entityType']?.toString();

    final route = switch (entity) {
      'AttendanceSession' || 'AttendanceRecord' => AppRoutes.parent,
      'Homework' => AppRoutes.parent,
      'Notice' => AppRoutes.parent,
      'Payment' || 'FeeInvoice' => AppRoutes.parent,
      _ => null,
    };

    if (route != null && Get.currentRoute != route) {
      unawaited(Get.toNamed<void>(route));
    }
  }
}
