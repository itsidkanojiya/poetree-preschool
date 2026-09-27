import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/routes/app_pages.dart';
import '../../core/theme/play_palette.dart';
import '../../core/widgets/art.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/authed_image.dart';
import '../../core/widgets/squish.dart';
import '../activities/book_shelf_controller.dart';
import 'film_controllers.dart';

/// The books of one subject.
///
/// A subject has several — a book per term or per level — and each has its
/// own chapters, so the child picks the book they are reading in class.
class FilmBooksView extends GetView<FilmBooksController> {
  const FilmBooksView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(controller.subjectName)),
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.books.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'No books here yet',
          emptyMessage: 'Books for ${controller.subjectName} will appear here.',
          builder: (context) => RefreshIndicator(
            onRefresh: controller.load,
            child: GridView.builder(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 18,
                crossAxisSpacing: 16,
                childAspectRatio: 0.62,
              ),
              itemCount: controller.books.length,
              itemBuilder: (context, index) => _BookCard(
                book: controller.books[index],
                studentId: controller.studentId,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BookCard extends StatelessWidget {
  const _BookCard({required this.book, required this.studentId});

  final ShelfBook book;
  final String? studentId;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = toneFor(book.name);

    return Squish(
      onTap: () => Get.toNamed<void>(
        AppRoutes.filmChapters,
        arguments: {
          'studentId': studentId,
          'bookId': book.id,
          'bookName': book.name,
          'art': book.art,
        },
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: tone.wash,
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: tone.deep.withValues(alpha: 0.18),
                    blurRadius: 14,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (book.coverPath != null)
                      AuthedImage(path: book.coverPath!, fit: BoxFit.cover)
                    else
                      // No cover: its subject's picture.
                      Center(child: ArtIcon(book.art, size: 96)),
                    // A big play button: this screen is about the films.
                    Positioned(
                      right: 10,
                      bottom: 10,
                      child: Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.18),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                        child: Icon(
                          Icons.play_arrow_rounded,
                          color: tone.deep,
                          size: 28,
                        ),
                      ),
                    ),
                    if (book.filmsToWatch > 0)
                      Positioned(
                        left: 10,
                        top: 10,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 9,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF0648C),
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: Text(
                            book.filmsToWatch == 1
                                ? '1 new film'
                                : '${book.filmsToWatch} new films',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
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
          const SizedBox(height: 10),
          Text(
            book.name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              height: 1.15,
            ),
          ),
          if (book.levelName.isNotEmpty)
            Text(
              book.levelName,
              style: theme.textTheme.bodySmall?.copyWith(color: tone.deep),
            ),
        ],
      ),
    );
  }
}
