import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/models/attached_file.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/authed_image.dart';
import '../../core/widgets/async_view.dart';
import 'child_controller.dart';

String _day(String iso) {
  final date = DateTime.tryParse(iso);
  return date == null ? iso : DateFormat('d MMM').format(date);
}

/// The colour a status is allowed to shout in.
({Color fg, Color bg}) statusColours(HomeworkItem item, ColorScheme colors) {
  return switch (item.myStatus) {
    'COMPLETED' => (
      fg: AppTheme.leaf,
      bg: AppTheme.leaf.withValues(alpha: 0.12),
    ),
    'NOT_COMPLETED' => (
      fg: AppTheme.coral,
      bg: AppTheme.coral.withValues(alpha: 0.12),
    ),
    'SUBMITTED' ||
    'LATE' => (fg: AppTheme.sky, bg: AppTheme.sky.withValues(alpha: 0.14)),
    _ when item.isOverdue => (
      fg: AppTheme.coral,
      bg: AppTheme.coral.withValues(alpha: 0.12),
    ),
    _ => (fg: colors.onSurfaceVariant, bg: colors.surfaceContainerHighest),
  };
}

/// One piece of work, opened.
///
/// Modelled on Google Classroom's assignment screen, which a parent with an
/// older child has already learned: what it is and who set it at the top, the
/// teacher's own material next, and everything the family has to *do* gathered
/// into a single card at the bottom rather than scattered through the page.
///
/// It reads the item back out of the controller's list on every build so that
/// sending work in updates this screen without a round trip through a
/// navigator result.
class HomeworkDetailPage extends StatelessWidget {
  const HomeworkDetailPage({required this.child, required this.id, super.key});

  final ChildController child;
  final String id;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Homework')),
      body: Obx(() {
        final item = child.homework.firstWhereOrNull((h) => h.id == id);
        if (item == null) {
          return const Center(child: Text('This work is no longer set.'));
        }

        final tone = statusColours(item, colors);

        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            Text(item.title, style: theme.textTheme.headlineSmall),
            const SizedBox(height: 12),

            // Who set it. Classroom leads with the teacher's face and the date
            // they posted, which is what makes a page of work feel like it came
            // from a person.
            Row(
              children: [
                InitialsAvatar(name: item.setBy, radius: 18),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.setBy.isEmpty ? 'Class teacher' : item.setBy,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        [
                          if (item.className.isNotEmpty) item.className,
                          if (item.subject != null) item.subject!,
                          if (item.setOn != null) 'set ${_day(item.setOn!)}',
                        ].join(' · '),
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 16),
            Row(
              children: [
                _StatusPill(label: item.statusLabel, fg: tone.fg, bg: tone.bg),
                const Spacer(),
                Text(
                  'Due ${_day(item.dueDate)}',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: item.isOverdue
                        ? AppTheme.coral
                        : colors.onSurfaceVariant,
                    fontWeight: item.isOverdue ? FontWeight.w600 : null,
                  ),
                ),
              ],
            ),

            const Divider(height: 32),

            if (item.description != null && item.description!.isNotEmpty)
              Text(
                item.description!,
                style: theme.textTheme.bodyLarge?.copyWith(height: 1.5),
              )
            else
              Text(
                'No further instructions.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: colors.outline,
                ),
              ),

            if (item.attachments.isNotEmpty) ...[
              const SizedBox(height: 20),
              ...item.attachments.map((file) => _AttachmentCard(file: file)),
            ],

            const SizedBox(height: 24),
            _YourWork(child: child, item: item),
          ],
        );
      }),
    );
  }
}

/// The card Classroom calls "Your work": status, what has been sent, and the
/// one button that changes anything.
class _YourWork extends StatelessWidget {
  const _YourWork({required this.child, required this.item});

