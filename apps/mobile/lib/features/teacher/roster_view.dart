import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/widgets/async_view.dart';
import 'roster_controller.dart';

/// Bands, in the words a teacher would use out loud.
({String label, Color color}) _band(int percent, int attempts) {
  if (attempts == 0) {
    return (label: 'Not started', color: const Color(0xFF94A3B8));
  }
  if (percent >= 80) {
    return (label: 'Confident', color: const Color(0xFF16A34A));
  }
  if (percent >= 50) {
    return (label: 'Getting there', color: const Color(0xFFD97706));
  }
  return (label: 'Needs practice', color: const Color(0xFFDC2626));
}

class RosterView extends GetView<RosterController> {
  const RosterView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('The class')),
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.children.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'Nobody enrolled',
          emptyMessage: 'The office adds children to a class.',
          builder: (context) => ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              if (controller.commonGaps.isNotEmpty) ...[
                Card(
                  color: Theme.of(context).colorScheme.secondaryContainer,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Worth revisiting with everyone',
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        const SizedBox(height: 8),
                        // More than one child struggling is a teaching signal;
                        // one child is a quiet word.
                        Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          children: controller.commonGaps
                              .map(
                                (gap) => Chip(
                                  visualDensity: VisualDensity.compact,
                                  label: Text('${gap.key} · ${gap.value}'),
                                ),
                              )
                              .toList(),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
              ],

              ...controller.children.map((child) {
                final band = _band(child.averageMastery, child.skillsAttempted);

                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    onTap: () => _openChild(context, child),
                    leading: InitialsAvatar(name: child.fullName, radius: 20),
                    title: Text(child.fullName),
                    subtitle: Text(
                      child.hasStarted
                          ? '${child.skillsAttempted} skill${child.skillsAttempted == 1 ? '' : 's'} tried · ${band.label}'
                          : 'Nothing recorded yet',
                      style: TextStyle(color: band.color),
                    ),
                    trailing: Text(
                      child.hasStarted ? '${child.averageMastery}%' : '—',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: band.color,
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openChild(BuildContext context, RosterChild child) async {
    await controller.openSkills(child.studentId);
    if (!context.mounted) return;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        builder: (context, scrollController) => Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Row(
                children: [
                  InitialsAvatar(name: child.fullName, radius: 18),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      child.fullName,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Obx(() {
                if (controller.skills.isEmpty) {
                  return const Center(child: Text('Nothing recorded yet.'));
                }

                return ListView.separated(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                  itemCount: controller.skills.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 14),
                  itemBuilder: (context, index) {
                    final skill = controller.skills[index];
                    final band = _band(
                      skill.masteryPercent,
                      skill.attemptsCount,
                    );

                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(child: Text(skill.skillName)),
                            Text(
                              skill.attemptsCount == 0
                                  ? '—'
                                  : '${skill.masteryPercent}%',
                              style: TextStyle(
                                color: band.color,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 5),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: skill.attemptsCount == 0
                                ? 0
                                : skill.masteryPercent / 100,
                            minHeight: 5,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              band.color,
                            ),
                          ),
                        ),
                        const SizedBox(height: 4),
                        // The figure never travels without its working.
                        Text(
                          skill.basis,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                color: Theme.of(context).colorScheme.outline,
                              ),
                        ),
                      ],
                    );
                  },
                );
              }),
            ),
          ],
        ),
      ),
    );
  }
}
