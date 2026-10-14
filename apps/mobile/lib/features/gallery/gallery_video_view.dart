import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../tracing_module/lesson_video.dart';
import 'gallery_ui.dart';

/// One of the school's videos, by its YouTube id.
class GalleryVideoItem {
  GalleryVideoItem({
    required this.id,
    required this.videoId,
    required this.thumbnailUrl,
    this.caption,
  });

  factory GalleryVideoItem.fromJson(Map<String, dynamic> json) {
    final videoId = json['videoId'] as String;
    return GalleryVideoItem(
      id: json['id'] as String,
      videoId: videoId,
      thumbnailUrl:
          json['thumbnailUrl'] as String? ??
          'https://i.ytimg.com/vi/$videoId/hqdefault.jpg',
      caption: json['caption'] as String?,
    );
  }

  final String id;
  final String videoId;

  /// YouTube's own still for it — public, so no sign-in is needed to show it.
  final String thumbnailUrl;
  final String? caption;
}

/// Opens a school video full screen, under [title].
Future<void> openGalleryVideo(
  BuildContext context,
  GalleryVideoItem video, {
  String? title,
}) => Navigator.of(context).push<void>(
  MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) =>
        GalleryVideoView(video: video, title: title ?? video.caption),
  ),
);

/// A school video, played from the school's YouTube channel.
///
/// The same player the tracing lessons use — YouTube's page underneath, our
/// own controls on top, so a tap never lands on a link out into YouTube —
/// without their rule about watching to the end: a family can skip about as
/// it likes.
///
/// Drawn to the designer's player: back and the title along the top with the
/// fullscreen button opposite, a gold progress bar, then play, the time and
/// the sound. A tap on the picture shows or hides them; while it plays they
/// step aside after a few seconds.
class GalleryVideoView extends StatefulWidget {
  const GalleryVideoView({required this.video, this.title, super.key});

  final GalleryVideoItem video;
  final String? title;

  @override
  State<GalleryVideoView> createState() => _GalleryVideoViewState();
}

class _GalleryVideoViewState extends State<GalleryVideoView> {
  late final LessonVideoController _video = LessonVideoController(
    videoId: widget.video.videoId,
    freeSeek: true,
  );

  bool _controlsShown = true;
  bool _fullscreen = false;
  bool _wasPlaying = false;
  Timer? _hide;

  @override
  void initState() {
    super.initState();
    _video.addListener(_changed);
  }

  void _changed() {
    if (!mounted) return;
    // Playing again after a pause: the controls make way shortly after.
    if (_video.playing && !_wasPlaying) _scheduleHide();
    _wasPlaying = _video.playing;
    setState(() {});
  }

  @override
  void dispose() {
    _hide?.cancel();
    _video
      ..removeListener(_changed)
      ..dispose();
    if (_fullscreen) unawaited(_restoreSystem());
    super.dispose();
  }

  void _scheduleHide() {
    _hide?.cancel();
    _hide = Timer(const Duration(seconds: 3), () {
      if (mounted && _video.playing) setState(() => _controlsShown = false);
    });
  }

  void _onSurfaceTap() {
    setState(() => _controlsShown = !_controlsShown);
    if (_controlsShown) _scheduleHide();
  }

  void _togglePlay() {
    _video.toggle();
    _scheduleHide();
  }

