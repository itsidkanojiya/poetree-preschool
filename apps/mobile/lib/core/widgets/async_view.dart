import 'package:flutter/material.dart';

import 'authed_image.dart';

/// Loading, empty and error states, once, for every screen.
///
/// Written as a shared widget because these three are the states most often
/// skipped, and a parent staring at a blank screen has no way to tell a slow
/// connection from a school that has posted nothing.
class AsyncView extends StatelessWidget {
  const AsyncView({
    required this.isLoading,
    required this.error,
    required this.isEmpty,
    required this.builder,
    required this.onRetry,
    this.emptyTitle = 'Nothing here yet',
    this.emptyMessage,
    super.key,
  });

  final bool isLoading;
  final String? error;
  final bool isEmpty;
  final WidgetBuilder builder;
  final Future<void> Function() onRetry;
  final String emptyTitle;
  final String? emptyMessage;

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (error != null) {
      return _Message(
        icon: Icons.cloud_off_outlined,
        title: 'Could not load',
        message: error!,
        action: FilledButton.tonal(
          onPressed: () => onRetry(),
          child: const Text('Try again'),
        ),
      );
    }

    if (isEmpty) {
      return RefreshIndicator(
        onRefresh: onRetry,
        // Must scroll, or pull-to-refresh has nothing to pull.
        child: ListView(
          children: [
            const SizedBox(height: 80),
            _Message(
              icon: Icons.inbox_outlined,
              title: emptyTitle,
              message: emptyMessage,
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(onRefresh: onRetry, child: builder(context));
  }
}

class _Message extends StatelessWidget {
  const _Message({
    required this.icon,
    required this.title,
    this.message,
    this.action,
  });

  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: colors.outline),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (message != null) ...[
              const SizedBox(height: 6),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: colors.outline),
              ),
            ],
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}

/// A child's or a person's initials, used wherever a photograph is missing.
/// A face when the school has uploaded one, initials when it has not.
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar({
    required this.name,
    this.radius = 22,
    this.photoPath,
    super.key,
  });

  final String name;
  final double radius;

  /// An API path such as `/files/abc`. Authenticated, so it goes through
  /// AuthedImage rather than Image.network.
  final String? photoPath;

  @override
  Widget build(BuildContext context) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    final initials = parts.isEmpty
        ? '?'
        : parts.length == 1
        ? parts.first.substring(0, 1)
        : '${parts.first.substring(0, 1)}${parts.last.substring(0, 1)}';

    final colors = Theme.of(context).colorScheme;

    final path = photoPath;
    if (path != null && path.isNotEmpty) {
      return ClipOval(
        child: SizedBox(
          width: radius * 2,
          height: radius * 2,
          child: AuthedImage(path: path, width: radius * 2, height: radius * 2),
        ),
      );
    }

    return CircleAvatar(
      radius: radius,
      backgroundColor: colors.primaryContainer,
      child: Text(
        initials.toUpperCase(),
        style: TextStyle(
          color: colors.onPrimaryContainer,
          fontWeight: FontWeight.w600,
          fontSize: radius * 0.72,
        ),
      ),
    );
  }
}
