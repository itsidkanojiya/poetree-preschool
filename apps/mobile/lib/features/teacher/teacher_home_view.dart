import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/routes/app_pages.dart';
import '../auth/auth_controller.dart';
import 'register_controller.dart';

/// The teacher's home.
///
/// Attendance is first and largest because it is the one thing they do every
/// morning, on a phone, while a room full of four-year-olds needs them. Nothing
/// else on this screen is allowed to get in its way.
class TeacherHomeView extends GetView<RegisterController> {
  const TeacherHomeView({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthController>();

    return Scaffold(
      appBar: AppBar(
        title: Obx(() => Text(auth.user.value?.schoolName ?? 'School')),
        actions: [
          IconButton(
            onPressed: auth.signOut,
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: controller.loadClassrooms,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Obx(
              () => Text(
                'Good morning, ${auth.user.value?.name.split(' ').first ?? ''}',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
            const SizedBox(height: 20),

            Obx(() {
              if (controller.pendingCount == 0) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Card(
                  color: Theme.of(context).colorScheme.errorContainer,
                  child: ListTile(
                    leading: const Icon(Icons.cloud_upload_outlined),
                    title: Text(
                      '${controller.pendingCount} register${controller.pendingCount == 1 ? '' : 's'} waiting for signal',
                    ),
                    subtitle: const Text(
                      'They will send themselves once you are back online.',
                    ),
                  ),
                ),
              );
            }),

            FilledButton.icon(
              onPressed: () => Get.toNamed<void>(AppRoutes.register),
              icon: const Icon(Icons.how_to_reg_outlined),
              label: const Text('Take the register'),
            ),
            const SizedBox(height: 16),

            Obx(() {
              if (controller.classrooms.isEmpty) {
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Text(
                      'You are not assigned to a class yet. The office does this.',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                );
              }

              return Column(
                children: controller.classrooms
                    .map(
                      (classroom) => Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: ListTile(
                          title: Text(classroom.label),
                          subtitle: Text(
                            '${classroom.studentCount} ${classroom.studentCount == 1 ? 'child' : 'children'}',
                          ),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () async {
                            await controller.selectClassroom(classroom.id);
                            await Get.toNamed<void>(AppRoutes.register);
                          },
                        ),
                      ),
                    )
                    .toList(),
              );
            }),
          ],
        ),
      ),
    );
  }
}
