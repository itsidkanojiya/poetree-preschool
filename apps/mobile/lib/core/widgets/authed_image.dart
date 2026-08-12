import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../api/api_service.dart';

/// An image behind the API's authorisation.
///
/// `/files/:id` needs a bearer token, so `Image.network` cannot fetch it, and
/// handing headers to a caching image widget goes stale the moment the token
/// rotates. Going through [ApiClient] means the refresh interceptor covers
/// pictures exactly as it covers everything else.
///
/// Bytes are held in a small process-wide map so scrolling a list of
/// submissions does not refetch the same photograph. A preschool opens a
/// handful a day, so the cache is capped rather than managed.
class AuthedImage extends StatefulWidget {
  const AuthedImage({
    required this.path,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    super.key,
  });

  /// The API path, e.g. `/files/abc123`.
  final String path;
  final BoxFit fit;
  final double? width;
  final double? height;

  @override
  State<AuthedImage> createState() => _AuthedImageState();
}

/// Bounded so a long session cannot grow it without limit.
const _cacheLimit = 40;
final _cache = <String, Uint8List>{};

class _AuthedImageState extends State<AuthedImage> {
  Uint8List? _bytes;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(AuthedImage old) {
    super.didUpdateWidget(old);
    if (old.path != widget.path) _load();
  }

  Future<void> _load() async {
    final cached = _cache[widget.path];
    if (cached != null) {
      setState(() {
        _bytes = cached;
        _failed = false;
      });
      return;
    }

    setState(() {
      _bytes = null;
      _failed = false;
    });

    try {
      final data = await api.bytes(widget.path);
      if (!mounted) return;

      if (_cache.length >= _cacheLimit) _cache.remove(_cache.keys.first);
      _cache[widget.path] = data;

      setState(() => _bytes = data);
    } on Object {
      if (!mounted) return;
      setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    if (_failed) {
      return _Frame(
        width: widget.width,
        height: widget.height,
        child: InkWell(
          onTap: _load,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.refresh_rounded, size: 20, color: colors.outline),
              const SizedBox(height: 4),
              Text(
                'Tap to retry',
                style: TextStyle(fontSize: 11, color: colors.outline),
              ),
            ],
          ),
        ),
      );
    }

    if (_bytes == null) {
      return _Frame(
        width: widget.width,
        height: widget.height,
        child: const Center(
          child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }

    return Image.memory(
      _bytes!,
      fit: widget.fit,
      width: widget.width,
      height: widget.height,
      // A photograph that will not decode should not take the screen with it.
      errorBuilder: (context, _, _) => _Frame(
        width: widget.width,
        height: widget.height,
        child: Icon(Icons.broken_image_outlined, color: colors.outline),
      ),
    );
  }
}

class _Frame extends StatelessWidget {
  const _Frame({required this.child, this.width, this.height});

  final Widget child;
  final double? width;
  final double? height;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: child,
    );
  }
}

/// Opens a photograph full screen, where a teacher can actually judge it.
Future<void> showPhoto(BuildContext context, String path, {String? caption}) {
  return showDialog<void>(
    context: context,
    barrierColor: Colors.black87,
    builder: (context) => Dialog(
      insetPadding: const EdgeInsets.all(12),
      backgroundColor: Colors.transparent,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              // Pinch and pan: a child's pencil lines are the thing being
              // looked at, and they are faint.
              child: InteractiveViewer(
                maxScale: 5,
                child: AuthedImage(path: path, fit: BoxFit.contain),
              ),
            ),
          ),
          if (caption != null) ...[
            const SizedBox(height: 10),
            Text(
              caption,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontSize: 13),
            ),
          ],
          const SizedBox(height: 10),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            style: TextButton.styleFrom(foregroundColor: Colors.white),
            child: const Text('Close'),
          ),
        ],
      ),
    ),
  );
}
