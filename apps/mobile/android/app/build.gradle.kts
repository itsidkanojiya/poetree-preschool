import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// The upload key. Google Play App Signing holds the key the store actually
// signs with; this one only proves to Play that a bundle came from us, which is
// why losing it is recoverable (Play Console can reset it) and leaking it is not
// a catastrophe — but it still never goes into this repository, which is public.
//
// Read from android/key.properties on a release machine (see
// key.properties.example), or from the environment in CI. Each value can come
// from either place.
val keystoreProperties = Properties().apply {
    val file = rootProject.file("key.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

fun signingValue(property: String, variable: String): String? =
    keystoreProperties.getProperty(property)?.takeIf { it.isNotBlank() }
        ?: System.getenv(variable)?.takeIf { it.isNotBlank() }

val uploadStoreFile = signingValue("storeFile", "POETREE_UPLOAD_STORE_FILE")
val uploadStorePassword = signingValue("storePassword", "POETREE_UPLOAD_STORE_PASSWORD")
val uploadKeyAlias = signingValue("keyAlias", "POETREE_UPLOAD_KEY_ALIAS")
val uploadKeyPassword = signingValue("keyPassword", "POETREE_UPLOAD_KEY_PASSWORD")

val releaseSigningConfigured =
    listOf(uploadStoreFile, uploadStorePassword, uploadKeyAlias, uploadKeyPassword)
        .all { it != null }

// A release signed with the debug key builds without complaint and is then
// refused by Play, so a release without the upload key stops here instead.
// Debug and profile builds never read any of this.
val buildingRelease =
    gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) }
if (buildingRelease && !releaseSigningConfigured) {
    throw GradleException(
        "Release signing is not configured. Copy android/key.properties.example to " +
            "android/key.properties and fill it in, or set POETREE_UPLOAD_STORE_FILE, " +
            "POETREE_UPLOAD_STORE_PASSWORD, POETREE_UPLOAD_KEY_ALIAS and " +
            "POETREE_UPLOAD_KEY_PASSWORD.",
    )
}

// Push needs the Poetree Kids Firebase app's google-services.json here (its
// package must be com.poetreepublications.kids). It is not in the repository,
// and the Google plugin fails the build outright when the file is missing,
// which would break every developer build — so it is applied only when the
// file is actually there. Without it the app still runs and falls back to the
// in-app inbox, which is the durable record anyway.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.poetreepublications.kids"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // One app for every school, on Google Play as Poetree Kids. Schools are
        // told apart by the School ID typed at sign-in, never by a build of
        // their own, and this can never change once the app has been uploaded.
        applicationId = "com.poetreepublications.kids"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (releaseSigningConfigured) {
            create("release") {
                // Absolute, or relative to android/app.
                storeFile = file(uploadStoreFile!!)
                storePassword = uploadStorePassword
                keyAlias = uploadKeyAlias
                keyPassword = uploadKeyPassword
            }
        }
    }

    buildTypes {
        release {
            signingConfig =
                if (releaseSigningConfigured) signingConfigs.getByName("release") else null
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
