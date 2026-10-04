import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/assets/app_assets.dart';
import '../tracing/trace_lessons.dart';
import 'game_models.dart';

/// The pieces every game screen is built from: answer tiles, the big
/// letter, the "Great Job!" card, the gentle "Oops!", confetti and the end of
/// round. Drawn the same in every game, so a child learns them once.

abstract final class GameInk {
  static const navy = Color(0xFF173A78);
  static const soft = Color(0xFF52607A);
  static const green = Color(0xFF2EB46A);
  static const greenSoft = Color(0xFFE3F8EA);
  static const oops = Color(0xFFF08A24);
  static const oopsSoft = Color(0xFFFFF0E0);
  static const purple = Color(0xFF7B4FE0);

  /// Letters in turn: blue, red, orange, purple, green, teal.
  static const letters = [
    Color(0xFF3D72E5),
    Color(0xFFE8455B),
    Color(0xFFF08A24),
    Color(0xFF7B4FE0),
    Color(0xFF1E9E63),
    Color(0xFF138FB0),
  ];
}

const characterGreatJob = 'assets/games/characters/great_job.png';
const characterOops = 'assets/games/characters/oops.png';
const characterHero = 'assets/games/characters/hero.png';

/// A letter or number as a bright sticker with a white edge. Hindi and
/// Gujarati come from the phone's own fonts, which carry every character.
class BubbleText extends StatelessWidget {
  const BubbleText(
    this.text, {
    required this.colour,
    required this.size,
    super.key,
  });

  final String text;
  final Color colour;
  final double size;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontSize: size,
      fontWeight: FontWeight.w900,
      height: 1.15,
    );
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: Stack(
        children: [
          Text(
            text,
            style: style.copyWith(
              foreground: Paint()
                ..style = PaintingStyle.stroke
                ..strokeWidth = size * 0.1
                ..strokeJoin = StrokeJoin.round
                ..color = Colors.white,
            ),
          ),
          Text(text, style: style.copyWith(color: colour)),
        ],
      ),
    );
  }
}

/// How an answer tile looks right now.
enum TileState { idle, wrong, right }

/// One answer: a picture with its word, or a letter or number. Shakes
/// gently when it is the wrong one, grows a little when it is right.
class AnswerTile extends StatefulWidget {
  const AnswerTile({
    required this.option,
    required this.state,
    required this.onTap,
    required this.colour,
    this.shake = 0,
    super.key,
  });

  final GameOption option;
  final TileState state;
  final VoidCallback? onTap;

  /// The letter's colour.
  final Color colour;

  /// Changes each time this tile is tapped wrongly, to shake it again.
  final int shake;

  @override
  State<AnswerTile> createState() => _AnswerTileState();
}

