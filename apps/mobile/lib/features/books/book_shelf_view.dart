import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/play_palette.dart';
import '../../core/widgets/art.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/authed_image.dart';
import '../../core/widgets/squish.dart';
import 'book_reader_view.dart';
import 'books_controllers.dart';

/// The books of one subject.
///
/// Covers and names, because that is what a four-year-old recognises — they
/// know the orange book with the apple on it long before they can read "EVS".
/// Tapping one opens it to read, page by page, as it was printed.
class BookShelfView extends GetView<BookShelfController> {
  const BookShelfView({super.key});

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
          emptyTitle: 'No books yet',
          emptyMessage:
              'This subject’s books will appear here once your school has them.',
          builder: (context) => RefreshIndicator(
            onRefresh: controller.load,
            child: GridView.builder(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 18,
                crossAxisSpacing: 16,
                // Taller than square: a book is a book shape, and a cover
                // squeezed into a square reads as a photograph of one.
                childAspectRatio: 0.62,
              ),
              itemCount: controller.books.length,
              itemBuilder: (context, index) =>
                  _BookTile(book: controller.books[index]),
            ),
          ),
        ),
      ),
    );
  }
}

class _BookTile extends StatelessWidget {
  const _BookTile({required this.book});

  final ShelfBook book;

  void _open() {
    if (book.canRead) {
      Get.to<void>(() => BookReaderView(book: book));
      return;
    }
    Get
      ..closeAllSnackbars()
      ..snackbar(
        book.name,
        'This book is not ready to read yet. It will open here soon.',
        snackPosition: SnackPosition.BOTTOM,
        margin: const EdgeInsets.all(16),
      );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = toneFor(book.name);

    return Squish(
      onTap: _open,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: tone.wash,
                borderRadius: BorderRadius.circular(24),
                // A book on a shelf casts a shadow. Soft and low, so a screen
                // of them still reads as a shelf rather than as a pile.
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
                    Opacity(
                      opacity: book.canRead ? 1 : 0.55,
                      child: book.coverPath != null
                          ? AuthedImage(
                              path: book.coverPath!,
                              fit: BoxFit.cover,
                            )
                          // No cover: the book's own colour and its subject's
                          // picture, which a child can still tell apart at a
                          // glance.
                          : Center(child: ArtIcon(book.art, size: 96)),
                    ),
                    Positioned(
                      right: 10,
                      top: 10,
                      child: _Badge(
                        icon: book.canRead
                            ? Icons.menu_book_rounded
                            : Icons.hourglass_top_rounded,
                        label: book.canRead ? 'Read' : 'Soon',
                        color: tone.deep,
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

class _Badge extends StatelessWidget {
  const _Badge({required this.icon, required this.label, required this.color});

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.16),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}
