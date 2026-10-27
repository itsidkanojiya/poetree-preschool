import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../core/widgets/authed_image.dart';
import '../activity_controller.dart';
import '../activity_models.dart';
import 'step_kit.dart';

/// Put each card in its basket. One card at a time comes up; the child drags
/// it onto a basket, or taps the basket. A right one drops in and stays; a
/// wrong one bounces back. Two misses on the same card and the app puts it
/// where it belongs, and says so.
class SortGroupsStep extends StatefulWidget {
  const SortGroupsStep({
    required this.controller,
    required this.item,
    super.key,
  });

  final ActivityPlayController controller;
  final SortGroupsItem item;

  @override
  State<SortGroupsStep> createState() => _SortGroupsStepState();
}

class _SortGroupsStepState extends State<SortGroupsStep> {
  /// The order the cards come up in: not the author's, which tends to put
  /// all the healthy food first.
  late final List<int> order = steadyShuffle(
    widget.item.cards.length,
    widget.controller.index.value * 17 + widget.item.cards.length,
  );

  int _at = 0;
  final _placed = <int, int>{};
  int _mistakes = 0;
  int _missesHere = 0;
  int _shake = 0;
  int? _shownGroup;
  String? _message;

  bool get _done => widget.controller.chosen.value != null;
  int? get _current => _at < order.length ? order[_at] : null;

  void _drop(int group) {
    final card = _current;
    if (_done || card == null) return;
    final belongs = widget.item.cards[card].group;

    setState(() {
      if (group == belongs) {
        _placed[card] = group;
        _at += 1;
        _missesHere = 0;
        _shownGroup = null;
        _message = null;
      } else {
        _mistakes += 1;
        _missesHere += 1;
        _shake += 1;
        widget.controller.missed();
        if (_missesHere >= 2) {
          _placed[card] = belongs;
          _at += 1;
          _missesHere = 0;
          _shownGroup = belongs;
          _message = 'That one goes in ${widget.item.groups[belongs].label}.';
        } else {
          _message = 'Not that basket. Try again!';
        }
      }
    });

    if (_at == order.length) {
      widget.controller.finishItem(right: _mistakes == 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    return Obx(
      () => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
        child: Column(
          children: [
            StepPrompt(
              say: item.prompt.say,
              glyph: item.prompt.glyph,
              imagePath: item.prompt.imagePath,
              pictureHeight: 70,
            ),
            const SizedBox(height: 8),
            _Dots(total: order.length, done: _at),
            Expanded(child: Center(child: _card(context))),
            if (_done)
              StepDone(controller: widget.controller)
            else if (_message != null)
              StepFeedback(_message!, good: false),
            const SizedBox(height: 10),
            SizedBox(
              height: 150,
              child: Row(
                children: [
                  for (var group = 0; group < item.groups.length; group++) ...[
                    if (group > 0) const SizedBox(width: 10),
                    Expanded(child: _basket(context, group)),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _card(BuildContext context) {
    final card = _current;
    if (card == null) {
      return const Icon(
        Icons.check_circle_rounded,
        size: 72,
        color: StepInk.right,
      );
    }
    final media = widget.item.cards[card].media;
    final tile = SizedBox(
      width: 132,
      height: 132,
      child: PlayTile(shake: _shake, child: MediaView(media, size: 64)),
    );
    return Draggable<int>(
      data: card,
      feedback: Material(
        color: Colors.transparent,
        child: SizedBox(
          width: 140,
          height: 140,
          child: PlayTile(
            look: TileLook.picked,
            child: MediaView(media, size: 64),
          ),
        ),
      ),
      childWhenDragging: Opacity(opacity: 0.25, child: tile),
      child: tile,
    );
  }

  Widget _basket(BuildContext context, int group) {
    final basket = widget.item.groups[group];
    final inside = [
      for (final entry in _placed.entries)
        if (entry.value == group) widget.item.cards[entry.key].media,
    ];

    return DragTarget<int>(
      onWillAcceptWithDetails: (_) => !_done,
      onAcceptWithDetails: (_) => _drop(group),
      builder: (context, hovering, _) {
        final lit = hovering.isNotEmpty || _shownGroup == group;
        return Semantics(
          button: true,
          label: basket.label,
          child: Material(
            color: lit ? StepInk.pickedSoft : StepInk.tile,
            borderRadius: BorderRadius.circular(20),
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: () => _drop(group),
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: lit ? StepInk.picked : const Color(0xFF94A3B8),
                    width: 2,
                  ),
                ),
                child: Column(
                  children: [
                    SizedBox(
                      height: 44,
                      child: basket.imagePath != null
                          ? AuthedImage(
                              path: basket.imagePath!,
                              fit: BoxFit.contain,
                            )
                          : basket.glyph != null
                          ? FittedBox(child: Glyph(basket.glyph!, size: 40))
                          : const Icon(Icons.shopping_basket_rounded, size: 36),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      basket.label,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Expanded(
                      child: Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 2,
                        runSpacing: 2,
                        children: [
                          for (final media in inside)
                            SizedBox(
                              width: 26,
                              height: 26,
                              child: MediaView(media, size: 20, padding: 1),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// How many cards are sorted, as dots.
class _Dots extends StatelessWidget {
  const _Dots({required this.total, required this.done});

  final int total;
  final int done;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$done of $total sorted',
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (var i = 0; i < total; i++)
            Container(
              width: 9,
              height: 9,
              margin: const EdgeInsets.symmetric(horizontal: 3),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: i < done ? StepInk.right : const Color(0xFFCBD5E1),
              ),
            ),
        ],
      ),
    );
  }
}