class _AnswerTileState extends State<AnswerTile>
    with SingleTickerProviderStateMixin {
  late final AnimationController _shake = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  );
  bool _down = false;

  @override
  void didUpdateWidget(AnswerTile old) {
    super.didUpdateWidget(old);
    if (widget.shake != old.shake && widget.state == TileState.wrong) {
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
    final state = widget.state;
    final border = switch (state) {
      TileState.right => GameInk.green,
      TileState.wrong => GameInk.oops,
      TileState.idle => Colors.white,
    };
    final paper = switch (state) {
      TileState.right => GameInk.greenSoft,
      TileState.wrong => GameInk.oopsSoft,
      TileState.idle => Colors.white,
    };
    final option = widget.option;

    return AnimatedBuilder(
      animation: _shake,
      builder: (context, child) => Transform.translate(
        // A small, quick shake: "not that one", not "you are wrong".
        offset: Offset(
          math.sin(_shake.value * math.pi * 5) * 7 * (1 - _shake.value),
          0,
        ),
        child: child,
      ),
      child: AnimatedScale(
        scale: state == TileState.right ? 1.06 : (_down ? 0.95 : 1),
        duration: const Duration(milliseconds: 180),
        curve: state == TileState.right ? Curves.elasticOut : Curves.easeOut,
        child: GestureDetector(
          onTapDown: widget.onTap == null
              ? null
              : (_) => setState(() => _down = true),
          onTapUp: widget.onTap == null
              ? null
              : (_) => setState(() => _down = false),
          onTapCancel: () => setState(() => _down = false),
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            decoration: BoxDecoration(
              color: paper,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: border,
                width: state == TileState.idle ? 2 : 4,
              ),
              boxShadow: [
                BoxShadow(
                  color: GameInk.navy.withValues(alpha: 0.12),
                  blurRadius: 12,
                  offset: const Offset(0, 5),
                ),
              ],
            ),
            child: Stack(
              children: [
                Positioned.fill(
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: option.image != null
                        ? Column(
                            children: [
                              Expanded(child: ObjectPicture(option.image!)),
                              if (option.text != null)
                                FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: Text(
                                    option.text!,
                                    style: const TextStyle(
                                      color: GameInk.navy,
                                      fontSize: 16,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                            ],
                          )
                        : Center(
                            child: BubbleText(
                              option.glyph ?? option.text ?? '',
                              colour: widget.colour,
                              size: 64,
                            ),
                          ),
                  ),
                ),
                if (state != TileState.idle)
                  Positioned(
                    top: 6,
                    right: 6,
                    child: state == TileState.right
                        ? SvgPicture.asset(CardArt.check, width: 26)
                        : const _CrossBadge(),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CrossBadge extends StatelessWidget {
  const _CrossBadge();

  @override
  Widget build(BuildContext context) => Container(
    width: 26,
    height: 26,
    decoration: const BoxDecoration(
      color: GameInk.oops,
      shape: BoxShape.circle,
    ),
    child: const Icon(Icons.close_rounded, color: Colors.white, size: 18),
  );
}

/// "Oops! Try again!" — beside the question, never in the way of it.
class OopsNote extends StatelessWidget {
  const OopsNote({super.key});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.6, end: 1),
      duration: const Duration(milliseconds: 380),
      curve: Curves.elasticOut,
      builder: (context, scale, child) =>
          Transform.scale(scale: scale, child: child),
      child: Container(
        padding: const EdgeInsets.fromLTRB(6, 6, 16, 6),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(30),
          border: Border.all(
            color: GameInk.oops.withValues(alpha: 0.5),
            width: 2,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipOval(
              child: Image.asset(
                characterOops,
                width: 40,
                height: 40,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 10),
            const Text(
              'Oops! Try again!',
              style: TextStyle(
                color: GameInk.oops,
                fontSize: 17,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The right answer, celebrated briefly: "Great Job!", what it was, the
/// speaker to hear it again, and Next.
class SuccessCard extends StatelessWidget {
  const SuccessCard({
    required this.question,
    required this.onNext,
    required this.onSpeak,
    required this.isLast,
    super.key,
  });

  final GameQuestion question;
  final VoidCallback onNext;
  final VoidCallback onSpeak;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final q = question;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutBack,
      builder: (context, t, child) => Transform.translate(
        offset: Offset(0, (1 - t) * 160),
        child: Opacity(opacity: t.clamp(0, 1), child: child),
      ),
      child: Container(
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFFF7DA), Colors.white],
          ),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
          boxShadow: [
            BoxShadow(
              color: GameInk.navy.withValues(alpha: 0.18),
              blurRadius: 20,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: Image.asset(
                      characterGreatJob,
                      width: 92,
                      height: 62,
                      fit: BoxFit.cover,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Great Job!',
                        style: TextStyle(
                          color: GameInk.purple,
                          fontSize: 30,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: GameInk.green, width: 3),
                ),
                child: Row(
                  children: [
                    SizedBox(
                      width: 70,
                      height: 60,
                      child: q.successImage != null
                          ? ObjectPicture(q.successImage!)
                          : Center(
                              child: BubbleText(
                                q.successGlyph ?? '',
                                colour: GameInk.letters.first,
                                size: 48,
                              ),
                            ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(
                          q.successTitle,
                          style: const TextStyle(
                            color: GameInk.navy,
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                    ),
                    IconButton.filledTonal(
                      onPressed: onSpeak,
                      tooltip: 'Say it again',
                      iconSize: 28,
                      icon: SvgPicture.asset(LearningArt.speaker, width: 28),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                height: 58,
                child: FilledButton(
                  onPressed: onNext,
                  style: FilledButton.styleFrom(
                    backgroundColor: GameInk.green,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        isLast ? 'Finish' : 'Next',
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Icon(Icons.arrow_forward_rounded, size: 26),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Paper confetti falling once.
class Confetti extends StatefulWidget {
  const Confetti({super.key});

  @override
  State<Confetti> createState() => _ConfettiState();
}

class _ConfettiState extends State<Confetti>
    with SingleTickerProviderStateMixin {
  late final AnimationController _fall = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2200),
  )..forward();

  @override
  void dispose() {
    _fall.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: CustomPaint(painter: _ConfettiPainter(_fall), size: Size.infinite),
  );
}

class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter(this.t) : super(repaint: t);

  final Animation<double> t;
  static final _pieces = List.generate(46, (i) {
    final r = math.Random(i * 7 + 3);
    return (
      x: r.nextDouble(),
      delay: r.nextDouble() * 0.35,
      speed: 0.7 + r.nextDouble() * 0.6,
      spin: r.nextDouble() * 6,
      colour: GameInk.letters[i % GameInk.letters.length],
      size: 6 + r.nextDouble() * 7,
    );
  });

  @override
  void paint(Canvas canvas, Size size) {
    for (final p in _pieces) {
      final progress = ((t.value - p.delay) / (1 - p.delay)).clamp(0.0, 1.0);
      if (progress == 0 || progress == 1) continue;
      final y = -20 + progress * p.speed * (size.height + 40);
      final x = p.x * size.width + math.sin(progress * 8 + p.spin) * 18;
      canvas
        ..save()
        ..translate(x, y)
        ..rotate(progress * p.spin * 4)
        ..drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromCenter(
              center: Offset.zero,
              width: p.size,
              height: p.size * 0.6,
            ),
            const Radius.circular(2),
          ),
          Paint()..color = p.colour.withValues(alpha: 1 - progress * 0.4),
        )
        ..restore();
    }
  }

  @override
  bool shouldRepaint(_ConfettiPainter old) => true;
}

/// Five stars, as many lit as earned.
class StarRow extends StatelessWidget {
  const StarRow({required this.lit, this.size = 40, super.key});

  final int lit;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < 5; i++)
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: 1),
            duration: Duration(milliseconds: 400 + i * 140),
            curve: Curves.elasticOut,
            builder: (context, s, child) =>
                Transform.scale(scale: s, child: child),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 3),
              // Unlit stars are grey, not faded gold: a child reads "not
              // yet", not "broken".
              child: SvgPicture.asset(
                CardArt.star,
                width: size,
                colorFilter: i < lit
                    ? null
                    : const ColorFilter.mode(
                        Color(0xFFD5DBE5),
                        BlendMode.srcIn,
                      ),
              ),
            ),
          ),
      ],
    );
  }
}

/// The end of a round: the trophy, the score, the stars, and the way on.
class RoundComplete extends StatelessWidget {
  const RoundComplete({
    required this.correct,
    required this.total,
    required this.saveFailed,
    required this.onPlayAgain,
    required this.onBack,
    super.key,
  });

  final int correct;
  final int total;
  final bool saveFailed;
  final VoidCallback onPlayAgain;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final stars = starRating(correct, total);
    return Stack(
      children: [
        Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Container(
              padding: const EdgeInsets.fromLTRB(22, 24, 22, 22),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xFFFFF4D6), Color(0xFFF6EEFF)],
                ),
                borderRadius: BorderRadius.circular(32),
                border: Border.all(color: Colors.white, width: 3),
                boxShadow: [
                  BoxShadow(
                    color: GameInk.navy.withValues(alpha: 0.14),
                    blurRadius: 24,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.emoji_events_rounded,
                    size: 96,
                    color: Color(0xFFF5B21B),
                  ),
                  const Text(
                    'Amazing!',
                    style: TextStyle(
                      color: GameInk.purple,
                      fontSize: 36,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'You got $correct / $total correct',
                    style: const TextStyle(
                      color: GameInk.navy,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 14),
                  StarRow(lit: stars),
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SvgPicture.asset(CardArt.star, width: 24),
                        const SizedBox(width: 6),
                        Text(
                          '+$correct Stars',
                          style: const TextStyle(
                            color: GameInk.navy,
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (saveFailed) ...[
                    const SizedBox(height: 8),
                    const Text(
                      'Played! The score could not reach the school just now.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: GameInk.soft, fontSize: 12),
                    ),
                  ],
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    height: 58,
                    child: FilledButton.icon(
                      onPressed: onPlayAgain,
                      style: FilledButton.styleFrom(
                        backgroundColor: GameInk.purple,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                        ),
                      ),
                      icon: const Icon(Icons.replay_rounded, size: 26),
                      label: const Text(
                        'Play Again',
                        style: TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: OutlinedButton.icon(
                      onPressed: onBack,
                      style: OutlinedButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: GameInk.navy,
                        side: const BorderSide(
                          color: Color(0xFFDDE3EE),
                          width: 2,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                        ),
                      ),
                      icon: const Icon(Icons.home_rounded),
                      label: const Text(
                        'Back to Games',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const Positioned.fill(child: Confetti()),
      ],
    );
  }
}
