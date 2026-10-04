import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/assets/app_assets.dart';
import '../../core/letterforms/glyph_text.dart';
import '../../core/letterforms/letterforms.dart';
import '../../core/widgets/squish.dart';
import '../tracing/trace_lessons.dart';
import 'learning_card.dart';
import 'tracing_module_models.dart';
import 'tracing_ui.dart';

/// A category's letters or numbers as cards — the same card for every
/// language, drawn from data ([LearningCard]).
///
/// Letters: the letter, the word it stands for in its own language, and its
/// picture where the app has one that matches. Numbers: the numeral, its
/// name, and a picture of that many things — the same picture in English,
/// Hindi and Gujarati. A speaker on every card, and a tick once traced.
///
/// A learned card is never locked: tapping it again is practice.
class LetterGrid extends StatefulWidget {
  const LetterGrid({
    required this.items,
    required this.onPick,
    this.header,
    super.key,
  });

  final List<TracingModuleItem> items;
  final ValueChanged<int> onPick;

  /// Scrolls with the cards, above them.
  final Widget? header;

  @override
  State<LetterGrid> createState() => _LetterGridState();
}

class _LetterGridState extends State<LetterGrid> {
  TraceLessons? _lessons;

  @override
  void initState() {
    super.initState();
    unawaited(
      TraceLessons.load().then((lessons) {
        if (mounted) setState(() => _lessons = lessons);
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final lessons = _lessons ?? TraceLessons.from(const {}, const {});

    return LayoutBuilder(
      builder: (context, box) {
        // Two big cards across a phone; three on a tablet.
        final columns = box.maxWidth >= 900
            ? 4
            : box.maxWidth >= 600
            ? 3
            : 2;

        return CustomScrollView(
          slivers: [
            if (widget.header != null) SliverToBoxAdapter(child: widget.header),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
              sliver: SliverGrid(
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: columns,
                  mainAxisSpacing: 14,
                  crossAxisSpacing: 14,
                  childAspectRatio: 0.74,
                ),
                delegate: SliverChildBuilderDelegate(
                  childCount: widget.items.length,
                  (context, index) {
                    final item = widget.items[index];
                    return _Arrive(
                      index: index,
                      child: LetterCard(
                        card: LearningCard.from(
                          item,
                          lessons.forGlyph(item.glyph),
                        ),
                        tone: _tones[index % _tones.length],
                        onTap: () => widget.onPick(index),
                      ),
                    );
                  },
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// A card's colours: a soft paper and the character's ink.
typedef CardTone = ({Color paper, Color ink});

const List<CardTone> _tones = [
  (paper: Color(0xFFFFE9EC), ink: Color(0xFFE8455B)),
  (paper: Color(0xFFE6F0FF), ink: Color(0xFF3D6FE0)),
  (paper: Color(0xFFFFF3D1), ink: Color(0xFFE08A00)),
  (paper: Color(0xFFE4F7EC), ink: Color(0xFF1E9E63)),
  (paper: Color(0xFFF1E8FF), ink: Color(0xFF7B4FE0)),
  (paper: Color(0xFFDFF5FA), ink: Color(0xFF138FB0)),
];

const _navy = Color(0xFF173A78);
const _soft = Color(0xFF5B6880);
const _green = Color(0xFF2E9E5B);
const _learnedPaper = Color(0xFFE6F8EC);

/// One letter's or number's card, drawn from its [LearningCard].
class LetterCard extends StatelessWidget {
  const LetterCard({
    required this.card,
    required this.tone,
    required this.onTap,
    super.key,
  });

  final LearningCard card;
  final CardTone tone;
  final VoidCallback onTap;

  static bool _latin(String glyph) =>
      RegExp(r'^[A-Za-z0-9]{1,2}$').hasMatch(glyph);

  @override
  Widget build(BuildContext context) {
    final learned = card.learned;
    final image = card.imageAsset;
    final label = card.label;
    final caption = card.caption;

    return Semantics(
      button: true,
      label: [
        card.character,
        ?label,
        ?caption,
        if (learned) 'learned',
      ].join(', '),
      child: Squish(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            color: learned ? _learnedPaper : tone.paper,
            borderRadius: BorderRadius.circular(26),
            border: Border.all(
              color: learned ? const Color(0xFF9FDDB5) : Colors.white,
              width: 2,
            ),
            boxShadow: [
              BoxShadow(
                color: tone.ink.withValues(alpha: 0.14),
                blurRadius: 14,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: LayoutBuilder(
            builder: (context, box) {
              final w = box.maxWidth;
              return Stack(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(10, 10, 8, 8),
                    child: Column(
                      children: [
                        Expanded(
                          // A number's picture is the lesson — how many — so
                          // it gets more of the card than a letter's does.
                          flex: image == null
                              ? 9
                              : card.type == LearningCardType.number
                              ? 4
                              : 5,
                          child: Center(
                            child: SizedBox(
                              width: w * (_latin(card.character) ? 0.62 : 0.74),
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                child: _BigGlyph(
                                  glyph: card.character,
                                  ink: tone.ink,
                                  size: w * (image != null ? 0.4 : 0.55),
                                ),
                              ),
                            ),
                          ),
                        ),
                        if (image != null)
                          Expanded(
                            flex: card.type == LearningCardType.number ? 7 : 5,
                            child: _Picture(asset: image),
                          ),
                        const SizedBox(height: 6),
                        if (label != null)
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Text(
                              label,
                              maxLines: 1,
                              style: const TextStyle(
                                color: _navy,
                                fontSize: 19,
                                fontWeight: FontWeight.w900,
                                height: 1.15,
                              ),
                            ),
                          ),
                        if (caption != null)
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Text(
                              caption,
                              maxLines: 1,
                              style: const TextStyle(
                                color: _soft,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        const SizedBox(height: 4),
                        // "Learned" and the speaker share the bottom row, so
                        // neither ever covers the word or the other.
                        SizedBox(
                          height: 40,
                          child: Row(
                            children: [
                              Expanded(
                                child: learned
                                    ? const Align(
                                        alignment: Alignment.centerLeft,
                                        child: FittedBox(
                                          fit: BoxFit.scaleDown,
                                          child: _LearnedPill(),
                                        ),
                                      )
                                    : const SizedBox(),
                              ),
                              _SpeakButton(
                                onTap: () => sayAloud(card.spoken),
                                ink: tone.ink,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (learned)
                    const Positioned(top: 8, right: 8, child: _CheckBadge()),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

/// The character as a bright sticker with a white edge — the same look as the
/// lesson page it opens. The school's letterforms draw the scripts the
/// typeface cannot.
class _BigGlyph extends StatelessWidget {
  const _BigGlyph({required this.glyph, required this.ink, required this.size});

  final String glyph;
  final Color ink;
  final double size;

  @override
  Widget build(BuildContext context) {
    final latin = RegExp(r'^[A-Za-z0-9]{1,2}$').hasMatch(glyph);
    if (!latin) {
      final pattern =
          glyph.startsWith('pattern-') &&
          Letterforms.current?.shapesFor(glyph) == null;
      return pattern
          ? Icon(Icons.gesture_rounded, size: size, color: ink)
          : GlyphText(glyph, size: size * 0.8, color: ink, weight: 1.5);
    }

    final style = TextStyle(
      fontSize: glyph.length > 1 ? size * 0.8 : size,
      fontWeight: FontWeight.w800,
      height: 1,
    );
    return Stack(
      children: [
        Text(
          glyph,
          style: style.copyWith(
            foreground: Paint()
              ..style = PaintingStyle.stroke
              ..strokeWidth = size * 0.1
              ..strokeJoin = StrokeJoin.round
              ..color = Colors.white,
          ),
        ),
        Text(glyph, style: style.copyWith(color: ink)),
      ],
    );
  }
}

/// The picture in a soft white frame. Quantity pictures are wide — ten cars
/// side by side — so the frame is a rounded panel rather than a circle.
class _Picture extends StatelessWidget {
  const _Picture({required this.asset});

  final String asset;

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      widthFactor: 0.92,
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
        ),
        child: ObjectPicture(asset),
      ),
    );
  }
}

class _LearnedPill extends StatelessWidget {
  const _LearnedPill();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      decoration: BoxDecoration(
        color: _green,
        borderRadius: BorderRadius.circular(12),
      ),
      // An icon, not a "✓" character: not every font has one.
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_rounded, color: Colors.white, size: 14),
          SizedBox(width: 3),
          Text(
            'Learned',
            style: TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

/// The tick, popping in the first time it is drawn.
class _CheckBadge extends StatelessWidget {
  const _CheckBadge();

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 500),
      curve: Curves.elasticOut,
      builder: (context, scale, child) =>
          Transform.scale(scale: scale, child: child),
      child: SvgPicture.asset(CardArt.check, width: 30, height: 30),
    );
  }
}

/// The small white speaker: says the card, only when tapped.
class _SpeakButton extends StatelessWidget {
  const _SpeakButton({required this.onTap, required this.ink});

  final VoidCallback onTap;
  final Color ink;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Say it',
      child: Material(
        color: Colors.transparent,
        shape: const CircleBorder(),
        elevation: 1.5,
        shadowColor: ink.withValues(alpha: 0.3),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          // 40 across: big enough for a small finger without crowding the
          // card it sits on.
          child: SvgPicture.asset(CardArt.speaker, width: 40, height: 40),
        ),
      ),
    );
  }
}

/// Cards fade and rise in, one just after another — gently, and only the
/// first screenful waits for any of the others.
class _Arrive extends StatelessWidget {
  const _Arrive({required this.index, required this.child});

  final int index;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    // Only the cards there when the page opens; one scrolled to later is
    // simply there; a grid that fades in under the finger is a distraction.
    if (index >= 8) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: 260 + index * 45),
      curve: Curves.easeOutCubic,
      builder: (context, t, child) => Opacity(
        opacity: t,
        child: Transform.translate(
          offset: Offset(0, (1 - t) * 18),
          child: child,
        ),
      ),
      child: child,
    );
  }
}

/// Above the cards: "Let's Learn Letters!" and how many are learned so far.
class LettersBanner extends StatelessWidget {
  const LettersBanner({
    required this.categoryKey,
    required this.learned,
    required this.total,
    super.key,
  });

  final String categoryKey;
  final int learned;
  final int total;

  /// "Letters", "Numbers", "Patterns"…
  String get _noun => switch (categoryKey) {
    'number' || 'hindi-number' || 'gujarati-number' => 'Numbers',
    'pattern' => 'Patterns',
    _ => 'Letters',
  };

  String get _one => switch (_noun) {
    'Numbers' => 'number',
    'Patterns' => 'pattern',
    _ => 'letter',
  };

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFFFFFFFF), Color(0xFFF4F0FF)],
          ),
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: _navy.withValues(alpha: 0.08),
              blurRadius: 14,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        child: Row(
          children: [
            SvgPicture.asset(CardArt.star, width: 44),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Let’s Learn $_noun!',
                      style: const TextStyle(
                        color: _navy,
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Choose a $_one to start learning.',
                    style: const TextStyle(
                      color: Color(0xFF52607A),
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: LinearProgressIndicator(
                            value: total == 0 ? 0 : learned / total,
                            minHeight: 8,
                            backgroundColor: const Color(0xFFE6E9F2),
                            valueColor: const AlwaysStoppedAnimation(_green),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        '$learned / $total learned',
                        style: const TextStyle(
                          color: _navy,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
