import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../core/widgets/sticker_text.dart';
import '../activity_controller.dart';
import '../activity_models.dart';
import 'step_kit.dart';

/// Find every one: "all the D and d", "7 on the train". Each one found turns
/// green and is counted; a wrong tap wobbles and the hunt goes on. It ends by
/// itself when the last is found, so there is no Done to forget.
class LetterHuntStep extends StatefulWidget {
  const LetterHuntStep({
    required this.controller,
    required this.item,
    super.key,
  });

  final ActivityPlayController controller;
  final LetterHuntItem item;

  @override
  State<LetterHuntStep> createState() => _LetterHuntStepState();
}

class _LetterHuntStepState extends State<LetterHuntStep> {
  final _found = <int>{};
  final _shake = <int, int>{};
  int _mistakes = 0;

  bool get _done => widget.controller.chosen.value != null;

  void _tap(int cell) {
    if (_done || _found.contains(cell)) return;
    final item = widget.item;

    if (item.targets.contains(item.cells[cell])) {
      setState(() => _found.add(cell));
      if (_found.length == item.toFind) {
        widget.controller.finishItem(right: _mistakes == 0);
      }
      return;
    }

    setState(() {
      _mistakes += 1;
      _shake[cell] = (_shake[cell] ?? 0) + 1;
    });
    widget.controller.missed();
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final count = item.cells.length;
    // A short row reads as the Numeracy book's train; a long one as a grid.
    final columns = count <= 6
        ? count
        : count <= 12
        ? 4
        : count <= 20
        ? 5
        : 6;

    return Obx(
      () => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
        child: Column(
          children: [
            Text(
              item.say,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 10),
            Semantics(
              label: 'Found ${_found.length} of ${item.toFind}',
              excludeSemantics: true,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('Found', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(width: 8),
                  StickerText(
                    '${_found.length}',
                    size: 32,
                    colour: StepInk.right,
                  ),
                  const SizedBox(width: 8),
                  Text('of', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(width: 8),
                  StickerText('${item.toFind}', size: 32),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: Center(
                child: GridView.count(
                  shrinkWrap: true,
                  crossAxisCount: columns,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  children: [
                    for (var cell = 0; cell < count; cell++)
                      PlayTile(
                        radius: 40,
                        look: _found.contains(cell)
                            ? TileLook.right
                            : TileLook.idle,
                        shake: _shake[cell] ?? 0,
                        onTap: () => _tap(cell),
                        semanticLabel: item.cells[cell],
                        child: Center(
                          child: Padding(
                            padding: const EdgeInsets.all(6),
                            child: FittedBox(
                              child: Glyph(item.cells[cell], size: 44),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 10),
            if (_done)
              StepDone(
                controller: widget.controller,
                shown: 'You found them all!',
              ),
          ],
        ),
      ),
    );
  }
}
