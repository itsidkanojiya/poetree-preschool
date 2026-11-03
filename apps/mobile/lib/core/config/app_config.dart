/// What is fixed when the app is built: where the API is, and nothing else.
///
/// Poetree Kids is one app for every school. Which school a person belongs to
/// is not a build setting — they type their School ID at sign-in, the API
/// checks it, and the phone remembers it (see [BrandingService.choose]). A new
/// school is a row in the schools table, never a new build.
class AppConfig {
  const AppConfig._();

  /// Injected with --dart-define for a build against another server; the
  /// default is production.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://school.poetreepublications.com/api/v1',
  );
}
