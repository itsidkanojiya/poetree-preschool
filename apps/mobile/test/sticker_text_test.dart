import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/core/widgets/sticker_text.dart';

/// The tracing lesson's sticker lettering, shared with the activities.

void main() {
  group('what is a sticker', () {
    test('numbers of any length, and letters one or two at a time', () {
      for (final text in ['3', '10', '125', 'A', 'b', 'Aa', '३', '૭']) {
        expect(StickerText.fits(text), isTrue, reason: text);
      }
    });

    test('a word, an emoji or nothing stays as it was', () {
      for (final text in ['Cat', 'apple', '⭕', '🍎', '', '3 apples']) {
        expect(StickerText.fits(text), isFalse, reason: text);
      }
    });
  });

  test('the lesson’s colours: numbers coral, small letters green', () {
    expect(StickerText.colourFor('7'), const Color(0xFFFF4D66));
    expect(StickerText.colourFor('४'), const Color(0xFFFF4D66));
    expect(StickerText.colourFor('b'), const Color(0xFF22B07D));
    expect(StickerText.colourFor('B'), const Color(0xFF4C7FF0));
  });

  testWidgets('draws a white edge under the coloured number', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Center(child: StickerText('4', size: 60))),
    );

    final layers = tester.widgetList<Text>(find.text('4')).toList();
    expect(layers, hasLength(2));
    final edge = layers.first.style!;
    expect(edge.foreground!.style, PaintingStyle.stroke);
    expect(edge.foreground!.color, Colors.white);
    expect(edge.foreground!.strokeWidth, closeTo(60 * 0.09, 0.001));
    expect(edge.fontWeight, FontWeight.w800);
    expect(layers.last.style!.color, const Color(0xFFFF4D66));
    // Read out once.
    expect(find.bySemanticsLabel('4'), findsOneWidget);
  });
}
