import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/letterforms/glyph_text.dart';
import '../../../core/widgets/authed_image.dart';
import '../../../core/widgets/sticker_text.dart';
import '../activity_controller.dart';
import '../activity_models.dart';

/// The pieces every activity screen is built from, so a child meets the same
/// tile, the same "try again" and the same Next button in every one.

/// The book activities' colours: the app's navy, and a green and an amber
/// that read the same to a parent glancing over.
abstract final class StepInk {
  static const navy = Color(0xFF16307C);
  static const right = Color(0xFF22B07D);
  static const rightSoft = Color(0xFFDCFCE7);
  static const oops = Color(0xFFE8740C);
  static const oopsSoft = Color(0xFFFFEDD5);
  static const picked = Color(0xFF4C7FF0);
  static const pickedSoft = Color(0xFFDBEAFE);
  static const tile = Color(0xFFF1EFE9);
}

/// How a tile looks right now.
enum TileLook { idle, picked, right, wrong }

/// One thing to tap: rounded, big, and it shakes — gently — when it was the
/// wrong one. "Not that one", never "you are wrong".
class PlayTile extends StatefulWidget {
  const PlayTile({
    required this.child,
    this.look = TileLook.idle,
    this.onTap,
    this.shake = 0,
    this.radius = 20,
    this.semanticLabel,
    super.key,
  });

  final Widget child;
  final TileLook look;
  final VoidCallback? onTap;

  /// Changes each time this tile is tapped wrongly, to shake it again.
  final int shake;
  final double radius;
  final String? semanticLabel;

  @override
  State<PlayTile> createState() => _PlayTileState();
}

