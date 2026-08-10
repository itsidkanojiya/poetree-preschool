import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../auth/auth_controller.dart';

/// The teacher's home.
///
/// It opens on today's registers because that is the reason a teacher unlocks
/// their phone at 9am. Marking works offline and syncs later, which is why the
/// API takes a whole register in one idempotent call.
class TeacherHomeView extends StatelessWidget {
  const TeacherHomeView({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthController>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Today'),
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
              'Good morning, ${auth.user.value?.name.split(' ').first ?? ''}',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
          ),
          const SizedBox(height: 20),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Coming next', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Text(
                    'Your classes, the offline register, homework and the class stream.',
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
