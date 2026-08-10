import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/widgets/async_view.dart';
import 'timetable_controller.dart';

/// The week.
///
/// A phone is too narrow for a seven-by-eight grid, so this is a day at a time
/// rather than a shrunken version of the web portal's grid. Today is selected
/// on open, because "what is happening now" is the question being asked.
class TimetableView extends GetView<TimetableController> {
  const TimetableView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Timetable')),
      body: Obx(() {
        final active = controller.activeDays;

        return AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.slots.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'No timetable yet',
          emptyMessage: 'The school has not filled in the week.',
          builder: (context) => _Week(controller: controller, days: active),
        );
      }),
    );
  }
}

class _Week extends StatefulWidget {
  const _Week({required this.controller, required this.days});

  final TimetableController controller;
  final List<int> days;

  @override
  State<_Week> createState() => _WeekState();
}

class _WeekState extends State<_Week> {
  late int _day;

  @override
  void initState() {
    super.initState();
    // DateTime.weekday is already 1..7 with Monday first, matching the API.
    final today = DateTime.now().weekday;
    _day = widget.days.contains(today)
        ? today
        : (widget.days.isEmpty ? 1 : widget.days.first);
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;

    return Column(
      children: [
        SizedBox(
          height: 54,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            itemCount: widget.days.length,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final day = widget.days[index];
              return ChoiceChip(
                label: Text(TimetableController.days[day] ?? ''),
                selected: day == _day,
                onSelected: (_) => setState(() => _day = day),
              );
            },
          ),
        ),
        Expanded(
          child: controller.forTeacher
              ? _TeacherDay(controller: controller, day: _day)
              : _ClassDay(controller: controller, day: _day),
        ),
      ],
    );
  }
}

/// A child's day: every period, including the ones with nothing scheduled, so a
/// parent can see the shape of the day rather than a list of fragments.
class _ClassDay extends StatelessWidget {
  const _ClassDay({required this.controller, required this.day});

  final TimetableController controller;
  final int day;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      itemCount: controller.periods.length,
      itemBuilder: (context, index) {
        final period = controller.periods[index];
        final slot = controller.slotAt(day, period.id);

        if (period.isBreak) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                const Icon(Icons.restaurant_outlined, size: 16),
                const SizedBox(width: 8),
                Text(
                  '${period.name}  ${period.startTime}–${period.endTime}',
                  style: TextStyle(color: colors.outline),
                ),
              ],
            ),
          );
        }

        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            title: Text(slot?.subject ?? 'Free'),
            subtitle: Text(
              [
                '${period.startTime}–${period.endTime}',
                if (slot?.teacher != null) slot!.teacher!,
                if (slot?.room != null) slot!.room!,
              ].join(' · '),
            ),
            leading: CircleAvatar(
              backgroundColor: slot?.subject == null
                  ? colors.surfaceContainerHighest
                  : colors.primaryContainer,
              child: Text(
                period.name.characters.take(2).toString().toUpperCase(),
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: slot?.subject == null
                      ? colors.outline
                      : colors.onPrimaryContainer,
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// A teacher's day, across every class they take — the answer to "where am I
/// meant to be next".
class _TeacherDay extends StatelessWidget {
  const _TeacherDay({required this.controller, required this.day});

  final TimetableController controller;
  final int day;

  @override
  Widget build(BuildContext context) {
    final slots = controller.teacherDay(day);

    if (slots.isEmpty) {
      return const Center(child: Text('Nothing scheduled.'));
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      itemCount: slots.length,
      itemBuilder: (context, index) {
        final slot = slots[index];
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            title: Text(slot.classroomLabel ?? 'Class'),
            subtitle: Text(
              [
                if (slot.periodName != null) slot.periodName!,
                if (slot.startTime != null)
                  '${slot.startTime}–${slot.endTime ?? ''}',
                if (slot.subject != null) slot.subject!,
                if (slot.room != null) slot.room!,
              ].join(' · '),
            ),
          ),
        );
      },
    );
  }
}
