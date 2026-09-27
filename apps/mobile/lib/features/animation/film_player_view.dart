import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import '../../core/api/api_service.dart';
import '../../core/assets/app_assets.dart';
import '../../core/widgets/art.dart';
import 'chapter_done_view.dart';
import 'film_controllers.dart';
import 'film_widgets.dart';

/// What the WebView tells us about itself.
const _channel = 'PoetreeFilm';

/// Watches the real video element on YouTube's own embed page, and reports its
/// position twice a second so our own controls can draw a progress bar.
///
/// The same approach AnimationView proved: the embed page is loaded directly,
/// so the `<video>` element is ours to read and to drive. Play, pause, seek and
/// mute below are one line of script each against that element — YouTube's
/// JavaScript player API is what could never be made to work here.
///
/// YouTube's own title bar, pause overlay and end cards are hidden: the child
/// has our buttons, and those are exits into YouTube.
const _watcher =
    '''
(function () {
  if (window.__poetreeWatching) return;
  window.__poetreeWatching = true;

  var style = document.createElement('style');
  style.textContent = '.ytp-chrome-top,.ytp-pause-overlay,.ytp-watermark,' +
    '.ytp-gradient-top,.ytp-show-cards-title,.ytp-ce-element,' +
    '.ytp-endscreen-content,.ytp-chrome-bottom,.ytp-gradient-bottom,' +
    '.ytp-large-play-button{display:none!important}';
  (document.head || document.documentElement).appendChild(style);

  var reported = false;
  function tell(what) { $_channel.postMessage(what); }

  setInterval(function () {
    if (document.querySelector('.ytp-error, .ytp-error-content-wrap')) {
      tell('refused');
      return;
    }

    var video = document.querySelector('video');
    if (!video) return;

    if (!video.dataset.poetreeWatched) {
      video.dataset.poetreeWatched = '1';
      video.addEventListener('ended', function () {
        if (!reported) { reported = true; tell('ended'); }
      });
    }

    if (!video.paused && video.currentTime > 0) tell('playing');

    tell('tick:' + video.currentTime.toFixed(2) + ':' +
      (isFinite(video.duration) ? video.duration.toFixed(2) : '0') + ':' +
      (video.paused ? 1 : 0) + ':' + (video.muted ? 1 : 0));

    if (!reported && video.duration > 0 && video.duration - video.currentTime < 1) {
      reported = true;
      tell('ended');
    }
  }, 500);
})();
''';

/// One line of script against the page's video element.
String _onVideo(String body) =>
    "(function(){var v=document.querySelector('video');if(!v)return;$body})();";

/// The animation player.
///
/// Steps through one book's films in order: Previous and Next move between
/// chapters, and when a film ends it is recorded as watched and the child is
/// shown the chapter-complete screen, which carries on to the next one.
class FilmPlayerView extends StatefulWidget {
  const FilmPlayerView({
    required this.chapters,
    required this.playlist,
    required this.startIndex,
    this.start3d = false,
    super.key,
  });

  /// The book's chapter list, told about each film watched.
  final FilmChaptersController chapters;

  /// The chapters that have a film, in the book's order.
  final List<FilmChapter> playlist;
  final int startIndex;
  final bool start3d;

  @override
  State<FilmPlayerView> createState() => _FilmPlayerViewState();
}

class _FilmPlayerViewState extends State<FilmPlayerView> {
  late final WebViewController _web;
  late int _index = widget.startIndex;
  late bool _is3d = widget.start3d && _chapter.has3d;

  Timer? _startupWatch;
  Timer? _hideControls;

  bool _playing = false;
  bool _started = false;
  bool _paused = false;
  bool _muted = false;
  bool _finished = false;
  bool _saving = false;
  bool _stuck = false;
  bool _triedWatchPage = false;
  bool _fullscreen = false;
  bool _controlsShown = true;
  String? _error;

  double _position = 0;
  double _duration = 0;

  /// Where to pick up after switching between 2D and 3D, so the story does
  /// not start over.
  double? _resumeAt;

  /// Set while the child drags the progress bar, so the ticks from the page do
  /// not fight their thumb.
  double? _dragging;

