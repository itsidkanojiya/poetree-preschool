import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/config/branding.dart';
import '../../core/routes/app_pages.dart';
import '../../core/widgets/password_field.dart';
import 'auth_controller.dart';

/// Sign-in.
///
/// No school picker: this binary belongs to one school, so the only thing to
/// ask for is who the person is.
class LoginView extends GetView<AuthController> {
  const LoginView({super.key});

  @override
  Widget build(BuildContext context) {
    final identifier = TextEditingController();
    final password = TextEditingController();
    final formKey = GlobalKey<FormState>();

    Future<void> submit() async {
      if (!(formKey.currentState?.validate() ?? false)) return;
      FocusScope.of(context).unfocus();
      await controller.signIn(
        identifier: identifier.text,
        password: password.text,
      );
    }

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 12),

                    // The school's own badge, on the one screen where nobody is
                    // signed in — which is why it comes from the public route
                    // and needs no token. Image.network is right here and
                    // nowhere else in this app.
                    if (BrandingService.current.absoluteLogoUrl != null) ...[
                      Center(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(18),
                          child: Image.network(
                            BrandingService.current.absoluteLogoUrl!,
                            height: 88,
                            width: 88,
                            fit: BoxFit.contain,
                            // A logo that will not load must not take the
                            // sign-in screen with it.
                            errorBuilder: (_, _, _) => const SizedBox.shrink(),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    Text(
                      BrandingService.current.name,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Sign in to see your child’s day',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                    const SizedBox(height: 32),

                    Obx(() {
                      final message = controller.errorMessage.value;
                      if (message == null) return const SizedBox.shrink();

                      // A family waiting on the school has done nothing wrong,
                      // so this is not painted as a mistake. Same box, calmer
                      // colours, and an icon that reads as "in hand".
                      final waiting = controller.isAwaitingSchool.value;
                      final scheme = Theme.of(context).colorScheme;

                      return Container(
                        margin: const EdgeInsets.only(bottom: 16),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: waiting
                              ? scheme.secondaryContainer
                              : scheme.errorContainer,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(
                              waiting
                                  ? Icons.hourglass_top_rounded
                                  : Icons.error_outline_rounded,
                              size: 20,
                              color: waiting
                                  ? scheme.onSecondaryContainer
                                  : scheme.onErrorContainer,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                message,
                                style: TextStyle(
                                  color: waiting
                                      ? scheme.onSecondaryContainer
                                      : scheme.onErrorContainer,
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),

                    TextFormField(
                      controller: identifier,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.username],
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: 'Phone or email',
                        hintText: '+91 98200 00000',
                      ),
                      validator: (value) =>
                          (value == null || value.trim().length < 3)
                          ? 'Enter your phone number or email'
                          : null,
                    ),
                    const SizedBox(height: 16),

                    PasswordField(
                      controller: password,
                      label: 'Password',
                      autofillHints: const [AutofillHints.password],
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => submit(),
                      validator: (value) => (value == null || value.isEmpty)
                          ? 'Enter your password'
                          : null,
                    ),
                    const SizedBox(height: 28),

                    Obx(
                      () => FilledButton(
                        onPressed: controller.isBusy.value ? null : submit,
                        child: controller.isBusy.value
                            ? const SizedBox(
                                height: 22,
                                width: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.5,
                                ),
                              )
                            : const Text('Sign in'),
                      ),
                    ),

                    const SizedBox(height: 12),
                    // No self-service reset: parents sign in with a phone
                    // number and many have no email address on file, and an
                    // SMS gateway is a bill for something the office already
                    // does at the gate. So say plainly who to ask.
                    TextButton(
                      onPressed: () => showDialog<void>(
                        context: context,
                        builder: (context) => AlertDialog(
                          title: const Text('Forgotten your password?'),
                          content: const Text(
                            'Ask the school office. They can set a new one for '
                            'you in a moment, and you choose your own the next '
                            'time you sign in.',
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.of(context).pop(),
                              child: const Text('Right you are'),
                            ),
                          ],
                        ),
                      ),
                      child: const Text('Forgotten your password?'),
                    ),
                    const SizedBox(height: 12),
                    // This used to read "ask the school office if you do not
                    // have a password yet", which was the only answer there
                    // was. A family can start it themselves now.
                    const Divider(height: 28),
                    Text(
                      'New here?',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                    const SizedBox(height: 6),
                    OutlinedButton(
                      onPressed: () => Get.toNamed<void>(AppRoutes.registration),
                      child: const Text('Register with the school'),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Your child must already be enrolled. You will need their '
                      'admission number.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
