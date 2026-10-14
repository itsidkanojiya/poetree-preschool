import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/features/parent/parent_tab_bar.dart';

/// The parent app's bottom bar on a phone: four tabs, the chosen one marked,
/// and room left for the phone's own gesture bar.

Widget _bar({
  required int selected,
  required ValueChanged<int> onSelect,
  double bottomInset = 0,
}) => MaterialApp(
  home: MediaQuery(
    data: MediaQueryData(
      size: const Size(320, 640),
      padding: EdgeInsets.only(bottom: bottomInset),
    ),
    child: Scaffold(
      body: const SizedBox.expand(),
      bottomNavigationBar: ParentTabBar(selected: selected, onSelect: onSelect),
    ),
  ),
);

void main() {
  testWidgets('shows all four tabs and says which one was tapped', (
    tester,
  ) async {
    final tapped = <int>[];
    await tester.binding.setSurfaceSize(const Size(320, 640));
    await tester.pumpWidget(_bar(selected: 0, onSelect: tapped.add));

    for (final label in ['Home', 'Learning', 'Progress', 'Settings']) {
      expect(find.text(label), findsOneWidget);
    }

    await tester.tap(find.text('Progress'));
    await tester.tap(find.text('Settings'));
    await tester.tap(find.text('Learning'));
    await tester.tap(find.text('Home'));
    expect(tapped, [2, 3, 1, 0]);

    // Nothing spills over on the narrowest phones.
    expect(tester.takeException(), isNull);
  });

  testWidgets('marks the tab it is given, and only that one', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    await tester.pumpWidget(_bar(selected: 2, onSelect: (_) {}));
    await tester.pumpAndSettle();

    final selected = tester
        .widgetList<Semantics>(find.byType(Semantics))
        .where((s) => s.properties.selected == true)
        .map((s) => s.properties.label)
        .toList();
    expect(selected, ['Progress']);
  });

  testWidgets('sits above the gesture bar', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    await tester.pumpWidget(_bar(selected: 0, onSelect: (_) {}));
    final flat = tester.getSize(find.byType(ParentTabBar)).height;

    await tester.pumpWidget(
      _bar(selected: 0, onSelect: (_) {}, bottomInset: 24),
    );
    final raised = tester.getSize(find.byType(ParentTabBar)).height;

    // The inset is added beneath the tabs, not taken out of them.
    expect(raised - flat, closeTo(24 - 8, 0.5));
    expect(tester.getBottomLeft(find.text('Home')).dy, lessThan(640 - 24));
  });
}
