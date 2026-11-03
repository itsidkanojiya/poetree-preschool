import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/core/widgets/youtube_guard.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// A preschool app must not be a way into YouTube itself. The players may show
/// only their own video's embed page, and the way out to the YouTube app waits
/// for a grown-up.

NavigationRequest _go(String url, {bool mainFrame = true}) =>
    NavigationRequest(url: url, isMainFrame: mainFrame);

/// Always rolls the lowest numbers, so the sum is 11 + 3.
class _Lowest implements Random {
  @override
  int nextInt(int max) => 0;
  @override
  bool nextBool() => false;
  @override
  double nextDouble() => 0;
}

/// Opens the grown-up check. The returned function reads its answer, which
/// only exists once the dialog has closed.
Future<bool? Function()> _ask(WidgetTester tester) async {
  bool? result;
  await tester.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (context) => TextButton(
          onPressed: () async =>
              result = await confirmGrownUp(context, random: _Lowest()),
          child: const Text('Open'),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Open'));
  await tester.pumpAndSettle();
  return () => result;
}

void main() {
  group('a player', () {
    test('may show its own video’s embed page', () {
      expect(
        embedOnly(
          _go('https://www.youtube.com/embed/abc123?autoplay=1&controls=0'),
          'abc123',
        ),
        NavigationDecision.navigate,
      );
    });

    test('may not leave for anywhere else on YouTube', () {
      for (final url in [
        'https://www.youtube.com/watch?v=abc123',
        'https://www.youtube.com/',
        'https://www.youtube.com/results?search_query=cartoons',
        'https://www.youtube.com/embed/someOtherVideo',
        'https://m.youtube.com/watch?v=abc123',
        'http://www.youtube.com/embed/abc123',
      ]) {
        expect(
          embedOnly(_go(url), 'abc123'),
          NavigationDecision.prevent,
          reason: url,
        );
      }
    });

    test('may not leave YouTube altogether', () {
      for (final url in [
        'https://www.google.com/',
        'https://evil.example/embed/abc123',
        'https://www.youtube.com.evil.example/embed/abc123',
        'intent://youtube.com/watch?v=abc123#Intent;end',
      ]) {
        expect(
          embedOnly(_go(url), 'abc123'),
          NavigationDecision.prevent,
          reason: url,
        );
      }
    });

    test('leaves the frames inside its own page alone', () {
      // The embed player is built from frames of its own; refusing them would
      // break the film, not keep anyone in.
      expect(
        embedOnly(
          _go('https://www.youtube.com/s/player/frame.html', mainFrame: false),
          'abc123',
        ),
        NavigationDecision.navigate,
      );
    });
  });

  group('the way out to YouTube', () {
    testWidgets('asks a grown-up first', (tester) async {
      final answer = await _ask(tester);
      expect(find.text('For grown-ups'), findsOneWidget);
      expect(find.textContaining('what is 11 + 3?'), findsOneWidget);

      await tester.enterText(find.byType(TextField), '14');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      expect(answer(), isTrue);
      expect(find.text('For grown-ups'), findsNothing);
    });

    testWidgets('stays shut for a wrong answer', (tester) async {
      final answer = await _ask(tester);
      await tester.enterText(find.byType(TextField), '5');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      expect(find.text('That is not right. Try again.'), findsOneWidget);
      expect(find.text('For grown-ups'), findsOneWidget);
      expect(answer(), isNull);
    });

    testWidgets('stays shut when cancelled', (tester) async {
      final answer = await _ask(tester);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();

      expect(answer(), isFalse);
    });
  });
}
