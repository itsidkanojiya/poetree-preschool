import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/assets/app_assets.dart';
import '../../core/routes/app_pages.dart';
import '../../core/theme/play_palette.dart';
import '../../core/widgets/art.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/authed_image.dart';
import '../../core/widgets/squish.dart';
import '../animation/film_widgets.dart';
import 'books_controllers.dart';

/// Books: the first step, choosing a subject — the parent app's Learning tab.
///
/// A subject first because that is how a child names what they want, "the
/// English one", and a subject has several books, one per term, which the
/// next screen lays out. The 2D & 3D Animation screen starts from the same
/// subjects, so the two never disagree about what a child has.
///
/// The controller is created here rather than by a route binding, because a tab
/// is not navigated to — and it is replaced when the chosen child changes, so
/// two children never share one list.
class BookSubjectsEmbedded extends StatefulWidget {
  const BookSubjectsEmbedded({
    super.key,
    required this.studentId,
    required this.childName,
  });

  final String studentId;
  final String childName;

  @override
  State<BookSubjectsEmbedded> createState() => _BookSubjectsEmbeddedState();
}

class _BookSubjectsEmbeddedState extends State<BookSubjectsEmbedded> {
  late final String _tag = 'book-subjects-${widget.studentId}';

  @override
  void initState() {
    super.initState();
    Get.put<SubjectsController>(
      SubjectsController(
        studentId: widget.studentId,
        childName: widget.childName,
      ),
      tag: _tag,
    );
  }

  @override
  void dispose() {
    Get.delete<SubjectsController>(tag: _tag);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<SubjectsController>(tag: _tag);
    final theme = Theme.of(context);

    return Obx(
      () => AsyncView(
        isLoading: controller.isLoading.value,
        error: controller.error.value,
        isEmpty: controller.subjects.isEmpty,
        onRetry: controller.load,
        emptyTitle: 'No books yet',
        emptyMessage:
            'Your school’s books will appear here once they are switched on.',
        builder: (context) => RefreshIndicator(
          onRefresh: controller.load,
          child: CustomScrollView(
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                sliver: SliverToBoxAdapter(
                  child: Row(
                    children: [
                      const ArtIcon(AppIcons.subjects, size: 44),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Pick a subject',
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
                sliver: SliverGrid.builder(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 14,
                    // Taller than square, for the subject's picture.
                    childAspectRatio: 0.8,
                  ),
                  itemCount: controller.subjects.length,
                  itemBuilder: (context, index) => _SubjectCard(
                    subject: controller.subjects[index],
                    studentId: controller.studentId,
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

class _SubjectCard extends StatelessWidget {
  const _SubjectCard({required this.subject, required this.studentId});

  final ShelfSubject subject;
  final String? studentId;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = toneFor(subject.name);

    return Squish(
      onTap: () => Get.toNamed<void>(
        AppRoutes.books,
        arguments: {
          'studentId': studentId,
          'subjectId': subject.id,
          'subjectName': subject.name,
        },
      ),
      child: Container(
        clipBehavior: Clip.antiAlias,
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
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // The publisher's picture across the top, as a book wears its
            // cover; until there is one, the subject's icon.
            Expanded(
              child: subject.picturePath != null
                  ? AuthedImage(path: subject.picturePath!, fit: BoxFit.cover)
                  : Center(
                      child: SubjectBadge(
                        icon: subject.icon,
                        name: subject.name,
                        tone: tone,
                        size: 76,
                      ),
                    ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
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
                    subject.bookCount == 1
                        ? '1 book'
                        : '${subject.bookCount} books',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: tone.deep,
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
