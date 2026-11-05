import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/config/branding.dart';
import '../../core/widgets/kid_ui.dart';
import 'auth_controller.dart';

/// Which school, before anything else.
///
/// Poetree Kids is one app for every school, so the first thing it needs is
/// the School ID the school gave the family. It is checked with the API before
/// the sign-in screen opens — there is no way past this screen without one the
/// API recognises — and remembered, so a phone only sees this once.
class SchoolIdView extends GetView<AuthController> {
  const SchoolIdView({super.key});

  @override
  Widget build(BuildContext context) {
    final schoolId = TextEditingController(
      text: BrandingService.current.code ?? '',
    );
    final formKey = GlobalKey<FormState>();
    final theme = Theme.of(context);

    Future<void> submit() async {
      if (!(formKey.currentState?.validate() ?? false)) return;
      FocusScope.of(context).unfocus();
      await controller.chooseSchool(schoolId.text);
    }

    return Scaffold(
      body: SingleChildScrollView(
        child: Column(
          children: [
            const AuthHeader(
              title: 'Welcome to Poetree Kids',
              subtitle: 'First, tell us which school is yours',
              extraBottom: 36,
              badge: _AppBadge(),
            ),
            Transform.translate(
              offset: const Offset(0, -36),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 18),
                    padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surface,
                      borderRadius: BorderRadius.circular(28),
                      boxShadow: [
                        BoxShadow(
                          color: KidPalette.violet.withValues(alpha: 0.12),
                          blurRadius: 24,
                          offset: const Offset(0, 10),
                        ),
                      ],
                    ),
                    child: Form(
                      key: formKey,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'Your School ID',
                            style: theme.textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Your school gives it to you — on the admission '
                            'letter, or ask the office.',
                            style: theme.textTheme.bodySmall,
                          ),
                          const SizedBox(height: 20),
                          Obx(() {
                            final message = controller.errorMessage.value;
                            if (message == null) return const SizedBox.shrink();
                            return Container(
                              margin: const EdgeInsets.only(bottom: 16),
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.errorContainer,
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Text(
                                message,
                                style: TextStyle(
                                  color: theme.colorScheme.onErrorContainer,
                                ),
                              ),
                            );
                          }),
                          TextFormField(
                            controller: schoolId,
                            // A code, not a word: no capitals, corrections or
                            // suggestions turning "sunrise" into "Sunrise".
                            keyboardType: TextInputType.visiblePassword,
                            autocorrect: false,
                            enableSuggestions: false,
                            textInputAction: TextInputAction.done,
                            onFieldSubmitted: (_) => submit(),
                            decoration: const InputDecoration(
                              labelText: 'School ID',
                              hintText: 'e.g. sunrise',
                              prefixIcon: Icon(Icons.school_rounded),
                            ),
                            validator: (value) =>
                                (value == null || value.trim().isEmpty)
                                ? 'Enter your School ID'
                                : null,
                          ),
                          const SizedBox(height: 20),
                          Obx(
                            () => GradientButton(
                              label: 'Continue',
                              icon: Icons.arrow_forward_rounded,
                              busy: controller.isBusy.value,
                              onPressed: submit,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The app's own badge: no school has been chosen yet to wear.
class _AppBadge extends StatelessWidget {
  const _AppBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 96,
      height: 96,
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.15),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: const Icon(
        Icons.school_rounded,
        size: 48,
        color: KidPalette.violet,
      ),
    );
  }
}
