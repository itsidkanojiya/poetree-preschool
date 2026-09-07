import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/core/theme/app_theme.dart';

/// Every FilledButton in this app is full width by default.
///
/// The theme sets `minimumSize: Size.fromHeight(54)`, and `Size.fromHeight` is
/// `Size(double.infinity, 54)` — an infinite *minimum width*. That is
/// deliberate: a primary button that fills its column is the right shape on a
/// phone, and it saves every screen from saying so.
///
/// The cost is that one of these inside a Row cannot fit. In debug you get the
/// yellow overflow stripes; in a release build you get silence and a button
/// pushed off the edge of the screen. That is what happened on the tracing
/// page: a child traced the number and then sat there, because Next had been
/// laid out past the right edge and nothing said so.
///
/// So this is written down as a test rather than as a comment somebody edits
/// away.
void main() {
  Widget host(Widget child) => MaterialApp(
    theme: AppTheme.light,
    home: Scaffold(body: child),
  );

  test('the theme asks every FilledButton for infinite width', () {
    // Asserted directly rather than by provoking a real overflow, which throws
    // a screenful of stack trace into every test run. The rule is the same: an
    // infinite minimum width cannot sit beside anything in a Row.
    final size = AppTheme.light.filledButtonTheme.style?.minimumSize
        ?.resolve(<WidgetState>{});

    expect(size, isNotNull);
    expect(size!.width, double.infinity);
    expect(size.height, 54);
  });

  testWidgets('the same button in a Column fits, which is why they stack', (
    tester,
  ) async {
    await tester.pumpWidget(
      host(
        Column(
          children: [
            const Align(
              alignment: Alignment.centerLeft,
              child: Text('Start again'),
            ),
            FilledButton(onPressed: () {}, child: const Text('Next')),
          ],
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    expect(find.text('Next'), findsOneWidget);

    // And it really is full width, which is the point of the default.
    final button = tester.getSize(find.byType(FilledButton));
    expect(button.width, tester.getSize(find.byType(Column)).width);
  });
}
