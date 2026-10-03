import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/letterforms/glyph_text.dart';
import '../../core/widgets/kid_ui.dart';
import '../activities/activity_controller.dart';
import '../activities/activity_models.dart';
import '../activities/animation_view.dart';
import '../tracing/tracing_play.dart';
import 'tracing_module_controllers.dart';
import 'tracing_module_models.dart';

/// One letter after another, each the same way:
///
///   its video → watched to the end → trace it → next letter → its video …
///
/// The video comes first every time, not only the first time: watching how a
/// letter is written is the lesson, and tracing is practising it. There is no
/// way past an unwatched video from here — Back from the video comes back to
/// this page, which offers only to play it. A letter the publisher has not
/// given a video yet goes straight to tracing.
class TracingSessionView extends StatefulWidget {
  const TracingSessionView({
    required this.controller,
    required this.startAt,
    this.playVideo,
    super.key,
  });

  final TracingLettersController controller;
  final int startAt;

  /// Plays an item's video; true once it was watched to the end and the
  /// school told. Defaults to the in-app player — a test passes its own,
  /// since a WebView needs a phone.
  final Future<bool?> Function(BuildContext context, TracingModuleItem item)?
  playVideo;

  @override
  State<TracingSessionView> createState() => _TracingSessionViewState();
}

enum _Step { video, trace }

class _TracingSessionViewState extends State<TracingSessionView> {
  late int _index = widget.startAt;
  _Step _step = _Step.video;
  ActivityPlayController? _play;
  Worker? _finished;
  bool _videoOpen = false;

  List<TracingModuleItem> get _items => widget.controller.items;
  TracingModuleItem get _item => _items[_index];
  bool get _isLast => _index >= _items.length - 1;

  @override
  void initState() {
    super.initState();
    _begin(_index);
  }

  @override
  void dispose() {
    _finished?.dispose();
    super.dispose();
  }

  /// Arrives at a letter: its video if it has one, else its tracing.
  void _begin(int index) {
    _finished?.dispose();
    _finished = null;
    _play = null;
    _index = index;

    if (_item.hasVideo) {
      _step = _Step.video;
      // After this frame: a route cannot be pushed while this one is built.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _index == index) unawaited(_watch());
      });
    } else {
      _startTracing();
    }
  }

  /// Plays the letter's video. Only reaching the end — and the school
  /// hearing about it — moves on to tracing.
  Future<void> _watch() async {
    if (_videoOpen) return;
    _videoOpen = true;
    final item = _item;
    final watched = await (widget.playVideo ?? _inAppPlayer)(context, item);
    _videoOpen = false;
    if (!mounted || item != _item) return;
    if (watched == true) setState(_startTracing);
  }

  Future<bool?> _inAppPlayer(BuildContext context, TracingModuleItem item) =>
      Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => AnimationView(
            videoId: item.videoId!,
            title: 'Learn ${item.glyph}',
            markWatched: () => widget.controller.markWatched(item),
            watchText: 'Watch how to write it, then it is your turn to trace.',
            doneText: 'Well watched! Now trace it.',
          ),
        ),
      );

  void _startTracing() {
    final item = _item;
    final play = ActivityPlayController(
      activity: ActivityDefinition(
        id: item.id,
        code: '',
        title: item.glyph,
        type: 'TRACING',
        skillName: '',
        bookName: '',
        chapterName: '',
        chapterId: '',
        bookId: '',
        isLocked: false,
        content: TracingContent(items: [item.shape]),
      ),
      studentId: widget.controller.studentId,
      recorder: (_, _) => widget.controller.markTraced(item),
    );
    _play = play;
    _step = _Step.trace;
    // "Next letter" finishes this letter's sitting; that is the cue to go on.
    _finished = ever<bool>(play.isFinished, (done) {
      if (done && mounted) _advance();
    });
  }

  void _advance() {
    if (_isLast) {
      Navigator.of(context).pop();
      return;
    }
    setState(() => _begin(_index + 1));
  }

  @override
  Widget build(BuildContext context) {
    final play = _play;
    final item = _item;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.controller.title),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: Text(
                '${_index + 1} / ${_items.length}',
                style: Theme.of(
                  context,
                ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ],
      ),
      body: _step == _Step.trace && play != null
          ? TracingPlay(
              key: ValueKey('trace-${item.id}'),
              controller: play,
              content: play.activity.content! as TracingContent,
              finishLabel: _isLast ? 'All done' : 'Next ${item.kind}',
            )
          : VideoGate(item: item, onPlay: () => unawaited(_watch())),
    );
  }
}

/// Before tracing: the letter, and the one way on — its video. Public so a
/// preview test can draw it.
class VideoGate extends StatelessWidget {
  const VideoGate({required this.item, required this.onPlay, super.key});

  final TracingModuleItem item;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Spacer(),
          Container(
            width: 180,
            height: 180,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: theme.colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(40),
            ),
            child: GlyphText(
              item.glyph,
              size: 110,
              color: theme.colorScheme.onPrimaryContainer,
            ),
          ),
          const SizedBox(height: 28),
          Text(
            'First, watch the video',
            textAlign: TextAlign.center,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'See how it is written, then it is your turn to trace it.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyLarge,
          ),
          const Spacer(),
          SizedBox(
            width: double.infinity,
            child: GradientButton(
              label: 'Play the video',
              icon: Icons.play_arrow_rounded,
              onPressed: onPlay,
            ),
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}
