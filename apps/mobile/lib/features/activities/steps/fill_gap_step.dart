import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../activity_controller.dart';
import '../activity_models.dart';
import 'step_kit.dart';

/// Complete the row: the train's cars in Tracing's sticker style, the empty
/// ones waiting in order, and the tiles to choose from underneath. A right
/// tile goes into the car; a wrong one shakes. Two misses on the same car and
/// the app fills it, so the row always ends up whole.
class FillGapStep extends StatefulWidget {
  const FillGapStep({required this.controller, required this.item, super.key});

  final ActivityPlayController controller;
  final FillGapItem item;

  @override
  State<FillGapStep> createState() => _FillGapStepState();
}

/// The cars' paint, in turn.
const _carColours = [
  Color(0xFFFDE68A),
  Color(0xFFBFDBFE),
  Color(0xFFFBCFE8),
  Color(0xFFBBF7D0),
  Color(0xFFDDD6FE),
];

class _FillGapStepState extends State<FillGapStep> {
  late final List<int> tiles = steadyShuffle(
    widget.item.choices.length,
    widget.controller.index.value * 13 + widget.item.choices.length,
  );

  final _filled = <int>{};
  final _shake = <int, int>{};
  int _mistakes = 0;
  int _missesHere = 0;
  String? _message;

  bool get _done => widget.controller.chosen.value != null;

  /// The first gap still empty: gaps fill in order, left to right.
  int? get _current {
    final cells = widget.item.cells;
    for (var cell = 0; cell < cells.length; cell++) {
      if (cells[cell].gap && !_filled.contains(cell)) return cell;
    }
    return null;
  }

  /// Whether every gap this value fills is filled: then its tile is spent.
  bool _used(String value) {
    final cells = widget.item.cells;
    var gaps = 0;
    var filled = 0;
    for (var cell = 0; cell < cells.length; cell++) {
      if (!cells[cell].gap || cells[cell].value != value) continue;
      gaps += 1;
      if (_filled.contains(cell)) filled += 1;
    }
    return gaps > 0 && filled == gaps;
  }

  void _choose(int tile) {
    final cell = _current;
    if (_done || cell == null) return;
    final value = widget.item.choices[tile];

    setState(() {
      if (value == widget.item.cells[cell].value) {
        _filled.add(cell);
        _missesHere = 0;
        _message = null;
      } else {
        _mistakes += 1;
        _missesHere += 1;
        _shake[tile] = (_shake[tile] ?? 0) + 1;
        widget.controller.missed();
        if (_missesHere >= 2) {
          _filled.add(cell);
          _missesHere = 0;
          _message = 'That one is ${widget.item.cells[cell].value}.';
        } else {
          _message = 'Not that one. Try again!';
        }
      }
    });

    if (_current == null) {
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
            ),
            const SizedBox(height: 24),
            LayoutBuilder(builder: _row),
            const Spacer(),
            if (_done)
              StepDone(controller: widget.controller)
            else ...[
              if (_message != null) ...[
                StepFeedback(_message!, good: false),
                const SizedBox(height: 12),
              ],
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // A tile already in its car leaves the choices, so what
                  // is left is what is still to place.
                  for (final tile in tiles)
                    if (!_used(item.choices[tile]))
                      // As wide as the screen allows, never wider than a
                      // finger needs: four tiles fit a small phone.
                      Flexible(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 5),
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 82),
                            child: AspectRatio(
                              aspectRatio: 1,
                              child: PlayTile(
                                shake: _shake[tile] ?? 0,
                                onTap: () => _choose(tile),
                                semanticLabel: item.choices[tile],
                                child: Center(
                                  child: FittedBox(
                                    child: Glyph(item.choices[tile], size: 54),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _row(BuildContext context, BoxConstraints box) {
    final cells = widget.item.cells;
    const gap = 6.0;
    final side = math.min(
      68.0,
      (box.maxWidth - gap * (cells.length - 1)) / cells.length,
    );
    final current = _current;

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var cell = 0; cell < cells.length; cell++) ...[
          if (cell > 0) const SizedBox(width: gap),
          _car(cells[cell], cell, side, waiting: cell == current),
        ],
      ],
    );
  }

  Widget _car(GapCell cell, int at, double side, {required bool waiting}) {
    final empty = cell.gap && !_filled.contains(at);
    return Semantics(
      label: empty ? 'Empty' : cell.value,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: side,
            height: side,
            decoration: BoxDecoration(
              color: empty
                  ? Colors.white
                  : _carColours[at % _carColours.length],
              borderRadius: BorderRadius.circular(side * 0.2),
              // The gap waiting for a tile is outlined; the rest keep the
              // same width of edge, clear, so nothing shifts as gaps fill.
              border: Border.all(
                color: waiting
                    ? StepInk.picked
                    : empty
                    ? const Color(0xFFCBD5E1)
                    : Colors.transparent,
                width: 3,
              ),
              boxShadow: empty
                  ? null
                  : [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.08),
                        blurRadius: 6,
                        offset: const Offset(0, 3),
                      ),
                    ],
            ),
            alignment: Alignment.center,
            child: empty
                ? Text(
                    '?',
                    style: TextStyle(
                      fontSize: side * 0.42,
                      fontWeight: FontWeight.w800,
                      color: waiting ? StepInk.picked : const Color(0xFFCBD5E1),
                    ),
                  )
                : Padding(
                    padding: EdgeInsets.all(side * 0.1),
                    child: FittedBox(
                      child: Glyph(cell.value, size: side * 0.62),
                    ),
                  ),
          ),
          // The wheels' rail: what makes a row of boxes a train.
          Container(
            width: side * 0.8,
            height: 5,
            margin: const EdgeInsets.only(top: 3),
            decoration: BoxDecoration(
              color: const Color(0xFF374151),
              borderRadius: BorderRadius.circular(3),
            ),
          ),
        ],
      ),
    );
  }
}
