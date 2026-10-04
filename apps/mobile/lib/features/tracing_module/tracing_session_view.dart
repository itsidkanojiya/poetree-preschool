import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/letterforms/letterforms.dart';

import '../activities/activity_controller.dart';
import '../activities/activity_models.dart';
import '../tracing/tracing_play.dart';
import 'lesson_video.dart';
import 'tracing_lesson_view.dart';
import 'tracing_module_controllers.dart';
import 'tracing_module_models.dart';
import 'tracing_ui.dart';

/// One letter after another.
///
/// First visit to a letter with a video:
///   lesson video → watched to the end → Start Tracing → trace → "A for Apple"
/// Every visit after that, the video is not forced again:
///   trace → "A for Apple"
/// and "Watch again" on the tracing screen replays it whenever the child
/// likes, then comes back to the tracing exactly as it was left.
///
/// Whether a letter's video has been watched is kept per letter, on the
/// school's server, so watching A's video does nothing for B. A letter the
/// publisher has not given a video yet goes straight to tracing.
class TracingSessionView extends StatefulWidget {
  const TracingSessionView({
    required this.controller,
    required this.startAt,
    this.videoSurface,
    super.key,
  });

  final TracingLettersController controller;
  final int startAt;

  /// The lesson video, for a test to stand in for YouTube.
  final Widget Function(LessonVideoController video, VoidCallback onTap)?
  videoSurface;

  @override
  State<TracingSessionView> createState() => _TracingSessionViewState();
}

enum _Step { lesson, trace }

class _TracingSessionViewState extends State<TracingSessionView> {
  late int _index = widget.startAt;
  _Step _step = _Step.trace;
  ActivityPlayController? _play;
  Worker? _finished;

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

  /// Arrives at a letter: its lesson the first time, its tracing after.
  void _begin(int index) {
    _finished?.dispose();
    _finished = null;
    _play = null;
    _index = index;

    if (_item.hasVideo && !_item.videoWatched) {
      _step = _Step.lesson;
    } else {
      _startTracing();
    }
  }

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

  /// Watching again, from the tracing: the lesson over the top, and Back
  /// returns to the tracing just as it was.
  Future<void> _watchAgain() async {
    final item = _item;
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (route) => TracingLessonView(
          item: item,
          categoryKey: widget.controller.categoryKey,
          replay: true,
          markWatched: () => widget.controller.markWatched(item),
          onStart: () => Navigator.of(route).pop(),
          onBack: () => Navigator.of(route).pop(),
          videoSurface: widget.videoSurface,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    final play = _play;

    // The lesson is this page's own content rather than a page on top of it:
    // finishing it opens the tracing right here, with nothing in between to
    // be backed out of.
    if (_step == _Step.lesson || play == null) {
      return TracingLessonView(
        key: ValueKey('lesson-${item.id}'),
        item: item,
        categoryKey: widget.controller.categoryKey,
        markWatched: () => widget.controller.markWatched(item),
        onStart: () => setState(_startTracing),
        onBack: () => Navigator.of(context).maybePop(),
        videoSurface: widget.videoSurface,
      );
    }

    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: TracingSky()),
          SafeArea(
            child: Column(
              children: [
                _TraceHeader(
                  title: _traceTitle(item),
                  position: '${_index + 1} / ${_items.length}',
                  progress: (_index + 1) / _items.length,
                  onBack: () => Navigator.of(context).maybePop(),
                  onWatchAgain: item.hasVideo
                      ? () => unawaited(_watchAgain())
                      : null,
                ),
                Expanded(
                  child: TracingPlay(
                    key: ValueKey('trace-${item.id}'),
                    controller: play,
                    content: play.activity.content! as TracingContent,
                    finishLabel: _isLast ? 'All done' : 'Next ${item.kind}',
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

/// "Trace A", "Trace 7", "Trace the big zigzag".
String _traceTitle(TracingModuleItem item) {
  if (item.glyph.startsWith('pattern-')) {
    final name = Letterforms.current?.patternNames[item.glyph];
    return name == null
        ? 'Trace the pattern'
        : 'Trace the ${name.toLowerCase()}';
  }
  return 'Trace ${item.glyph}';
}

/// Above the tracing: back, what is being traced, where in the set it is,
/// and the way back to the video. The speaker is the tracing's own, beside
/// the instruction it reads.
class _TraceHeader extends StatelessWidget {
  const _TraceHeader({
    required this.title,
    required this.position,
    required this.progress,
    required this.onBack,
    required this.onWatchAgain,
  });

  final String title;
  final String position;
  final double progress;
  final VoidCallback onBack;
  final VoidCallback? onWatchAgain;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Column(
        children: [
          Row(
            children: [
              BackRound(onTap: onBack),
              const SizedBox(width: 12),
              Expanded(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    title,
                    style: const TextStyle(
                      color: TraceInk.navy,
                      fontSize: 26,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Text(
                  position,
                  style: const TextStyle(
                    color: TraceInk.navy,
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(child: TracingProgressBar(value: progress)),
              if (onWatchAgain != null) ...[
                const SizedBox(width: 10),
                Material(
                  color: const Color(0xFF2F6FED),
                  borderRadius: BorderRadius.circular(18),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(18),
                    onTap: onWatchAgain,
                    child: const Padding(
                      padding: EdgeInsets.fromLTRB(10, 8, 14, 8),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.play_circle_fill_rounded,
                            color: Colors.white,
                            size: 22,
                          ),
                          SizedBox(width: 6),
                          Text(
                            'Watch again',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
