import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:get/get.dart';

import '../../core/assets/app_assets.dart';
import '../../core/audio/speech_service.dart';
import '../../core/letterforms/glyph_text.dart';
import '../../core/letterforms/letterforms.dart';
import '../../core/widgets/kid_ui.dart';
import 'lesson_video.dart';
import 'tracing_module_models.dart';

/// The lesson before a letter is traced: "Let's learn Number 1!", the video
/// of how it is written, and the way on to tracing it.
///
///   Watch → (video reaches its end) → Great Job! → Start Tracing
///
/// On a first visit Start Tracing stays locked until the video has actually
/// played to its end and the school has been told; dragging the progress bar
/// past what has been watched is not allowed. Opened again from the tracing
/// screen ([replay]), nothing is locked and the button goes back to tracing.
///
/// Fullscreen is the same video, not a second one: it moves to fill the
/// screen in landscape and keeps playing where it was, with only the controls
/// a child needs over it.
class TracingLessonView extends StatefulWidget {
  const TracingLessonView({
    required this.item,
    required this.categoryKey,
    required this.markWatched,
    required this.onStart,
    required this.onBack,
    this.replay = false,
    this.videoSurface,
    super.key,
  });

  final TracingModuleItem item;

  /// "capital", "number", "small", … — the colour the letter is drawn in.
  final String categoryKey;

  /// Tells the school the video was watched to the end. Throws if it could
  /// not; the screen then offers to try again.
  final Future<void> Function() markWatched;

  /// Start Tracing, or in [replay] Back to tracing.
  final VoidCallback onStart;
  final VoidCallback onBack;

  /// Watching again, from the tracing screen: nothing to unlock.
  final bool replay;

  /// The video, for a test to stand in for YouTube. Null is the real one.
  final Widget Function(LessonVideoController video, VoidCallback onTap)?
  videoSurface;

  @override
  State<TracingLessonView> createState() => _TracingLessonViewState();
}

/// The lesson's colours: sky, grass, and the designer's navy and coral.
abstract final class _Ink {
  static const navy = Color(0xFF173A78);
  static const coral = Color(0xFFFF4D66);
  static const blue = Color(0xFF2E6BE6);
  static const sun = Color(0xFFFFD33D);
  static const green = Color(0xFF57C878);
  static const grey = Color(0xFF98A4B7);
  static const lilac = Color(0xFFF1EEFF);
}

Color _letterColour(String categoryKey) => switch (categoryKey) {
  'number' || 'hindi-number' || 'gujarati-number' => _Ink.coral,
  'small' => const Color(0xFF22B07D),
  'pattern' => const Color(0xFF8E5CF0),
  _ => const Color(0xFF4C7FF0),
};

