import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_service.dart';
import '../../core/routes/app_pages.dart';
import '../../core/theme/play_palette.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/authed_image.dart';
import '../../core/widgets/squish.dart';

/// One photograph in an event.
class GalleryPhotoItem {
  GalleryPhotoItem({required this.id, required this.path, this.caption});

  factory GalleryPhotoItem.fromJson(Map<String, dynamic> json) =>
      GalleryPhotoItem(
        id: json['id'] as String,
        // Rooted at the domain; our base URL already ends in /api/v1.
        path: (json['url'] as String).replaceFirst('/api/v1', ''),
        caption: json['caption'] as String?,
      );

  final String id;
  final String path;
  final String? caption;
}

/// A school occasion, and its photos once opened.
class GalleryEventItem {
  GalleryEventItem({
    required this.id,
    required this.name,
    required this.photoCount,
    required this.photos,
    this.eventDate,
    this.description,
    this.cover,
  });

  factory GalleryEventItem.fromJson(Map<String, dynamic> json) {
    final cover = json['cover'];
    return GalleryEventItem(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Event',
      eventDate: DateTime.tryParse(json['eventDate'] as String? ?? ''),
      description: json['description'] as String?,
      photoCount: (json['photoCount'] as num?)?.toInt() ?? 0,
      cover: cover is Map<String, dynamic>
          ? GalleryPhotoItem.fromJson(cover)
          : null,
      photos: (json['photos'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(GalleryPhotoItem.fromJson)
          .toList(),
    );
  }

  final String id;
  final String name;
  final DateTime? eventDate;
  final String? description;
  final int photoCount;
  final GalleryPhotoItem? cover;
  final List<GalleryPhotoItem> photos;

  String? get dateLabel =>
      eventDate == null ? null : DateFormat('d MMM yyyy').format(eventDate!);
}

String _problem(DioException e, String fallback) {
  final payload = e.response?.data;
  return payload is Map && payload['error'] is Map
      ? (payload['error'] as Map)['message']?.toString() ?? fallback
      : 'Cannot reach the school right now.';
}

/// The events the school has shared with this child's class.
///
/// The server decides what is shown: an event the office opened to the whole
/// school, or to the class this child is in this year. The photos are of other
/// families' children, so nothing here filters on the phone.
class GalleryController extends GetxController {
  GalleryController({required this.studentId});

  final String? studentId;

  final events = <GalleryEventItem>[].obs;
  final isLoading = true.obs;
  final error = RxnString();

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> load() async {
    if (studentId == null) {
      isLoading.value = false;
      return;
    }
    isLoading.value = true;
    error.value = null;
    try {
      final rows = await api.get<List<dynamic>>(
        '/me/children/$studentId/gallery',
      );
      events.value = rows
          .whereType<Map<String, dynamic>>()
          .map(GalleryEventItem.fromJson)
          .toList();
    } on DioException catch (e) {
      error.value = _problem(e, 'Could not load the gallery.');
    } finally {
      isLoading.value = false;
    }
  }
}

class GalleryView extends GetView<GalleryController> {
  const GalleryView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Gallery')),
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.events.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'No photos yet',
          emptyMessage:
              'Photos from school events appear here once the school shares them.',
          builder: (context) => RefreshIndicator(
            onRefresh: controller.load,
            child: GridView.builder(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 16,
                crossAxisSpacing: 14,
                childAspectRatio: 0.8,
              ),
              itemCount: controller.events.length,
              itemBuilder: (context, index) => _EventTile(
                event: controller.events[index],
                studentId: controller.studentId,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _EventTile extends StatelessWidget {
  const _EventTile({required this.event, required this.studentId});

  final GalleryEventItem event;
  final String? studentId;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = toneFor(event.name);

    return Squish(
      onTap: () => Get.toNamed<void>(
        AppRoutes.galleryEvent,
        arguments: {
          'studentId': studentId,
          'eventId': event.id,
          'eventName': event.name,
        },
      ),
      child: Container(
        decoration: BoxDecoration(
          color: tone.wash,
          borderRadius: BorderRadius.circular(22),
          boxShadow: [
            BoxShadow(
              color: tone.deep.withValues(alpha: 0.14),
              blurRadius: 12,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (event.cover != null)
                    AuthedImage(path: event.cover!.path)
                  else
                    Icon(
                      Icons.photo_library_rounded,
                      color: tone.ink,
                      size: 48,
                    ),
                  Positioned(
                    right: 8,
                    top: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(99),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.photo_rounded,
                            size: 13,
                            color: Colors.white,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '${event.photoCount}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    event.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: tone.deep,
                    ),
                  ),
                  if (event.dateLabel != null)
                    Text(
                      event.dateLabel!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: tone.deep,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One event's photos.
class GalleryEventController extends GetxController {
  GalleryEventController({required this.studentId, required this.eventId});

  final String? studentId;
  final String? eventId;

  final event = Rxn<GalleryEventItem>();
  final isLoading = true.obs;
  final error = RxnString();

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> load() async {
    if (studentId == null || eventId == null) {
      isLoading.value = false;
      return;
    }
    isLoading.value = true;
    error.value = null;
    try {
      final data = await api.get<Map<String, dynamic>>(
        '/me/children/$studentId/gallery/$eventId',
      );
      event.value = GalleryEventItem.fromJson(data);
    } on DioException catch (e) {
      error.value = _problem(e, 'Could not open this event.');
    } finally {
      isLoading.value = false;
    }
  }
}

class GalleryEventView extends GetView<GalleryEventController> {
  const GalleryEventView({required this.title, super.key});

  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Obx(() {
        final event = controller.event.value;
        return AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: event == null || event.photos.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'No photos in this event',
          builder: (context) => CustomScrollView(
            slivers: [
              if (event!.dateLabel != null || event.description != null)
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                  sliver: SliverToBoxAdapter(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (event.dateLabel != null)
                          Text(
                            event.dateLabel!,
                            style: theme.textTheme.labelMedium,
                          ),
                        if (event.description != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            event.description!,
                            style: theme.textTheme.bodyMedium,
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 28),
                sliver: SliverGrid.builder(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisSpacing: 6,
                    crossAxisSpacing: 6,
                  ),
                  itemCount: event.photos.length,
                  itemBuilder: (context, index) {
                    final photo = event.photos[index];
                    return GestureDetector(
                      onTap: () => unawaited(
                        showPhoto(context, photo.path, caption: photo.caption),
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: AuthedImage(path: photo.path),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      }),
    );
  }
}
