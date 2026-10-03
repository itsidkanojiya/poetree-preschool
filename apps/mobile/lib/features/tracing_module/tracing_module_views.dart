import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/letterforms/glyph_text.dart';
import '../../core/widgets/async_view.dart';
import 'tracing_module_controllers.dart';
import 'tracing_module_models.dart';
import 'tracing_session_view.dart';

/// Each category's own colour, so a child finds "1 2 3" by colour before they
/// can read it.
Color _colourFor(String key) => switch (key) {
  'capital' => const Color(0xFF7B5CF0),
  'number' => const Color(0xFFFF9F43),
  'small' => const Color(0xFF2EC4A0),
  'pattern' => const Color(0xFF3FA9F5),
  'hindi' || 'hindi-number' => const Color(0xFFF0648C),
  'gujarati' || 'gujarati-number' => const Color(0xFFE5AC0B),
  _ => const Color(0xFF3FA9F5),
};

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

/// Tracing → pick a category.
class TracingCategoriesView extends GetView<TracingHomeController> {
  const TracingCategoriesView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tracing')),
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: !controller.enabled.value || controller.categories.isEmpty,
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
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              itemCount: controller.categories.length,
              separatorBuilder: (_, _) => const SizedBox(height: 14),
              itemBuilder: (context, index) {
                final category = controller.categories[index];
                return CategoryCard(
                  category: category,
                  onTap: () async {
                    await Get.to<void>(
                      () => const TracingLettersView(),
                      binding: BindingsBuilder(() {
                        Get.put(
                          TracingLettersController(
                            studentId: controller.studentId,
                            categoryId: category.id,
                            title: category.name,
                          ),
                        );
                      }),
                    );
                    // Back from the letters: the ticks may have moved.
                    await controller.load();
                  },
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

/// A category, drawn big: "A B C" across it, its name and how far along.
class CategoryCard extends StatelessWidget {
  const CategoryCard({required this.category, required this.onTap, super.key});

  final TracingCategorySummary category;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colour = _colourFor(category.key);
    final done =
        category.itemCount > 0 && category.tracedCount >= category.itemCount;

    return Material(
      color: colour,
      borderRadius: BorderRadius.circular(26),
      child: InkWell(
        borderRadius: BorderRadius.circular(26),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 20, 18, 18),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      category.label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 40,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 2,
                        height: 1.1,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      category.name,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: category.itemCount == 0
                            ? 0
                            : category.tracedCount / category.itemCount,
                        minHeight: 7,
                        backgroundColor: Colors.white.withValues(alpha: 0.3),
                        valueColor: const AlwaysStoppedAnimation(Colors.white),
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      '${category.tracedCount} of ${category.itemCount} traced',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.92),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Icon(
                done ? Icons.emoji_events_rounded : Icons.play_circle_rounded,
                color: Colors.white,
                size: 44,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A category's letters: traced ones ticked, the rest waiting. Tapping one
/// starts there — its video, then its tracing, then the next.
class TracingLettersView extends GetView<TracingLettersController> {
  const TracingLettersView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(controller.title)),
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.items.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'Nothing here yet',
          builder: (context) =>
              LetterGrid(items: controller.items.toList(), onPick: _start),
        ),
      ),
    );
  }

  void _start(int index) {
    Get.to<void>(
      () => TracingSessionView(controller: controller, startAt: index),
    );
  }
}

/// The letters as big tiles. Public so a preview test can draw it.
class LetterGrid extends StatelessWidget {
  const LetterGrid({required this.items, required this.onPick, super.key});

  final List<TracingModuleItem> items;
  final ValueChanged<int> onPick;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 110,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
      ),
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        return Material(
          color: item.traced
              ? const Color(0xFFDDF2E8)
              : theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(20),
          child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () => onPick(index),
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: theme.colorScheme.outlineVariant),
              ),
              child: Stack(
                children: [
                  Center(
                    child: GlyphText(
                      item.glyph,
                      size: 44,
                      color: theme.colorScheme.onSurface,
                    ),
                  ),
                  if (item.traced)
                    const Positioned(
                      right: 6,
                      top: 6,
                      child: Icon(
                        Icons.check_circle_rounded,
                        size: 20,
                        color: Color(0xFF2E9469),
                      ),
                    )
                  else if (item.hasVideo)
                    Positioned(
                      right: 6,
                      top: 6,
                      child: Icon(
                        Icons.play_circle_outline_rounded,
                        size: 18,
                        color: theme.colorScheme.outline,
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
