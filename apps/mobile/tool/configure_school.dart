// Produces one school's branded Android build from a JSON description.
//
//   dart run tool/configure_school.dart schools/sunrise.json
//
// One codebase, one app per school. Everything school-specific is a compile-time
// constant injected with --dart-define, so onboarding school number two hundred
// is another build rather than another branch — and nothing a user does at
// runtime can point the app at a different school.
//
// This writes the applicationId and app label into the Android manifest files,
// then prints the exact build command. It does not run the build itself: the
// signing key belongs to whoever is releasing, and this script should never be
// in a position to need it.
import 'dart:convert';
import 'dart:io';

const _usage = '''
Usage: dart run tool/configure_school.dart <school.json> [--build]

The JSON must contain:
  schoolId       cuid from the schools table — baked in, and the API refuses a
                 login whose school does not match
  code           short slug, e.g. "sunrise"
  name           display name, shown as the app label
  primaryColor   hex, with or without the leading hash
  applicationId  Android package name, e.g. com.poetree.sunrise
  apiBaseUrl     optional; defaults to the production API
  versionName    optional; defaults to 1.0.0
  versionCode    optional; defaults to 1
''';

const _defaultApiBaseUrl = 'https://school.poetreepublications.com/api/v1';

void main(List<String> args) {
  if (args.isEmpty || args.contains('--help') || args.contains('-h')) {
    stdout.writeln(_usage);
    exit(args.isEmpty ? 64 : 0);
  }

  final configFile = File(args.first);
  if (!configFile.existsSync()) {
    stderr.writeln('No such file: ${configFile.path}');
    exit(66);
  }

  final Map<String, dynamic> config;
  try {
    config = jsonDecode(configFile.readAsStringSync()) as Map<String, dynamic>;
  } on FormatException catch (error) {
    stderr.writeln('${configFile.path} is not valid JSON: ${error.message}');
    exit(65);
  }

  // Fail before touching anything. A half-configured checkout that still builds
  // is how one school's app ships pointing at another school.
  final missing = <String>[
    for (final key in [
      'schoolId',
      'code',
      'name',
      'primaryColor',
      'applicationId',
    ])
      if (config[key] == null || '${config[key]}'.trim().isEmpty) key,
  ];

  if (missing.isNotEmpty) {
    stderr.writeln('Missing required field(s): ${missing.join(', ')}');
    stderr.writeln(_usage);
    exit(65);
  }

  final schoolId = '${config['schoolId']}'.trim();
  final code = '${config['code']}'.trim();
  final name = '${config['name']}'.trim();
  final applicationId = '${config['applicationId']}'.trim();
  final apiBaseUrl = '${config['apiBaseUrl'] ?? _defaultApiBaseUrl}'.trim();
  final versionName = '${config['versionName'] ?? '1.0.0'}'.trim();
  final versionCode = '${config['versionCode'] ?? 1}'.trim();

  final colour = '${config['primaryColor']}'.replaceAll('#', '').trim();
  if (!RegExp(r'^[0-9a-fA-F]{6}$').hasMatch(colour)) {
    stderr.writeln('primaryColor must be six hex digits, got "$colour".');
    exit(65);
  }

  if (!RegExp(
    r'^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$',
  ).hasMatch(applicationId)) {
    // Play rejects these late and unhelpfully; catching it here saves a build.
    stderr.writeln(
      'applicationId must be a lowercase dotted package name, got "$applicationId".',
    );
    exit(65);
  }

  _rewriteGradle(applicationId);
  _rewriteAppLabel(name);
  final push = _placeGoogleServices(
    config['googleServicesJson'],
    applicationId,
  );

  final defines = <String, String>{
    'SCHOOL_ID': schoolId,
    'SCHOOL_CODE': code,
    'SCHOOL_NAME': name,
    'PRIMARY_COLOR': colour,
    'API_BASE_URL': apiBaseUrl,
  };

  stdout
    ..writeln('Configured $name ($code)')
    ..writeln('  applicationId  $applicationId')
    ..writeln('  api            $apiBaseUrl')
    ..writeln('  version        $versionName+$versionCode')
    ..writeln()
    ..writeln('Build the release bundle with:')
    ..writeln()
    ..writeln('  flutter build appbundle \\');

  for (final entry in defines.entries) {
    // Quoted: school names contain spaces.
    stdout.writeln("    --dart-define=${entry.key}='${entry.value}' \\");
  }

  stdout
    ..writeln('    --build-name=$versionName \\')
    ..writeln('    --build-number=$versionCode')
    ..writeln()
    ..writeln(
      'Put the school logo at assets/branding/logo.png before building.',
    )
    ..writeln(
      push
          ? 'Push: google-services.json is in place.'
          : 'Push: no google-services.json — this build will use the in-app '
                'inbox only. Add "googleServicesJson" to the config to enable it.',
    );

  if (args.contains('--build')) {
    stderr.writeln(
      '\n--build is not supported here. Release builds need the signing key, '
      'and this script must never be the thing that holds it.',
    );
    exit(64);
  }
}

