import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/widgets/async_view.dart';
import '../../core/widgets/squish.dart';
import '../tracing_module/tracing_ui.dart';
import 'game_models.dart';
import 'game_play_view.dart';
import 'game_widgets.dart';
import 'games_controller.dart';

/// Opens the Games hub for one child. Public so the home banner, or anything
/// else, reaches it the same way.
void openGames({required String studentId, required String childName}) {
  Get.to<void>(
    () => const GamesHubView(),
    binding: BindingsBuilder(() {
      Get.put(GamesHubController(studentId: studentId, childName: childName));
    }),
  );
}

/// Games → choose a language → choose a game.
class GamesHubView extends GetView<GamesHubController> {
  const GamesHubView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: TracingSky()),
          SafeArea(
            bottom: false,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: Row(
                    children: [
                      BackRound(onTap: () => Get.back<void>()),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Text(
                          'Games',
                          style: TextStyle(
                            color: GameInk.navy,
                            fontSize: 28,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      Obx(() => _StarsChip(stars: controller.stars.value)),
                    ],
                  ),
                ),
                Expanded(
                  child: Obx(
                    () => AsyncView(
                      isLoading: controller.isLoading.value,
                      error: controller.error.value,
                      isEmpty:
                          !controller.enabled.value || controller.games.isEmpty,
                      onRetry: controller.load,
                      emptyTitle: controller.enabled.value
                          ? 'No games yet'
                          : 'Games are not available',
                      emptyMessage: controller.enabled.value
                          ? 'The games will appear here.'
                          : 'They have been switched off for now.',
                      builder: (context) => _Hub(controller: controller),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Hub extends StatelessWidget {
  const _Hub({required this.controller});

  final GamesHubController controller;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final games = controller.games;
      final content = controller.content.value!;
      final language = controller.language.value;
      final difficulty = controller.difficulty.value;
      // Read so the cards redraw as rounds are recorded.
      controller.progress.length;

      return RefreshIndicator(
        onRefresh: controller.load,
        child: ListView(
          padding: EdgeInsets.fromLTRB(
            16,
            4,
            16,
            MediaQuery.paddingOf(context).bottom + 28,
          ),
          children: [
            const _Hero(),
            const SizedBox(height: 16),
            _LanguagePicker(
              labels: {
                for (final l in GameLanguage.values)
                  l: content.languages[l]?.label ?? l.code,
              },
              selected: language,
              onPick: controller.chooseLanguage,
            ),
            const SizedBox(height: 10),
            _DifficultyPicker(
              selected: difficulty,
              onPick: controller.chooseDifficulty,
            ),
            const SizedBox(height: 16),
            LayoutBuilder(
              builder: (context, box) {
                // Two cards across a phone, three on a tablet.
                final columns = box.maxWidth >= 600 ? 3 : 2;
                const gap = 14.0;
                final width = (box.maxWidth - gap * (columns - 1)) / columns;
                return Wrap(
                  spacing: gap,
                  runSpacing: gap,
                  children: [
                    for (final game in games)
                      SizedBox(
                        width: width,
                        child: _GameCard(
                          game: game,
                          progress: controller.progressOf(game.kind),
                          questions: content.questionsPerRound,
                          onPlay: () => openGame(controller, game),
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      );
    });
  }
}

class _StarsChip extends StatelessWidget {
  const _StarsChip({required this.stars});

  final int stars;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 6, 14, 6),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF4CC),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white, width: 2),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.emoji_events_rounded,
            color: Color(0xFFF5B21B),
            size: 26,
          ),
          const SizedBox(width: 6),
          Text(
            '$stars',
            style: const TextStyle(
              color: GameInk.navy,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

/// "Let's Play & Learn!", with the boy and his controller.
class _Hero extends StatelessWidget {
  const _Hero();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 150,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFB9E6FF), Color(0xFFEDE4FF)],
        ),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: [
          BoxShadow(
            color: GameInk.navy.withValues(alpha: 0.12),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Row(
        children: [
          AspectRatio(
            aspectRatio: 129 / 118,
            child: Image.asset(characterHero, fit: BoxFit.cover),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Padding(
              padding: EdgeInsets.only(right: 14),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(text: 'Let’s Play\n'),
                          TextSpan(
                            text: '& Learn!',
                            style: TextStyle(color: GameInk.purple),
                          ),
                        ],
                      ),
                      style: TextStyle(
                        color: Color(0xFF2F4FD6),
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        height: 1.05,
                      ),
                    ),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'Fun Games for Bright Minds',
                    style: TextStyle(
                      color: GameInk.navy,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// English | हिंदी | ગુજરાતી — the content changes, the games stay.
class _LanguagePicker extends StatelessWidget {
  const _LanguagePicker({
    required this.labels,
    required this.selected,
    required this.onPick,
  });

  final Map<GameLanguage, String> labels;
  final GameLanguage selected;
  final ValueChanged<GameLanguage> onPick;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(26),
      ),
      child: Row(
        children: [
          for (final MapEntry(key: language, value: label) in labels.entries)
            Expanded(
              child: GestureDetector(
                onTap: () => onPick(language),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  height: 48,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: language == selected
                        ? const Color(0xFF2F4FD6)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: Text(
                    label,
                    style: TextStyle(
                      color: language == selected ? Colors.white : GameInk.navy,
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _DifficultyPicker extends StatelessWidget {
  const _DifficultyPicker({required this.selected, required this.onPick});

  final GameDifficulty selected;
  final ValueChanged<GameDifficulty> onPick;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (final d in GameDifficulty.values) ...[
          if (d != GameDifficulty.values.first) const SizedBox(width: 8),
          ChoiceChip(
            label: Text(d.label),
            selected: d == selected,
            onSelected: (_) => onPick(d),
            labelStyle: TextStyle(
              fontWeight: FontWeight.w800,
              color: d == selected ? Colors.white : GameInk.navy,
            ),
            selectedColor: GameInk.green,
            backgroundColor: Colors.white,
            side: BorderSide.none,
            showCheckmark: false,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          ),
        ],
      ],
    );
  }
}

/// One game: its picture, its name and line, how far along, and Play.
class _GameCard extends StatelessWidget {
  const _GameCard({
    required this.game,
    required this.progress,
    required this.questions,
    required this.onPlay,
  });

  final GameDefinition game;
  final GameProgress? progress;
  final int questions;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    final best = progress?.bestCorrect ?? 0;
    final total = progress?.bestTotal ?? questions;

    return Squish(
      onTap: onPlay,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
        decoration: BoxDecoration(
          color: game.paper,
          borderRadius: BorderRadius.circular(26),
          border: Border.all(color: Colors.white, width: 2),
          boxShadow: [
            BoxShadow(
              color: game.accent.withValues(alpha: 0.18),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AspectRatio(
              aspectRatio: 1.45,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(18),
                // Contained, not cropped: the artwork's own tile shows round
                // it, on a white panel.
                child: ColoredBox(
                  color: Colors.white.withValues(alpha: 0.7),
                  child: Image.asset(game.icon, fit: BoxFit.contain),
                ),
              ),
            ),
            const SizedBox(height: 8),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                game.name,
                style: const TextStyle(
                  color: GameInk.navy,
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            Text(
              game.description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: GameInk.soft,
                fontSize: 12,
                fontWeight: FontWeight.w600,
                height: 1.25,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TracingProgressBar(
                    value: total == 0 ? 0 : best / total,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '$best / $total',
                  style: const TextStyle(
                    color: GameInk.navy,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Container(
              height: 44,
              decoration: BoxDecoration(
                color: game.accent,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.play_arrow_rounded,
                    color: Colors.white,
                    size: 26,
                  ),
                  const SizedBox(width: 6),
                  const Text(
                    'Play',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                    ),
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
