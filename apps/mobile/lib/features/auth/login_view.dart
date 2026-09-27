import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/config/branding.dart';
import '../../core/routes/app_pages.dart';
import '../../core/widgets/kid_ui.dart';
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
    final theme = Theme.of(context);

    Future<void> submit() async {
      if (!(formKey.currentState?.validate() ?? false)) return;
      FocusScope.of(context).unfocus();
      await controller.signIn(
        identifier: identifier.text,
        password: password.text,
      );
    }

    return Scaffold(
      body: SingleChildScrollView(
        child: Column(
          children: [
            AuthHeader(
              title: 'Welcome back!',
              subtitle:
                  'Sign in to see your child’s day at '
                  '${BrandingService.current.name}',
              extraBottom: 36,
              badge: const _SchoolBadge(),
            ),

            // The form, on a card that overlaps the header.
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
                            'Sign in',
                            style: theme.textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Use the mobile number you registered with.',
                            style: theme.textTheme.bodySmall,
                          ),
                          const SizedBox(height: 20),

                          Obx(
                            () => _Banner(
                              message:
                                  controller.errorMessage.value ??
                                  _whySignedOut(),
                              waiting:
                                  controller.errorMessage.value == null ||
                                  controller.isAwaitingSchool.value,
                            ),
                          ),

                          TextFormField(
                            controller: identifier,
                            keyboardType: TextInputType.emailAddress,
                            autofillHints: const [AutofillHints.username],
                            textInputAction: TextInputAction.next,
                            decoration: const InputDecoration(
                              labelText: 'Phone or email',
                              hintText: '98200 00000',
                              prefixIcon: Icon(Icons.person_rounded),
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
                            prefixIcon: Icons.lock_rounded,
                            autofillHints: const [AutofillHints.password],
                            textInputAction: TextInputAction.done,
                            onSubmitted: (_) => submit(),
                            validator: (value) =>
                                (value == null || value.isEmpty)
                                ? 'Enter your password'
                                : null,
                          ),

                          // No self-service reset: parents sign in with a
                          // phone number and many have no email address on
                          // file, and an SMS gateway is a bill for something
                          // the office already does at the gate. So say
                          // plainly who to ask.
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              onPressed: () => showDialog<void>(
                                context: context,
                                builder: (context) => AlertDialog(
                                  title: const Text('Forgotten your password?'),
                                  content: const Text(
                                    'Ask the school office. They can set a new '
                                    'one for you in a moment, and you choose '
                                    'your own the next time you sign in.',
                                  ),
                                  actions: [
                                    TextButton(
                                      onPressed: () =>
                                          Navigator.of(context).pop(),
                                      child: const Text('Right you are'),
                                    ),
                                  ],
                                ),
                              ),
                              style: TextButton.styleFrom(
                                foregroundColor: KidPalette.violet,
                              ),
                              child: const Text('Forgot password?'),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Obx(
                            () => GradientButton(
                              label: 'Sign in',
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

            // A family can start it themselves now; the school checks it.
            Transform.translate(
              offset: const Offset(0, -12),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            const Expanded(child: Divider()),
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                              ),
                              child: Text(
                                'New here?',
                                style: theme.textTheme.bodySmall,
                              ),
                            ),
                            const Expanded(child: Divider()),
                          ],
                        ),
                        const SizedBox(height: 12),
                        OutlinedButton.icon(
                          onPressed: () =>
                              Get.toNamed<void>(AppRoutes.registration),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: KidPalette.violet,
                            minimumSize: const Size.fromHeight(54),
                            side: const BorderSide(
                              color: KidPalette.violet,
                              width: 1.5,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(18),
                            ),
                            textStyle: const TextStyle(
                              fontFamily: 'Poppins',
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                            ),
                          ),
                          icon: const Icon(Icons.how_to_reg_rounded),
                          label: const Text('Register with the school'),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          'The school checks your details and opens your '
                          'account.',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodySmall,
                        ),
                        const SizedBox(height: 24),
                      ],
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

/// Why the app brought the family back here, when it was not their choice.
///
/// Shown until they try to sign in, when any answer from that replaces it.
String? _whySignedOut() {
  final args = Get.arguments;
  final reason = args is Map ? args['reason'] : null;
  return switch (reason) {
    'replaced' =>
      'You were signed out because this account signed in on another '
          'phone. It can be signed in on one device at a time.',
    'expired' => 'Your session ended. Please sign in again.',
    _ => null,
  };
}

/// The school's own badge, on the one screen where nobody is signed in — which
/// is why it comes from the public route and needs no token. Image.network is
/// right here and nowhere else in this app.
class _SchoolBadge extends StatelessWidget {
  const _SchoolBadge();

  @override
  Widget build(BuildContext context) {
    final logo = BrandingService.current.absoluteLogoUrl;
    const fallback = Icon(
      Icons.school_rounded,
      size: 44,
      color: KidPalette.violet,
    );

    return Container(
      width: 96,
      height: 96,
      padding: const EdgeInsets.all(12),
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
      child: ClipOval(
        child: logo == null
            ? fallback
            : Image.network(
                logo,
                fit: BoxFit.contain,
                // A logo that will not load must not take the sign-in screen
                // with it.
                errorBuilder: (_, _, _) => fallback,
              ),
      ),
    );
  }
}

/// Why the last attempt did not sign in.
class _Banner extends StatelessWidget {
  const _Banner({required this.message, required this.waiting});

  final String? message;
  final bool waiting;

  @override
  Widget build(BuildContext context) {
    final message = this.message;
    if (message == null) return const SizedBox.shrink();

    // A family waiting on the school has done nothing wrong, so this is not
    // painted as a mistake. Same box, calmer colours, and an icon that reads
    // as "in hand".
    final scheme = Theme.of(context).colorScheme;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: waiting ? scheme.secondaryContainer : scheme.errorContainer,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            waiting ? Icons.hourglass_top_rounded : Icons.error_outline_rounded,
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
  }
}
