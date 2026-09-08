import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import '../../core/api/api_service.dart';

/// What the WebView tells us about itself.
const _channel = 'PoetreeFilm';

/// Watches the real video element on YouTube's own embed page.
///
/// This is only possible because the page is loaded directly rather than put
/// inside an iframe of our own: our script and the player are the same origin,
/// so the `<video>` element is simply there to be read. Through an iframe it
/// would be unreachable, which is what the JavaScript player API exists to work
/// around — and that API is what could never be made to work here.
///
/// Polled rather than purely event-driven because the element does not exist
/// when the page first loads, and a listener attached to nothing is silent
/// forever.
const _watcher = '''
(function () {
  var reported = false;
  function tell(what) { $_channel.postMessage(what); }

  setInterval(function () {
    var video = document.querySelector('video');
    if (!video) return;

    if (!video.dataset.poetreeWatched) {
      video.dataset.poetreeWatched = '1';
      video.addEventListener('ended', function () {
        if (!reported) { reported = true; tell('ended'); }
      });
    }

    if (!video.paused && video.currentTime > 0) tell('playing');

    // A film the child scrubbed to the end of, or one whose 'ended' event the
    // page swallowed: within a second of the end counts as watched.
    if (!reported && video.duration > 0 && video.duration - video.currentTime < 1) {
      reported = true;
      tell('ended');
    }
  }, 700);
})();
''';

/// The animation a child watches before a chapter's activities open.
///
/// Played inside the app rather than handed to YouTube: this is the only way to
/// know the film actually reached the end rather than a four-year-old tapping
/// away from it, and it keeps them out of YouTube's recommendations.
///
/// It loads YouTube's own embed page straight into a WebView. It used to build
/// a page of our own around YouTube's JavaScript player, and that could not be
/// made to work: the player wants an origin, the package that wrapped it fed
/// the same value to the origin, the page's base URL and the host it loads the
/// player from, and no single value is right for all three. Every combination
/// was refused, each with a different code, on videos YouTube's own oEmbed
/// service was happily handing out embed iframes for. Loading the page itself
/// removes the negotiation rather than winning it.
class AnimationView extends StatefulWidget {
  const AnimationView({
    required this.videoId,
    required this.chapterId,
    required this.chapterName,
    required this.studentId,
    super.key,
  });

  final String videoId;
  final String chapterId;
  final String chapterName;
  final String studentId;

  @override
  State<AnimationView> createState() => _AnimationViewState();
}

class _AnimationViewState extends State<AnimationView> {
  late final WebViewController _web;
  Timer? _startupWatch;
  bool _finished = false;
  bool _saving = false;
  bool _stuck = false;
  bool _playing = false;
  String? _error;

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
            // Only the page itself failing counts. An advert or a font that
            // did not load is not a film that will not play.
            if (error.isForMainFrame ?? false) {
              if (mounted) setState(() => _stuck = true);
            }
          },
        ),
      )
      ..loadRequest(
        Uri.parse(
          'https://www.youtube.com/embed/${widget.videoId}'
          '?autoplay=1&playsinline=1&rel=0&modestbranding=1',
        ),
      );

    // Autoplay without a tap, which is the point at this age.
    final platform = _web.platform;
    if (platform is AndroidWebViewController) {
      platform.setMediaPlaybackRequiresUserGesture(false);
    }

    /// Nothing playing after twelve seconds counts as stuck.
    ///
    /// A film can fail without any error the app can see: YouTube draws its own
    /// "video unavailable" card inside the page and everything below reports
    /// success. That is a dead end — the chapter never opens and there is
    /// nothing on screen to try — so this offers the way out instead.
    _startupWatch = Timer(const Duration(seconds: 12), () {
      if (mounted && !_playing && !_finished) setState(() => _stuck = true);
    });
  }

  void _fromPage(JavaScriptMessage message) {
    if (!mounted) return;

    if (message.message == 'playing' && !_playing) {
      _startupWatch?.cancel();
      setState(() {
        _playing = true;
        _stuck = false;
      });
      return;
    }

    if (message.message == 'ended' && !_finished) {
      _finished = true;
      unawaited(_unlock());
    }
  }

  /// Opens the film in YouTube, for a device that will not play it here.
  Future<void> _openOutside() async {
    final url = Uri.parse('https://www.youtube.com/watch?v=${widget.videoId}');
    if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
      if (mounted) {
        setState(() => _error = 'Could not open YouTube on this device.');
      }
    }
  }

  /// Tells the school this child has watched it, then lets them through.
  Future<void> _unlock() async {
    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await api.post<dynamic>(
        '/catalogue/chapters/${widget.chapterId}/watched',
        body: {'studentId': widget.studentId},
      );
      if (!mounted) return;
      // `true` tells the chapter behind us to reload: it is open now.
      Navigator.of(context).pop(true);
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

  @override
  void dispose() {
    _startupWatch?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(widget.chapterName)),
      body: Column(
        children: [
          AspectRatio(
            aspectRatio: 16 / 9,
            child: ColoredBox(
              color: Colors.black,
              child: WebViewWidget(controller: _web),
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  Text(
                    _finished
                        ? 'All done. The activities are open now.'
                        : 'Watch this together, then the activities open.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleMedium,
                  ),

                  // A film that will not play must not be a dead end. Some
                  // phones cannot play YouTube inside an app at all, and
                  // without this the chapter simply never opens for them.
                  if (_stuck && !_finished) ...[
                    const SizedBox(height: 16),
                    Text(
                      'This film is not playing here.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.titleSmall,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Open it in YouTube, watch it together, then come back '
                      'and tap below.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall,
                    ),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: () => unawaited(_openOutside()),
                      icon: const Icon(Icons.open_in_new_rounded),
                      label: const Text('Open in YouTube'),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      // Deliberately an adult's decision, and only offered when
                      // the film has already failed — the gate exists so a
                      // child meets the film, not to punish a phone.
                      onPressed: _saving ? null : () => unawaited(_unlock()),
                      child: const Text('We have watched it'),
                    ),
                  ],

                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: theme.colorScheme.error,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _saving ? null : () => unawaited(_unlock()),
                      child: const Text('Try again'),
                    ),
                  ],

                  if (_saving) ...[
                    const SizedBox(height: 16),
                    const CircularProgressIndicator(),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
