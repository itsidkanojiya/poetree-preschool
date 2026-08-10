import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../api/api_service.dart';

/// Registers marked with no signal, waiting to reach the server.
///
/// A preschool's wifi does not reach every classroom, and a teacher taking the
/// register cannot be told to walk somewhere else and start again. Marking
/// always succeeds locally; the network is a detail that resolves later.
///
/// This is safe only because `PUT /attendance` replaces a whole session and the
/// database holds a unique constraint on (classroom, date). Replaying an entry
/// hours later cannot create a second register or double-count a child, so the
/// outbox never has to reason about what the server has already seen.
///
/// Deliberately a JSON file rather than a database. The queue holds at most a
/// few registers of thirty rows, it is drained within minutes, and a schema plus
/// a code-generation step in CI would be machinery with nothing to do.
class Outbox {
  Outbox({Connectivity? connectivity, this.directory})
    : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  /// Where the queue file lives. Injected in tests; resolved on first use in
  /// the app, because path_provider needs a platform channel.
  Directory? directory;

  static const _fileName = 'pending_registers.json';

  List<PendingRegister> _pending = <PendingRegister>[];
  bool _loaded = false;
  Future<void>? _draining;
  StreamSubscription<List<ConnectivityResult>>? _watch;

  /// How many registers are still waiting. The teacher sees this, because a
  /// silent queue is indistinguishable from lost work.
  int get pendingCount => _pending.length;

  Future<void> init() async {
    await _load();
    // Drain as soon as a connection returns, rather than making the teacher
    // remember to reopen the app.
    _watch = _connectivity.onConnectivityChanged.listen((results) {
      if (results.any((r) => r != ConnectivityResult.none)) {
        unawaited(drain());
      }
    });
    unawaited(drain());
  }

  Future<void> dispose() async {
    await _watch?.cancel();
  }

  Future<File> _file() async {
    directory ??= await getApplicationDocumentsDirectory();
    return File(p.join(directory!.path, _fileName));
  }

  Future<void> _load() async {
    if (_loaded) return;
    _loaded = true;

    try {
      final file = await _file();
      if (!file.existsSync()) return;

      final raw = jsonDecode(await file.readAsString());
      if (raw is! List) return;

      _pending = raw
          .whereType<Map<String, dynamic>>()
          .map(PendingRegister.fromJson)
          .toList();
    } on Object {
      // A corrupt file must not stop the app starting. The registers in it are
      // lost, which is bad, but an app that will not open is worse — and the
      // teacher can mark again.
      _pending = <PendingRegister>[];
    }
  }

  Future<void> _save() async {
    final file = await _file();
    await file.writeAsString(
      jsonEncode(_pending.map((e) => e.toJson()).toList()),
    );
  }

  /// Sends a register, or keeps it until the network comes back.
  ///
  /// Returns true if the server has it. False means it is queued, not lost —
  /// the caller says so on screen rather than showing a failure.
  Future<bool> submit(PendingRegister register) async {
    await _load();

    // Replace any earlier attempt at the same register. Only the latest state
    // of a class on a day is meaningful; queuing both would send a correction
    // and then undo it.
    _pending.removeWhere((e) => e.key == register.key);
    _pending.add(register);
    await _save();

    await drain();
    return !_pending.any((e) => e.key == register.key);
  }

  /// Attempts every queued register, oldest first.
  Future<void> drain() {
    return _draining ??= _drainOnce().whenComplete(() {
      _draining = null;
    });
  }

  Future<void> _drainOnce() async {
    await _load();
    if (_pending.isEmpty) return;

    final sent = <String>[];

    for (final register in List<PendingRegister>.from(_pending)) {
      try {
        await api.put<dynamic>('/attendance', body: register.body);
        sent.add(register.key);
      } on DioException catch (error) {
        final status = error.response?.statusCode;

        // A rejection is not a connectivity problem and will be rejected again
        // every time. Dropping it stops the queue jamming behind one bad entry
        // and retrying forever.
        if (status != null && status >= 400 && status < 500) {
          sent.add(register.key);
          continue;
        }

        // Anything else — no signal, a 5xx, a timeout — is worth retrying, and
        // stopping here keeps the registers in order.
        break;
      }
    }

    if (sent.isNotEmpty) {
      _pending.removeWhere((e) => sent.contains(e.key));
      await _save();
    }
  }
}

/// One classroom's register for one day, as the API expects it.
class PendingRegister {
  PendingRegister({
    required this.classroomId,
    required this.date,
    required this.records,
    this.note,
  });

  factory PendingRegister.fromJson(Map<String, dynamic> json) {
    return PendingRegister(
      classroomId: json['classroomId'] as String,
      date: json['date'] as String,
      note: json['note'] as String?,
      records: (json['records'] as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .toList(),
    );
  }

  final String classroomId;

  /// YYYY-MM-DD. The register belongs to a calendar day, not an instant, so a
  /// queued entry syncing after midnight still lands on the right day.
  final String date;
  final String? note;
  final List<Map<String, dynamic>> records;

  String get key => '$classroomId@$date';

  Map<String, dynamic> get body => <String, dynamic>{
    'classroomId': classroomId,
    'date': date,
    'records': records,
    if (note != null && note!.isNotEmpty) 'note': note,
  };

  Map<String, dynamic> toJson() => body;
}
