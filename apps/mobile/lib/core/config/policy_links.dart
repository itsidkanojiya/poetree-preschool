import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import 'app_config.dart';

/// The two public pages Google Play requires the app to point to: the privacy
/// policy, and how to delete an account without the app.
///
/// They live on the website, which shares its server with the API, so the
/// address follows API_BASE_URL rather than being one more thing to configure
/// per build. Both open for anyone, signed in or not.
abstract final class PolicyLinks {
  /// The site the API is served from: its base URL without the /api/v1 part.
  static String get _site =>
      AppConfig.apiBaseUrl.replaceFirst(RegExp(r'/api/v\d+/?$'), '');

  static Uri get privacy => Uri.parse('$_site/privacy');

  static Uri get deleteAccount => Uri.parse('$_site/delete-account');

  /// Opens [page] in the phone's browser. False when nothing could open it,
  /// so the caller can say so instead of the tap doing nothing.
  static Future<bool> open(Uri page) async {
    try {
      return await launchUrl(page, mode: LaunchMode.externalApplication);
    } on PlatformException {
      return false;
    }
  }
}