/// Rewrites the applicationId in the Gradle build file.
void _rewriteGradle(String applicationId) {
  // Both the Kotlin and Groovy DSLs are in the wild depending on the Flutter
  // version the project was created with.
  final candidates = [
    File('android/app/build.gradle.kts'),
    File('android/app/build.gradle'),
  ];

  final gradle = candidates.firstWhere(
    (file) => file.existsSync(),
    orElse: () => throw StateError(
      'No android/app/build.gradle(.kts) found. Run this from apps/mobile.',
    ),
  );

  final source = gradle.readAsStringSync();
  final pattern = RegExp(r'applicationId\s*=?\s*"[^"]*"');

  if (!pattern.hasMatch(source)) {
    stderr.writeln('Could not find applicationId in ${gradle.path}.');
    exit(70);
  }

  gradle.writeAsStringSync(
    source.replaceFirst(pattern, 'applicationId = "$applicationId"'),
  );
}

/// Copies this school's Firebase config into the Android build.
///
/// Each school is its own Firebase app, so the file is per school and cannot
/// live in the repository. Absent, the app still runs and falls back to the
/// in-app inbox — a school without push configured yet is a normal state, not
/// a broken build.
///
/// Returns whether push will be available in this build.
bool _placeGoogleServices(Object? source, String applicationId) {
  if (source == null || '$source'.trim().isEmpty) return false;

  final file = File('$source'.trim());
  if (!file.existsSync()) {
    stderr.writeln(
      'googleServicesJson points at a file that does not exist: ${file.path}',
    );
    exit(66);
  }

  // A google-services.json from the wrong Firebase app builds fine and then
  // silently never delivers a notification, which is close to impossible to
  // diagnose afterwards. Check the package name matches before copying.
  if (!file.readAsStringSync().contains('"$applicationId"')) {
    stderr.writeln(
      'googleServicesJson does not mention $applicationId. That file belongs to '
      'a different app, and push would fail silently.',
    );
    exit(65);
  }

  file.copySync('android/app/google-services.json');
  return true;
}

/// Rewrites android:label so the icon on a parent's home screen says their
/// school's name and not "poetree_school".
void _rewriteAppLabel(String name) {
  final manifest = File('android/app/src/main/AndroidManifest.xml');
  if (!manifest.existsSync()) {
    stderr.writeln('No AndroidManifest.xml found. Run this from apps/mobile.');
    exit(70);
  }

  final source = manifest.readAsStringSync();
  final pattern = RegExp(r'android:label="[^"]*"');

  if (!pattern.hasMatch(source)) {
    stderr.writeln('Could not find android:label in ${manifest.path}.');
    exit(70);
  }

  // XML-escape: an ampersand in a school name breaks the manifest parser.
  final escaped = name
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

  manifest.writeAsStringSync(
    source.replaceFirst(pattern, 'android:label="$escaped"'),
  );
}
