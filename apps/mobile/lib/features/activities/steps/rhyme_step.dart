import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../core/audio/speech_service.dart';
import '../../../core/widgets/authed_image.dart';
import '../activity_controller.dart';
import '../activity_models.dart';
import 'step_kit.dart';

/// A rhyme or a story to say along with: the picture, the words a line at a
/// time, and "Read it to me", which reads each line in turn and lights it up.
///
/// The phone's voice does not say when a line has finished, so the light moves
/// on after the time a line takes at the app's slow reading pace — near
/// enough to follow with a finger. Tapping a line reads just that line.
class RhymeStep extends StatefulWidget {
  const RhymeStep({required this.controller, required this.item, super.key});

  final ActivityPlayController controller;
  final CardItem item;

  @override
  State<RhymeStep> createState() => _RhymeStepState();
}

class _RhymeStepState extends State<RhymeStep> {
  int? _reading;
  Timer? _timer;

  SpeechService? get _voice =>
      Get.isRegistered<SpeechService>() ? Get.find<SpeechService>() : null;

  /// About as long as the app's slow voice takes over a line.
  static Duration lineTime(String line) =>
      Duration(milliseconds: 700 + line.split(RegExp(r'\s+')).length * 520);

  void _read(int line) {
    _timer?.cancel();
    final lines = widget.item.lines;
    if (line >= lines.length) {
      setState(() => _reading = null);
      widget.controller.seen();
      return;
    }
    setState(() => _reading = line);
    unawaited(_voice?.say(lines[line]));
    _timer = Timer(lineTime(lines[line]), () => _read(line + 1));
  }

  void _readOne(int line) {
    _timer?.cancel();
    setState(() => _reading = line);
    unawaited(_voice?.say(widget.item.lines[line]));
  }

  @override
  void dispose() {
    _timer?.cancel();
    unawaited(_voice?.stop());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: Column(
        children: [
          if (item.imagePath != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: AuthedImage(
                path: item.imagePath!,
                height: 170,
                fit: BoxFit.contain,
              ),
            )
          else if (item.glyph != null)
            Glyph(item.glyph!, size: 80),
          const SizedBox(height: 12),
          Text(
            item.title,
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: ListView(
              children: [
                for (var line = 0; line < item.lines.length; line++)
                  _Line(
                    text: item.lines[line],
                    lit: line == _reading,
                    onTap: () => _readOne(line),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _read(0),
                  icon: const Icon(Icons.volume_up_rounded),
                  label: Text(_reading == null ? 'Read it to me' : 'Again'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: () {
                    _timer?.cancel();
                    widget.controller
                      ..seen()
                      ..next();
                  },
                  child: Text(widget.controller.isLast ? 'Finish' : 'Next'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.text, required this.lit, required this.onTap});

  final String text;
  final bool lit;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: text,
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 250),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          margin: const EdgeInsets.symmetric(vertical: 2),
          decoration: BoxDecoration(
            color: lit ? const Color(0xFFFEF3C7) : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            text,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: lit ? FontWeight.w800 : FontWeight.w500,
              color: lit ? StepInk.navy : null,
            ),
          ),
        ),
      ),
    );
  }
}
