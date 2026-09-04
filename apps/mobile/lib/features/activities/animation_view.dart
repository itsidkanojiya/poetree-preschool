import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';

import '../../core/api/api_service.dart';

/// A player channel name that JavaScript can actually parse.
///
/// `YoutubePlayerController.fromVideoId` uses the video id itself as the
/// player's key, and the package pastes that key **unquoted** into its own
/// player script: `Youtube<key>.postMessage(message)`.
///
/// YouTube ids may contain a hyphen, and ours does. `a-3kJzYn_Bo` produced
/// `Youtubea-3kJzYn_Bo.postMessage(...)`, which JavaScript reads as
/// `Youtubea - 3kJzYn_Bo` — and `3kJzYn_Bo`, a digit followed by letters, is
/// not a token at all. The whole script then fails to parse, so nothing in it
/// runs: no player, no events, no error the app can see. Just a black
/// rectangle, which is exactly what a family reported.
///
/// Stripping what an identifier cannot hold fixes it. The name only has to be
/// unique among players on screen, and there is never more than one.
String youtubePlayerKey(String videoId) =>
    videoId.replaceAll(RegExp(r'[^A-Za-z0-9_]'), '');

/// The animation a child watches before a book's activities open.
///
/// Played inside the app rather than handed to YouTube. Two reasons, and the
/// second is the important one: this is the only way to know the video actually
/// reached the end rather than a four-year-old tapping away from it, and it
/// keeps them out of YouTube's recommendations and comments.
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
  late final YoutubePlayerController _controller;
  StreamSubscription<YoutubePlayerValue>? _states;
  Timer? _startupWatch;
  bool _finished = false;
  bool _saving = false;
  bool _stuck = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Built by hand rather than through `fromVideoId`, which is the only way to
    // choose the key — see [youtubePlayerKey]. The video is then loaded exactly
    // as that factory would with autoPlay on.
    _controller = YoutubePlayerController(
      params: const YoutubePlayerParams(
        // No related videos at the end, and nothing to tap through to: the
        // viewer is between two and six.
        showFullscreenButton: true,
        showControls: true,
        strictRelatedVideos: true,
        enableCaption: false,
        // The package defaults this to `https://www.youtube.com`, which tells
        // YouTube the film is being embedded on YouTube itself. That is not
        // true, and an origin YouTube cannot make sense of is one of the
        // things it refuses an embed over. Ours is a domain we actually own
        // and already serve the portal from.
        origin: 'https://school.poetreepublications.com',
      ),
      key: youtubePlayerKey(widget.videoId),
    );
    unawaited(_controller.loadVideoById(videoId: widget.videoId));

    _states = _controller.stream.listen((value) {
      if (!mounted) return;

      /// Only pictures on the screen count as the film having arrived.
      ///
      /// Being "ready" does not: the player reports itself ready and then
      /// shows YouTube's own "This video is unavailable" card, which is a
      /// failure that looks like a success from here. Treating ready as
      /// arrival cancelled the watchdog and took the way out away again,
      /// leaving a child on an error card with no way past it.
      final arrived =
          value.playerState == PlayerState.playing ||
          value.playerState == PlayerState.buffering;

      if (arrived) {
        _startupWatch?.cancel();
        if (_stuck) setState(() => _stuck = false);
      } else if (value.error != YoutubeError.none) {
        // Sticky. A film that has failed stays failed until one actually
        // plays — a later harmless event must not quietly withdraw the offer
        // of a way out.
        _startupWatch?.cancel();
        if (!_stuck) setState(() => _stuck = true);
      }

      if (_finished) return;
      if (value.playerState == PlayerState.ended) {
        _finished = true;
        unawaited(_unlock());
      }
    });

    /// Nothing at all after ten seconds counts as stuck.
    ///
    /// The player can fail without ever reporting an error — a WebView that
    /// cannot run YouTube's own script leaves a black rectangle and says
    /// nothing. That is a dead end: the chapter never opens, and there is
    /// nothing on screen to try.
    _startupWatch = Timer(const Duration(seconds: 10), () {
      if (mounted && !_finished) setState(() => _stuck = true);
    });
  }

  /// Opens the film in YouTube, for a device whose WebView will not play it.
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
      // `true` tells the shelf behind us to reload: the book is open now.
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
    unawaited(_states?.cancel());
    _controller.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return YoutubePlayerScaffold(
      controller: _controller,
      builder: (context, player) => Scaffold(
        appBar: AppBar(title: Text(widget.chapterName)),
        body: Column(
          children: [
            player,
            Padding(
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
                  // devices cannot run YouTube's player inside an app at all,
                  // and without this the chapter simply never opens for them.
                  if (_stuck && !_finished) ...[
                    const SizedBox(height: 16),
                    Text(
                      'This film is not playing here.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.titleSmall,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Some films cannot be played inside an app, and some '
                      'phones cannot play them at all. Open it in YouTube, '
                      'watch it together, then come back and tap below.',
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
                      // the player has already failed — the gate exists so a
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
          ],
        ),
      ),
    );
  }
}