  final ChildController child;
  final HomeworkItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final tone = statusColours(item, colors);

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: colors.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Your work', style: theme.textTheme.titleMedium),
              const Spacer(),
              _StatusPill(label: item.statusLabel, fg: tone.fg, bg: tone.bg),
            ],
          ),

          if (item.myFiles.isNotEmpty) ...[
            const SizedBox(height: 14),
            SizedBox(
              height: 96,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: item.myFiles.length,
                separatorBuilder: (_, _) => const SizedBox(width: 10),
                itemBuilder: (context, index) {
                  final file = item.myFiles[index];
                  return GestureDetector(
                    onTap: () => showPhoto(
                      context,
                      file.path,
                      caption: file.originalName,
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      // From the server, not the phone's gallery: seeing it come
                      // back is what tells a parent it actually arrived.
                      child: AuthedImage(
                        path: file.path,
                        width: 96,
                        height: 96,
                      ),
                    ),
                  );
                },
              ),
            ),
          ],

          if (item.teacherRemark != null && item.teacherRemark!.isNotEmpty) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: colors.secondaryContainer,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.setBy.isEmpty
                        ? 'From the teacher'
                        : 'From ${item.setBy.split(' ').first}',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: colors.onSecondaryContainer,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    item.teacherRemark!,
                    style: TextStyle(
                      fontSize: 14,
                      height: 1.4,
                      color: colors.onSecondaryContainer,
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 16),

          if (item.canSubmit)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => sendWork(context, child, item),
                icon: const Icon(Icons.add_a_photo_outlined, size: 18),
                label: const Text('Send a photo of the work'),
              ),
            )
          else
            Text(
              switch (item.myStatus) {
                'COMPLETED' =>
                  'The teacher has marked this done. Nothing more to do.',
                'NOT_COMPLETED' =>
                  'The teacher has asked about this one — have a word at pickup.',
                'LATE' =>
                  'Sent in after the due date. Waiting for the teacher.',
                'SUBMITTED' => 'Sent. The teacher will look at it and mark it.',
                // Not every piece of work comes back. Saying so beats a card
                // with no button, which reads as broken.
                _ => 'Nothing to send back for this one — just do it at home.',
              },
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colors.onSurfaceVariant,
              ),
            ),
        ],
      ),
    );
  }
}

/// A worksheet, shown the way Classroom shows an attachment: a wide card with a
/// preview on the left, because a filename alone tells a parent nothing.
class _AttachmentCard extends StatelessWidget {
  const _AttachmentCard({required this.file});

  final AttachedFile file;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: file.isImage
            ? () => showPhoto(context, file.path, caption: file.originalName)
            : null,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: colors.outlineVariant),
          ),
          clipBehavior: Clip.antiAlias,
          child: Row(
            children: [
              SizedBox(
                width: 76,
                height: 76,
                child: file.isImage
                    ? AuthedImage(path: file.path, width: 76, height: 76)
                    : Container(
                        color: colors.surfaceContainerHighest,
                        child: Icon(
                          Icons.description_outlined,
                          color: colors.outline,
                        ),
                      ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        file.originalName,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        file.isImage ? 'Picture' : 'Document',
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.fg, required this.bg});

  final String label;
  final Color fg;
  final Color bg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg),
      ),
    );
  }
}

/// Sending the work in: photographs, an optional note, then off it goes.
Future<void> sendWork(
  BuildContext context,
  ChildController child,
  HomeworkItem item,
) async {
  final noteField = TextEditingController();
  final picker = ImagePicker();
  final photos = <XFile>[];

  final sent = await showModalBottomSheet<bool>(
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
        builder: (context, setState) {
          Future<void> pick(ImageSource source) async {
            // Resized and recompressed on the way in. A modern phone photo is
            // often over the server's 8 MB cap, and a picture of a crayon
            // drawing does not need twelve megapixels.
            final picked = await picker.pickImage(
              source: source,
              imageQuality: 70,
              maxWidth: 1600,
            );
            if (picked != null) setState(() => photos.add(picked));
          }

          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(item.title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(
                'Send a photo of the finished work.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 16),

              if (photos.isNotEmpty) ...[
                SizedBox(
                  height: 84,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: photos.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (context, index) => Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(14),
                          // Straight off local disk — no round trip to preview
                          // something that has not been sent yet.
                          child: Image.file(
                            File(photos[index].path),
                            width: 84,
                            height: 84,
                            fit: BoxFit.cover,
                          ),
                        ),
                        Positioned(
                          top: 2,
                          right: 2,
                          child: GestureDetector(
                            onTap: () => setState(() => photos.removeAt(index)),
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
                const SizedBox(height: 12),
              ],

              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: photos.length >= 5
                          ? null
                          : () => pick(ImageSource.camera),
                      icon: const Icon(Icons.photo_camera_outlined, size: 18),
                      label: const Text('Camera'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: photos.length >= 5
                          ? null
                          : () => pick(ImageSource.gallery),
                      icon: const Icon(Icons.photo_library_outlined, size: 18),
                      label: const Text('Gallery'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              TextField(
                controller: noteField,
                maxLines: 2,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Anything to tell the teacher? (optional)',
                ),
              ),
              const SizedBox(height: 14),

              FilledButton(
                onPressed: () => Navigator.of(sheetContext).pop(true),
                child: const Text('Send to the teacher'),
              ),
              const SizedBox(height: 4),
            ],
          );
        },
      ),
    ),
  );

  if (sent != true) return;

  final failure = await child.submitHomework(
    item,
    note: noteField.text,
    photoPaths: photos.map((p) => p.path).toList(),
  );

  if (!context.mounted) return;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(failure ?? 'Sent to the teacher.')));
}
