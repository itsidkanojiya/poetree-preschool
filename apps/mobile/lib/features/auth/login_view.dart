import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/config/school_config.dart';
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
                    Text(
                      SchoolConfig.schoolName,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
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
                      return Container(
                        margin: const EdgeInsets.only(bottom: 16),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.errorContainer,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Text(
                          message,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.onErrorContainer,
                          ),
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
                      validator: (value) => (value == null || value.trim().length < 3)
                          ? 'Enter your phone number or email'
                          : null,
                    ),
                    const SizedBox(height: 16),

                    TextFormField(
                      controller: password,
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => submit(),
                      decoration: const InputDecoration(labelText: 'Password'),
                      validator: (value) =>
                          (value == null || value.isEmpty) ? 'Enter your password' : null,
                    ),
                    const SizedBox(height: 28),

                    Obx(
                      () => FilledButton(
                        onPressed: controller.isBusy.value ? null : submit,
                        child: controller.isBusy.value
                            ? const SizedBox(
                                height: 22,
                                width: 22,
                                child: CircularProgressIndicator(strokeWidth: 2.5),
                              )
                            : const Text('Sign in'),
                      ),
                    ),

                    const SizedBox(height: 24),
                    Text(
                      'Ask the school office if you do not have a password yet.',
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