class _PlayTileState extends State<PlayTile>
    with SingleTickerProviderStateMixin {
  late final AnimationController _shake = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  );

  @override
  void didUpdateWidget(PlayTile old) {
    super.didUpdateWidget(old);
    if (widget.shake != old.shake && widget.shake > 0) {
      _shake.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _shake.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final (paper, edge) = switch (widget.look) {
      TileLook.right => (StepInk.rightSoft, StepInk.right),
      TileLook.wrong => (StepInk.oopsSoft, StepInk.oops),
      TileLook.picked => (StepInk.pickedSoft, StepInk.picked),
      TileLook.idle => (StepInk.tile, StepInk.tile),
    };

    return Semantics(
      button: widget.onTap != null,
      label: widget.semanticLabel,
      selected: widget.look == TileLook.picked,
      child: AnimatedBuilder(
        animation: _shake,
        builder: (context, child) => Transform.translate(
          offset: Offset(
            math.sin(_shake.value * math.pi * 5) * 7 * (1 - _shake.value),
            0,
          ),
          child: child,
        ),
        child: AnimatedScale(
          scale: widget.look == TileLook.right ? 1.04 : 1,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutBack,
          child: Material(
            color: paper,
            borderRadius: BorderRadius.circular(widget.radius),
            child: InkWell(
              borderRadius: BorderRadius.circular(widget.radius),
              onTap: widget.onTap,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(widget.radius),
                  // Always three wide, clear when idle, so a tile does not
                  // jump in size when it is picked.
                  border: Border.all(
                    color: widget.look == TileLook.idle
                        ? Colors.transparent
                        : edge,
                    width: 3,
                  ),
                ),
                child: Stack(
                  children: [
                    Positioned.fill(child: widget.child),
                    if (widget.look == TileLook.right)
                      const Positioned(
                        top: 4,
                        right: 4,
                        child: Icon(
                          Icons.check_circle_rounded,
                          size: 20,
                          color: StepInk.right,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A picture, a number or letter as a sticker, an emoji, or a word — whatever
/// the author gave. [grey] is Count and Colour's "not coloured yet".
class MediaView extends StatelessWidget {
  const MediaView(
    this.media, {
    this.size = 56,
    this.grey = false,
    this.padding = 8,
    super.key,
  });

  final ActivityMedia media;

  /// The height of a letter, number or emoji.
  final double size;
  final bool grey;
  final double padding;

  /// Luminance, for a picture that has not been coloured in yet.
  static const _greyscale = ColorFilter.matrix([
    0.2126, 0.7152, 0.0722, 0, 0, //
    0.2126, 0.7152, 0.0722, 0, 0, //
    0.2126, 0.7152, 0.0722, 0, 0, //
    0, 0, 0, 1, 0,
  ]);

  @override
  Widget build(BuildContext context) {
    Widget child;
    if (media.imagePath != null) {
      child = AuthedImage(path: media.imagePath!, fit: BoxFit.contain);
      if (media.silhouette) {
        // The picture's own shape, filled black: its shadow.
        child = ColorFiltered(
          colorFilter: const ColorFilter.mode(
            Color(0xFF1F2937),
            BlendMode.srcIn,
          ),
          child: child,
        );
      }
    } else {
      child = Center(
        child: FittedBox(child: Glyph(_label, size: size)),
      );
    }

    if (grey) {
      child = Opacity(
        opacity: 0.45,
        child: ColorFiltered(colorFilter: _greyscale, child: child),
      );
    }
    return Padding(padding: EdgeInsets.all(padding), child: child);
  }

  String get _label => media.glyph ?? media.text ?? '';
}

/// A letter or number as Tracing's sticker; anything else in the school's
/// letterforms or as text.
class Glyph extends StatelessWidget {
  const Glyph(this.text, {this.size = 56, this.colour, super.key});

  final String text;
  final double size;
  final Color? colour;

  @override
  Widget build(BuildContext context) {
    if (StickerText.fits(text)) {
      return StickerText(text, size: size, colour: colour);
    }
    // An emoji or a single character in the school's handwriting.
    if (text.characters.length <= 2) return GlyphText(text, size: size);
    return Text(
      text,
      textAlign: TextAlign.center,
      style: TextStyle(fontSize: size * 0.5, fontWeight: FontWeight.w800),
    );
  }
}

/// The question: a picture or letter above it when there is one, and the
/// words a parent reads over the child's shoulder.
class StepPrompt extends StatelessWidget {
  const StepPrompt({
    required this.say,
    this.glyph,
    this.imagePath,
    this.pictureHeight = 110,
    super.key,
  });

  final String say;
  final String? glyph;
  final String? imagePath;
  final double pictureHeight;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (imagePath != null)
          ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: AuthedImage(
              path: imagePath!,
              height: pictureHeight,
              fit: BoxFit.contain,
            ),
          )
        else if (glyph != null)
          Glyph(glyph!, size: 60),
        if (imagePath != null || glyph != null) const SizedBox(height: 10),
        Text(
          say,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleLarge,
        ),
      ],
    );
  }
}

/// "Great job!", or the gentle "try again" — beside the question, never in
/// the way of it.
class StepFeedback extends StatelessWidget {
  const StepFeedback(this.message, {required this.good, super.key});

  final String message;
  final bool good;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(
          good ? Icons.celebration_rounded : Icons.refresh_rounded,
          color: good ? StepInk.right : StepInk.oops,
          size: 22,
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: good ? StepInk.right : StepInk.oops,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}

/// Next, or Finish on the last question.
class NextButton extends StatelessWidget {
  const NextButton({required this.controller, super.key});

  final ActivityPlayController controller;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: controller.next,
        child: Text(controller.isLast ? 'Finish' : 'Next'),
      ),
    );
  }
}

/// What a finished book question says: praise, or the answer shown kindly.
class StepDone extends StatelessWidget {
  const StepDone({
    required this.controller,
    this.right = 'Great job!',
    this.shown = 'Here it is. Well tried!',
    super.key,
  });

  final ActivityPlayController controller;
  final String right;
  final String shown;

  @override
  Widget build(BuildContext context) {
    final good = controller.wasCorrect.value == true;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        StepFeedback(good ? right : shown, good: good),
        const SizedBox(height: 12),
        NextButton(controller: controller),
      ],
    );
  }
}

/// A shuffled order that stays put while the child plays: seeded by the
/// question, so the same question is laid out the same way until it changes.
List<int> steadyShuffle(int length, int seed) {
  final order = List<int>.generate(length, (i) => i)
    ..shuffle(math.Random(seed));
  // Never leave the right column exactly in the left's order: a child would
  // match straight across without looking.
  if (length > 1 &&
      List.generate(length, (i) => i).every((i) => order[i] == i)) {
    order.add(order.removeAt(0));
  }
  return order;
}
