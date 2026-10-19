import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lottie/lottie.dart';
import 'package:poetree_school/features/splash/splash_view.dart';

/// Stands in for the app: counts how many times it is set up.
class _App extends StatefulWidget {
  const _App();

  static var created = 0;

  @override
  State<_App> createState() => _AppState();
}

class _AppState extends State<_App> {
  @override
  void initState() {
    super.initState();
    _App.created++;
  }

  @override
  Widget build(BuildContext context) => const Directionality(
    textDirection: TextDirection.ltr,
    child: Text('app'),
  );
}

/// Loads the animation for real, as the phone does: asset, JSON and the
/// embedded logo, decoded. Cached, so the splash's own load is then instant.
Future<LottieComposition> _load(WidgetTester tester) async =>
    (await tester.runAsync(() => AssetLottie(SplashGate.animation).load()))!;

void main() {
  setUp(() => _App.created = 0);

  testWidgets('the animation loads whole and plays for two seconds', (
    tester,
  ) async {
    final composition = await _load(tester);

    expect(composition.warnings, isEmpty);
    expect(composition.duration, const Duration(seconds: 2));
    expect(composition.frameRate, 30);
    // The logo and its four sparkles; the sky is the screen's to draw.
    expect(composition.images.keys, ['logo']);
    expect(composition.images['logo']!.loadedImage, isNotNull);
    // Wider than the designer's 498 × 852, so the logo, which starts larger
    // than that, is never clipped at the canvas's edge.
    expect(composition.bounds.width, greaterThan(498));
    expect(composition.bounds.height, 852);
  });

  testWidgets('the app appears once the animation and start-up are both done', (
    tester,
  ) async {
    await _load(tester);
    final startUp = Completer<void>();

    await tester.pumpWidget(
      SplashGate(startUp: () => startUp.future, app: (_) => const _App()),
    );
    await tester.pump();
    expect(find.byType(Lottie), findsOneWidget);

    // Start-up finishes first: the animation still plays to its end.
    startUp.complete();
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('app'), findsNothing);

    await tester.pump(const Duration(milliseconds: 1100));
    await tester.pumpAndSettle();
    expect(find.text('app'), findsOneWidget);
    expect(find.byType(Lottie), findsNothing);

    // However often the root rebuilds, the hand-over happens once.
    await tester.pump(const Duration(seconds: 3));
    expect(_App.created, 1);
  });

  testWidgets('a slow start-up holds the last frame until it is done', (
    tester,
  ) async {
    await _load(tester);
    final startUp = Completer<void>();

    await tester.pumpWidget(
      SplashGate(startUp: () => startUp.future, app: (_) => const _App()),
    );
    await tester.pump();
    await tester.pump(const Duration(seconds: 5));
    expect(find.byType(Lottie), findsOneWidget);
    expect(_App.created, 0);

    startUp.complete();
    await tester.pumpAndSettle();
    expect(find.text('app'), findsOneWidget);
  });

  testWidgets('a start-up that fails offers Try again, which carries on', (
    tester,
  ) async {
    await _load(tester);
    final ran = <String>[];
    var connected = false;
    final startUp = StartUp([
      () async => ran.add('storage'),
      () async {
        ran.add('session');
        if (!connected) throw StateError('no connection');
      },
      () async => ran.add('theme'),
    ]);

    await tester.pumpWidget(
      SplashGate(startUp: startUp.run, app: (_) => const _App()),
    );
    await tester.pump();
    expect(tester.takeException(), isStateError);
    await tester.pump(const Duration(seconds: 3));

    expect(find.text('The app could not start'), findsOneWidget);
    expect(_App.created, 0);

    connected = true;
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();

    expect(find.text('app'), findsOneWidget);
    // The step that worked the first time was not run again.
    expect(ran, ['storage', 'session', 'session', 'theme']);
  });
}
