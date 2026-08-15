import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';

import '../../core/api/api_service.dart';

/// The animation a child watches before a book's activities open.
///
/// Played inside the app rather than handed to YouTube. Two reasons, and the
/// second is the important one: this is the only way to know the video actually
/// reached the end rather than a four-year-old tapping away from it, and it
/// keeps them out of YouTube's recommendations and comments.
class AnimationView extends StatefulWidget {
  const AnimationView({
    required this.videoId,
    required this.bookId,
    required this.bookName,
    required this.studentId,
    super.key,
  });

  final String videoId;
  final String bookId;
  final String bookName;
  final String studentId;

  @override
  State<AnimationView> createState() => _AnimationViewState();
}

class _AnimationViewState extends State<AnimationView> {
  late final YoutubePlayerController _controller;
  StreamSubscription<YoutubePlayerValue>? _states;
  bool _finished = false;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller = YoutubePlayerController.fromVideoId(
      videoId: widget.videoId,
      autoPlay: true,
      params: const YoutubePlayerParams(
        // No related videos at the end, and nothing to tap through to: the
        // viewer is between two and six.
        showFullscreenButton: true,
        showControls: true,
        strictRelatedVideos: true,
        enableCaption: false,
      ),
    );

    _states = _controller.stream.listen((value) {
      if (_finished || !mounted) return;
      if (value.playerState == PlayerState.ended) {
        _finished = true;
        unawaited(_unlock());
      }
    });
  }

  /// Tells the school this child has watched it, then lets them through.
  Future<void> _unlock() async {
    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await api.post<dynamic>(
        '/catalogue/books/${widget.bookId}/watched',
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
        appBar: AppBar(title: Text(widget.bookName)),
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
