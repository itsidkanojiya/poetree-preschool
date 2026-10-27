import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../core/widgets/sticker_text.dart';
import '../activity_controller.dart';
import '../activity_models.dart';
import 'step_kit.dart';

/// Colour exactly N: the number big in Tracing's sticker style, the pictures
/// in grey, and each tap colours one and counts it. Tapping a coloured one
/// takes it back. Done checks the count; a second wrong count colours the
/// right number for the child to see.
///
/// The grey is the app's own: the picture is the author's ordinary colour
/// picture, drawn without its colour until it is tapped.
class CountOutStep extends StatefulWidget {
  const CountOutStep({required this.controller, required this.item, super.key});

  final ActivityPlayController controller;
  final CountOutItem item;

  @override
  State<CountOutStep> createState() => _CountOutStepState();
}

class _CountOutStepState extends State<CountOutStep> {
  final _coloured = <int>{};
  int _wrongChecks = 0;
  String? _message;

  bool get _done => widget.controller.chosen.value != null;

  void _tap(int tile) {
    if (_done) return;
    setState(() {
      if (!_coloured.remove(tile)) _coloured.add(tile);
      _message = null;
    });
  }

  void _check() {
    final target = widget.item.target;
    if (_coloured.length == target) {
      widget.controller.finishItem(right: _wrongChecks == 0);
      return;
    }

    setState(() {
      _wrongChecks += 1;
      widget.controller.missed();
      if (_wrongChecks >= 2) {
        // The right number, coloured, so they can count it with a finger.
        _coloured
          ..clear()
          ..addAll(List.generate(target, (i) => i));
        _message = null;
      } else {
        _message = _coloured.length < target
            ? 'You coloured ${_coloured.length}. Colour $target.'
            : 'That is more than $target. Tap one to take it back.';
      }
    });
    if (_wrongChecks >= 2) widget.controller.finishItem(right: false);
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final columns = item.shown <= 6
        ? 3
        : item.shown <= 12
        ? 4
        : 5;

    return Obx(
      () => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
        child: Column(
          children: [
            Row(
              children: [
                Semantics(
                  label: 'Colour ${item.target}',
                  excludeSemantics: true,
                  child: StickerText('${item.target}', size: 64),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    item.say,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                Semantics(
                  label: '${_coloured.length} coloured',
                  excludeSemantics: true,
                  child: Column(
                    children: [
                      StickerText(
                        '${_coloured.length}',
                        size: 34,
                        colour: StepInk.right,
                      ),
                      Text(
                        'coloured',
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Expanded(
              child: GridView.count(
                crossAxisCount: columns,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                children: [
                  for (var tile = 0; tile < item.shown; tile++)
                    PlayTile(
                      radius: 16,
                      look: _coloured.contains(tile)
                          ? TileLook.right
                          : TileLook.idle,
                      onTap: () => _tap(tile),
                      semanticLabel: _coloured.contains(tile)
                          ? 'Coloured'
                          : 'Not coloured',
                      child: MediaView(
                        item.picture,
                        grey: !_coloured.contains(tile),
                        size: 36,
                        padding: 6,
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            if (_done)
              StepDone(
                controller: widget.controller,
                shown: 'Here are ${item.target}. Count them with me!',
              )
            else ...[
              if (_message != null) ...[
                StepFeedback(_message!, good: false),
                const SizedBox(height: 10),
              ],
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _coloured.isEmpty ? null : _check,
                  child: const Text('Done'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
