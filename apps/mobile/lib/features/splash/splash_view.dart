import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lottie/lottie.dart';

/// The launch screen: the sky-and-flowers picture, and the Poetree logo
/// zooming out among sparkles, played once.
///
/// It stands in front of the app while [startUp] runs, and hands over — a
/// cross-fade into the app's first screen — only when both the animation has
/// finished and start-up has. Start-up that outlasts the animation keeps its
/// last frame on screen; an animation that cannot load is skipped rather than
/// holding the app back.
///
/// It is the root widget at launch and nowhere else, so it plays on a cold
/// start only; coming back to the app from the background goes straight to
/// where the user was.
class SplashGate extends StatefulWidget {
  const SplashGate({required this.startUp, required this.app, super.key});

  /// Everything the app needs before its first screen. Called again by Try
  /// again after it throws.
  final Future<void> Function() startUp;

  /// The app itself, built once [startUp] has finished.
  final WidgetBuilder app;

  /// The animation. Its canvas is wider than its design (see [_design]).
  static const animation = 'assets/animations/poetree_magical_entrance_2s.json';

  /// Drawn by the screen rather than the animation, so it can fill any shape
  /// of screen while the logo stays whole.
  static const background = 'assets/images/magical_sky_flower_background.png';

  /// The sky, shown for the moment before the picture is decoded. Android's
  /// own launch screen is the same colour (`splash_sky` in the app's
  /// resources), so start-up goes sky to sky with no white in between.
  static const sky = Color(0xFF91D1D8);

  @override
  State<SplashGate> createState() => _SplashGateState();
}

/// Start-up's steps, run in order.
///
/// A step that throws stops the run there, and running again carries on from
/// that step: Try again on the splash never sets up twice what already worked.
class StartUp {
  StartUp(this._steps);

  final List<Future<void> Function()> _steps;
  var _next = 0;

  Future<void> run() async {
    for (; _next < _steps.length; _next++) {
      await _steps[_next]();
    }
  }
}

class _SplashGateState extends State<SplashGate>
    with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(vsync: this);
  LottieComposition? _composition;

  var _played = false;
  var _ready = false;
  Object? _failure;

  @override
  void initState() {
    super.initState();
    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed) setState(() => _played = true);
    });
    _loadAnimation();
    _runStartUp();
  }

  void _retry() {
    setState(() => _failure = null);
    _runStartUp();
  }

  Future<void> _loadAnimation() async {
    try {
      final composition = await AssetLottie(SplashGate.animation).load();
      if (!mounted) return;
      setState(() => _composition = composition);
      _controller
        ..duration = composition.duration
        ..forward();
    } on Object catch (error) {
      debugPrint('Splash animation did not load, skipping it: $error');
      if (mounted) setState(() => _played = true);
    }
  }

  Future<void> _runStartUp() async {
    try {
      await widget.startUp();
      if (mounted) setState(() => _ready = true);
    } on Object catch (error, stack) {
      FlutterError.reportError(
        FlutterErrorDetails(
          exception: error,
          stack: stack,
          library: 'poetree start-up',
        ),
      );
      if (mounted) setState(() => _failure = error);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Both only ever become true, so once the app is shown it stays: one
    // hand-over, however many times this rebuilds.
    final showApp = _played && _ready;

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 450),
      switchInCurve: Curves.easeOut,
      // Every child fills the screen, as the root widget would.
      layoutBuilder: (current, previous) => Stack(
        // Above any app, so there is no reading direction to align by.
        alignment: Alignment.center,
        fit: StackFit.expand,
        children: [...previous, ?current],
      ),
      child: showApp
          ? KeyedSubtree(
              key: const ValueKey('app'),
              child: Builder(builder: widget.app),
            )
          : _SplashScreen(
              key: const ValueKey('splash'),
              composition: _composition,
              progress: _controller,
              failed: _failure != null,
              onRetry: _retry,
            ),
    );
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen({
    required this.composition,
    required this.progress,
    required this.failed,
    required this.onRetry,
    super.key,
  });

  final LottieComposition? composition;
  final Animation<double> progress;
  final bool failed;
  final VoidCallback onRetry;

  /// The designer's frame: the logo and sparkles are placed for a 498 × 852
  /// portrait screen. The animation's own canvas is wider than this, so the
  /// logo, which starts much larger than the frame, is never cut off at the
  /// canvas's edge on a wide screen.
  static const _design = Size(498, 852);

  @override
  Widget build(BuildContext context) {
    final composition = this.composition;

    // Before the app exists there is no MaterialApp to supply these.
    return MediaQuery.fromView(
      view: View.of(context),
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: AnnotatedRegion<SystemUiOverlayStyle>(
          value: const SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: Brightness.light,
            statusBarBrightness: Brightness.dark,
          ),
          child: ColoredBox(
            color: SplashGate.sky,
            child: Stack(
              fit: StackFit.expand,
              children: [
                // Full-screen behind the system bars, cropped rather than
                // stretched to the phone's shape.
                Image.asset(
                  SplashGate.background,
                  fit: BoxFit.cover,
                  gaplessPlayback: true,
                  excludeFromSemantics: true,
                  frameBuilder: (context, child, frame, synchronous) =>
                      AnimatedOpacity(
                        opacity: synchronous || frame != null ? 1 : 0,
                        duration: const Duration(milliseconds: 180),
                        child: child,
                      ),
                ),
                if (composition != null)
                  // The designer's frame scaled to fit the screen whole: on a
                  // phone it spans the width, on a tablet the height. The
                  // logo is centred and always fully visible at rest.
                  LayoutBuilder(
                    builder: (context, box) {
                      final scale = math.min(
                        box.maxWidth / _design.width,
                        box.maxHeight / _design.height,
                      );
                      final width = composition.bounds.width * scale;
                      final height = composition.bounds.height * scale;
                      // Centred, and free to spill past the screen's sides,
                      // where the logo starts.
                      return OverflowBox(
                        minWidth: width,
                        maxWidth: width,
                        minHeight: height,
                        maxHeight: height,
                        child: Lottie(
                          composition: composition,
                          controller: progress,
                          fit: BoxFit.fill,
                          // Every display frame, not the file's 30 a second:
                          // the zoom is one continuous scale, and smoother so.
                          frameRate: FrameRate.max,
                        ),
                      );
                    },
                  ),
                if (failed) _StartUpFailed(onRetry: onRetry),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Start-up threw. Said plainly at the foot of the splash, over the flowers,
/// with one thing to do about it.
class _StartUpFailed extends StatelessWidget {
  const _StartUpFailed({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.paddingOf(context);

    return Positioned(
      left: 24,
      right: 24,
      bottom: inset.bottom + 32,
      child: Semantics(
        liveRegion: true,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.94),
            borderRadius: BorderRadius.circular(20),
            boxShadow: const [
              BoxShadow(
                color: Color(0x33000000),
                blurRadius: 18,
                offset: Offset(0, 6),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
            child: DefaultTextStyle(
              style: const TextStyle(
                fontFamily: 'Poppins',
                fontSize: 15,
                height: 1.35,
                color: Color(0xFF1D2560),
              ),
              textAlign: TextAlign.center,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'The app could not start',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Please check your internet connection and try again.',
                  ),
                  const SizedBox(height: 14),
                  Semantics(
                    button: true,
                    child: GestureDetector(
                      onTap: onRetry,
                      child: Container(
                        height: 48,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: const Color(0xFFF28C1B),
                          borderRadius: BorderRadius.circular(24),
                        ),
                        child: const Text(
                          'Try again',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
