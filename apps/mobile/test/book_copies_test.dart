import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:poetree_school/features/books/book_reader_view.dart';

void main() {
  late Directory dir;
  late BookCopies copies;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('book_copies_');
    copies = BookCopies(dir);
  });

  tearDown(() async {
    if (await dir.exists()) await dir.delete(recursive: true);
  });

  Future<File> keep(String bookId, String version, {String text = '%PDF'}) =>
      copies.fileFor(bookId, version).writeAsString(text);

  test('a book read once opens again from the phone', () async {
    expect(await copies.current('bk1', 'v1'), isNull);

    await keep('bk1', 'v1');

    expect(await copies.current('bk1', 'v1'), isNotNull);
    // A replaced book is a different version, fetched again.
    expect(await copies.current('bk1', 'v2'), isNull);
  });

  test('an empty file is not a copy of the book', () async {
    await keep('bk1', 'v1', text: '');

    expect(await copies.current('bk1', 'v1'), isNull);
  });

  test('the new version replaces the old, and only for that book', () async {
    await keep('bk1', 'v1');
    final latest = await keep('bk1', 'v2');
    await keep('bk2', 'v1');

    await copies.dropAllBut('bk1', latest);

    expect(await copies.current('bk1', 'v1'), isNull);
    expect(await copies.current('bk1', 'v2'), isNotNull);
    // Another book's copy is left alone.
    expect(await copies.current('bk2', 'v1'), isNotNull);
  });

  test('without the internet, any copy of the book will do', () async {
    expect(await copies.anyCopyOf('bk1'), isNull);

    await keep('bk1', 'v1');
    // A download cut short is never mistaken for the book.
    await File(p.join(dir.path, 'bk1-v2.pdf.part')).writeAsString('%PD');

    final older = await copies.anyCopyOf('bk1');
    expect(p.basename(older!.path), 'bk1-v1.pdf');
  });

  test('a copy that will not open can be thrown away', () async {
    await keep('bk1', 'v1');
    await keep('bk2', 'v1');

    await copies.dropAll('bk1');

    expect(await copies.anyCopyOf('bk1'), isNull);
    expect(await copies.anyCopyOf('bk2'), isNotNull);
  });
}
