import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../auth/auth_controller.dart';

/// The parent's home.
///
/// A child is chosen by tapping a face, never by typing or logging in as them —
/// students hold no credentials anywhere in this platform. A parent with one
/// child never sees a picker at all.
class ParentHomeView extends StatelessWidget {
  const ParentHomeView({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthController>();

    return Scaffold(
      appBar: AppBar(
        title: Obx(() => Text(auth.user.value?.schoolName ?? 'Home')),
        actions: [
          IconButton(
            onPressed: auth.signOut,
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Obx(
            () => Text(
              'Hello, ${auth.user.value?.name.split(' ').first ?? ''}',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
          ),
          const SizedBox(height: 20),

          // Child picker, attendance, homework, fees and notices land here next.
          // Each reads an endpoint that already exists and is tenant-scoped.
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Coming next',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Your child’s attendance, homework, fees and school notices.',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.outline,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
