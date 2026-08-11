import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';

/// Obx rules, and the two ways this app broke them.
///
/// Both faults reached a real phone because nothing here ever rendered a
/// widget. The analyser cannot see either: they are runtime contracts, not
/// type errors.
///
///   1. An Obx whose builder reads no observable throws outright. The teacher's
///      home screen watched `pendingCount`, which was a plain int, and the
///      screen was a red error box on launch.
///
///   2. An observable read inside a CALLBACK the Obx returns — rather than in
///      the closure itself — subscribes to nothing. The parent's bottom bar
///      moved its highlight and the page underneath never changed.
void main() {
  setUp(Get.reset);

  Widget host(Widget child) => MaterialApp(home: Scaffold(body: child));

  testWidgets('an Obx over a plain field throws', (tester) async {
    var plain = 0;

    await tester.pumpWidget(host(Obx(() => Text('$plain'))));

    // This is the crash, reproduced: GetX refuses a builder with nothing to
    // rebuild on rather than silently never updating.
    expect(tester.takeException(), isNotNull);
    plain += 1;
  });

  testWidgets('an Obx over an observable rebuilds', (tester) async {
    final count = 0.obs;

    await tester.pumpWidget(host(Obx(() => Text('${count.value}'))));
    expect(find.text('0'), findsOneWidget);

    count.value = 3;
    await tester.pump();
    expect(find.text('3'), findsOneWidget);
  });

  testWidgets('reading inside a returned callback does NOT subscribe', (
    tester,
  ) async {
    // The bottom-bar bug in miniature, and modelled exactly: the closure DOES
    // read one observable — the parent screen read isLoading and the child
    // list — so GetX does not complain. The tab was read inside the callback
    // AsyncView invokes during its own build, which is outside the closure,
    // and that read subscribed to nothing.
    final loading = false.obs;
    final tab = 0.obs;

    await tester.pumpWidget(
      host(
        Obx(() {
          // ignore: unnecessary_statements — stands for the reads the real
          // screen makes, which are what keep GetX satisfied.
          loading.value;
          return _Deferred(builder: (_) => Text('tab ${tab.value}'));
        }),
      ),
    );
    expect(find.text('tab 0'), findsOneWidget);

    tab.value = 2;
    await tester.pump();

    // Still on the old tab. This is what "the bottom bar is not working"
    // looked like: the highlight moved, the page did not.
    expect(find.text('tab 0'), findsOneWidget);
    expect(find.text('tab 2'), findsNothing);

    // And it comes right as soon as something the closure DOES watch changes,
    // which is why it looked intermittent rather than broken.
    loading.value = true;
    await tester.pump();
    expect(find.text('tab 2'), findsOneWidget);
  });

  testWidgets('reading in the closure first fixes it', (tester) async {
    final tab = 0.obs;

    await tester.pumpWidget(
      host(
        Obx(() {
          // The fix: resolve inside the closure, then hand the plain value on.
          final value = tab.value;
          return _Deferred(builder: (_) => Text('tab $value'));
        }),
      ),
    );
    expect(find.text('tab 0'), findsOneWidget);

    tab.value = 2;
    await tester.pump();
    expect(find.text('tab 2'), findsOneWidget);
  });
}

/// Stands in for AsyncView: a widget that takes a builder and invokes it during
/// its own build, not the caller's.
class _Deferred extends StatelessWidget {
  const _Deferred({required this.builder});

  final WidgetBuilder builder;

  @override
  Widget build(BuildContext context) => builder(context);
}
