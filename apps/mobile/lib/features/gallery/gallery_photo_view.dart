import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:gal/gal.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api/api_service.dart';
import '../../core/widgets/authed_image.dart';
import 'gallery_ui.dart';
import 'gallery_view.dart';

/// Opens an event's photos full screen at [index].
Future<void> openGalleryPhotos(
  BuildContext context,
  List<GalleryPhotoItem> photos,
  int index,
) => Navigator.of(context).push<void>(
  MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) => GalleryPhotoView(photos: photos, initialIndex: index),
  ),
);

/// One photo at a time, the whole screen, swiping on to the next: "5 / 24"
/// along the top, Share and Download along the bottom.
///
/// The photo itself, not the small copy the grid showed — this is the one
/// place a family sees it full size. Pinch to look closer.
class GalleryPhotoView extends StatefulWidget {
  const GalleryPhotoView({
    required this.photos,
    required this.initialIndex,
    super.key,
  });

  final List<GalleryPhotoItem> photos;
  final int initialIndex;

  @override
  State<GalleryPhotoView> createState() => _GalleryPhotoViewState();
}

class _GalleryPhotoViewState extends State<GalleryPhotoView> {
  late final PageController _pages = PageController(
    initialPage: widget.initialIndex,
  );
  late int _index = widget.initialIndex;

  /// Share or Download working, so a second tap does not start a second one.
  String? _busy;

  GalleryPhotoItem get _photo => widget.photos[_index];

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  Future<Uint8List> _bytes() => api.bytes(_photo.path);

  Future<void> _share() => _run('share', () async {
    final bytes = await _bytes();
    final folder = await getTemporaryDirectory();
    final file = File(
      '${folder.path}/poetree-photo-${_photo.id}.${_extension(bytes)}',
    );
    await file.writeAsBytes(bytes, flush: true);
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path, mimeType: _mime(bytes))],
        text: _photo.caption,
      ),
    );
    return null;
  });

  Future<void> _download() => _run('download', () async {
    final bytes = await _bytes();
    if (!await Gal.hasAccess()) await Gal.requestAccess();
    await Gal.putImageBytes(
      bytes,
      name: 'poetree-photo-${_photo.id}',
      album: 'Poetree',
    );
    return 'Saved to your phone’s gallery.';
  });

  /// Runs Share or Download, and says how it went.
  Future<void> _run(String what, Future<String?> Function() work) async {
    if (_busy != null) return;
    setState(() => _busy = what);
    String? message;
    try {
      message = await work();
    } on GalException catch (e) {
      message = e.type == GalExceptionType.accessDenied
          ? 'Allow Poetree to save photos in your phone’s settings, then try again.'
          : 'The photo could not be saved.';
    } on DioException {
      message = 'Could not reach the school. Try again when you have signal.';
    } on Exception {
      message = what == 'share'
          ? 'The photo could not be shared.'
          : 'The photo could not be saved.';
    } finally {
      if (mounted) setState(() => _busy = null);
    }
    if (message != null && mounted) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final caption = _photo.caption;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PageView.builder(
            controller: _pages,
            itemCount: widget.photos.length,
            onPageChanged: (index) => setState(() => _index = index),
            itemBuilder: (context, index) => InteractiveViewer(
              maxScale: 4,
              child: Center(
                child: AuthedImage(
                  path: widget.photos[index].path,
                  fit: BoxFit.contain,
                ),
              ),
            ),
          ),
          // Shade top and bottom, so white controls read over any photo.
          const Positioned.fill(
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Color(0x99000000),
                      Colors.transparent,
                      Colors.transparent,
                      Color(0xB3000000),
                    ],
                    stops: [0, 0.18, 0.72, 1],
                  ),
                ),
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Row(
                    children: [
                      GalleryRoundButton(
                        icon: 'back',
                        label: 'Back',
                        onTap: () => Navigator.of(context).maybePop(),
                      ),
                      Expanded(
                        child: Text(
                          '${_index + 1} / ${widget.photos.length}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      // Balances the back button, so the count sits centred.
                      const SizedBox(width: 44),
                    ],
                  ),
                ),
                const Spacer(),
                if (caption != null && caption.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
                    child: Text(
                      caption,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 4, 24, 12),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _Action(
                        icon: 'share',
                        label: 'Share',
                        busy: _busy == 'share',
                        onTap: () => unawaited(_share()),
                      ),
                      _Action(
                        icon: 'download',
                        label: 'Download',
                        busy: _busy == 'download',
                        onTap: () => unawaited(_download()),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Share or Download: an icon over its word, white on the photo.
class _Action extends StatelessWidget {
  const _Action({
    required this.icon,
    required this.label,
    required this.busy,
    required this.onTap,
  });

  final String icon;
  final String label;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: InkResponse(
        onTap: busy ? null : onTap,
        radius: 40,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: 28,
                height: 28,
                child: busy
                    ? const Padding(
                        padding: EdgeInsets.all(4),
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Colors.white,
                        ),
                      )
                    : GalleryIcon(icon, size: 28, color: Colors.white),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// What the photo is, from its first bytes — the server keeps JPEG, PNG and
/// WebP, and a share sheet wants the right name on each.
String _mime(Uint8List bytes) {
  if (bytes.length > 3 && bytes[0] == 0x89 && bytes[1] == 0x50) {
    return 'image/png';
  }
  if (bytes.length > 11 && bytes[8] == 0x57 && bytes[9] == 0x45) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

String _extension(Uint8List bytes) => switch (_mime(bytes)) {
  'image/png' => 'png',
  'image/webp' => 'webp',
  _ => 'jpg',
};
