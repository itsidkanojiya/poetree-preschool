import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/routes/app_pages.dart';
import 'film_controllers.dart';
import 'film_player_view.dart';
import 'film_widgets.dart';

/// "Chapter complete!" — shown when a film ends.
///
/// Carries on to the next chapter by itself after a short countdown, which is
/// what a four-year-old expects of a screen of stories; a grown-up can stop it,
/// go on at once, or open the chapter's activities instead.
class ChapterDoneView extends StatefulWidget {
  const ChapterDoneView({
    required this.chapters,
    required this.playlist,
    required this.index,
    required this.was3d,
    super.key,
  });

  final FilmChaptersController chapters;
  final List<FilmChapter> playlist;
  final int index;
  final bool was3d;

  @override
  State<ChapterDoneView> createState() => _ChapterDoneViewState();
}

class _ChapterDoneViewState extends State<ChapterDoneView>
    with SingleTickerProviderStateMixin {
  static const _wait = 8;

  late final AnimationController _pop = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 700),
  )..forward();

  Timer? _tick;
  int _left = _wait;
  bool _autoAdvance = true;

  FilmChapter get _done => widget.playlist[widget.index];
  FilmChapter? get _next => widget.index < widget.playlist.length - 1
      ? widget.playlist[widget.index + 1]
      : null;

  @override
  void initState() {
    super.initState();
    if (_next != null) {
      _tick = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (!mounted || !_autoAdvance) return;
        if (_left <= 1) {
          timer.cancel();
          _continue();
        } else {
          setState(() => _left -= 1);
        }
      });
    }
  }

  void _stop() {
    _tick?.cancel();
    setState(() => _autoAdvance = false);
  }

  void _continue() {
    _tick?.cancel();
    if (_next == null) return;
    unawaited(
      Get.off<void>(
        () => FilmPlayerView(
          chapters: widget.chapters,
          playlist: widget.playlist,
          startIndex: widget.index + 1,
          start3d: widget.was3d,
        ),
      ),
    );
  }

  void _activities() {
    _stop();
    unawaited(
      Get.toNamed<void>(
        AppRoutes.activities,
        arguments: {
          'studentId': widget.chapters.studentId,
          'bookId': widget.chapters.bookId,
          'bookName': widget.chapters.bookName,
          'chapterId': _done.id,
        },
      ),
    );
  }

  @override
  void dispose() {
    _tick?.cancel();
    _pop.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final next = _next;
    final watched = widget.chapters.watchedCount;
    final total = widget.playlist.length;

    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF8E6CF5), Color(0xFFF07AA0)],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: IconButton(
                  onPressed: () => Get.back<void>(),
                  icon: const Icon(Icons.close_rounded),
                  color: Colors.white,
                  tooltip: 'Back to chapters',
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                  children: [
                    const SizedBox(height: 8),
                    Center(
                      child: ScaleTransition(
                        scale: CurvedAnimation(
                          parent: _pop,
                          curve: Curves.elasticOut,
                        ),
                        child: const _Stars(),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Chapter complete!',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.headlineMedium?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _done.name,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: Colors.white.withValues(alpha: 0.92),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Column(
                        children: [
                          Text(
                            '$watched of $total films in ${widget.chapters.bookName}',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 8),
                          FilmProgressBar(
                            done: watched,
                            total: total,
                            color: Colors.white,
                            track: Colors.white.withValues(alpha: 0.3),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    if (next != null) ...[
                      _NextCard(
                        next: next,
                        number: widget.index + 2,
                        secondsLeft: _autoAdvance ? _left : null,
                        total: _wait,
                      ),
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        onPressed: _continue,
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: FilmColors.violet,
                          minimumSize: const Size.fromHeight(54),
                          textStyle: const TextStyle(
                            fontFamily: 'Poppins',
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                          ),
                        ),
                        icon: const Icon(Icons.play_arrow_rounded),
                        label: const Text('Next chapter'),
                      ),
                      if (_autoAdvance)
                        TextButton(
                          onPressed: _stop,
                          style: TextButton.styleFrom(
                            foregroundColor: Colors.white,
                          ),
                          child: const Text('Stay here'),
                        ),
                    ] else ...[
                      Text(
                        'That was the last film in this book. Well done!',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.titleSmall?.copyWith(
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: () => Get.back<void>(),
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: FilmColors.violet,
                          minimumSize: const Size.fromHeight(54),
                        ),
                        child: const Text('Back to chapters'),
                      ),
                    ],
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _activities,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white70),
                        minimumSize: const Size.fromHeight(50),
                      ),
                      icon: const Icon(Icons.extension_rounded),
                      label: const Text('Play this chapter’s activities'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NextCard extends StatelessWidget {
  const _NextCard({
    required this.next,
    required this.number,
    required this.secondsLeft,
    required this.total,
  });

  final FilmChapter next;
  final int number;
  final int? secondsLeft;
  final int total;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 52,
            height: 52,
            child: Stack(
              alignment: Alignment.center,
              children: [
                if (secondsLeft != null)
                  CircularProgressIndicator(
                    value: secondsLeft! / total,
                    strokeWidth: 4,
                    color: FilmColors.pink,
                    backgroundColor: FilmColors.pink.withValues(alpha: 0.15),
                  ),
                Text(
                  secondsLeft != null ? '$secondsLeft' : '$number',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: FilmColors.violet,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  secondsLeft != null
                      ? 'Up next in $secondsLeft…'
                      : 'Up next · Chapter $number',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: FilmColors.pink,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  next.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: const Color(0xFF1E2230),
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

/// Three stars, the middle one biggest.
class _Stars extends StatelessWidget {
  const _Stars();

  @override
  Widget build(BuildContext context) {
    Widget star(double size, double turn) => Transform.rotate(
      angle: turn * math.pi / 180,
      child: Icon(
        Icons.star_rounded,
        size: size,
        color: FilmColors.sun,
        shadows: const [
          Shadow(color: Colors.black26, blurRadius: 12, offset: Offset(0, 4)),
        ],
      ),
    );

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [star(64, -14), star(104, 0), star(64, 14)],
    );
  }
}
