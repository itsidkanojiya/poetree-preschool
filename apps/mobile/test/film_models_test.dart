import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/features/animation/film_controllers.dart';
import 'package:poetree_school/features/books/books_controllers.dart';
import 'package:poetree_school/features/gallery/gallery_view.dart';

void main() {
  test('a chapter with both films offers the 3D switch', () {
    final chapter = FilmChapter.fromJson({
      'id': 'c1',
      'name': 'The Apple',
      'number': 1,
      'animation': {'videoId': 'aaaaaaaaaaa', 'url': 'https://youtu.be/a'},
      'animation3d': {'videoId': 'bbbbbbbbbbb', 'url': 'https://youtu.be/b'},
      'coverUrl': '/api/v1/files/f1',
      'isWatched': true,
      'isUnlocked': true,
    });

    expect(chapter.hasFilm, isTrue);
    expect(chapter.has3d, isTrue);
    expect(chapter.film3d!.videoId, 'bbbbbbbbbbb');
    // Our base URL already ends in /api/v1.
    expect(chapter.coverPath, '/files/f1');
    expect(chapter.isWatched, isTrue);
    expect(chapter.label, 'Chapter 1 · The Apple');
  });

  test('a chapter with no film is listed but not playable', () {
    final chapter = FilmChapter.fromJson({
      'id': 'c2',
      'name': 'Colours',
      'number': null,
      'animation': null,
      'animation3d': null,
      'coverUrl': null,
      'isWatched': false,
    });

    expect(chapter.hasFilm, isFalse);
    expect(chapter.has3d, isFalse);
    expect(chapter.coverPath, isNull);
    expect(chapter.label, 'Colours');
  });

  test('"More books" has no subject id, and counts what is left', () {
    final subject = ShelfSubject.fromJson({
      'id': null,
      'name': 'More books',
      'icon': 'book',
      'bookCount': 2,
      'filmCount': 5,
      'filmsToWatch': 3,
    });

    expect(subject.id, isNull);
    expect(subject.filmsWatched, 2);
    expect(subject.picturePath, isNull);
  });

  test('a subject with a picture wears it, fetched through our client', () {
    final subject = ShelfSubject.fromJson({
      'id': 'evs',
      'name': 'EVS',
      'icon': 'globe',
      'pictureUrl': '/api/v1/catalogue/assets/p1',
      'bookCount': 1,
      'filmCount': 0,
      'filmsToWatch': 0,
    });

    // Our base URL already ends in /api/v1.
    expect(subject.picturePath, '/catalogue/assets/p1');
  });

  test('a subject lists only the videos it can play, book by book', () {
    final book = FilmBookGroup.fromJson({
      'id': 'b1',
      'name': 'EVS Book 1',
      'coverUrl': null,
      'films': [
        {
          'id': 'c1',
          'name': 'Leaves',
          'animation': {'videoId': 'aaaaaaaaaaa', 'url': 'https://youtu.be/a'},
          'isWatched': false,
        },
        // A link that never became a playable video.
        {'id': 'c2', 'name': 'Roots', 'animation': null},
      ],
    });

    expect(book.name, 'EVS Book 1');
    expect(book.films.map((c) => c.id), ['c1']);
  });

  test('gallery photos are fetched through our own file route', () {
    final event = GalleryEventItem.fromJson({
      'id': 'e1',
      'name': 'Sports Day',
      'eventDate': '2026-09-20T00:00:00.000Z',
      'description': null,
      'photoCount': 1,
      'cover': {'id': 'p1', 'url': '/api/v1/files/f9', 'caption': null},
      'photos': [
        {'id': 'p1', 'url': '/api/v1/files/f9', 'caption': 'Race'},
      ],
    });

    expect(event.cover!.path, '/files/f9');
    expect(event.photos.single.caption, 'Race');
    expect(event.dateLabel, '20 Sep 2026');
  });
}
