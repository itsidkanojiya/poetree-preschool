import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../activity_controller.dart';
import '../activity_models.dart';
import 'step_kit.dart';

/// Join each one to its partner: tap a card on the left, then its partner on
/// the right (or the other way round). A right pair is joined by a line and
/// stays; a wrong one shakes apart. Two misses on the same card and the app
/// joins it for the child, so nobody is left stuck on a page.
class MatchPairsStep extends StatefulWidget {
  const MatchPairsStep({
    required this.controller,
    required this.item,
    super.key,
  });

  final ActivityPlayController controller;
  final MatchPairsItem item;

  @override
  State<MatchPairsStep> createState() => _MatchPairsStepState();
}

/// One colour per joined pair, so a child can follow each line.
const _pairColours = [
  Color(0xFF22B07D),
  Color(0xFF4C7FF0),
  Color(0xFFE8740C),
  Color(0xFF8E5CF0),
  Color(0xFFE2588B),
];

class _MatchPairsStepState extends State<MatchPairsStep> {
  /// `order[slot]` is which pair's right card sits in that slot.
  late final List<int> order = steadyShuffle(
    widget.item.pairs.length,
    widget.controller.index.value * 31 + widget.item.pairs.length,
  );

  int? _left;
  int? _right;

  /// Pair index → the right-hand slot it was joined to, in the order joined.
  final _joined = <int, int>{};
  final _misses = <int, int>{};
  final _shake = <String, int>{};
  int _mistakes = 0;
  String? _message;

  int get _count => widget.item.pairs.length;
  bool get _done => widget.controller.chosen.value != null;

  void _tapLeft(int pair) {
    if (_done || _joined.containsKey(pair)) return;
    setState(() => _left = _left == pair ? null : pair);
    _try();
  }

  void _tapRight(int slot) {
    if (_done || _joined.containsValue(slot)) return;
    setState(() => _right = _right == slot ? null : slot);
    _try();
  }

  void _try() {
    final pair = _left;
    final slot = _right;
    if (pair == null || slot == null) return;

    setState(() {
      if (order[slot] == pair) {
        _joined[pair] = slot;
        _message = null;
      } else {
        _mistakes += 1;
        _shake['l$pair'] = (_shake['l$pair'] ?? 0) + 1;
        _shake['r$slot'] = (_shake['r$slot'] ?? 0) + 1;
        final misses = (_misses[pair] ?? 0) + 1;
        _misses[pair] = misses;
        widget.controller.missed();
        if (misses >= 2) {
          // Shown, not left as a wall: this is where it goes.
          _joined[pair] = order.indexOf(pair);
          _message = 'This is its partner.';
        } else {
          _message = 'Not that one. Try again!';
        }
      }
      _left = null;
      _right = null;
    });

    if (_joined.length == _count) {
      widget.controller.finishItem(right: _mistakes == 0);
    }
  }

  TileLook _lookLeft(int pair) => _joined.containsKey(pair)
      ? TileLook.right
      : _left == pair
      ? TileLook.picked
      : TileLook.idle;

  TileLook _lookRight(int slot) => _joined.containsValue(slot)
      ? TileLook.right
      : _right == slot
      ? TileLook.picked
      : TileLook.idle;

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
              pictureHeight: 80,
            ),
            const SizedBox(height: 12),
            Expanded(child: LayoutBuilder(builder: _board)),
            const SizedBox(height: 10),
            if (_done)
              StepDone(controller: widget.controller)
            else if (_message != null)
              StepFeedback(_message!, good: false)
            else
              Text(
                'Tap one, then its partner.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
          ],
        ),
      ),
    );
  }

  Widget _board(BuildContext context, BoxConstraints box) {
    final width = box.maxWidth;
    final height = box.maxHeight;
    const gap = 10.0;
    final middle = math.max(48.0, width * 0.18);
    final side = math.min(
      120.0,
      math.min((width - middle) / 2, (height - gap * (_count - 1)) / _count),
    );
    final top = (height - (side * _count + gap * (_count - 1))) / 2;
    final leftX = width / 2 - middle / 2 - side;
    final rightX = width / 2 + middle / 2;
    double rowY(int row) => top + row * (side + gap);

    return Stack(
      children: [
        Positioned.fill(
          child: CustomPaint(
            painter: _Lines([
              for (final (number, entry) in _joined.entries.indexed)
                (
                  from: Offset(leftX + side, rowY(entry.key) + side / 2),
                  to: Offset(rightX, rowY(entry.value) + side / 2),
                  colour: _pairColours[number % _pairColours.length],
                ),
            ]),
          ),
        ),
        for (var pair = 0; pair < _count; pair++)
          Positioned(
            left: leftX,
            top: rowY(pair),
            width: side,
            height: side,
            child: PlayTile(
              look: _lookLeft(pair),
              shake: _shake['l$pair'] ?? 0,
              onTap: () => _tapLeft(pair),
              child: MediaView(widget.item.pairs[pair].left, size: side * 0.5),
            ),
          ),
        for (var slot = 0; slot < _count; slot++)
          Positioned(
            left: rightX,
            top: rowY(slot),
            width: side,
            height: side,
            child: PlayTile(
              look: _lookRight(slot),
              shake: _shake['r$slot'] ?? 0,
              onTap: () => _tapRight(slot),
              child: MediaView(
                widget.item.pairs[order[slot]].right,
                size: side * 0.5,
              ),
            ),
          ),
      ],
    );
  }
}

class _Lines extends CustomPainter {
  _Lines(this.lines);

  final List<({Offset from, Offset to, Color colour})> lines;

  @override
  void paint(Canvas canvas, Size size) {
    for (final line in lines) {
      final paint = Paint()
        ..color = line.colour
        ..strokeWidth = 5
        ..strokeCap = StrokeCap.round;
      canvas
        ..drawLine(line.from, line.to, paint)
        ..drawCircle(line.from, 6, paint)
        ..drawCircle(line.to, 6, paint);
    }
  }

  @override
  bool shouldRepaint(_Lines old) => old.lines.length != lines.length;
}
