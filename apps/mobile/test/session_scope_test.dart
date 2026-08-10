import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:poetree_school/core/session/session_scope.dart';

class _Family extends GetxController {
  _Family(this.children);
  final List<String> children;
}

void main() {
  setUp(Get.reset);

  test(
    'Get.put does not replace a permanent instance — the bug this guards',
    () {
      // This is why signing out has to delete deliberately rather than rely on
      // the next binding overwriting things. GetX keeps the first registration
      // and silently discards the new one, so the next family to use a shared
      // phone would be handed the previous family's controller.
      Get.put<_Family>(_Family(['Aarav']), permanent: true);
      Get.put<_Family>(_Family(['Meera']), permanent: true);

      expect(Get.find<_Family>().children, ['Aarav']);
    },
  );

  test('clearing the session removes permanent controllers', () {
    Get.put<_Family>(_Family(['Aarav']), permanent: true);

    SessionScope.clear<_Family>();

    expect(Get.isRegistered<_Family>(), isFalse);
  });

  test('after clearing, the next family gets their own children', () {
    Get.put<_Family>(_Family(['Aarav']), permanent: true);

    SessionScope.clear<_Family>();
    Get.put<_Family>(_Family(['Meera']), permanent: true);

    expect(Get.find<_Family>().children, ['Meera']);
  });

  test('clearing something never registered is not an error', () {
    // Sign-out runs on paths where a parent controller was never built — a
    // teacher signing out, or a failed sign-in — and must not throw there.
    expect(() => SessionScope.clear<_Family>(), returnsNormally);
  });
}
