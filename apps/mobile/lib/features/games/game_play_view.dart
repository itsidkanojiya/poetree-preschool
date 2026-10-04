import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:get/get.dart';

import '../../core/assets/app_assets.dart';
import '../tracing/trace_lessons.dart';
import '../tracing_module/tracing_ui.dart';
import 'game_content.dart';
import 'game_models.dart';
import 'game_widgets.dart';
import 'games_controller.dart';

/// One round of one game, whichever game it is.
///
/// The screen draws a [GameQuestion]; it never decides what to ask. The top
/// is the question — a big letter, a row with a gap, things to count, or a
/// speaker — and the bottom is the answers, as pictures or as letters. A
/// right answer brings up "Great Job!" with Next; a wrong one shakes, says
/// "Try again!" and waits.
class GamePlayView extends StatefulWidget {
  const GamePlayView({required this.controller, super.key});

  final GamePlayController controller;

  @override
  State<GamePlayView> createState() => _GamePlayViewState();
}

class _GamePlayViewState extends State<GamePlayView> {
  GamePlayController get c => widget.controller;
  int? _lastWrong;

  @override
  void initState() {
    super.initState();
    // Read the first question out once the page is up.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && c.questions.isNotEmpty) c.sayQuestion();
    });
  }

  void _choose(int option) {
    final before = c.mistakes.value;
    c.choose(option);
    if (c.mistakes.value != before) {
      _lastWrong = option;
      unawaited(HapticFeedback.lightImpact());
    } else if (c.solved.value) {
      unawaited(HapticFeedback.mediumImpact());
    }
  }

  /// Leaving mid-round asks first: a small hand on the back button should
  /// not throw away a round nearly done.
  Future<void> _leave() async {
    if (c.finished.value || c.questions.isEmpty) {
      Navigator.of(context).pop();
      return;
    }
    final leave = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => const _LeaveSheet(),
    );
    if (leave == true && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) unawaited(_leave());
      },
      child: Scaffold(
        body: Stack(
          children: [
            const Positioned.fill(child: TracingSky()),
            const Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: IgnorePointer(child: TracingHills(height: 90)),
            ),
            SafeArea(child: Obx(_body)),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (c.questions.isEmpty) {
      return Column(
        children: [
          _Header(title: c.game.name, onBack: _leave, onSpeak: null),
          const Expanded(
            child: Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'There is nothing to play in this language yet.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: GameInk.navy,
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
        ],
      );
    }

    if (c.finished.value) {
      return Column(
        children: [
          _Header(title: c.game.name, onBack: _leave, onSpeak: null),
          Expanded(
            child: RoundComplete(
              correct: c.correct.value,
              total: c.total,
              saveFailed: c.saveFailed.value,
              onPlayAgain: c.playAgain,
              onBack: () => Navigator.of(context).pop(),
            ),
          ),
        ],
      );
    }

    final q = c.question;
    // Read so the page redraws as answers are tapped.
    final wrong = c.wrongTaps.toSet();
    final solved = c.solved.value;
    final shake = c.mistakes.value;

    return Stack(
      children: [
        Column(
          children: [
            _Header(title: c.game.name, onBack: _leave, onSpeak: c.sayQuestion),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TracingProgressBar(
                      value: (c.index.value + 1) / c.total,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    '${c.index.value + 1} / ${c.total}',
                    style: const TextStyle(
                      color: GameInk.navy,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: LayoutBuilder(
                builder: (context, box) =>
                    _question(q, box, wrong, solved, shake),
              ),
            ),
          ],
        ),
        if (solved)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SuccessCard(
              key: ValueKey('success-${q.id}'),
              question: q,
              isLast: c.isLast,
              onSpeak: () => gameSay(q.successSay),
              onNext: c.next,
            ),
          ),
        if (solved)
          Positioned.fill(child: Confetti(key: ValueKey('confetti-${q.id}'))),
      ],
    );
  }

  /// The question on top, the answers below, sized to the space there is.
  Widget _question(
    GameQuestion q,
    BoxConstraints box,
    Set<int> wrong,
    bool solved,
    int shake,
  ) {
    final top = switch (q.kind) {
      GameKind.letterMatch => _targetCard(q.target ?? '', speaker: true),
      GameKind.findLetter => _targetCard(q.target ?? '', speaker: false),
      GameKind.completeSequence => _sequence(q),
      GameKind.countChoose => _counting(q, box.maxHeight * 0.32),
      GameKind.listenMatch => _bigSpeaker(),
    };

    final pictures = q.options.any((o) => o.image != null);
    final n = q.options.length;
    final columns = pictures
        ? 2
        : (n <= 3 ? n : (n == 4 ? 2 : (n <= 6 ? 3 : 4)));

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Column(
        children: [
          top,
          const SizedBox(height: 10),
          Text(
            q.prompt,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: GameInk.navy,
              fontSize: 21,
              fontWeight: FontWeight.w900,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 6),
          SizedBox(
            height: 50,
            child: wrong.isNotEmpty && !solved
                ? const Center(child: OopsNote())
                : null,
          ),
          Expanded(
            child: LayoutBuilder(
              builder: (context, area) {
                final rows = (n / columns).ceil();
                const gap = 14.0;
                final width = (area.maxWidth - gap * (columns - 1)) / columns;
                final height = math.min(
                  (area.maxHeight - gap * (rows - 1)) / rows,
                  pictures ? width * 1.05 : width * 1.1,
                );
                // Centred in the space left, where a small thumb reaches,
                // rather than crowded under the question.
                return Center(
                  child: Wrap(
                    spacing: gap,
                    runSpacing: gap,
                    alignment: WrapAlignment.center,
                    children: [
                      for (final (i, option) in q.options.indexed)
                        SizedBox(
                          width: width,
                          height: height,
                          child: AnswerTile(
                            option: option,
                            colour: GameInk.letters[i % GameInk.letters.length],
                            state: solved && i == q.answer
                                ? TileState.right
                                : wrong.contains(i)
                                ? TileState.wrong
                                : TileState.idle,
                            shake: _lastWrong == i ? shake : 0,
                            onTap: solved ? null : () => _choose(i),
                          ),
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
          // Clear of the hills along the bottom.
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  /// The letter to find or to match, on a wooden board.
  Widget _targetCard(String letter, {required bool speaker}) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: 190,
          height: 120,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFFFCE7B8), Color(0xFFF1CC85)],
            ),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: const Color(0xFFD9A55B), width: 3),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF8A5A1E).withValues(alpha: 0.25),
                blurRadius: 12,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: BubbleText(letter, colour: GameInk.letters[1], size: 84),
        ),
        if (speaker)
          Positioned(
            right: -18,
            top: 34,
            child: RoundButton(
              tooltip: 'Hear it',
              size: 52,
              onTap: c.sayQuestion,
              child: SvgPicture.asset(LearningArt.speaker, width: 29),
            ),
          ),
      ],
    );
  }

  /// The row with its gap, in a wooden frame.
  Widget _sequence(GameQuestion q) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFC98A4B),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFF9C6530), width: 3),
      ),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (i, item) in q.sequence.indexed) ...[
              if (i > 0) const SizedBox(width: 8),
              Container(
                width: 70,
                height: 82,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: item == null
                      ? const Color(0xFFFFF0F3)
                      : const Color(0xFFFFFBF2),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: item == null ? GameInk.letters[1] : Colors.white,
                    width: item == null ? 3 : 2,
                  ),
                ),
                child: BubbleText(
                  item ?? '?',
                  colour: item == null ? GameInk.letters[1] : GameInk.navy,
                  size: 48,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// That many things to count, in a soft panel.
  Widget _counting(GameQuestion q, double maxHeight) {
    final image = q.countImage;
    if (image == null) return const SizedBox.shrink();
    final size = q.count <= 5 ? 76.0 : (q.count <= 10 ? 56.0 : 40.0);
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: math.max(maxHeight, 120)),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.85),
          borderRadius: BorderRadius.circular(26),
        ),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: SizedBox(
            width: 320,
            child: Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              runSpacing: 8,
              children: [
                for (var i = 0; i < q.count; i++)
                  SizedBox(
                    width: size,
                    height: size,
                    child: ObjectPicture(image),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Listen & Match: the speaker to hear it again, as often as wanted.
  Widget _bigSpeaker() {
    return GestureDetector(
      onTap: c.sayQuestion,
      child: Container(
        width: 120,
        height: 120,
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          border: Border.all(color: const Color(0xFFCFE0FF), width: 6),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF2F6FED).withValues(alpha: 0.25),
              blurRadius: 20,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: SvgPicture.asset(LearningArt.speaker),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.title,
    required this.onBack,
    required this.onSpeak,
  });

  final String title;
  final VoidCallback onBack;
  final VoidCallback? onSpeak;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Row(
        children: [
          BackRound(onTap: onBack),
          const SizedBox(width: 12),
          Expanded(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                title,
                style: const TextStyle(
                  color: GameInk.navy,
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
          if (onSpeak != null)
            RoundButton(
              tooltip: 'Hear the question',
              onTap: onSpeak!,
              child: SvgPicture.asset(LearningArt.speaker, width: 29),
            ),
        ],
      ),
    );
  }
}

/// "Stop playing?" — two big buttons, the safe one first.
class _LeaveSheet extends StatelessWidget {
  const _LeaveSheet();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Stop playing?',
              style: TextStyle(
                color: GameInk.navy,
                fontSize: 24,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 58,
              child: FilledButton(
                onPressed: () => Navigator.of(context).pop(false),
                style: FilledButton.styleFrom(
                  backgroundColor: GameInk.green,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                  ),
                ),
                child: const Text(
                  'Keep playing',
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900),
                ),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text(
                  'Stop',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: GameInk.soft,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Opens a round of [game], in the hub's language and difficulty.
void openGame(GamesHubController hub, GameDefinition game) {
  final content = hub.content.value;
  if (content == null) return;
  final language = hub.language.value;
  final controller = GamePlayController(
    game: game,
    language: language,
    difficulty: hub.difficulty.value,
    factory: QuestionFactory(content),
    recorder: ({required total, required correct, required wrong}) =>
        hub.record(
          game.kind,
          language,
          total: total,
          correct: correct,
          wrong: wrong,
        ),
  );
  Get.to<void>(() => GamePlayView(controller: controller));
}
