import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../auth/auth_controller.dart';

/// Where everyone at a school lands when its plan is switched off.
///
/// No retry button: the API has already stopped answering for this school, so
/// offering one would only produce the same refusal.
class BlockedView extends StatelessWidget {
  const BlockedView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.pause_circle_outline,
                  size: 56,
                  color: Theme.of(context).colorScheme.error,
                ),
                const SizedBox(height: 20),
                Text(
                  'Your school’s access is paused',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                Text(
                  'The school’s subscription is not active at the moment, so the '
                  'app is unavailable for everyone there. Please contact the school.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                ),
                const SizedBox(height: 28),
                OutlinedButton(
                  onPressed: () => Get.find<AuthController>().signOut(),
                  child: const Text('Sign out'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
