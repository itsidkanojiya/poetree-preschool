import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_service.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/authed_image.dart';
import '../../core/widgets/squish.dart';
import 'gallery_ui.dart';
import 'gallery_view.dart';

/// Every event this child's family can see, as albums: the cover, the name
/// and how many things are in it. Choosing one goes back to the media screen
/// showing that album.
///
/// The same list the gallery's first screen shows, from the same place — the
/// server decides which events a family sees; nothing is filtered here.
class GalleryAlbumsView extends StatefulWidget {
  const GalleryAlbumsView({
    required this.studentId,
    this.currentEventId,
    super.key,
  });

  final String? studentId;

  /// The album the media screen is showing, marked so a family sees where
  /// they came from.
  final String? currentEventId;

  @override
  State<GalleryAlbumsView> createState() => _GalleryAlbumsViewState();
}

class _GalleryAlbumsViewState extends State<GalleryAlbumsView> {
  List<GalleryEventItem> _albums = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final studentId = widget.studentId;
    if (studentId == null) {
      setState(() => _loading = false);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await api.get<List<dynamic>>(
        '/me/children/$studentId/gallery',
      );
      _albums = rows
          .whereType<Map<String, dynamic>>()
          .map(GalleryEventItem.fromJson)
          .toList();
    } on DioException catch (e) {
      final payload = e.response?.data;
      _error = payload is Map && payload['error'] is Map
          ? (payload['error'] as Map)['message']?.toString() ??
                'Could not load the albums.'
          : 'Cannot reach the school right now.';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: GalleryBackdrop(
        child: SafeArea(
          bottom: false,
          child: Column(
            children: [
              const GalleryHeader(title: 'Albums'),
              Expanded(
                child: AsyncView(
                  isLoading: _loading,
                  error: _error,
                  isEmpty: false,
                  onRetry: _load,
                  builder: (context) => RefreshIndicator(
                    onRefresh: _load,
                    child: _albums.isEmpty
                        ? const GalleryEmptyState(
                            title: 'No albums yet',
                            message:
                                'Albums from school events will appear here once they are shared.',
                          )
                        : GridView.builder(
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
                            gridDelegate:
                                const SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 2,
                                  mainAxisSpacing: 14,
                                  crossAxisSpacing: 14,
                                  childAspectRatio: 0.82,
                                ),
                            itemCount: _albums.length,
                            itemBuilder: (context, index) {
                              final album = _albums[index];
                              return _AlbumCard(
                                album: album,
                                current: album.id == widget.currentEventId,
                                onTap: () =>
                                    Navigator.of(context).pop(album.id),
                              );
                            },
                          ),
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

/// An album: its cover, its name, and how many photos and videos.
class _AlbumCard extends StatelessWidget {
  const _AlbumCard({
    required this.album,
    required this.current,
    required this.onTap,
  });

  final GalleryEventItem album;
  final bool current;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final items = album.photoCount + album.videoCount;
    final cover = album.cover;
    final coverVideo = album.coverVideo;

    return Semantics(
      button: true,
      selected: current,
      label: '${album.name}, $items ${items == 1 ? 'item' : 'items'}',
      child: Squish(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: current ? GalleryInk.violet : Colors.transparent,
              width: 2,
            ),
            boxShadow: GalleryInk.lift(),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: SizedBox(
                  width: double.infinity,
                  child: cover != null
                      ? AuthedImage(path: cover.thumbPath)
                      : coverVideo != null
                      ? Image.network(
                          coverVideo.thumbnailUrl,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => const _NoCover(),
                        )
                      : const _NoCover(),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      album.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: GalleryInk.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '$items ${items == 1 ? 'item' : 'items'}',
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(color: GalleryInk.muted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NoCover extends StatelessWidget {
  const _NoCover();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: Color(0xFFE9E2FB),
      child: Center(
        child: GalleryIcon('album', size: 36, color: GalleryInk.violet),
      ),
    );
  }
}
