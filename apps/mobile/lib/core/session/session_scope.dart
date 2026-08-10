import 'package:get/get.dart';

/// Controllers that belong to whoever is signed in, and must not outlive them.
///
/// GetX keeps the first registration of a type and silently discards later
/// `Get.put` calls for it, so a binding running again after a second sign-in
/// does *not* replace anything. On a phone shared between two households that
/// means the next parent is handed the previous parent's controller, with the
/// previous family's children already in it.
///
/// So sign-out deletes deliberately. `session_scope_test.dart` pins both halves:
/// that `Get.put` really does not replace, and that this does.
class SessionScope {
  const SessionScope._();

  /// Removes a session-scoped controller if it is registered.
  ///
  /// `force` because these are registered as permanent — without it GetX
  /// declines to remove them, which is the whole problem.
  static void clear<T>() {
    if (Get.isRegistered<T>()) {
      Get.delete<T>(force: true);
    }
  }
}
