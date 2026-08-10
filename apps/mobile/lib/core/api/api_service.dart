import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:get/get.dart';

import 'api_client.dart';

/// Wraps the framework-agnostic [ApiClient] as a GetxService.
///
/// A service rather than a controller: it outlives every route, so the session
/// survives navigation and Get.find never returns a fresh client mid-flight.
/// [ApiClient] itself knows nothing about GetX, which keeps the refresh logic
/// testable without pumping a widget.
class ApiService extends GetxService {
  late final ApiClient client;

  Future<ApiService> init() async {
    client = ApiClient(TokenStore(const FlutterSecureStorage()))
      ..onSessionExpired = _toLogin
      ..onSchoolSuspended = _toBlocked;
    return this;
  }

  void _toLogin() {
    if (Get.currentRoute != '/login') {
      Get.offAllNamed<void>('/login', arguments: {'reason': 'expired'});
    }
  }

  void _toBlocked() {
    if (Get.currentRoute != '/blocked') {
      Get.offAllNamed<void>('/blocked');
    }
  }
}

/// Shorthand used across controllers.
ApiClient get api => Get.find<ApiService>().client;
