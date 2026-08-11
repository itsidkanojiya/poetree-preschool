import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/routes/app_pages.dart';
import '../../core/theme/app_theme.dart';
import '../auth/auth_controller.dart';
import '../notifications/inbox_view.dart';
import 'register_controller.dart';

/// The teacher's home.
///
/// Attendance is the one thing they do every morning, on a phone, while a room
/// full of four-year-olds needs them — so it is the only thing given a full
/// button, and everything else is a quiet row beneath it.
class TeacherHomeView extends GetView<RegisterController> {
  const TeacherHomeView({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthController>();
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Obx(() => Text(auth.user.value?.schoolName ?? 'School')),
        actions: [
          InboxButton(onOpen: () => Get.toNamed<void>(AppRoutes.inbox)),
          IconButton(
            onPressed: auth.signOut,
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Sign out',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: controller.loadClassrooms,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
          children: [
            Obx(
              () => Text(
                '${_partOfDay()}, ${auth.user.value?.name.split(' ').first ?? ''}',
                style: theme.textTheme.headlineMedium,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              DateFormat('EEEE d MMMM').format(DateTime.now()),
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 20),

            // Queued work is never allowed to be invisible: a teacher must be
            // able to tell "saved" from "saved on this phone".
            Obx(() {
              final waiting = controller.pendingCount.value;
              if (waiting == 0) return const SizedBox.shrink();

              return Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.secondaryContainer,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.cloud_upload_rounded,
                        size: 20,
                        color: theme.colorScheme.onSecondaryContainer,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '$waiting register${waiting == 1 ? '' : 's'} waiting for signal',
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                color: theme.colorScheme.onSecondaryContainer,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'They will send themselves once you are back online.',
                              style: TextStyle(
                                fontSize: 13,
                                height: 1.35,
                                color: theme.colorScheme.onSecondaryContainer,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),

            // The morning job, and nothing competing with it.
            _TakeRegisterCard(
              onTap: () => Get.toNamed<void>(AppRoutes.register),
            ),
            const SizedBox(height: 22),

            Text('YOUR CLASSES', style: theme.textTheme.labelSmall),
            const SizedBox(height: 10),

            Obx(() {
              if (controller.classrooms.isEmpty) {
                return Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surface,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: theme.colorScheme.outlineVariant),
                  ),
                  child: Text(
                    'You are not assigned to a class yet. The office does that.',
                    style: theme.textTheme.bodyMedium,
                  ),
                );
              }

              return Column(
                children: controller.classrooms
                    .map(
                      (c) => _ClassCard(classroom: c, controller: controller),
                    )
                    .toList(),
              );
            }),

            const SizedBox(height: 22),
            Text('ALSO', style: theme.textTheme.labelSmall),
            const SizedBox(height: 10),
            _QuietRow(
              icon: Icons.schedule_rounded,
              tone: AppTheme.apricot,
              toneSoft: AppTheme.apricotSoft,
              title: 'My week',
              subtitle: 'Every class you take, day by day',
              onTap: () => Get.toNamed<void>(
                AppRoutes.timetable,
                arguments: {'forTeacher': true},
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _partOfDay() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }
}

class _TakeRegisterCard extends StatelessWidget {
  const _TakeRegisterCard({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    return Material(
      color: colors.primary,
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Row(
            children: [
              Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  color: colors.onPrimary.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(
                  Icons.how_to_reg_rounded,
                  size: 27,
                  color: colors.onPrimary,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Take the register',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.3,
                        color: colors.onPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Everyone starts present — tap only who is away',
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.35,
                        color: colors.onPrimary.withValues(alpha: 0.82),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One class, with everything a teacher does to it on the same card rather
/// than hidden behind a menu they have to know is there.
class _ClassCard extends StatelessWidget {
  const _ClassCard({required this.classroom, required this.controller});

  final Classroom classroom;
  final RegisterController controller;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    Future<void> open(String route, [Map<String, dynamic>? args]) async {
      await controller.selectClassroom(classroom.id);
      await Get.toNamed<void>(route, arguments: args);
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: colors.outlineVariant),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: colors.primaryContainer,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Text(
                    '${classroom.studentCount}',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                      color: colors.onPrimaryContainer,
                    ),
                  ),
                ),
                const SizedBox(width: 13),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(classroom.label, style: theme.textTheme.titleMedium),
                      Text(
                        '${classroom.studentCount} ${classroom.studentCount == 1 ? 'child' : 'children'}',
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: colors.outlineVariant),
          Row(
            children: [
              _CardAction(
                icon: Icons.menu_book_rounded,
                label: 'Homework',
                onTap: () => open(AppRoutes.teacherHomework, {
                  'classroomId': classroom.id,
                }),
              ),
              _divider(colors),
              _CardAction(
                icon: Icons.dynamic_feed_rounded,
                label: 'Stream',
                onTap: () => open(AppRoutes.stream, {
                  'classroomId': classroom.id,
                  'canPost': true,
                }),
              ),
              _divider(colors),
              _CardAction(
                icon: Icons.insights_rounded,
                label: 'The class',
                onTap: () =>
                    open(AppRoutes.roster, {'classroomId': classroom.id}),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _divider(ColorScheme colors) =>
      Container(width: 1, height: 44, color: colors.outlineVariant);
}

class _CardAction extends StatelessWidget {
  const _CardAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(22)),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 13),
          child: Column(
            children: [
              Icon(icon, size: 19, color: colors.primary),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: colors.onSurface,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuietRow extends StatelessWidget {
  const _QuietRow({
    required this.icon,
    required this.tone,
    required this.toneSoft,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final Color tone;
  final Color toneSoft;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    return Material(
      color: colors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: colors.outlineVariant),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: isDark ? tone.withValues(alpha: 0.18) : toneSoft,
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(icon, size: 20, color: tone),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: theme.textTheme.titleSmall),
                    const SizedBox(height: 1),
                    Text(subtitle, style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: colors.outline),
            ],
          ),
        ),
      ),
    );
  }
}
