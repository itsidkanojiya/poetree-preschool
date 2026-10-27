import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/routes/app_pages.dart';
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
              itemBuilder: (context, index) => _BookTile(
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

class _BookTile extends StatelessWidget {
  const _BookTile({required this.book, required this.studentId});

  final ShelfBook book;
  final String? studentId;

  void _read() => Get.to<void>(() => BookReaderView(book: book));

  /// The book's activities, chapter by chapter.
  void _play() => Get.toNamed<void>(
    AppRoutes.activities,
    arguments: {
      'studentId': studentId,
      'bookId': book.id,
      'bookName': book.name,
    },
  );

  /// Whatever the book has: its pages to read, its activities to play, a
  /// choice of the two — or, with neither yet, a word that it is coming.
  void _open() {
    if (book.canRead && book.hasActivities) {
      Get.bottomSheet<void>(
        _ReadOrPlay(book: book, onRead: _read, onPlay: _play),
        backgroundColor: Colors.white,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
        ),
      );
      return;
    }
    if (book.canRead) return _read();
    if (book.hasActivities) return _play();
    Get
      ..closeAllSnackbars()
      ..snackbar(
        book.name,
        'This book is not ready yet. It will open here soon.',
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
                      opacity: book.isEmpty ? 0.55 : 1,
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
                            : book.hasActivities
                            ? Icons.extension_rounded
                            : Icons.hourglass_top_rounded,
                        label: book.canRead
                            ? 'Read'
                            : book.hasActivities
                            ? 'Play'
                            : 'Soon',
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

/// A book with both: read its pages, or play its activities.
class _ReadOrPlay extends StatelessWidget {
  const _ReadOrPlay({
    required this.book,
    required this.onRead,
    required this.onPlay,
  });

  final ShelfBook book;
  final VoidCallback onRead;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              book.name,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 16),
            _Choice(
              icon: Icons.menu_book_rounded,
              label: 'Read the book',
              colour: const Color(0xFF3B82F6),
              onTap: () {
                Get.back<void>();
                onRead();
              },
            ),
            const SizedBox(height: 12),
            _Choice(
              icon: Icons.extension_rounded,
              label: book.activityCount == 1
                  ? 'Play the activity'
                  : 'Play the ${book.activityCount} activities',
              colour: const Color(0xFFF59E0B),
              onTap: () {
                Get.back<void>();
                onPlay();
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _Choice extends StatelessWidget {
  const _Choice({
    required this.icon,
    required this.label,
    required this.colour,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final Color colour;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: colour.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          child: Row(
            children: [
              Icon(icon, color: colour, size: 28),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  label,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: colour),
            ],
          ),
        ),
      ),
    );
  }
}
