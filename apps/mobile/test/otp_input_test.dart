import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/core/widgets/kid_ui.dart';

void main() {
  Future<({TextEditingController code, List<String> completed})> pump(
    WidgetTester tester, {
    int length = 4,
  }) async {
    final code = TextEditingController();
    final completed = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: OtpInput(
              controller: code,
              length: length,
              onCompleted: completed.add,
            ),
          ),
        ),
      ),
    );
    return (code: code, completed: completed);
  }

  testWidgets('one box per digit, and each digit lands in its own box', (
    tester,
  ) async {
    final input = await pump(tester);

    await tester.enterText(find.byType(TextField), '12');
    await tester.pump();

    expect(find.text('1'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(input.completed, isEmpty);
  });

  testWidgets('a full code is reported once, however often it is touched', (
    tester,
  ) async {
    final input = await pump(tester);

    // A pasted code, or one the keyboard offers from a text message.
    await tester.enterText(find.byType(TextField), '1234');
    await tester.pump();
    input.code.selection = const TextSelection.collapsed(offset: 2);
    await tester.pump();

    expect(input.completed, ['1234']);
  });

  testWidgets('letters are refused and a long paste is cut to length', (
    tester,
  ) async {
    final input = await pump(tester, length: 6);

    await tester.enterText(find.byType(TextField), '12ab345678');
    await tester.pump();

    expect(input.code.text, '123456');
    expect(input.completed, ['123456']);
  });

  testWidgets('a row never tapped can leave the screen cleanly', (
    tester,
  ) async {
    // A confirmed code is never focused, so its caret was first made while
    // the screen was being torn down, which threw.
    await pump(tester);
    await tester.pumpWidget(const SizedBox.shrink());

    expect(tester.takeException(), isNull);
  });
}
