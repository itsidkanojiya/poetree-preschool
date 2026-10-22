import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Where a child left an activity part-way: the item they were on, what they
/// had scored before it, and — for tracing — which items they had traced.
class SavedPlace {
  const SavedPlace({
    required this.index,
    required this.correct,
    this.traced = const {},
  });

  factory SavedPlace.fromJson(Map<String, dynamic> json) => SavedPlace(
    index: (json['index'] as num?)?.toInt() ?? 0,
    correct: (json['correct'] as num?)?.toInt() ?? 0,
    traced: {
      for (final item in json['traced'] as List<dynamic>? ?? const [])
        if (item is num) item.toInt(),
    },
  );

  final int index;
  final int correct;
  final Set<int> traced;

  Map<String, dynamic> toJson() => {
    'index': index,
    'correct': correct,
    'traced': traced.toList()..sort(),
  };
}

/// One child's places in their activities, kept on the phone.
///
/// A child who leaves an activity on question four comes back to question
/// four — after closing the app, or the next day. One file per child, so two
/// children sharing a phone never pick up each other's places, and an activity
/// finished or started again forgets its place.
///
/// Kept on the phone rather than at the school: a place is only worth having
/// on the device the child was using, and it is gone the moment they finish.
/// Whether they finished is what the school keeps.
class ActivityPlaces {
  ActivityPlaces(this.studentId, {Future<Directory> Function()? directory})
    : _directory = directory ?? _defaultDirectory;

  final String studentId;
  final Future<Directory> Function() _directory;

  static Future<Directory> _defaultDirectory() async => Directory(
    p.join((await getApplicationSupportDirectory()).path, 'places'),
  );

  /// Writes one at a time, so a quick tap and the next cannot cross.
  Future<void> _queue = Future.value();

  Future<File?> _file() async {
    try {
      final dir = await _directory();
      await dir.create(recursive: true);
      return File(p.join(dir.path, '$studentId.json'));
    } on Object {
      // No storage — a test, or a phone refusing. A place is a kindness, not
      // a requirement: the activity simply starts from the beginning.
      return null;
    }
  }

  Future<Map<String, SavedPlace>> all() async {
    final file = await _file();
    if (file == null || !await file.exists()) return {};
    try {
      final json = jsonDecode(await file.readAsString());
      if (json is! Map<String, dynamic>) return {};
      return {
        for (final entry in json.entries)
          if (entry.value is Map<String, dynamic>)
            entry.key: SavedPlace.fromJson(entry.value as Map<String, dynamic>),
      };
    } on Object {
      return {};
    }
  }

  Future<SavedPlace?> read(String activityId) async =>
      (await all())[activityId];

  Future<void> save(String activityId, SavedPlace place) =>
      _write((places) => places[activityId] = place);

  Future<void> clear(String activityId) =>
      _write((places) => places.remove(activityId));

  Future<void> _write(void Function(Map<String, SavedPlace>) change) {
    final next = _queue.then((_) async {
      final file = await _file();
      if (file == null) return;
      final places = await all();
      change(places);
      // Written beside and swapped in, so a phone switched off mid-write
      // keeps the old places rather than half a file.
      final temp = File('${file.path}.tmp');
      await temp.writeAsString(
        jsonEncode({
          for (final entry in places.entries) entry.key: entry.value.toJson(),
        }),
      );
      await temp.rename(file.path);
    });
    _queue = next.catchError((Object _) {});
    return _queue;
  }
}
