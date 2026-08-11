import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/widgets/async_view.dart';
import 'register_controller.dart';

/// Status colours and the single letter shown on the tap target.
const _statuses = <String, ({String label, String short, Color color})>{
  'PRESENT': (label: 'Present', short: 'P', color: Color(0xFF16A34A)),
  'ABSENT': (label: 'Absent', short: 'A', color: Color(0xFFDC2626)),
  'LATE': (label: 'Late', short: 'L', color: Color(0xFFD97706)),
  'LEAVE': (label: 'Leave', short: 'V', color: Color(0xFF7C3AED)),
  'HALF_DAY': (label: 'Half day', short: 'H', color: Color(0xFF0891B2)),
};

class RegisterView extends GetView<RegisterController> {
  const RegisterView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Obx(
          () => Text(
            controller.classroomLabel.value.isEmpty
                ? 'Register'
                : controller.classroomLabel.value,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Another day',
            icon: const Icon(Icons.calendar_today_outlined),
            onPressed: () => _pickDate(context),
          ),
        ],
      ),
      body: Obx(() {
        return AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.rows.isEmpty,
          onRetry: controller.loadSheet,
          emptyTitle: 'Nobody enrolled',
          emptyMessage: 'This class has no children in it yet.',
          builder: (context) => Column(
            children: [
              _Header(controller: controller),
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 96),
                  itemCount: controller.rows.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 6),
                  itemBuilder: (context, index) =>
                      _Row(controller: controller, index: index),
                ),
              ),
            ],
          ),
        );
      }),
      bottomSheet: Obx(() {
        if (controller.rows.isEmpty || !controller.editable.value) {
          return const SizedBox.shrink();
        }
        return _SaveBar(controller: controller);
      }),
    );
  }

  Future<void> _pickDate(BuildContext context) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: controller.date.value,
      firstDate: DateTime(now.year - 1),
      // A register cannot be taken for a day that has not happened.
      lastDate: now,
    );
    if (picked != null) await controller.selectDate(picked);
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.controller});

  final RegisterController controller;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final isToday = DateUtils.isSameDay(controller.date.value, DateTime.now());

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (controller.classrooms.length > 1)
            SizedBox(
              height: 38,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: controller.classrooms.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final classroom = controller.classrooms[index];
                  final selected =
                      classroom.id == controller.selectedClassroomId.value;
                  return ChoiceChip(
                    label: Text(classroom.label),
                    selected: selected,
                    onSelected: (_) => controller.selectClassroom(classroom.id),
                  );
                },
              ),
            ),
          if (controller.classrooms.length > 1) const SizedBox(height: 10),

          Row(
            children: [
              Text(
                isToday
                    ? 'Today'
                    : DateFormat('EEE d MMM').format(controller.date.value),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const Spacer(),
              Text(
                '${controller.presentCount} in · ${controller.absentCount} away',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: colors.outline),
              ),
            ],
          ),

          if (controller.isHoliday.value) ...[
            const SizedBox(height: 8),
            _Banner(
              tone: colors.tertiaryContainer,
              onTone: colors.onTertiaryContainer,
              icon: Icons.beach_access_outlined,
              // Marking a holiday would put it in the denominator and make
              // every attendance percentage wrong.
              text:
                  '${controller.holidayTitle.value ?? 'School holiday'} — no register today.',
            ),
          ] else if (!controller.editable.value) ...[
            const SizedBox(height: 8),
            _Banner(
              tone: colors.surfaceContainerHighest,
              onTone: colors.onSurfaceVariant,
              icon: Icons.lock_outline,
              text:
                  'This day is closed. Ask the office to correct it — corrections are recorded.',
            ),
          ] else if (controller.alreadyMarked.value) ...[
            const SizedBox(height: 8),
            _Banner(
              tone: colors.secondaryContainer,
              onTone: colors.onSecondaryContainer,
              icon: Icons.check_circle_outline,
              text: controller.markedByName.value == null
                  ? 'Already marked. Saving again replaces it.'
                  : 'Marked by ${controller.markedByName.value}. Saving again replaces it.',
            ),
          ],

          if (controller.pendingCount.value > 0) ...[
            const SizedBox(height: 8),
            _Banner(
              tone: colors.errorContainer,
              onTone: colors.onErrorContainer,
              icon: Icons.cloud_upload_outlined,
              // Never let queued work be invisible — a teacher must be able to
              // tell "saved" from "saved on this phone".
              text:
                  '${controller.pendingCount.value} register${controller.pendingCount.value == 1 ? '' : 's'} waiting for signal.',
            ),
          ],
        ],
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({
    required this.tone,
    required this.onTone,
    required this.icon,
    required this.text,
  });

  final Color tone;
  final Color onTone;
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: tone,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: onTone),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: TextStyle(color: onTone, fontSize: 13)),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.controller, required this.index});

  final RegisterController controller;
  final int index;

  @override
  Widget build(BuildContext context) {
    final row = controller.rows[index];
    final status = _statuses[row.status] ?? _statuses['PRESENT']!;
    final enabled = controller.editable.value;

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: enabled ? () => controller.cycle(index) : null,
        onLongPress: enabled ? () => _choose(context) : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              InitialsAvatar(name: row.fullName, radius: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      row.fullName,
                      style: const TextStyle(fontWeight: FontWeight.w500),
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      row.rollNo == null
                          ? row.admissionNo
                          : 'Roll ${row.rollNo}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    ),
                  ],
                ),
              ),
              // Big enough to hit one-handed without looking.
              Container(
                width: 46,
                height: 46,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: status.color.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Text(
                  status.short,
                  style: TextStyle(
                    color: status.color,
                    fontWeight: FontWeight.w700,
                    fontSize: 17,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Long press for the full list — kept off the main path so the common case
  /// stays one tap.
  Future<void> _choose(BuildContext context) async {
    final picked = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final entry in _statuses.entries)
              ListTile(
                leading: CircleAvatar(
                  radius: 14,
                  backgroundColor: entry.value.color.withValues(alpha: 0.15),
                  child: Text(
                    entry.value.short,
                    style: TextStyle(
                      color: entry.value.color,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ),
                title: Text(entry.value.label),
                onTap: () => Navigator.of(context).pop(entry.key),
              ),
          ],
        ),
      ),
    );

    if (picked != null) controller.setStatus(index, picked);
  }
}

class _SaveBar extends StatelessWidget {
  const _SaveBar({required this.controller});

  final RegisterController controller;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
        child: FilledButton(
          onPressed: controller.isSaving.value
              ? null
              : () async {
                  final message = await controller.save();
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context)
                    ..hideCurrentSnackBar()
                    ..showSnackBar(SnackBar(content: Text(message)));
                },
          child: controller.isSaving.value
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2.5),
                )
              : Text('Save · ${controller.absentCount} away'),
        ),
      ),
    );
  }
}