class _TracingLessonViewState extends State<TracingLessonView>
    with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  late final LessonVideoController _video = LessonVideoController(
    videoId: widget.item.videoId!,
    freeSeek: widget.replay || widget.item.videoWatched,
  )..onEnded = _ended;

  late bool _unlocked = widget.replay || widget.item.videoWatched;
  late final AnimationController _celebrate;

  bool _fullscreen = false;
  bool _controlsShown = true;
  bool _saving = false;
  bool _justUnlocked = false;
  String? _error;
  double? _dragging;
  Timer? _hideControls;

  SpeechService? get _voice =>
      Get.isRegistered<SpeechService>() ? Get.find<SpeechService>() : null;

  void _say(String text) => unawaited(_voice?.say(text));

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Made here, not lazily: one first touched in dispose would look for its
    // ticker's ancestors after they have gone.
    _celebrate = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    _video.addListener(_changed);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _hideControls?.cancel();
    _video
      ..removeListener(_changed)
      ..dispose();
    _celebrate.dispose();
    if (_fullscreen) _restoreSystem();
    super.dispose();
  }

  /// A phone call or the home button pauses the lesson; it does not carry on
  /// playing to an empty room and count as watched.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      if (_video.playing) _video.pause();
    }
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  /* ---------------------------------------------------------------------- */
  /* Words                                                                  */
  /* ---------------------------------------------------------------------- */

  /// "Number 1", "Letter A", "Letter a", "the Big zigzag", "क".
  String get _subject {
    final item = widget.item;
    if (item.glyph.startsWith('pattern-')) {
      final name = Letterforms.current?.patternNames[item.glyph];
      return name == null ? 'this pattern' : 'the $name';
    }
    if (item.kind == 'number') return 'Number ${item.glyph}';
    final ascii = RegExp(r'^[A-Za-z]$').hasMatch(item.glyph);
    return ascii ? 'Letter ${item.glyph}' : item.glyph;
  }

  String get _instruction => 'Watch how to write $_subject.';

  /* ---------------------------------------------------------------------- */
  /* Video                                                                  */
  /* ---------------------------------------------------------------------- */

  /// The video reached its end. On a first visit that is what unlocks
  /// tracing — once the school knows.
  Future<void> _ended() async {
    unawaited(_celebrate.forward(from: 0));
    if (_fullscreen) await _setFullscreen(false);
    if (!_unlocked) await _record();
  }

  Future<void> _record() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.markWatched();
      if (!mounted) return;
      setState(() {
        _unlocked = true;
        _justUnlocked = true;
      });
      unawaited(HapticFeedback.mediumImpact());
      _say('Great job! Now it is your turn to trace.');
    } on Object {
      if (!mounted) return;
      setState(
        () => _error =
            'Watched — but we could not tell the school. Check the '
            'connection and try again.',
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _tapVideo() {
    if (_fullscreen) {
      setState(() => _controlsShown = !_controlsShown);
      if (_controlsShown) _scheduleHide();
      return;
    }
    _video.toggle();
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
    if (on) {
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
      await SystemChrome.setPreferredOrientations(const [
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
      _scheduleHide();
    } else {
      await _restoreSystem();
    }
  }

  Future<void> _restoreSystem() async {
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    await SystemChrome.setPreferredOrientations(const []);
  }

  /// In fullscreen the controls fade after a few seconds of playing, and a
  /// tap brings them back.
  void _scheduleHide() {
    _hideControls?.cancel();
    if (!_fullscreen) return;
    _hideControls = Timer(const Duration(seconds: 3), () {
      if (mounted && _video.playing && _fullscreen) {
        setState(() => _controlsShown = false);
      }
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Layout                                                                 */
  /* ---------------------------------------------------------------------- */

  @override
  Widget build(BuildContext context) {
    return PopScope(
      // Back in fullscreen leaves fullscreen, as in every player.
      canPop: !_fullscreen,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _fullscreen) unawaited(_setFullscreen(false));
      },
      child: Scaffold(
        backgroundColor: _fullscreen ? Colors.black : const Color(0xFFDFF4FF),
        body: Stack(
          children: [
            Positioned.fill(
              child: Offstage(offstage: _fullscreen, child: const _Sky()),
            ),
            SafeArea(
              top: !_fullscreen,
              bottom: !_fullscreen,
              left: !_fullscreen,
              right: !_fullscreen,
              child: LayoutBuilder(builder: _layout),
            ),
          ],
        ),
      ),
    );
  }

  /// Everything is placed by hand, so the video keeps one place in the tree
  /// in portrait and in fullscreen: moving it never reloads it.
  Widget _layout(BuildContext context, BoxConstraints box) {
    final w = box.maxWidth;
    final h = box.maxHeight;

    const side = 12.0;
    const pad = 16.0;
    const headerH = 76.0;
    const watchRowH = 44.0;
    const below = 14 + 56 + 12 + 84 + 14 + 60.0;

    // As wide as the screen allows, but never so tall that the letter above
    // it disappears — a tablet on its side gets a smaller video, not a page
    // with no letter.
    final room = h - headerH - pad * 2 - watchRowH - 12 - below - 90 - side;
    final videoW = math.max(
      200.0,
      math.min(w - side * 2 - pad * 2, room * 16 / 9),
    );
    final videoH = videoW * 9 / 16;
    final panelW = videoW + pad * 2;
    final panelH = pad + watchRowH + 12 + videoH + below + pad;
    final heroH = math.max(80.0, h - headerH - panelH - side);
    final panelLeft = (w - panelW) / 2;
    final panelTop = headerH + heroH;

    final videoRect = _fullscreen
        ? Rect.fromLTWH(0, 0, w, h)
        : Rect.fromLTWH(
            panelLeft + pad,
            panelTop + pad + watchRowH + 12,
            videoW,
            videoH,
          );

    return Stack(
      children: [
        Positioned(
          left: 0,
          right: 0,
          top: 0,
          height: headerH,
          child: Offstage(offstage: _fullscreen, child: _header()),
        ),
        Positioned(
          left: 0,
          right: 0,
          top: headerH,
          height: heroH,
          child: Offstage(offstage: _fullscreen, child: _hero(heroH)),
        ),
        Positioned(
          left: panelLeft,
          top: panelTop,
          width: panelW,
          height: panelH,
          child: Offstage(
            offstage: _fullscreen,
            child: _panel(videoH: videoH, watchRowH: watchRowH, pad: pad),
          ),
        ),
        // The video, in one place in the tree whatever the layout.
        Positioned(
          key: const ValueKey('lesson-video'),
          left: videoRect.left,
          top: videoRect.top,
          width: videoRect.width,
          height: videoRect.height,
          child: _videoCard(),
        ),
      ],
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Portrait pieces                                                        */
  /* ---------------------------------------------------------------------- */

  Widget _header() {
    final accent = _letterColour(widget.categoryKey);

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Row(
        children: [
          _RoundSvg(
            asset: LessonIcons.back,
            tooltip: 'Back',
            onTap: widget.onBack,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.88),
                borderRadius: BorderRadius.circular(26),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text.rich(
                      TextSpan(
                        children: [
                          const TextSpan(text: 'Let’s Learn '),
                          TextSpan(
                            text: _subject,
                            style: TextStyle(color: accent),
                          ),
                          const TextSpan(text: '!'),
                        ],
                      ),
                      style: const TextStyle(
                        color: _Ink.navy,
                        fontSize: 21,
                        fontWeight: FontWeight.w800,
                        height: 1.1,
                      ),
                    ),
                  ),
                  const SizedBox(height: 2),
                  const FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      'Watch carefully and learn how to write it.',
                      style: TextStyle(
                        color: _Ink.navy,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 10),
          _RoundSvg(
            asset: LessonIcons.sound,
            tooltip: 'Say it',
            onTap: () => _say(
              'Let’s learn $_subject. Watch carefully and learn how to '
              'write it.',
            ),
          ),
        ],
      ),
    );
  }

  /// The letter, big and bright, with stars round it and the pencil ready.
  Widget _hero(double height) {
    final size = math.min(height * 0.82, 210.0);

    return Stack(
      alignment: Alignment.center,
      children: [
        _BubbleGlyph(
          glyph: widget.item.glyph,
          colour: _letterColour(widget.categoryKey),
          size: size,
        ),
        for (final (dx, dy, s) in [
          (-0.42, -0.55, 0.16),
          (0.40, -0.40, 0.13),
          (-0.36, 0.30, 0.11),
        ])
          Align(
            alignment: Alignment(dx, dy),
            child: SvgPicture.asset(LessonIcons.star, width: size * s),
          ),
        Align(
          alignment: const Alignment(0.94, 0.85),
          child: Image.asset(
            AppIcons.tracing,
            height: math.min(height * 0.55, 120),
          ),
        ),
      ],
    );
  }

  Widget _panel({
    required double videoH,
    required double watchRowH,
    required double pad,
  }) {
    return Container(
      padding: EdgeInsets.all(pad),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: _Ink.navy.withValues(alpha: 0.10),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: watchRowH,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Flexible(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: _WatchLearnPill(),
                  ),
                ),
                const SizedBox(width: 8),
                _TimeChip(
                  text: _video.duration > 0 ? clock(_video.duration) : '–:––',
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // Where the video sits; it is drawn over this from above.
          SizedBox(height: videoH),
          const SizedBox(height: 14),
          SizedBox(height: 56, child: _instructionRow()),
          const SizedBox(height: 12),
          SizedBox(height: 84, child: _Steps(watched: _unlocked)),
          const SizedBox(height: 14),
          SizedBox(height: 60, child: _startButton()),
        ],
      ),
    );
  }

  Widget _instructionRow() {
    final error = _error;
    if (error != null) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: const Color(0xFFFFEEF0),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                error,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12.5,
                  color: Color(0xFFB4233A),
                ),
              ),
            ),
            TextButton(
              onPressed: _saving ? null : () => unawaited(_record()),
              child: const Text('Try again'),
            ),
          ],
        ),
      );
    }

    return Material(
      color: _Ink.lilac,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () => _say(_instruction),
        child: Row(
          children: [
            const SizedBox(width: 10),
            Container(
              width: 40,
              height: 40,
              padding: const EdgeInsets.all(7),
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
              child: SvgPicture.asset(
                LessonIcons.sound,
                colorFilter: const ColorFilter.mode(
                  Color(0xFF7B5CF0),
                  BlendMode.srcIn,
                ),
              ),
            ),
            Expanded(
              child: Text(
                _instruction,
                textAlign: TextAlign.center,
                maxLines: 2,
                style: const TextStyle(
                  color: _Ink.navy,
                  fontSize: 15.5,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(width: 12),
          ],
        ),
      ),
    );
  }

  Widget _startButton() {
    if (_unlocked) {
      return _Pulse(
        active: _justUnlocked,
        child: GradientButton(
          label: widget.replay ? 'Back to tracing' : 'Start Tracing',
          icon: Icons.arrow_forward_rounded,
          onPressed: widget.onStart,
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFE3E7EE),
        borderRadius: BorderRadius.circular(18),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          if (_saving)
            const SizedBox(
              width: 24,
              height: 24,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            )
          else
            SvgPicture.asset(LessonIcons.lock, width: 30),
          const SizedBox(width: 12),
          const Expanded(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                'Watch the video to unlock tracing',
                maxLines: 1,
                style: TextStyle(
                  color: Color(0xFF7C879B),
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const Icon(Icons.chevron_right_rounded, color: _Ink.grey),
        ],
      ),
    );
  }

  /* ---------------------------------------------------------------------- */
  /* The video card, in either mode                                         */
  /* ---------------------------------------------------------------------- */

  Widget _videoCard() {
    final surface =
        widget.videoSurface?.call(_video, _tapVideo) ??
        LessonVideoSurface(controller: _video, onTap: _tapVideo);

    return ClipRRect(
      borderRadius: BorderRadius.circular(_fullscreen ? 0 : 20),
      child: Stack(
        fit: StackFit.expand,
        children: [
          surface,
          if (!_video.started && !_video.stuck && !_video.ended)
            const IgnorePointer(child: _Loading()),
          if (_video.stuck && !_video.ended) _stuckCard(),
          if (_video.started && _video.paused && !_video.ended)
            Center(
              child: _BigPlay(
                asset: LessonIcons.play,
                onTap: _togglePlay,
                size: _fullscreen ? 96 : 72,
              ),
            ),
          if (_video.ended) _doneCard(),
          if (!_fullscreen && _video.started && !_video.ended)
            Positioned(left: 0, right: 0, bottom: 0, child: _portraitBar()),
          if (_fullscreen)
            AnimatedOpacity(
              opacity: _controlsShown || !_video.playing ? 1 : 0,
              duration: const Duration(milliseconds: 200),
              child: IgnorePointer(
                ignoring: !(_controlsShown || !_video.playing),
                child: _fullscreenControls(),
              ),
            ),
        ],
      ),
    );
  }

  /// Under the video in portrait: play, time, progress, sound, fullscreen —
  /// white on a dark fade, as the design draws it.
  Widget _portraitBar() {
    return LayoutBuilder(builder: (context, box) => _bar(box.maxWidth >= 300));
  }

  Widget _bar(bool roomy) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.transparent, Color(0x990B1A33)],
        ),
      ),
      child: Container(
        height: 62,
        padding: const EdgeInsets.fromLTRB(4, 12, 4, 2),
        child: Row(
          children: [
            IconButton(
              onPressed: _togglePlay,
              tooltip: _video.playing ? 'Pause' : 'Play',
              icon: Icon(
                _video.playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
                color: Colors.white,
              ),
            ),
            if (roomy)
              Text(
                '${clock(_dragging ?? _video.position)} / ${clock(_video.duration)}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            Expanded(child: _scrubber(light: true)),
            IconButton(
              onPressed: _video.toggleMute,
              tooltip: _video.muted ? 'Sound on' : 'Sound off',
              icon: Icon(
                _video.muted
                    ? Icons.volume_off_rounded
                    : Icons.volume_up_rounded,
                color: Colors.white,
              ),
            ),
            IconButton(
              onPressed: () => unawaited(_setFullscreen(true)),
              tooltip: 'Full screen',
              icon: SvgPicture.asset(
                LessonIcons.fullscreen,
                width: 24,
                colorFilter: const ColorFilter.mode(
                  Colors.white,
                  BlendMode.srcIn,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _scrubber({required bool light}) {
    final duration = _video.duration;
    final value = (_dragging ?? _video.position).clamp(
      0.0,
      duration > 0 ? duration : 1.0,
    );

    return SliderTheme(
      data: SliderThemeData(
        trackHeight: light ? 4 : 7,
        activeTrackColor: light ? Colors.white : _Ink.coral,
        inactiveTrackColor: light
            ? Colors.white.withValues(alpha: 0.35)
            : const Color(0xFFDDE3EE),
        thumbColor: light ? Colors.white : _Ink.coral,
        overlayShape: SliderComponentShape.noOverlay,
        thumbShape: RoundSliderThumbShape(enabledThumbRadius: light ? 7 : 10),
      ),
      child: Slider(
        value: value.toDouble(),
        max: duration > 0 ? duration : 1,
        onChanged: duration > 0
            ? (v) => setState(() {
                // A first watch cannot be dragged past what has been seen.
                final limit = _video.freeSeek ? duration : _video.furthest;
                _dragging = math.min(v, limit);
              })
            : null,
        onChangeEnd: (v) {
          final to = _dragging ?? v;
          _dragging = null;
          _video.seek(to);
          _scheduleHide();
        },
      ),
    );
  }

  /// Fullscreen's few controls: back and the lesson's name along the top;
  /// play, progress, time, sound and leaving fullscreen along the bottom.
  Widget _fullscreenControls() {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(
          children: [
            Row(
              children: [
                _RoundSvg(
                  asset: LessonIcons.back,
                  tooltip: 'Leave full screen',
                  onTap: () => unawaited(_setFullscreen(false)),
                ),
                const SizedBox(width: 12),
                Flexible(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 18,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.92),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Text(
                      'Let’s Learn $_subject!',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: _Ink.navy,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const Spacer(),
            Container(
              padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.94),
                borderRadius: BorderRadius.circular(30),
              ),
              child: Row(
                children: [
                  _BigPlay(
                    asset: _video.playing
                        ? LessonIcons.pause
                        : LessonIcons.play,
                    onTap: _togglePlay,
                    size: 50,
                  ),
                  const SizedBox(width: 10),
                  Text(
                    '${clock(_dragging ?? _video.position)} / ${clock(_video.duration)}',
                    style: const TextStyle(
                      color: _Ink.navy,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(child: _scrubber(light: false)),
                  IconButton(
                    onPressed: _video.toggleMute,
                    tooltip: _video.muted ? 'Sound on' : 'Sound off',
                    icon: _video.muted
                        ? const Icon(
                            Icons.volume_off_rounded,
                            color: _Ink.blue,
                            size: 30,
                          )
                        : SvgPicture.asset(LessonIcons.sound, width: 32),
                  ),
                  IconButton(
                    onPressed: () => unawaited(_setFullscreen(false)),
                    tooltip: 'Leave full screen',
                    icon: const Icon(
                      Icons.fullscreen_exit_rounded,
                      color: _Ink.navy,
                      size: 32,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Over the finished video: Great Job!, and the way to watch it again.
  Widget _doneCard() {
    return ColoredBox(
      color: Colors.white.withValues(alpha: 0.93),
      child: ScaleTransition(
        scale: CurvedAnimation(parent: _celebrate, curve: Curves.elasticOut),
        child: Center(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SvgPicture.asset(LessonIcons.star, width: 28),
                      const SizedBox(width: 8),
                      SvgPicture.asset(LessonIcons.check, width: 58),
                      const SizedBox(width: 8),
                      SvgPicture.asset(LessonIcons.star, width: 28),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _unlocked ? 'Great Job!' : 'Well watched!',
                    style: const TextStyle(
                      color: _Ink.navy,
                      fontSize: 26,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Text(
                    widget.replay
                        ? 'Now back to tracing.'
                        : _unlocked
                        ? 'Now it is your turn to trace.'
                        : 'Saving…',
                    style: const TextStyle(
                      color: _Ink.navy,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 6),
                  TextButton.icon(
                    onPressed: _video.play,
                    icon: const Icon(Icons.replay_rounded),
                    label: const Text('Watch again'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// A video that will not play here must not be a dead end: YouTube itself,
  /// and an adult's word that it has been watched.
  Widget _stuckCard() {
    return ColoredBox(
      color: Colors.white,
      child: Center(
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'This video is not playing here.',
                  style: TextStyle(
                    color: _Ink.navy,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                FilledButton.icon(
                  onPressed: () => unawaited(openInYouTube(_video.videoId)),
                  icon: const Icon(Icons.open_in_new_rounded),
                  label: const Text('Open in YouTube'),
                ),
                TextButton(
                  // An adult's decision, offered only once the video has
                  // failed: the lesson exists so a child meets the video,
                  // not to punish a phone.
                  onPressed: _saving ? null : () => _video.handle('ended'),
                  child: const Text('We have watched it'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

/// Sky to grass, with a few soft clouds.
class _Sky extends StatelessWidget {
  const _Sky();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFBFE8FF), Color(0xFFE6F7FF), Color(0xFFCDEFB4)],
          stops: [0, 0.42, 1],
        ),
      ),
      child: CustomPaint(painter: _CloudPainter(), size: Size.infinite),
    );
  }
}

class _CloudPainter extends CustomPainter {
  const _CloudPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white.withValues(alpha: 0.85);
    void cloud(double x, double y, double r) {
      canvas
        ..drawCircle(Offset(x, y), r, paint)
        ..drawCircle(Offset(x + r * 0.9, y + r * 0.15), r * 0.8, paint)
        ..drawCircle(Offset(x - r * 0.9, y + r * 0.2), r * 0.7, paint);
    }

    cloud(size.width * 0.12, size.height * 0.16, 22);
    cloud(size.width * 0.86, size.height * 0.11, 26);
    cloud(size.width * 0.70, size.height * 0.30, 16);
  }

  @override
  bool shouldRepaint(_CloudPainter oldDelegate) => false;
}

/// The letter as a fat, bright sticker: coloured, with a thick white edge.
/// The school's own letterforms draw the scripts and patterns the typeface
/// cannot.
class _BubbleGlyph extends StatelessWidget {
  const _BubbleGlyph({
    required this.glyph,
    required this.colour,
    required this.size,
  });

  final String glyph;
  final Color colour;
  final double size;

  @override
  Widget build(BuildContext context) {
    final latin = RegExp(r'^[A-Za-z0-9]{1,2}$').hasMatch(glyph);
    if (!latin) {
      return Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.9),
          borderRadius: BorderRadius.circular(size * 0.22),
        ),
        child: GlyphText(glyph, size: size * 0.62, color: colour, weight: 1.6),
      );
    }

    final style = TextStyle(
      fontSize: size,
      fontWeight: FontWeight.w800,
      height: 1,
    );
    return Stack(
      children: [
        Text(
          glyph,
          style: style.copyWith(
            foreground: Paint()
              ..style = PaintingStyle.stroke
              ..strokeWidth = size * 0.09
              ..strokeJoin = StrokeJoin.round
              ..color = Colors.white,
            shadows: [
              Shadow(
                color: Colors.black.withValues(alpha: 0.18),
                blurRadius: 10,
                offset: const Offset(0, 5),
              ),
            ],
          ),
        ),
        Text(glyph, style: style.copyWith(color: colour)),
      ],
    );
  }
}

class _RoundSvg extends StatelessWidget {
  const _RoundSvg({
    required this.asset,
    required this.tooltip,
    required this.onTap,
  });

  final String asset;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.white,
        shape: const CircleBorder(),
        elevation: 3,
        shadowColor: _Ink.navy.withValues(alpha: 0.3),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(11),
            child: SvgPicture.asset(asset, width: 30, height: 30),
          ),
        ),
      ),
    );
  }
}

class _BigPlay extends StatelessWidget {
  const _BigPlay({
    required this.asset,
    required this.onTap,
    required this.size,
  });

  final String asset;
  final VoidCallback onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: size * 0.06),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.25),
              blurRadius: 12,
            ),
          ],
        ),
        child: SvgPicture.asset(asset, width: size, height: size),
      ),
    );
  }
}

class _WatchLearnPill extends StatelessWidget {
  const _WatchLearnPill();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(6, 6, 16, 6),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF2E6BE6), Color(0xFF4C8DF6)],
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(9),
            ),
            child: SvgPicture.asset(LessonIcons.play, width: 22),
          ),
          const SizedBox(width: 10),
          const Text(
            'Watch & Learn',
            style: TextStyle(
              color: Colors.white,
              fontSize: 17,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _TimeChip extends StatelessWidget {
  const _TimeChip({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF2F8),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.timer_outlined, size: 18, color: _Ink.navy),
          const SizedBox(width: 6),
          Text(
            text,
            style: const TextStyle(
              color: _Ink.navy,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

/// 1 Watch → 2 Trace → 3 Complete.
class _Steps extends StatelessWidget {
  const _Steps({required this.watched});

  final bool watched;

  @override
  Widget build(BuildContext context) {
    // Once watched — or watching again — tracing is the step they are on.
    final current = watched ? 1 : 0;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE8ECF3)),
      ),
      child: Row(
        children: [
          for (final (i, label) in ['Watch', 'Trace', 'Complete'].indexed) ...[
            if (i > 0)
              const Expanded(
                flex: 1,
                child: Padding(
                  padding: EdgeInsets.only(bottom: 28),
                  child: _Dashes(),
                ),
              ),
            Expanded(
              flex: 3,
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: _Step(
                  number: i + 1,
                  label: label,
                  done: i < current,
                  active: i == current,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.number,
    required this.label,
    required this.done,
    required this.active,
  });

  final int number;
  final String label;
  final bool done;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final fill = done
        ? _Ink.green
        : active
        ? _Ink.sun
        : const Color(0xFFDDE2EA);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: fill,
            shape: BoxShape.circle,
            border: active
                ? Border.all(color: const Color(0xFFF2B705), width: 2)
                : null,
          ),
          child: done
              ? const Icon(Icons.check_rounded, color: Colors.white, size: 22)
              : Text(
                  '$number',
                  style: TextStyle(
                    color: active ? _Ink.navy : const Color(0xFF6B7891),
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
        ),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
          decoration: BoxDecoration(
            color: active
                ? _Ink.sun
                : done
                ? const Color(0xFFDDF5E5)
                : const Color(0xFFEEF1F5),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: active || done ? _Ink.navy : const Color(0xFF6B7891),
              fontSize: 13,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}

class _Dashes extends StatelessWidget {
  const _Dashes();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final count = math.max(1, (box.maxWidth / 8).floor());
        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            for (var i = 0; i < count; i++)
              Container(width: 4, height: 2, color: const Color(0xFFC3CAD6)),
          ],
        );
      },
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: Color(0xFF0B1A33),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: Colors.white),
            SizedBox(height: 10),
            Text(
              'Getting the video ready…',
              style: TextStyle(color: Colors.white70),
            ),
          ],
        ),
      ),
    );
  }
}

/// A gentle pulse, for the button that has just opened.
class _Pulse extends StatefulWidget {
  const _Pulse({required this.active, required this.child});

  final bool active;
  final Widget child;

  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final AnimationController _beat = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  @override
  void initState() {
    super.initState();
    if (widget.active) unawaited(_beat.repeat(reverse: true));
  }

  @override
  void didUpdateWidget(_Pulse oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !_beat.isAnimating) {
      unawaited(_beat.repeat(reverse: true));
    } else if (!widget.active) {
      _beat.stop();
    }
  }

  @override
  void dispose() {
    _beat.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: Tween(
        begin: 1.0,
        end: 1.04,
      ).animate(CurvedAnimation(parent: _beat, curve: Curves.easeInOut)),
      child: widget.child,
    );
  }
}
