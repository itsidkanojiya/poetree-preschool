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
import 'gallery_video_view.dart';

/// One photograph in an event.
class GalleryPhotoItem {
  GalleryPhotoItem({
    required this.id,
    required this.path,
    required this.thumbPath,
    this.caption,
  });

  factory GalleryPhotoItem.fromJson(Map<String, dynamic> json) {
    // Rooted at the domain; our base URL already ends in /api/v1.
    final path = (json['url'] as String).replaceFirst('/api/v1', '');
    final thumb = json['thumbUrl'] as String?;
    return GalleryPhotoItem(
      id: json['id'] as String,
      path: path,
      thumbPath: thumb == null ? path : thumb.replaceFirst('/api/v1', ''),
      caption: json['caption'] as String?,
    );
  }

  final String id;
  final String path;

  /// The small copy grids show — a few kilobytes, where the photo is up to a
  /// megabyte. The photo itself opens only when tapped.
  final String thumbPath;
  final String? caption;
}

/// A school occasion, and its photos and videos once opened.
class GalleryEventItem {
  GalleryEventItem({
    required this.id,
    required this.name,
    required this.photoCount,
    required this.videoCount,
    required this.photos,
    required this.videos,
    this.eventDate,
    this.description,
    this.cover,
    this.coverVideo,
  });

  factory GalleryEventItem.fromJson(Map<String, dynamic> json) {
    final cover = json['cover'];
    final coverVideo = json['coverVideo'];
    return GalleryEventItem(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Event',
      eventDate: DateTime.tryParse(json['eventDate'] as String? ?? ''),
      description: json['description'] as String?,
      photoCount: (json['photoCount'] as num?)?.toInt() ?? 0,
      videoCount: (json['videoCount'] as num?)?.toInt() ?? 0,
      cover: cover is Map<String, dynamic>
          ? GalleryPhotoItem.fromJson(cover)
          : null,
      coverVideo: coverVideo is Map<String, dynamic>
          ? GalleryVideoItem.fromJson(coverVideo)
          : null,
      photos: (json['photos'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(GalleryPhotoItem.fromJson)
          .toList(),
      videos: (json['videos'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(GalleryVideoItem.fromJson)
          .toList(),
    );
  }

  final String id;
  final String name;
  final DateTime? eventDate;
  final String? description;
  final int photoCount;
  final int videoCount;
  final GalleryPhotoItem? cover;
  final GalleryVideoItem? coverVideo;
  final List<GalleryPhotoItem> photos;
  final List<GalleryVideoItem> videos;

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
              'Photos and videos from school events appear here once the school shares them.',
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
                    AuthedImage(path: event.cover!.thumbPath)
                  else if (event.coverVideo != null)
                    Image.network(
                      event.coverVideo!.thumbnailUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => Icon(
                        Icons.smart_display_rounded,
                        color: tone.ink,
                        size: 48,
                      ),
                    )
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
                          if (event.photoCount > 0 || event.videoCount == 0)
                            _Count(
                              icon: Icons.photo_rounded,
                              count: event.photoCount,
                            ),
                          if (event.photoCount > 0 && event.videoCount > 0)
                            const SizedBox(width: 8),
                          if (event.videoCount > 0)
                            _Count(
                              icon: Icons.smart_display_rounded,
                              count: event.videoCount,
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

/// "📷 12" on an event's tile.
class _Count extends StatelessWidget {
  const _Count({required this.icon, required this.count});

  final IconData icon;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: Colors.white),
        const SizedBox(width: 4),
        Text(
          '$count',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}
