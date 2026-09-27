import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/assets/app_assets.dart';
import '../../core/routes/app_pages.dart';
import '../../core/theme/play_palette.dart';
import '../../core/widgets/art.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/squish.dart';
import 'film_controllers.dart';
import 'film_widgets.dart';

/// 2D & 3D Animation: the first step, choosing a subject.
///
/// A subject rather than a book first because that is how a child names what
/// they want — "the English one" — and a subject has several books, one per
/// term, which the next screen lays out.
class FilmSubjectsView extends GetView<FilmSubjectsController> {
  const FilmSubjectsView({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('2D & 3D Animation')),
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.subjects.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'No films yet',
          emptyMessage:
              'Films arrive with your school’s books. They will appear here.',
          builder: (context) {
            final subjects = controller.subjects;
            final films = subjects.fold(0, (sum, s) => sum + s.filmCount);
            final watched = subjects.fold(0, (sum, s) => sum + s.filmsWatched);

            return RefreshIndicator(
              onRefresh: controller.load,
              child: CustomScrollView(
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                    sliver: SliverList.list(
                      children: [
                        const ArtBanner(
                          AppBanners.animation2d3d,
                          semanticLabel: '2D and 3D Animation',
                        ),
                        const SizedBox(height: 14),
                        FilmProgressCard(
                          title: 'Pick a subject',
                          done: watched,
                          total: films,
                        ),
                      ],
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                    sliver: SliverGrid.builder(
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            mainAxisSpacing: 14,
                            crossAxisSpacing: 14,
                            childAspectRatio: 0.9,
                          ),
                      itemCount: subjects.length,
                      itemBuilder: (context, index) => _SubjectCard(
                        subject: subjects[index],
                        studentId: controller.studentId,
                      ),
                    ),
                  ),
                  if (subjects.isNotEmpty)
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 24),
                        child: Text(
                          'Tap a subject to see its books',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _SubjectCard extends StatelessWidget {
  const _SubjectCard({required this.subject, required this.studentId});

  final FilmSubject subject;
  final String? studentId;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = toneFor(subject.name);

    return Squish(
      onTap: () => Get.toNamed<void>(
        AppRoutes.filmBooks,
        arguments: {
          'studentId': studentId,
          'subjectId': subject.id,
          'subjectName': subject.name,
        },
      ),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: tone.wash,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: tone.deep.withValues(alpha: 0.12),
              blurRadius: 12,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SubjectBadge(
                  icon: subject.icon,
                  name: subject.name,
                  tone: tone,
                  size: 64,
                ),
                const Spacer(),
                if (subject.filmsToWatch > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: FilmColors.pink,
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text(
                      '${subject.filmsToWatch} new',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
              ],
            ),
            const Spacer(),
            Text(
              subject.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: tone.deep,
              ),
            ),
            Text(
              subject.bookCount == 1 ? '1 book' : '${subject.bookCount} books',
              style: theme.textTheme.bodySmall?.copyWith(color: tone.deep),
            ),
            const SizedBox(height: 8),
            FilmProgressBar(
              done: subject.filmsWatched,
              total: subject.filmCount,
              color: tone.ink,
            ),
            const SizedBox(height: 4),
            Text(
              subject.filmCount == 0
                  ? 'No films yet'
                  : '${subject.filmsWatched}/${subject.filmCount} films',
              style: theme.textTheme.labelSmall?.copyWith(
                color: tone.deep,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
