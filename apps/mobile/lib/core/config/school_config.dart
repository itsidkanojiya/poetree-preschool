/// Identity of the school this binary belongs to.
///
/// One codebase, one branded app per school. These values are baked in at build
/// time by `tool/configure_school.dart` from the school's SchoolAppConfig, so
/// onboarding school number two hundred needs no code change — only another
/// build.
///
/// They are compile-time constants rather than runtime settings on purpose: the
/// app cannot be pointed at a different school by anything a user does. The
/// code is sent with every sign-in, so the API refuses a login that belongs to
/// a school this binary was not built for.
///
/// For a customer that runs several branches the code here is the GROUP's, not
/// one branch's: one app covers every branch, and each person's own branch
/// comes from their account.
class SchoolConfig {
  const SchoolConfig._();

  /// Injected with --dart-define at build time; the defaults are for local
  /// development against the seeded demo school.
  static const String schoolId = String.fromEnvironment(
    'SCHOOL_ID',
    defaultValue: '',
  );

  static const String schoolCode = String.fromEnvironment(
    'SCHOOL_CODE',
    defaultValue: 'sunrise',
  );

  static const String schoolName = String.fromEnvironment(
    'SCHOOL_NAME',
    defaultValue: 'Sunrise Preschool',
  );

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://school.poetreepublications.com/api/v1',
  );

  /// Hex without the leading hash, e.g. "16307C".
  static const String primaryColorHex = String.fromEnvironment(
    'PRIMARY_COLOR',
    defaultValue: '16307C',
  );

  /// True once a real school has been baked in, rather than the dev default.
  static bool get isConfigured => schoolId.isNotEmpty;
}
