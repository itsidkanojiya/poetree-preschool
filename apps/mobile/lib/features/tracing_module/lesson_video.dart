import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

/// What the WebView tells us about itself.
const _channel = 'PoetreeLesson';

/// Watches the real `<video>` on YouTube's own embed page and reports its
/// position, so our own controls can draw everything. The same approach the
/// film player proved: the embed page loaded directly is the same origin as
/// this script, so the element is there to read and to drive.
///
/// YouTube's own chrome is hidden — its title bar, end screen and buttons are
/// all ways out into YouTube, and a four-year-old finds every one of them.
const _watcher =
    '''
(function () {
  if (window.__poetreeLesson) return;
  window.__poetreeLesson = true;

  var style = document.createElement('style');
  style.textContent = '.ytp-chrome-top,.ytp-pause-overlay,.ytp-watermark,' +
    '.ytp-gradient-top,.ytp-show-cards-title,.ytp-ce-element,' +
    '.ytp-endscreen-content,.ytp-chrome-bottom,.ytp-gradient-bottom,' +
    '.ytp-large-play-button,.ytp-spinner{display:none!important}';
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

    tell('tick:' + video.currentTime.toFixed(2) + ':' +
      (isFinite(video.duration) ? video.duration.toFixed(2) : '0') + ':' +
      (video.paused ? 1 : 0) + ':' + (video.muted ? 1 : 0));

    if (!reported && video.duration > 0 && video.duration - video.currentTime < 1) {
      reported = true;
      tell('ended');
    }
  }, 400);
})();
''';

String _onVideo(String body) =>
    "(function(){var v=document.querySelector('video');if(!v)return;$body})();";

/// The state of one lesson video, for the controls to draw and drive.
///
/// The video counts as watched only when it reaches its end. On a first
/// watch the progress bar cannot be dragged past the furthest point already
/// played — otherwise dragging to the end would be watching it.
class LessonVideoController extends ChangeNotifier {
  LessonVideoController({required this.videoId, required this.freeSeek});

  final String videoId;

  /// True once the video has been watched before: the bar then goes anywhere.
  bool freeSeek;

  double position = 0;
  double duration = 0;

  /// The furthest point actually played.
  double furthest = 0;

  bool started = false;
  bool paused = true;
  bool muted = false;
  bool ended = false;

  /// The video will not play here; the screen offers YouTube instead.
  bool stuck = false;

  /// Called once, when the video reaches its end.
  VoidCallback? onEnded;

  Future<void> Function(String script)? _run;

  bool get playing => started && !paused && !ended;

  void _js(String body) {
    final run = _run;
    if (run != null) unawaited(run(_onVideo(body)));
  }

  void play() {
    if (ended) {
      // Again from the start, which the end of a video means to a child.
      ended = false;
      position = 0;
      _js('v.currentTime=0;v.play();');
    } else {
      _js('v.play();');
    }
    paused = false;
    notifyListeners();
  }

  void pause() {
    _js('v.pause();');
    paused = true;
    notifyListeners();
  }

  void toggle() => playing ? pause() : play();

  /// Moves to [seconds] — no further than already watched on a first watch.
  void seek(double seconds) {
    final limit = freeSeek ? duration : furthest;
    final to = seconds.clamp(0, limit > 0 ? limit : 0).toDouble();
    _js('v.currentTime=${to.toStringAsFixed(2)};');
    position = to;
    notifyListeners();
  }

  void toggleMute() {
    muted = !muted;
    _js('v.muted=$muted;');
    notifyListeners();
  }

