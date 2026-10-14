import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_service.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/authed_image.dart';
import '../tracing_module/lesson_video.dart';
import 'gallery_albums_view.dart';
import 'gallery_photo_view.dart';
import 'gallery_ui.dart';
import 'gallery_video_view.dart';
import 'gallery_view.dart';

/// Which of an event's things are showing.
enum GalleryFilter { all, photos, videos }

/// One event's photos and videos.
///
/// The event can change under it: the albums screen opened from here hands
/// back another event, and this one shows that instead — so a family moves
/// from album to album without the screens piling up.
class GalleryEventController extends GetxController {
  GalleryEventController({required this.studentId, required this.eventId});

  final String? studentId;
  String? eventId;

  final event = Rxn<GalleryEventItem>();
  final isLoading = true.obs;
  final error = RxnString();
  final filter = GalleryFilter.all.obs;

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
      final payload = e.response?.data;
      error.value = payload is Map && payload['error'] is Map
          ? (payload['error'] as Map)['message']?.toString() ??
                'Could not open this event.'
          : 'Cannot reach the school right now.';
    } finally {
      isLoading.value = false;
    }
  }

  /// Another album, chosen on the albums screen.
  Future<void> open(String id) async {
    if (id == eventId) return;
    eventId = id;
    event.value = null;
    filter.value = GalleryFilter.all;
    await load();
  }
}

/// An event's photos and videos, drawn to the designer's media grid.
///
/// "All", "Photos" and "Videos" along the top with their counts. All and
/// Photos are a grid of small copies under the event's month; Videos is the
/// video list. A photo opens full screen, a video in the player; the albums
/// button opens every other event.
class GalleryEventView extends GetView<GalleryEventController> {
  const GalleryEventView({required this.title, super.key});

  /// The event's name as the gallery list knew it, until the event loads.
  final String title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: GalleryBackdrop(
        child: SafeArea(
          bottom: false,
          child: Obx(() {
            final event = controller.event.value;
            // Read here, where Obx sees it, so a chip's tap redraws the screen.
            final filter = controller.filter.value;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GalleryHeader(
                  title: event?.name ?? title,
                  trailing: GalleryRoundButton(
                    icon: 'album',
                    label: 'Albums',
                    onTap: () => unawaited(_openAlbums(context)),
                  ),
                ),
                if (event != null)
                  _Filters(
                    event: event,
                    filter: filter,
                    onChoose: (chosen) => controller.filter.value = chosen,
                  ),
                Expanded(
                  child: AsyncView(
                    isLoading: controller.isLoading.value,
                    error: controller.error.value,
                    isEmpty: false,
                    onRetry: controller.load,
                    builder: (context) => event == null
                        ? const GalleryEmptyState()
                        : RefreshIndicator(
                            onRefresh: controller.load,
                            child: _Body(event: event, filter: filter),
                          ),
                  ),
                ),
              ],
            );
          }),
        ),
      ),
    );
  }

  Future<void> _openAlbums(BuildContext context) async {
    final chosen = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => GalleryAlbumsView(
          studentId: controller.studentId,
          currentEventId: controller.eventId,
        ),
      ),
    );
    if (chosen != null) await controller.open(chosen);
  }
}

class _Filters extends StatelessWidget {
  const _Filters({
    required this.event,
    required this.filter,
    required this.onChoose,
  });

  final GalleryEventItem event;
  final GalleryFilter filter;
  final ValueChanged<GalleryFilter> onChoose;

  @override
  Widget build(BuildContext context) {
    final photos = event.photos.length;
    final videos = event.videos.length;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 10),
      child: Row(
        children: [
          GalleryFilterChip(
            label: 'All (${photos + videos})',
            selected: filter == GalleryFilter.all,
            color: GalleryInk.violet,
            onTap: () => onChoose(GalleryFilter.all),
          ),
          const SizedBox(width: 10),
          GalleryFilterChip(
            label: 'Photos ($photos)',
            selected: filter == GalleryFilter.photos,
            color: GalleryInk.apricot,
            onTap: () => onChoose(GalleryFilter.photos),
          ),
          const SizedBox(width: 10),
          GalleryFilterChip(
            label: 'Videos ($videos)',
            selected: filter == GalleryFilter.videos,
            color: GalleryInk.rose,
            onTap: () => onChoose(GalleryFilter.videos),
          ),
        ],
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.event, required this.filter});

  final GalleryEventItem event;
  final GalleryFilter filter;

  @override
  Widget build(BuildContext context) {
    switch (filter) {
      case GalleryFilter.videos:
        return event.videos.isEmpty
            ? const GalleryEmptyState(
                title: 'No videos yet',
                message: 'Videos from this event will appear here.',
              )
            : _VideoList(event: event);
      case GalleryFilter.photos:
        return event.photos.isEmpty
            ? const GalleryEmptyState(
                title: 'No photos yet',
                message: 'Photos from this event will appear here.',
              )
            : _MediaGrid(event: event, showVideos: false);
      case GalleryFilter.all:
        return event.photos.isEmpty && event.videos.isEmpty
            ? const GalleryEmptyState()
            : _MediaGrid(event: event, showVideos: true);
    }
  }
}

