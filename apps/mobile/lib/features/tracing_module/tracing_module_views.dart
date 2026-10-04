import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:get/get.dart';

import '../../core/assets/app_assets.dart';
import '../../core/audio/speech_service.dart';
import '../../core/widgets/async_view.dart';
import 'letter_cards.dart';
import 'tracing_module_controllers.dart';
import 'tracing_module_models.dart';
import 'tracing_session_view.dart';
import 'tracing_ui.dart';

/// Opens the module for one child. Public so the home tile and anything else
/// reach it the same way.
void openTracing({required String studentId, required String childName}) {
  Get.to<void>(
    () => const TracingCategoriesView(),
    binding: BindingsBuilder(() {
      Get.put(
        TracingHomeController(studentId: studentId, childName: childName),
      );
    }),
  );
}

/// Tracing → pick a category: a sky-blue page with the four (or however
/// many the publisher has on) categories as big bright cards, each with how
/// far this child has got.
class TracingCategoriesView extends GetView<TracingHomeController> {
  const TracingCategoriesView({super.key});

  static const _subtitle = 'Choose a category to start learning.';

  Future<void> _open(TracingCategorySummary category) async {
    await Get.to<void>(
      () => const TracingLettersView(),
      binding: BindingsBuilder(() {
        Get.put(
          TracingLettersController(
            studentId: controller.studentId,
            categoryId: category.id,
            title: category.name,
            categoryKey: category.key,
          ),
        );
      }),
    );
    // Back from the letters: the counts may have moved.
    await controller.load();
  }

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
                TracingHeader(
                  title: 'Tracing',
                  subtitle: _subtitle,
                  onBack: () => Get.back<void>(),
                ),
                Expanded(
                  child: Container(
                    margin: const EdgeInsets.only(top: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.9),
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(34),
                      ),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Stack(
                      children: [
                        const Positioned(
                          left: 0,
                          right: 0,
                          bottom: 0,
                          child: IgnorePointer(child: TracingHills()),
                        ),
                        Obx(
                          () => AsyncView(
                            isLoading: controller.isLoading.value,
                            error: controller.error.value,
                            isEmpty:
                                !controller.enabled.value ||
                                controller.categories.isEmpty,
                            onRetry: controller.load,
                            emptyTitle: controller.enabled.value
                                ? 'Nothing to trace yet'
                                : 'Tracing is not available',
                            emptyMessage: controller.enabled.value
                                ? 'The letters to trace will appear here.'
                                : 'It has been switched off for now.',
                            builder: (context) => RefreshIndicator(
                              onRefresh: controller.load,
                              child: ListView.separated(
                                padding: EdgeInsets.fromLTRB(
                                  16,
                                  18,
                                  16,
                                  MediaQuery.paddingOf(context).bottom + 96,
                                ),
                                itemCount: controller.categories.length,
                                separatorBuilder: (_, _) =>
                                    const SizedBox(height: 16),
                                itemBuilder: (context, index) {
                                  final category = controller.categories[index];
                                  return TracingCategoryCard(
                                    category: category,
                                    onTap: () => unawaited(_open(category)),
                                  );
                                },
                              ),
                            ),
                          ),
                        ),
                      ],
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

/// A category's letters as picture cards. Tapping one starts there: its
/// video the first time, then its tracing, then the next. A learned letter
/// stays open for practice.
class TracingLettersView extends GetView<TracingLettersController> {
  const TracingLettersView({super.key});

  /// "Capital letters" → "Capital Letters".
  String get _title => controller.title
      .split(' ')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');

  void _sayHelp() {
    if (!Get.isRegistered<SpeechService>()) return;
    final one = switch (controller.categoryKey) {
      'number' || 'hindi-number' || 'gujarati-number' => 'number',
      'pattern' => 'pattern',
      _ => 'letter',
    };
    unawaited(
      Get.find<SpeechService>().say('Choose a $one to start learning.'),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: TracingSky()),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: Row(
                    children: [
                      BackRound(onTap: () => Get.back<void>()),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          _title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xFF173A78),
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      RoundButton(
                        tooltip: 'Help',
                        onTap: _sayHelp,
                        child: SvgPicture.asset(LearningArt.speaker, width: 29),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Obx(
                    () => AsyncView(
                      isLoading: controller.isLoading.value,
                      error: controller.error.value,
                      isEmpty: controller.items.isEmpty,
                      onRetry: controller.load,
                      emptyTitle: 'Nothing here yet',
                      builder: (context) {
                        final items = controller.items.toList();
                        return LetterGrid(
                          items: items,
                          onPick: _start,
                          header: LettersBanner(
                            categoryKey: controller.categoryKey,
                            learned: items.where((i) => i.traced).length,
                            total: items.length,
                          ),
                        );
                      },
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

  void _start(int index) {
    Get.to<void>(
      () => TracingSessionView(controller: controller, startAt: index),
    );
  }
}
