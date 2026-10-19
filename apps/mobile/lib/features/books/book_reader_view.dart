import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:pdfx/pdfx.dart';

import '../../core/api/api_service.dart';
import '../../core/theme/play_palette.dart';
import '../../core/widgets/art.dart';
import 'books_controllers.dart';

/// The books kept on this phone, so a book opens again without the internet.
///
/// One file per book and version — `<bookId>-<version>.pdf` — so a book the
/// publisher replaced is fetched again, and the copy it replaced is removed
/// rather than kept forever.
class BookCopies {
  BookCopies(this.dir);

  final Directory dir;

  static Future<BookCopies> open() async {
    final root = await getApplicationSupportDirectory();
    final dir = Directory(p.join(root.path, 'books'));
    await dir.create(recursive: true);
    return BookCopies(dir);
  }

  File fileFor(String bookId, String version) =>
      File(p.join(dir.path, '$bookId-$version.pdf'));

  /// The copy of this exact version, if the phone has a whole one.
  Future<File?> current(String bookId, String version) async {
    final file = fileFor(bookId, version);
    return await file.exists() && await file.length() > 0 ? file : null;
  }

  /// Whatever copy of this book the phone has, of any version — what a child
  /// reads when the new one cannot be fetched right now.
  Future<File?> anyCopyOf(String bookId) async {
    final copies = await _copiesOf(bookId);
    if (copies.isEmpty) return null;
    copies.sort(
      (a, b) => b.statSync().modified.compareTo(a.statSync().modified),
    );
    return copies.first;
  }

  /// Removes every copy of this book except [keep].
  Future<void> dropAllBut(String bookId, File keep) async {
    // By name: a listed path and a built one may spell the separator
    // differently.
    final kept = p.basename(keep.path);
    for (final file in await _copiesOf(bookId)) {
      if (p.basename(file.path) != kept) await file.delete();
    }
  }

  /// Removes every copy of this book.
  Future<void> dropAll(String bookId) async {
    for (final file in await _copiesOf(bookId)) {
      await file.delete();
    }
  }

  Future<List<File>> _copiesOf(String bookId) async {
    if (!await dir.exists()) return [];
    return dir.listSync().whereType<File>().where((file) {
      final name = p.basename(file.path);
      return name.startsWith('$bookId-') && name.endsWith('.pdf');
    }).toList();
  }
}

/// A book, to read page by page as it was printed.
///
/// Fetched once and kept: the first open shows how much is left to come, and
/// every open after that is instant and works without the internet. Pages turn
/// with a swipe or with the big arrows, and pinch to look closer.
class BookReaderView extends StatefulWidget {
  const BookReaderView({required this.book, super.key});

  final ShelfBook book;

  @override
  State<BookReaderView> createState() => _BookReaderViewState();
}

class _BookReaderViewState extends State<BookReaderView> {
  final _cancel = CancelToken();
  PdfController? _pdf;
  double? _progress;
  String? _problem;

  /// Set when reading a copy kept from before because the new one could not
  /// be fetched.
  bool _olderCopy = false;
  int _pages = 0;

  BookPdf get _source => widget.book.pdf!;

  @override
  void initState() {
    super.initState();
    unawaited(_prepare());
  }

  Future<void> _retry() async {
    setState(() {
      _problem = null;
      _progress = null;
    });
    await _prepare();
  }

  Future<void> _prepare() async {
    final copies = await BookCopies.open();
    final kept = await copies.current(widget.book.id, _source.version);
    if (kept != null) {
      _show(kept);
      return;
    }

    final target = copies.fileFor(widget.book.id, _source.version);
    // Written under another name and renamed when whole, so a download cut
    // short is never mistaken for the book.
    final part = File('${target.path}.part');
    if (mounted) setState(() => _progress = 0);

    try {
      await api.download(
        _source.path,
        part.path,
        cancelToken: _cancel,
        onProgress: (received, total) {
          final expected = total > 0 ? total : _source.sizeBytes;
          if (!mounted || expected <= 0) return;
          setState(() => _progress = (received / expected).clamp(0, 1));
        },
      );
      await part.rename(target.path);
      await copies.dropAllBut(widget.book.id, target);
      _show(target);
    } on DioException catch (error) {
      if (await part.exists()) await part.delete();
      if (CancelToken.isCancel(error) || !mounted) return;

      final older = await copies.anyCopyOf(widget.book.id);
      if (older != null) {
        _olderCopy = true;
        _show(older);
        return;
      }
      setState(() {
        _progress = null;
        _problem =
            'Could not get the book. Check the internet and try again — '
            'once it has opened, it opens without the internet too.';
      });
    }
  }

  void _show(File file) {
    if (!mounted) return;
    setState(() {
      _progress = null;
      _pdf = PdfController(document: PdfDocument.openFile(file.path));
    });
  }