/// The media grid: three across, videos first with a play button, then the
/// photos as small copies, under the month the event was in.
class _MediaGrid extends StatelessWidget {
  const _MediaGrid({required this.event, required this.showVideos});

  final GalleryEventItem event;
  final bool showVideos;

  @override
  Widget build(BuildContext context) {
    final videos = showVideos ? event.videos : const <GalleryVideoItem>[];
    final date = event.eventDate;
    final description = event.description;

    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        if (date != null || (description != null && description.isNotEmpty))
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 10),
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (date != null)
                    Text(
                      DateFormat('MMMM yyyy').format(date),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: GalleryInk.ink,
                      ),
                    ),
                  if (description != null && description.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      description,
                      style: Theme.of(
                        context,
                      ).textTheme.bodyMedium?.copyWith(color: GalleryInk.muted),
                    ),
                  ],
                ],
              ),
            ),
          ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 28),
          sliver: SliverGrid.builder(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
            ),
            itemCount: videos.length + event.photos.length,
            itemBuilder: (context, index) {
              if (index < videos.length) {
                final video = videos[index];
                return _VideoCell(
                  video: video,
                  onTap: () => unawaited(
                    openGalleryVideo(
                      context,
                      video,
                      title: video.caption ?? event.name,
                    ),
                  ),
                );
              }
              final photoIndex = index - videos.length;
              final photo = event.photos[photoIndex];
              return Semantics(
                button: true,
                label: photo.caption ?? 'Photo ${photoIndex + 1}',
                child: GestureDetector(
                  onTap: () => unawaited(
                    openGalleryPhotos(context, event.photos, photoIndex),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    // The small copy; the photo itself loads full screen.
                    child: AuthedImage(path: photo.thumbPath),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// A video in the grid: YouTube's still, a play button, and the video mark in
/// the corner.
class _VideoCell extends StatelessWidget {
  const _VideoCell({required this.video, required this.onTap});

  final GalleryVideoItem video;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: video.caption ?? 'Play video',
      child: GestureDetector(
        onTap: onTap,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.network(
                video.thumbnailUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) =>
                    const ColoredBox(color: GalleryInk.ink),
              ),
              const ColoredBox(color: Color(0x33000000)),
              const Center(child: _PlayDot(size: 36)),
              Positioned(
                left: 6,
                bottom: 6,
                child: Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const GalleryIcon(
                    'video',
                    size: 14,
                    color: Colors.white,
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

/// The white play button over a still.
class _PlayDot extends StatelessWidget {
  const _PlayDot({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      padding: EdgeInsets.only(left: size * 0.06),
      child: GalleryIcon('play', size: size * 0.5, color: GalleryInk.ink),
    );
  }
}

/// The video list: each video's still, its name and the event's date, and a
/// menu to play it here or in YouTube.
class _VideoList extends StatelessWidget {
  const _VideoList({required this.event});

  final GalleryEventItem event;

  @override
  Widget build(BuildContext context) {
    final date = event.dateLabel;
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
      itemCount: event.videos.length,
      separatorBuilder: (_, _) =>
          const Divider(height: 1, color: GalleryInk.line),
      itemBuilder: (context, index) {
        final video = event.videos[index];
        final name = video.caption ?? '${event.name} — video ${index + 1}';
        void play() => unawaited(openGalleryVideo(context, video, title: name));

        return InkWell(
          onTap: play,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: SizedBox(
                    width: 112,
                    height: 72,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        Image.network(
                          video.thumbnailUrl,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) =>
                              const ColoredBox(color: GalleryInk.ink),
                        ),
                        const ColoredBox(color: Color(0x33000000)),
                        const Center(child: _PlayDot(size: 32)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: GalleryInk.ink,
                        ),
                      ),
                      if (date != null) ...[
                        const SizedBox(height: 4),
                        Text(
                          date,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: GalleryInk.muted),
                        ),
                      ],
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'More',
                  onPressed: () => unawaited(
                    _videoMenu(context, video: video, name: name, play: play),
                  ),
                  // Upright, as the design draws it; the icon is drawn lying down.
                  icon: const RotatedBox(
                    quarterTurns: 1,
                    child: GalleryIcon('more', size: 22, color: GalleryInk.ink),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _videoMenu(
    BuildContext context, {
    required GalleryVideoItem video,
    required String name,
    required VoidCallback play,
  }) => showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(sheet).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: GalleryInk.ink,
              ),
            ),
          ),
          ListTile(
            leading: const GalleryIcon('play', color: GalleryInk.ink),
            title: const Text('Play'),
            onTap: () {
              Navigator.pop(sheet);
              play();
            },
          ),
          ListTile(
            leading: const Icon(Icons.open_in_new_rounded),
            title: const Text('Open in YouTube'),
            onTap: () {
              Navigator.pop(sheet);
              unawaited(openInYouTube(video.videoId));
            },
          ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}