  FilmChapter get _chapter => widget.playlist[_index];
  bool get _hasPrevious => _index > 0;
  bool get _hasNext => _index < widget.playlist.length - 1;
  String get _videoId =>
      (_is3d ? _chapter.film3d : _chapter.film2d)?.videoId ?? '';

  @override
  void initState() {
    super.initState();

    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      // A plain WebView identifies itself as one, and YouTube serves it
      // something other than the player it serves a phone browser.
      ..setUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      )
      ..setBackgroundColor(Colors.black)
      ..addJavaScriptChannel(_channel, onMessageReceived: _fromPage)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) => unawaited(_web.runJavaScript(_watcher)),
          onWebResourceError: (error) {
            if (error.isForMainFrame ?? false) {
              if (mounted) setState(() => _stuck = true);
            }
          },
        ),
      );

    final platform = _web.platform;
    if (platform is AndroidWebViewController) {
      unawaited(platform.setMediaPlaybackRequiresUserGesture(false));
    }

    _loadFilm();
  }

  /// Loads the current chapter's film, in 2D or 3D, from the start.
  void _loadFilm({bool keepPosition = false}) {
    _startupWatch?.cancel();
    _resumeAt = keepPosition && _position > 2 ? _position : null;

    setState(() {
      _playing = false;
      _started = false;
      _paused = false;
      _finished = false;
      _stuck = false;
      _triedWatchPage = false;
      _error = null;
      _position = keepPosition ? _position : 0;
      _duration = keepPosition ? _duration : 0;
    });

    unawaited(
      _web.loadRequest(
        Uri.parse(
          'https://www.youtube.com/embed/$_videoId'
          '?autoplay=1&playsinline=1&rel=0&modestbranding=1&controls=0'
          '&fs=0&iv_load_policy=3&disablekb=1',
        ),
        // Without a referrer the embed page refuses with error 153. See
        // AnimationView, where this was found.
        headers: const {'Referer': 'https://school.poetreepublications.com/'},
      ),
    );

    // Nothing playing after twelve seconds: try the ordinary watch page once,
    // then offer the way out.
    _startupWatch = Timer(const Duration(seconds: 12), () {
      if (!mounted || _started || _finished) return;
      if (_triedWatchPage) {
        setState(() => _stuck = true);
      } else {
        _tryWatchPage();
      }
    });
  }

  void _tryWatchPage() {
    _triedWatchPage = true;
    _startupWatch?.cancel();
    _startupWatch = Timer(const Duration(seconds: 12), () {
      if (mounted && !_started && !_finished) setState(() => _stuck = true);
    });
    unawaited(
      _web.loadRequest(Uri.parse('https://www.youtube.com/watch?v=$_videoId')),
    );
  }

  void _fromPage(JavaScriptMessage message) {
    if (!mounted) return;
    final text = message.message;

    if (text.startsWith('tick:')) {
      final parts = text.split(':');
      if (parts.length < 5) return;
      final position = double.tryParse(parts[1]) ?? 0;
      final duration = double.tryParse(parts[2]) ?? 0;
      final paused = parts[3] == '1';
      final muted = parts[4] == '1';
      if (_dragging != null) return;
      setState(() {
        _position = position;
        _duration = duration;
        _paused = paused;
        _muted = muted;
        _playing = !paused;
      });
      return;
    }

    if (text == 'refused') {
      if (!_triedWatchPage) {
        _tryWatchPage();
      } else if (!_stuck) {
        setState(() => _stuck = true);
      }
      return;
    }

    if (text == 'playing' && !_started) {
      _startupWatch?.cancel();
      setState(() {
        _started = true;
        _stuck = false;
      });
      final resume = _resumeAt;
      if (resume != null) {
        _resumeAt = null;
        _seek(resume);
      }
      _scheduleHide();
      return;
    }

    if (text == 'ended' && !_finished) {
      _finished = true;
      unawaited(_complete());
    }
  }

  void _play() => unawaited(_web.runJavaScript(_onVideo('v.play();')));

  void _pause() => unawaited(_web.runJavaScript(_onVideo('v.pause();')));

  void _togglePlay() {
    if (_paused || !_playing) {
      _play();
      setState(() {
        _paused = false;
        _playing = true;
      });
      _scheduleHide();
    } else {
      _pause();
      setState(() {
        _paused = true;
        _playing = false;
        _controlsShown = true;
      });
    }
  }

  void _seek(double seconds) {
    final to = seconds.clamp(0, _duration > 0 ? _duration : seconds);
    unawaited(
      _web.runJavaScript(_onVideo('v.currentTime=${to.toStringAsFixed(2)};')),
    );
    setState(() => _position = to.toDouble());
  }

  void _toggleMute() {
    final muted = !_muted;
    unawaited(_web.runJavaScript(_onVideo('v.muted=$muted;')));
    setState(() => _muted = muted);
  }

  void _goTo(int index) {
    if (index < 0 || index >= widget.playlist.length) return;
    setState(() {
      _index = index;
      _is3d = _is3d && _chapter.has3d;
    });
    _loadFilm();
  }

  void _switchMode(bool to3d) {
    if (to3d == _is3d) return;
    setState(() => _is3d = to3d);
    _loadFilm(keepPosition: true);
  }

  Future<void> _setFullscreen(bool on) async {
    setState(() {
      _fullscreen = on;
      _controlsShown = true;
    });
    if (on) {
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
      await SystemChrome.setPreferredOrientations(const [
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
      _scheduleHide();
    } else {
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      await SystemChrome.setPreferredOrientations(const []);
    }
  }

  /// In fullscreen the controls fade after a few seconds of playing, and come
  /// back with a tap.
  void _scheduleHide() {
    _hideControls?.cancel();
    if (!_fullscreen) return;
    _hideControls = Timer(const Duration(seconds: 3), () {
      if (mounted && _playing && _fullscreen) {
        setState(() => _controlsShown = false);
      }
    });
  }

  Future<void> _openOutside() async {
    final url = Uri.parse('https://www.youtube.com/watch?v=$_videoId');
    if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
      if (mounted) {
        setState(() => _error = 'Could not open YouTube on this device.');
      }
    }
  }

  /// Records the film as watched, then shows the chapter-complete screen.
  Future<void> _complete() async {
    final studentId = widget.chapters.studentId;
    if (studentId == null) return;

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await api.post<dynamic>(
        '/catalogue/chapters/${_chapter.id}/watched',
        body: {'studentId': studentId},
      );
      widget.chapters.markWatched(_chapter.id);
      _refreshBehind();
      if (!mounted) return;
      if (_fullscreen) await _setFullscreen(false);
      if (!mounted) return;

      // Replaces the player, so Back from the finished screen is the chapter
      // list rather than a film that already ended.
      unawaited(
        Get.off<void>(
          () => ChapterDoneView(
            chapters: widget.chapters,
            playlist: widget.playlist,
            index: _index,
            was3d: _is3d,
          ),
          transition: Transition.fadeIn,
        ),
      );
    } on DioException {
      if (!mounted) return;
      setState(() {
        _error =
            'Watched — but we could not tell the school. Try again when you have signal.';
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// The screens behind this one count films still to watch; they are
  /// refreshed quietly so their badges are right when the child goes back.
  void _refreshBehind() {
    if (Get.isRegistered<FilmBooksController>()) {
      unawaited(Get.find<FilmBooksController>().load());
    }
    if (Get.isRegistered<FilmSubjectsController>()) {
      unawaited(Get.find<FilmSubjectsController>().load());
    }
  }

  @override
  void dispose() {
    _startupWatch?.cancel();
    _hideControls?.cancel();
    if (_fullscreen) {
      unawaited(SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge));
      unawaited(SystemChrome.setPreferredOrientations(const []));
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      // Back in fullscreen leaves fullscreen, as it does in every player.
      canPop: !_fullscreen,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _fullscreen) unawaited(_setFullscreen(false));
      },
      child: Scaffold(
        backgroundColor: _fullscreen ? Colors.black : null,
        appBar: _fullscreen
            ? null
            : AppBar(
                title: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _chapter.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      widget.chapters.bookName,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
        // The video keeps the same place in the tree whether or not it is
        // fullscreen, so the page inside it is never torn down and reloaded
        // halfway through the story.
        body: SafeArea(
          top: !_fullscreen,
          bottom: !_fullscreen,
          left: !_fullscreen,
          right: !_fullscreen,
          child: LayoutBuilder(
            builder: (context, constraints) {
              final videoHeight = _fullscreen
                  ? constraints.maxHeight
                  : constraints.maxWidth * 9 / 16;

              return Column(
                children: [
                  SizedBox(
                    height: videoHeight,
                    width: constraints.maxWidth,
                    child: _video(),
                  ),
                  if (!_fullscreen) Expanded(child: _panel(context)),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _video() {
    return Stack(
      fit: StackFit.expand,
      children: [
        ColoredBox(
          color: Colors.black,
          child: WebViewWidget(controller: _web),
        ),
        // Until the film starts: a friendly loading card rather than black.
        if (!_started && !_stuck)
          const IgnorePointer(
            child: ColoredBox(
              color: Colors.black,
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(color: Colors.white),
                    SizedBox(height: 12),
                    Text(
                      'Getting the film ready…',
                      style: TextStyle(color: Colors.white70),
                    ),
                  ],
                ),
              ),
            ),
          ),
        // A layer over the page that takes every tap, so a tap never lands on
        // YouTube's own links. Tapping shows or hides our controls.
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {
              if (!_fullscreen) {
                _togglePlay();
                return;
              }
              setState(() => _controlsShown = !_controlsShown);
              if (_controlsShown) _scheduleHide();
            },
            onDoubleTap: () => unawaited(_setFullscreen(!_fullscreen)),
          ),
        ),
        if (_fullscreen)
          AnimatedOpacity(
            opacity: _controlsShown ? 1 : 0,
            duration: const Duration(milliseconds: 200),
            child: IgnorePointer(
              ignoring: !_controlsShown,
              child: _overlay(context),
            ),
          ),
        if (_saving)
          const ColoredBox(
            color: Colors.black54,
            child: Center(
              child: CircularProgressIndicator(color: Colors.white),
            ),
          ),
      ],
    );
  }

  /// Fullscreen's controls, over the film.
  Widget _overlay(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.black54, Colors.transparent, Colors.black87],
          stops: [0, 0.4, 1],
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
        child: Column(
          children: [
            Row(
              children: [
                IconButton(
                  onPressed: () => unawaited(_setFullscreen(false)),
                  icon: const Icon(Icons.arrow_back_rounded),
                  color: Colors.white,
                ),
                Expanded(
                  child: Text(
                    _chapter.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                ),
                if (_chapter.has3d)
                  _ModeSwitch(is3d: _is3d, onChanged: _switchMode, dark: true),
              ],
            ),
            const Spacer(),
            _Transport(
              playing: _playing && !_paused,
              hasPrevious: _hasPrevious,
              hasNext: _hasNext,
              onPrevious: () => _goTo(_index - 1),
              onNext: () => _goTo(_index + 1),
              onPlay: _togglePlay,
              dark: true,
            ),
            const Spacer(),
            _Scrubber(
              position: _dragging ?? _position,
              duration: _duration,
              onChanged: (value) => setState(() => _dragging = value),
              onChangeEnd: (value) {
                _dragging = null;
                _seek(value);
                _scheduleHide();
              },
              dark: true,
              trailing: [
                IconButton(
                  onPressed: _toggleMute,
                  icon: Icon(
                    _muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
                  ),
                  color: Colors.white,
                ),
                IconButton(
                  onPressed: () => unawaited(_setFullscreen(false)),
                  icon: const Icon(Icons.fullscreen_exit_rounded),
                  color: Colors.white,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Portrait's controls, under the film: big, round and spaced for small
  /// fingers.
  Widget _panel(BuildContext context) {
    final theme = Theme.of(context);
    final next = _hasNext ? widget.playlist[_index + 1] : null;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
      children: [
        _Scrubber(
          position: _dragging ?? _position,
          duration: _duration,
          onChanged: (value) => setState(() => _dragging = value),
          onChangeEnd: (value) {
            _dragging = null;
            _seek(value);
          },
          trailing: [
            IconButton.filledTonal(
              onPressed: _toggleMute,
              tooltip: _muted ? 'Sound on' : 'Sound off',
              icon: Icon(
                _muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
              ),
            ),
            const SizedBox(width: 6),
            IconButton.filledTonal(
              onPressed: () => unawaited(_setFullscreen(true)),
              tooltip: 'Full screen',
              icon: const Icon(Icons.fullscreen_rounded),
            ),
          ],
        ),
        const SizedBox(height: 8),
        _Transport(
          playing: _playing && !_paused,
          hasPrevious: _hasPrevious,
          hasNext: _hasNext,
          onPrevious: () => _goTo(_index - 1),
          onNext: () => _goTo(_index + 1),
          onPlay: _togglePlay,
        ),
        const SizedBox(height: 18),

        // Both films, as the pack's two banners: the one playing is lifted
        // and outlined, and tapping the other switches to it.
        if (_chapter.has3d) ...[
          Row(
            children: [
              Expanded(
                child: _ModeCard(
                  banner: AppBanners.animation2d,
                  label: '2D',
                  selected: !_is3d,
                  onTap: () => _switchMode(false),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _ModeCard(
                  banner: AppBanners.animation3d,
                  label: '3D',
                  selected: _is3d,
                  onTap: () => _switchMode(true),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
        ],

        Text(
          'Chapter ${_index + 1} of ${widget.playlist.length}',
          textAlign: TextAlign.center,
          style: theme.textTheme.labelMedium?.copyWith(
            color: FilmColors.violet,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          _chapter.name,
          textAlign: TextAlign.center,
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w800,
          ),
        ),

        if (next != null) ...[
          const SizedBox(height: 18),
          Material(
            color: FilmColors.sun.withValues(alpha: 0.16),
            borderRadius: BorderRadius.circular(18),
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: () => _goTo(_index + 1),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    const Icon(
                      Icons.skip_next_rounded,
                      color: Color(0xFFB9770E),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Up next: ${next.name}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],

        // A film that will not play must not be a dead end.
        if (_stuck && !_finished) ...[
          const SizedBox(height: 18),
          Text(
            'This film is not playing here.',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleSmall,
          ),
          const SizedBox(height: 6),
          Text(
            'Open it in YouTube, watch it together, then come back and tap '
            'below.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () => unawaited(_openOutside()),
            icon: const Icon(Icons.open_in_new_rounded),
            label: const Text('Open in YouTube'),
          ),
          TextButton(
            onPressed: _saving
                ? null
                : () {
                    _finished = true;
                    unawaited(_complete());
                  },
            child: const Text('We have watched it'),
          ),
        ],

        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(
            _error!,
            textAlign: TextAlign.center,
            style: TextStyle(color: theme.colorScheme.error, fontSize: 13),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _saving ? null : () => unawaited(_complete()),
            child: const Text('Try again'),
          ),
        ],
      ],
    );
  }
}

/// Previous · Play/Pause · Next.
class _Transport extends StatelessWidget {
  const _Transport({
    required this.playing,
    required this.hasPrevious,
    required this.hasNext,
    required this.onPrevious,
    required this.onNext,
    required this.onPlay,
    this.dark = false,
  });

  final bool playing;
  final bool hasPrevious;
  final bool hasNext;
  final VoidCallback onPrevious;
  final VoidCallback onNext;
  final VoidCallback onPlay;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final side = dark ? Colors.white : FilmColors.violet;

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        IconButton(
          onPressed: hasPrevious ? onPrevious : null,
          iconSize: 38,
          color: side,
          disabledColor: side.withValues(alpha: 0.3),
          tooltip: 'Previous chapter',
          icon: const Icon(Icons.skip_previous_rounded),
        ),
        const SizedBox(width: 18),
        GestureDetector(
          onTap: onPlay,
          child: Container(
            width: 76,
            height: 76,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(colors: FilmColors.banner),
              boxShadow: [
                BoxShadow(
                  color: FilmColors.pink.withValues(alpha: 0.4),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Icon(
              playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
              color: Colors.white,
              size: 44,
              semanticLabel: playing ? 'Pause' : 'Play',
            ),
          ),
        ),
        const SizedBox(width: 18),
        IconButton(
          onPressed: hasNext ? onNext : null,
          iconSize: 38,
          color: side,
          disabledColor: side.withValues(alpha: 0.3),
          tooltip: 'Next chapter',
          icon: const Icon(Icons.skip_next_rounded),
        ),
      ],
    );
  }
}

/// The progress bar, with the time gone and the time left.
class _Scrubber extends StatelessWidget {
  const _Scrubber({
    required this.position,
    required this.duration,
    required this.onChanged,
    required this.onChangeEnd,
    this.trailing = const [],
    this.dark = false,
  });

  final double position;
  final double duration;
  final ValueChanged<double> onChanged;
  final ValueChanged<double> onChangeEnd;
  final List<Widget> trailing;
  final bool dark;

  static String _clock(double seconds) {
    final s = seconds.isFinite ? seconds.round() : 0;
    return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final max = duration > 0 ? duration : 1.0;
    final value = position.clamp(0, max).toDouble();
    final text = TextStyle(
      fontSize: 12,
      fontWeight: FontWeight.w600,
      color: dark
          ? Colors.white
          : Theme.of(context).colorScheme.onSurfaceVariant,
    );

    return Row(
      children: [
        Text(_clock(value), style: text),
        Expanded(
          child: SliderTheme(
            data: SliderTheme.of(context).copyWith(
              trackHeight: 6,
              activeTrackColor: FilmColors.pink,
              inactiveTrackColor: dark
                  ? Colors.white24
                  : FilmColors.pink.withValues(alpha: 0.18),
              thumbColor: dark ? Colors.white : FilmColors.violet,
              overlayColor: FilmColors.pink.withValues(alpha: 0.15),
            ),
            child: Slider(
              value: value,
              max: max,
              onChanged: duration > 0 ? onChanged : null,
              onChangeEnd: duration > 0 ? onChangeEnd : null,
            ),
          ),
        ),
        Text(_clock(duration), style: text),
        const SizedBox(width: 6),
        ...trailing,
      ],
    );
  }
}

/// One of the two films, as its banner.
class _ModeCard extends StatelessWidget {
  const _ModeCard({
    required this.banner,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String banner;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AnimatedScale(
      duration: const Duration(milliseconds: 180),
      scale: selected ? 1 : 0.94,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 180),
        opacity: selected ? 1 : 0.6,
        child: Column(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                gradient: selected
                    ? const LinearGradient(colors: FilmColors.banner)
                    : null,
                borderRadius: BorderRadius.circular(18),
              ),
              child: ArtBanner(
                banner,
                semanticLabel: selected
                    ? '$label film, playing'
                    : 'Watch the $label film',
                onTap: onTap,
              ),
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (selected) ...[
                  const Icon(
                    Icons.check_circle_rounded,
                    size: 16,
                    color: FilmColors.violet,
                  ),
                  const SizedBox(width: 4),
                ],
                Text(
                  selected ? 'Playing $label' : 'Watch in $label',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: selected
                        ? FilmColors.violet
                        : Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// The 2D / 3D switch, shown only for a chapter that has both.
class _ModeSwitch extends StatelessWidget {
  const _ModeSwitch({
    required this.is3d,
    required this.onChanged,
    this.dark = false,
  });

  final bool is3d;
  final ValueChanged<bool> onChanged;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    Widget option(String label, bool value) {
      final selected = is3d == value;
      return GestureDetector(
        onTap: () => onChanged(value),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 9),
          decoration: BoxDecoration(
            gradient: selected
                ? const LinearGradient(colors: FilmColors.banner)
                : null,
            borderRadius: BorderRadius.circular(99),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              color: selected
                  ? Colors.white
                  : (dark ? Colors.white70 : FilmColors.violet),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: dark
            ? Colors.white.withValues(alpha: 0.14)
            : FilmColors.violet.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [option('2D', false), option('3D', true)],
      ),
    );
  }
}
