import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/widgets/async_view.dart';
import 'inbox_controller.dart';

/// Icons chosen so the list is scannable without reading — a parent checks this
/// in bursts, usually one-handed.
IconData _iconFor(String type) {
  if (type.startsWith('ATTENDANCE')) return Icons.event_available_outlined;
  if (type.startsWith('HOMEWORK')) return Icons.menu_book_outlined;
  if (type.startsWith('FEE') || type.startsWith('PAYMENT')) {
    return Icons.receipt_long_outlined;
  }
  if (type.startsWith('NOTICE')) return Icons.campaign_outlined;
  return Icons.notifications_none;
}

String _when(String iso) {
  final at = DateTime.tryParse(iso);
  if (at == null) return '';

  final age = DateTime.now().difference(at);
  if (age.inMinutes < 1) return 'just now';
  if (age.inHours < 1) return '${age.inMinutes}m ago';
  if (age.inHours < 24) return '${age.inHours}h ago';
  if (age.inDays < 7) return '${age.inDays}d ago';
  return DateFormat('d MMM').format(at);
}

class InboxView extends GetView<InboxController> {
  const InboxView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Messages'),
        actions: [
          Obx(() {
            if (controller.unread.value == 0) return const SizedBox.shrink();
            return TextButton(
              onPressed: controller.markAllRead,
              child: const Text('Mark all read'),
            );
          }),
        ],
      ),
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.items.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'No messages',
          emptyMessage: 'Anything the school sends you will appear here.',
          builder: (context) => ListView.separated(
            itemCount: controller.items.length,
            separatorBuilder: (_, _) => const Divider(height: 1, indent: 68),
            itemBuilder: (context, index) {
              final item = controller.items[index];
              final colors = Theme.of(context).colorScheme;

              return ListTile(
                onTap: () => controller.markRead(item),
                leading: CircleAvatar(
                  backgroundColor: item.isUnread
                      ? colors.primaryContainer
                      : colors.surfaceContainerHighest,
                  child: Icon(
                    _iconFor(item.type),
                    size: 20,
                    color: item.isUnread
                        ? colors.onPrimaryContainer
                        : colors.outline,
                  ),
                ),
                title: Text(
                  item.title,
                  style: TextStyle(
                    // Weight carries unread, not colour alone — it survives
                    // being read in sunlight on a cheap screen.
                    fontWeight: item.isUnread
                        ? FontWeight.w600
                        : FontWeight.w400,
                  ),
                ),
                subtitle: Text(
                  item.body,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: Text(
                  _when(item.createdAt),
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: colors.outline),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

/// The bell, with its count, for an app bar.
class InboxButton extends StatelessWidget {
  const InboxButton({required this.onOpen, super.key});

  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    if (!Get.isRegistered<InboxController>()) {
      return IconButton(
        onPressed: onOpen,
        icon: const Icon(Icons.notifications_none),
        tooltip: 'Messages',
      );
    }

    final controller = Get.find<InboxController>();

    return Obx(() {
      final count = controller.unread.value;

      return Stack(
        alignment: Alignment.center,
        children: [
          IconButton(
            onPressed: onOpen,
            icon: const Icon(Icons.notifications_none),
            tooltip: 'Messages',
          ),
          if (count > 0)
            Positioned(
              top: 8,
              right: 6,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.error,
                  borderRadius: BorderRadius.circular(9),
                ),
                constraints: const BoxConstraints(minWidth: 17),
                child: Text(
                  count > 99 ? '99+' : '$count',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.onError,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
        ],
      );
    });
  }
}
