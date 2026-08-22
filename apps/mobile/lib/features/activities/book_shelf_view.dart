import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/routes/app_pages.dart';
import '../../core/theme/kid_icons.dart';
import '../../core/theme/play_palette.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/authed_image.dart';
import '../../core/widgets/squish.dart';
import 'book_shelf_controller.dart';

/// The child's shelf.
///
/// Covers and names, because that is what a four-year-old recognises — they
/// know the orange book with the apple on it long before they can read "EVS".
/// Tapping one opens the book: its chapters, each with a film and what there is
/// to do in it.
class BookShelfView extends GetView<BookShelfController> {
  const BookShelfView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Books')),
      body: const _Shelf(),
    );
  }
}

/// The shelf inside the parent's own shell, where it has a bottom bar of its
/// own and must not bring a second app bar with it.
///
/// The controller is created here rather than by a route binding, because a tab
/// is not navigated to — and it is replaced when the chosen child changes, so
/// two children never share one shelf.
class BookShelfEmbedded extends StatefulWidget {
  const BookShelfEmbedded({
    super.key,
    required this.studentId,
    required this.childName,
  });

  final String studentId;
  final String childName;

  @override
  State<BookShelfEmbedded> createState() => _BookShelfEmbeddedState();
}

class _BookShelfEmbeddedState extends State<BookShelfEmbedded> {
  late final String _tag = 'shelf-${widget.studentId}';

  @override
  void initState() {
    super.initState();
    Get.put<BookShelfController>(
      BookShelfController(
        studentId: widget.studentId,
        childName: widget.childName,
      ),
      tag: _tag,
    );
  }

  @override
  void dispose() {
    Get.delete<BookShelfController>(tag: _tag);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _Shelf(tag: _tag);
}

class _Shelf extends StatelessWidget {
  const _Shelf({this.tag});

  final String? tag;

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<BookShelfController>(tag: tag);

    return Obx(
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
            mainAxisSpacing: 18,
            crossAxisSpacing: 16,
            // Taller than square: a book is a book shape, and a cover squeezed
            // into a square reads as a photograph of one.
            childAspectRatio: 0.62,
          ),
          itemCount: controller.books.length,
          itemBuilder: (context, index) => _BookTile(
            book: controller.books[index],
            studentId: controller.studentId,
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = toneFor(book.name);

    return Squish(
      onTap: () => Get.toNamed<void>(
        AppRoutes.chapters,
        arguments: {
          'studentId': studentId,
          'bookId': book.id,
          'bookName': book.name,
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
                    if (book.coverPath != null)
                      AuthedImage(path: book.coverPath!, fit: BoxFit.cover)
                    else
                      // No cover: the book's own colour and a drawn book,
                      // which a child can still tell apart at a glance.
                      Center(
                        child: KidIcon(
                          KidGlyph.book,
                          size: 64,
                          color: tone.ink,
                        ),
                      ),

                    // The film still to watch. A play badge rather than a
                    // padlock: the child is being offered something, not
                    // refused.
                    if (book.filmsToWatch > 0)
                      Positioned(
                        right: 10,
                        top: 10,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
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
                              KidIcon(
                                KidGlyph.film,
                                size: 16,
                                color: tone.deep,
                              ),
                              const SizedBox(width: 5),
                              Text(
                                book.filmsToWatch == 1
                                    ? 'Film'
                                    : '${book.filmsToWatch} films',
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: tone.deep,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
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
