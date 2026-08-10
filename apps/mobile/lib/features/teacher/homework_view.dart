import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/widgets/async_view.dart';
import 'homework_controller.dart';

String _day(String iso) {
  final date = DateTime.tryParse(iso);
  return date == null ? iso : DateFormat('d MMM').format(date);
}

class TeacherHomeworkView extends GetView<TeacherHomeworkController> {
  const TeacherHomeworkView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Homework')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _compose(context),
        icon: const Icon(Icons.add),
        label: const Text('Set work'),
      ),
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.items.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'Nothing set yet',
          emptyMessage: 'Set the first piece of work for this class.',
          builder: (context) => ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
            itemCount: controller.items.length,
            itemBuilder: (context, index) {
              final item = controller.items[index];
              final done = item.assigned == 0
                  ? 0.0
                  : item.completed / item.assigned;

              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: item.isPublished
                      ? () => _openSubmissions(context, item)
                      : null,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.title,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Due ${_day(item.dueDate)}${item.isPublished ? '' : ' · draft'}',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: Theme.of(context).colorScheme.outline,
                              ),
                        ),
                        if (item.isPublished) ...[
                          const SizedBox(height: 10),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: done,
                              minHeight: 5,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            // The number that matters is who has not done it.
                            '${item.completed} of ${item.assigned} done'
                            '${item.pending > 0 ? ' · ${item.pending} still to do' : ''}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Future<void> _openSubmissions(
    BuildContext context,
    TeacherHomework item,
  ) async {
    await controller.openSubmissions(item.id);
    if (!context.mounted) return;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        builder: (context, scrollController) => Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      item.title,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Obx(
                () => ListView.separated(
                  controller: scrollController,
                  itemCount: controller.submissions.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final submission = controller.submissions[index];
                    return _SubmissionRow(
                      controller: controller,
                      submission: submission,
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _compose(BuildContext context) async {
    final titleField = TextEditingController();
    final detailField = TextEditingController();
    var due = DateTime.now().add(const Duration(days: 2));
    var allowsSubmission = true;

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 20,
        ),
        child: StatefulBuilder(
          builder: (context, setState) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Set work for the class',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: titleField,
                autofocus: true,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'What to do'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: detailField,
                maxLines: 3,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Details (optional)',
                ),
              ),
              const SizedBox(height: 12),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.event_outlined),
                title: const Text('Due'),
                subtitle: Text(DateFormat('EEE d MMM').format(due)),
                trailing: const Icon(Icons.edit_calendar_outlined),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: due,
                    // Homework cannot be due before it is set.
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 180)),
                  );
                  if (picked != null) setState(() => due = picked);
                },
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: allowsSubmission,
                onChanged: (value) => setState(() => allowsSubmission = value),
                title: const Text('Parents can mark it done'),
                subtitle: const Text('You still decide whether it counts'),
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () => Navigator.of(sheetContext).pop(true),
                child: const Text('Set and publish'),
              ),
              const SizedBox(height: 4),
            ],
          ),
        ),
      ),
    );

    if (confirmed != true) return;
    if (titleField.text.trim().length < 2) return;

    final failure = await controller.create(
      title: titleField.text,
      description: detailField.text,
      dueDate: due,
      allowsSubmission: allowsSubmission,
    );

    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(failure ?? 'Set for the class.')));
  }
}

class _SubmissionRow extends StatelessWidget {
  const _SubmissionRow({required this.controller, required this.submission});

  final TeacherHomeworkController controller;
  final Submission submission;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    final (label, color) = switch (submission.status) {
      'COMPLETED' => ('Done', const Color(0xFF16A34A)),
      'NOT_COMPLETED' => ('Not done', const Color(0xFFDC2626)),
      'SUBMITTED' => ('Sent in', const Color(0xFF0891B2)),
      'LATE' => ('Sent in late', const Color(0xFFD97706)),
      _ => ('Waiting', colors.outline),
    };

    return ListTile(
      leading: InitialsAvatar(name: submission.fullName, radius: 18),
      title: Text(submission.fullName),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(color: color, fontWeight: FontWeight.w600),
          ),
          // A parent's note is the closest thing to them being in the room.
          if (submission.note != null && submission.note!.isNotEmpty)
            Text(
              '“${submission.note}”',
              style: Theme.of(context).textTheme.bodySmall,
            ),
        ],
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            tooltip: 'Done',
            icon: const Icon(Icons.check_circle_outline),
            color: submission.status == 'COMPLETED'
                ? const Color(0xFF16A34A)
                : null,
            onPressed: () => _mark(context, 'COMPLETED'),
          ),
          IconButton(
            tooltip: 'Not done',
            icon: const Icon(Icons.cancel_outlined),
            color: submission.status == 'NOT_COMPLETED'
                ? const Color(0xFFDC2626)
                : null,
            onPressed: () => _mark(context, 'NOT_COMPLETED'),
          ),
        ],
      ),
    );
  }

  Future<void> _mark(BuildContext context, String status) async {
    final failure = await controller.review(submission, status);
    if (failure == null || !context.mounted) return;

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(failure)));
  }
}
