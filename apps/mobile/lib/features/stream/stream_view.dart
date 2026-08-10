import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/widgets/async_view.dart';
import 'stream_controller.dart';

String _when(String iso) {
  final at = DateTime.tryParse(iso);
  return at == null ? '' : DateFormat('d MMM, h:mm a').format(at);
}

class StreamView extends GetView<ClassStreamController> {
  const StreamView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Class stream')),
      floatingActionButton: controller.canPost
          ? FloatingActionButton.extended(
              onPressed: () => _compose(context),
              icon: const Icon(Icons.add),
              label: const Text('Post'),
            )
          : null,
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.posts.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'Nothing posted yet',
          emptyMessage: controller.canPost
              ? 'Share an announcement or a worksheet with the class.'
              : 'Announcements and materials from the class will appear here.',
          builder: (context) => ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
            itemCount: controller.posts.length,
            itemBuilder: (context, index) {
              final post = controller.posts[index];
              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            post.isMaterial
                                ? Icons.attach_file
                                : Icons.campaign_outlined,
                            size: 18,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              post.title,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (post.body != null && post.body!.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(post.body!),
                      ],
                      const SizedBox(height: 10),
                      Text(
                        [
                          post.createdBy,
                          _when(post.publishedAt),
                          if (post.attachmentCount > 0)
                            '${post.attachmentCount} attachment${post.attachmentCount == 1 ? '' : 's'}',
                        ].where((s) => s.isNotEmpty).join(' · '),
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.outline,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Future<void> _compose(BuildContext context) async {
    final titleField = TextEditingController();
    final bodyField = TextEditingController();
    var isMaterial = false;

    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          // Keeps the fields above the keyboard on a small phone.
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 20,
        ),
        child: StatefulBuilder(
          builder: (context, setState) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Post to the class',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: titleField,
                autofocus: true,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Title'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: bodyField,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Details (optional)',
                ),
              ),
              const SizedBox(height: 12),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: isMaterial,
                onChanged: (value) => setState(() => isMaterial = value),
                title: const Text('This is a material'),
                subtitle: const Text('Rather than an announcement'),
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () => Navigator.of(sheetContext).pop(true),
                child: const Text('Post'),
              ),
            ],
          ),
        ),
      ),
    );

    if (confirmed != true) return;
    if (titleField.text.trim().length < 2) return;

    final failure = await controller.post(
      title: titleField.text,
      body: bodyField.text,
      isMaterial: isMaterial,
    );

    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text(failure ?? 'Posted to the class.')),
      );
  }
}