  /// A copy that will not open is thrown away and fetched again.
  Future<void> _fetchAgain() async {
    final copies = await BookCopies.open();
    await copies.dropAll(widget.book.id);
    final pdf = _pdf;
    setState(() {
      _pdf = null;
      _olderCopy = false;
      _pages = 0;
    });
    pdf?.dispose();
    await _retry();
  }

  @override
  void dispose() {
    _cancel.cancel();
    _pdf?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    // Paper, not the app's background: a book is read on a page.
    final paper = dark ? const Color(0xFF1E2130) : const Color(0xFFF5F0E6);
    final pdf = _pdf;

    return Scaffold(
      backgroundColor: paper,
      appBar: AppBar(
        title: Text(widget.book.name),
        backgroundColor: paper,
        actions: [
          if (pdf != null && _pages > 0)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Center(
                child: ValueListenableBuilder<int>(
                  valueListenable: pdf.pageListenable,
                  builder: (context, page, _) => Text(
                    '$page / $_pages',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
      body: _problem != null
          ? _Problem(message: _problem!, onRetry: _retry)
          : pdf == null
          ? _Fetching(book: widget.book, progress: _progress)
          : Column(
              children: [
                if (_olderCopy)
                  const _Note(
                    'Reading the copy saved on this phone. The newest one '
                    'comes next time there is internet.',
                  ),
                Expanded(
                  child: PdfView(
                    controller: pdf,
                    backgroundDecoration: BoxDecoration(color: paper),
                    onDocumentLoaded: (document) =>
                        setState(() => _pages = document.pagesCount),
                    builders: PdfViewBuilders<DefaultBuilderOptions>(
                      options: const DefaultBuilderOptions(),
                      documentLoaderBuilder: (_) =>
                          const Center(child: CircularProgressIndicator()),
                      pageLoaderBuilder: (_) =>
                          const Center(child: CircularProgressIndicator()),
                      errorBuilder: (_, _) => _Problem(
                        message:
                            'This book would not open on this phone. Fetch it again?',
                        action: 'Fetch it again',
                        onRetry: _fetchAgain,
                      ),
                    ),
                  ),
                ),
                if (_pages > 1) _PageButtons(pdf: pdf, pages: _pages),
              ],
            ),
    );
  }
}

/// Back and forward, big enough for a small thumb, for a child who has not
/// discovered swiping — or whose swipe keeps zooming instead.
class _PageButtons extends StatelessWidget {
  const _PageButtons({required this.pdf, required this.pages});

  final PdfController pdf;
  final int pages;

  static const _turn = Duration(milliseconds: 280);

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 6, 20, 0),
        child: ValueListenableBuilder<int>(
          valueListenable: pdf.pageListenable,
          builder: (context, page, _) => Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _RoundButton(
                icon: Icons.arrow_back_rounded,
                label: 'Previous page',
                onTap: page > 1
                    ? () => pdf.previousPage(
                        duration: _turn,
                        curve: Curves.easeOut,
                      )
                    : null,
              ),
              _RoundButton(
                icon: Icons.arrow_forward_rounded,
                label: 'Next page',
                onTap: page < pages
                    ? () => pdf.nextPage(duration: _turn, curve: Curves.easeOut)
                    : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    final colors = Theme.of(context).colorScheme;

    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      excludeSemantics: true,
      child: Material(
        color: enabled ? colors.primary : colors.surfaceContainerHighest,
        shape: const CircleBorder(),
        elevation: enabled ? 3 : 0,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: 64,
            height: 64,
            child: Icon(
              icon,
              size: 32,
              color: enabled ? colors.onPrimary : colors.outline,
            ),
          ),
        ),
      ),
    );
  }
}

/// The first open: the book's picture and how much of it has arrived.
class _Fetching extends StatelessWidget {
  const _Fetching({required this.book, required this.progress});

  final ShelfBook book;
  final double? progress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = toneFor(book.name);
    final percent = progress == null ? null : (progress! * 100).round();

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                color: tone.wash,
                borderRadius: BorderRadius.circular(28),
              ),
              alignment: Alignment.center,
              child: ArtIcon(book.art, size: 88),
            ),
            const SizedBox(height: 24),
            Text(
              'Getting the book ready…',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 14),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 10,
                color: tone.ink,
                backgroundColor: tone.wash,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              percent == null
                  ? 'Only the first time — then it opens without the internet.'
                  : '$percent% · only the first time, then it opens without the internet.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

class _Problem extends StatelessWidget {
  const _Problem({
    required this.message,
    required this.onRetry,
    this.action = 'Try again',
  });

  final String message;
  final String action;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.menu_book_rounded,
              size: 56,
              color: Theme.of(context).colorScheme.outline,
            ),
            const SizedBox(height: 14),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: Text(action)),
          ],
        ),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      color: colors.secondaryContainer,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Text(
        text,
        style: Theme.of(
          context,
        ).textTheme.bodySmall?.copyWith(color: colors.onSecondaryContainer),
      ),
    );
  }
}