  Future<void> _setFullscreen(bool on) async {
    setState(() {
      _fullscreen = on;
      _controlsShown = true;
    });
    _scheduleHide();
    if (on) {
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
      await SystemChrome.setPreferredOrientations(const [
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
    } else {
      await _restoreSystem();
    }
  }

  Future<void> _restoreSystem() async {
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    await SystemChrome.setPreferredOrientations(const []);
  }

  @override
  Widget build(BuildContext context) {
    final shown = _controlsShown || !_video.playing;
    return PopScope(
      // Back in fullscreen leaves fullscreen, as in every player.
      canPop: !_fullscreen,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _fullscreen) unawaited(_setFullscreen(false));
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          fit: StackFit.expand,
          children: [
            Center(
              child: AspectRatio(
                aspectRatio: 16 / 9,
                child: _video.stuck
                    ? _Stuck(videoId: widget.video.videoId)
                    : LessonVideoSurface(
                        controller: _video,
                        onTap: _onSurfaceTap,
                      ),
              ),
            ),
            if (_video.stuck)
              SafeArea(
                child: Align(
                  alignment: Alignment.topLeft,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: GalleryRoundButton(
                      icon: 'back',
                      label: 'Back',
                      onTap: () => Navigator.of(context).maybePop(),
                    ),
                  ),
                ),
              )
            else
              IgnorePointer(
                ignoring: !shown,
                child: AnimatedOpacity(
                  opacity: shown ? 1 : 0,
                  duration: const Duration(milliseconds: 220),
                  child: _overlay(),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _overlay() {
    final duration = _video.duration;
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0x99000000),
            Colors.transparent,
            Colors.transparent,
            Color(0xB3000000),
          ],
          stops: [0, 0.22, 0.68, 1],
        ),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Column(
            children: [
              Row(
                children: [
                  GalleryRoundButton(
                    icon: 'back',
                    label: 'Back',
                    size: 40,
                    onTap: () => _fullscreen
                        ? unawaited(_setFullscreen(false))
                        : Navigator.of(context).maybePop(),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      widget.title ?? 'Video',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  _FrameButton(
                    tooltip: _fullscreen ? 'Leave fullscreen' : 'Fullscreen',
                    icon: _fullscreen
                        ? Icons.fullscreen_exit_rounded
                        : Icons.fullscreen_rounded,
                    onTap: () => unawaited(_setFullscreen(!_fullscreen)),
                  ),
                ],
              ),
              const Spacer(),
              SliderTheme(
                data: SliderTheme.of(context).copyWith(
                  trackHeight: 4,
                  activeTrackColor: GalleryInk.gold,
                  inactiveTrackColor: Colors.white24,
                  thumbColor: Colors.white,
                  overlayColor: Colors.white24,
                  thumbShape: const RoundSliderThumbShape(
                    enabledThumbRadius: 8,
                  ),
                ),
                child: Slider(
                  value: duration > 0
                      ? _video.position.clamp(0, duration).toDouble()
                      : 0,
                  max: duration > 0 ? duration : 1,
                  onChanged: duration > 0
                      ? (seconds) {
                          _video.seek(seconds);
                          _scheduleHide();
                        }
                      : null,
                ),
              ),
              Row(
                children: [
                  IconButton(
                    tooltip: _video.playing ? 'Pause' : 'Play',
                    onPressed: _togglePlay,
                    icon: GalleryIcon(
                      _video.playing ? 'pause' : 'play',
                      size: 28,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '${clock(_video.position)} / ${clock(duration)}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    tooltip: _video.muted ? 'Sound on' : 'Sound off',
                    onPressed: () {
                      _video.toggleMute();
                      _scheduleHide();
                    },
                    icon: _video.muted
                        ? const Icon(
                            Icons.volume_off_rounded,
                            color: Colors.white,
                            size: 28,
                          )
                        : const GalleryIcon(
                            'volume',
                            size: 28,
                            color: Colors.white,
                          ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The fullscreen button: a square outline over the picture, as drawn.
class _FrameButton extends StatelessWidget {
  const _FrameButton({
    required this.tooltip,
    required this.icon,
    required this.onTap,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.black26,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Colors.white38),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Icon(icon, color: Colors.white, size: 26),
          ),
        ),
      ),
    );
  }
}

/// The video will not play inside the app — embedding switched off on the
/// school's YouTube channel, or a phone whose WebView YouTube turns away.
class _Stuck extends StatelessWidget {
  const _Stuck({required this.videoId});

  final String videoId;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'This video will not play here.',
            style: TextStyle(color: Colors.white, fontSize: 16),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () => unawaited(openInYouTube(videoId)),
            icon: const Icon(Icons.open_in_new_rounded),
            label: const Text('Open in YouTube'),
          ),
        ],
      ),
    );
  }
}
