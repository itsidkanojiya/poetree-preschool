import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/models/attached_file.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/authed_image.dart';
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
                        if (item.attachments.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          // The teacher's own worksheet, so they can see what
                          // the class was actually given.
                          SizedBox(
                            height: 56,
                            child: ListView.separated(
                              scrollDirection: Axis.horizontal,
                              itemCount: item.attachments.length,
                              separatorBuilder: (_, _) =>
                                  const SizedBox(width: 8),
                              itemBuilder: (context, i) {
                                final file = item.attachments[i];
                                if (!file.isImage) {
                                  return Chip(
                                    avatar: const Icon(
                                      Icons.description_outlined,
                                      size: 16,
                                    ),
                                    label: Text(
                                      file.originalName,
                                      style: const TextStyle(fontSize: 11),
                                    ),
                                  );
                                }
                                return GestureDetector(
                                  onTap: () => showPhoto(
                                    context,
                                    file.path,
                                    caption: file.originalName,
                                  ),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(10),
                                    child: AuthedImage(
                                      path: file.path,
                                      width: 56,
                                      height: 56,
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
                        ],
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 2),
                  // The teacher's own queue: work sent in that nobody has
                  // looked at yet. It is the only number they can act on.
                  Obx(() {
                    final waiting = controller.submissions
                        .where((s) => s.isWaiting)
                        .length;
                    return Text(
                      waiting == 0
                          ? 'Nothing waiting to be checked'
                          : '$waiting to check',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.outline,
                      ),
                    );
                  }),
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
    final picker = ImagePicker();
    final worksheets = <XFile>[];
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
              if (worksheets.isNotEmpty) ...[
                const SizedBox(height: 4),
                SizedBox(
                  height: 84,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: worksheets.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (context, index) => Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(14),
                          // Off local disk: nothing has been uploaded yet.
                          child: Image.file(
                            File(worksheets[index].path),
                            width: 84,
                            height: 84,
                            fit: BoxFit.cover,
                          ),
                        ),
                        Positioned(
                          top: 2,
                          right: 2,
                          child: GestureDetector(
                            onTap: () =>
                                setState(() => worksheets.removeAt(index)),
                            child: const CircleAvatar(
                              radius: 11,
                              backgroundColor: Colors.black54,
                              child: Icon(
                                Icons.close,
                                size: 13,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
              // Photographing a page from the workbook is how a preschool
              // teacher shares a worksheet; the portal takes PDFs for anyone
              // who has one ready.
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: worksheets.length >= 3
                          ? null
                          : () async {
                              final picked = await picker.pickImage(
                                source: ImageSource.camera,
                                imageQuality: 70,
                                maxWidth: 1600,
                              );
                              if (picked != null) {
                                setState(() => worksheets.add(picked));
                              }
                            },
                      icon: const Icon(Icons.photo_camera_outlined, size: 18),
                      label: const Text('Photograph it'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: worksheets.length >= 3
                          ? null
                          : () async {
                              final picked = await picker.pickImage(
                                source: ImageSource.gallery,
                                imageQuality: 70,
                                maxWidth: 1600,
                              );
                              if (picked != null) {
                                setState(() => worksheets.add(picked));
                              }
                            },
                      icon: const Icon(Icons.photo_library_outlined, size: 18),
                      label: const Text('From gallery'),
                    ),
                  ),
                ],
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: allowsSubmission,
                onChanged: (value) => setState(() => allowsSubmission = value),
                title: const Text('Parents can send the work back'),
                subtitle: const Text('A photo of what the child did'),
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
      worksheetPaths: worksheets.map((w) => w.path).toList(),
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

    final photos = submission.files.where((f) => f.isImage).toList();

    return ListTile(
      // The photograph, not the initials, is what the teacher is looking for
      // when they scroll this list.
      leading: photos.isEmpty
          ? InitialsAvatar(name: submission.fullName, radius: 18)
          : ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: AuthedImage(
                path: photos.first.path,
                width: 44,
                height: 44,
              ),
            ),
      title: Text(submission.fullName),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            photos.length > 1 ? '$label · ${photos.length} photos' : label,
            style: TextStyle(color: color, fontWeight: FontWeight.w600),
          ),
          // A parent's note is the closest thing to them being in the room.
          if (submission.note != null && submission.note!.isNotEmpty)
            Text(
              '“${submission.note}”',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          if (submission.teacherRemark != null &&
              submission.teacherRemark!.isNotEmpty)
            Text(
              'You said: ${submission.teacherRemark}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: colors.outline,
                fontStyle: FontStyle.italic,
              ),
            ),
        ],
      ),
      // Opening the work is the deliberate act; the two buttons stay for the
      // child who did it in the room and needs no photograph looked at.
      onTap: photos.isEmpty ? null : () => _open(context, photos),
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

  /// The work itself, large, with somewhere to say a word back about it.
  Future<void> _open(BuildContext context, List<AttachedFile> photos) async {
    final remarkField = TextEditingController(
      text: submission.teacherRemark ?? '',
    );

    final decision = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                submission.fullName,
                style: Theme.of(sheetContext).textTheme.titleMedium,
              ),
              if (submission.submittedOn != null)
                Text(
                  'Sent ${_day(submission.submittedOn!)}',
                  style: Theme.of(sheetContext).textTheme.bodySmall?.copyWith(
                    color: Theme.of(sheetContext).colorScheme.outline,
                  ),
                ),
              const SizedBox(height: 14),
              SizedBox(
                height: 220,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: photos.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 10),
                  itemBuilder: (context, index) => GestureDetector(
                    onTap: () => showPhoto(
                      context,
                      photos[index].path,
                      caption: submission.fullName,
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: AuthedImage(path: photos[index].path, width: 190),
                    ),
                  ),
                ),
              ),
              if (submission.note != null && submission.note!.isNotEmpty) ...[
                const SizedBox(height: 14),
                Text(
                  '“${submission.note}”',
                  style: Theme.of(sheetContext).textTheme.bodyMedium,
                ),
              ],
              const SizedBox(height: 14),
              TextField(
                controller: remarkField,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'A word back (optional)',
                  hintText: 'Lovely letters, Aarav',
                ),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () =>
                          Navigator.of(sheetContext).pop('NOT_COMPLETED'),
                      icon: const Icon(Icons.cancel_outlined),
                      label: const Text('Not done'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () =>
                          Navigator.of(sheetContext).pop('COMPLETED'),
                      icon: const Icon(Icons.check_circle_outline),
                      label: const Text('Done'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );

    if (decision == null || !context.mounted) return;
    await _mark(context, decision, remark: remarkField.text);
  }

  Future<void> _mark(
    BuildContext context,
    String status, {
    String? remark,
  }) async {
    final failure = await controller.review(submission, status, remark: remark);
    if (failure == null || !context.mounted) return;

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(failure)));
  }
}