  /// A message from the page. Public so a test can play the part of YouTube.
  void handle(String message) {
    if (message.startsWith('tick:')) {
      final parts = message.split(':');
      if (parts.length < 5) return;
      position = double.tryParse(parts[1]) ?? position;
      duration = double.tryParse(parts[2]) ?? duration;
      paused = parts[3] == '1';
      muted = parts[4] == '1';
      if (!paused && position > 0) started = true;
      // Our seeks are clamped before they are sent and YouTube's own controls
      // are covered, so a position past the line can only be playback.
      if (position > furthest) furthest = position;
      if (stuck && started) stuck = false;
      notifyListeners();
      return;
    }
    if (message == 'ended' && !ended) {
      ended = true;
      paused = true;
      furthest = duration;
      position = duration;
      notifyListeners();
      onEnded?.call();
      return;
    }
    if (message == 'stuck' && !started) {
      stuck = true;
      notifyListeners();
    }
  }
}

/// The video itself: YouTube's page in a WebView, with a layer over it that
/// takes every tap so none land on YouTube's own links.
class LessonVideoSurface extends StatefulWidget {
  const LessonVideoSurface({
    required this.controller,
    required this.onTap,
    super.key,
  });

  final LessonVideoController controller;
  final VoidCallback onTap;

  @override
  State<LessonVideoSurface> createState() => _LessonVideoSurfaceState();
}

class _LessonVideoSurfaceState extends State<LessonVideoSurface> {
  late final WebViewController _web;
  Timer? _startupWatch;
  bool _triedWatchPage = false;

  LessonVideoController get _video => widget.controller;

  @override
  void initState() {
    super.initState();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      // A plain WebView identifies itself as one, and YouTube serves it
      // something other than the player a phone browser gets.
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
            if (error.isForMainFrame ?? false) _video.handle('stuck');
          },
        ),
      )
      ..loadRequest(
        Uri.parse(
          'https://www.youtube.com/embed/${_video.videoId}'
          '?autoplay=1&playsinline=1&rel=0&modestbranding=1&controls=0'
          '&fs=0&iv_load_policy=3&disablekb=1',
        ),
        // Without a referrer the embed page refuses with error 153.
        headers: const {'Referer': 'https://school.poetreepublications.com/'},
      );

    final platform = _web.platform;
    if (platform is AndroidWebViewController) {
      unawaited(platform.setMediaPlaybackRequiresUserGesture(false));
    }

    _video._run = _web.runJavaScript;
    _video.paused = false;

    // Nothing playing after twelve seconds: the ordinary watch page once,
    // then the way out.
    _startupWatch = Timer(const Duration(seconds: 12), () {
      if (!mounted || _video.started) return;
      if (_triedWatchPage) {
        _video.handle('stuck');
      } else {
        _tryWatchPage();
      }
    });
  }

  void _tryWatchPage() {
    _triedWatchPage = true;
    _startupWatch?.cancel();
    _startupWatch = Timer(const Duration(seconds: 12), () {
      if (mounted && !_video.started) _video.handle('stuck');
    });
    unawaited(
      _web.loadRequest(
        Uri.parse('https://www.youtube.com/watch?v=${_video.videoId}'),
      ),
    );
  }

  void _fromPage(JavaScriptMessage message) {
    if (!mounted) return;
    if (message.message == 'refused') {
      if (!_triedWatchPage) {
        _tryWatchPage();
      } else {
        _video.handle('stuck');
      }
      return;
    }
    _video.handle(message.message);
  }

  @override
  void dispose() {
    _startupWatch?.cancel();
    _video._run = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        ColoredBox(
          color: Colors.black,
          child: WebViewWidget(controller: _web),
        ),
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: widget.onTap,
          ),
        ),
      ],
    );
  }
}

/// Opens the video in the YouTube app, for a phone that will not play it here.
Future<bool> openInYouTube(String videoId) => launchUrl(
  Uri.parse('https://www.youtube.com/watch?v=$videoId'),
  mode: LaunchMode.externalApplication,
);

/// "0:32".
String clock(double seconds) {
  final total = seconds.isFinite ? seconds.round() : 0;
  final minutes = total ~/ 60;
  final rest = total % 60;
  return '$minutes:${rest.toString().padLeft(2, '0')}';
}
