import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/routes/app_pages.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/authed_image.dart';
import 'book_shelf_controller.dart';

/// The child's shelf.
///
/// Covers and names, because that is what a four-year-old recognises — they
/// know the orange book with the apple on it long before they can read "EVS".
/// Tapping one opens the book: its film, and then what there is to do in it.
class BookShelfView extends GetView<BookShelfController> {
  const BookShelfView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Books')),
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.books.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'No books yet',
          emptyMessage:
              'Your school’s books will appear here once they are switched on.',
          builder: (context) => GridView.builder(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 16,
              crossAxisSpacing: 16,
              // Taller than square: a book is a book shape, and a cover
              // squeezed into a square reads as a photograph of one.
              childAspectRatio: 0.66,
            ),
            itemCount: controller.books.length,
            itemBuilder: (context, index) =>
                _BookTile(book: controller.books[index]),
          ),
        ),
      ),
    );
  }
}

class _BookTile extends StatelessWidget {
  const _BookTile({required this.book});

  final ShelfBook book;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return Material(
      color: colors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => Get.toNamed<void>(
          AppRoutes.activities,
          arguments: {
            'studentId': Get.find<BookShelfController>().studentId,
            'bookId': book.id,
            'bookName': book.name,
          },
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(20),
                ),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (book.coverPath != null)
                      AuthedImage(path: book.coverPath!, fit: BoxFit.cover)
                    else
                      _NoCover(name: book.name),

                    // The film still to watch. Said with a play badge rather
                    // than a padlock: the child is being offered something,
                    // not refused.
                    if (book.hasAnimation && !book.isUnlocked)
                      Positioned(
                        right: 8,
                        top: 8,
                        child: Container(
                          padding: const EdgeInsets.all(6),
                          decoration: const BoxDecoration(
                            color: Colors.black54,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.play_arrow_rounded,
                            size: 18,
                            color: Colors.white,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    book.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall,
                  ),
                  if (book.levelName.isNotEmpty)
                    Text(book.levelName, style: theme.textTheme.bodySmall),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A book whose cover has not been uploaded yet.
///
/// A coloured card carrying the name rather than a placeholder photograph: the
/// colour is taken from the name, so the same book is always the same colour
/// and a child can still tell one from another on the shelf.
class _NoCover extends StatelessWidget {
  const _NoCover({required this.name});

  final String name;

  static const _tones = <Color>[
    Color(0xFFE8A33D),
    Color(0xFF2E9469),
    Color(0xFFE05A47),
    Color(0xFF3B93C4),
    Color(0xFF7C6BC4),
  ];

  @override
  Widget build(BuildContext context) {
    var hash = 0;
    for (final unit in name.codeUnits) {
      hash = (hash + unit) % _tones.length;
    }
    final tone = _tones[hash];

    return Container(
      color: tone.withValues(alpha: 0.18),
      alignment: Alignment.center,
      padding: const EdgeInsets.all(14),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.menu_book_rounded, size: 40, color: tone),
          const SizedBox(height: 10),
          Text(
            name,
            textAlign: TextAlign.center,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontWeight: FontWeight.w600, color: tone),
          ),
        ],
      ),
    );
  }
}
