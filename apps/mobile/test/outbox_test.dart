import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/core/offline/outbox.dart';

/// The outbox holds a teacher's work, so its failure modes are not "an error
/// appears" — they are "the morning's register is gone", or "yesterday's
/// register is sent again on top of a correction".

PendingRegister _register({
  String classroom = 'class-1',
  String date = '2026-08-10',
  String status = 'PRESENT',
}) {
  return PendingRegister(
    classroomId: classroom,
    date: date,
    records: [
      {'studentId': 'child-1', 'status': status},
    ],
  );
}

DioException _offline() => DioException.connectionError(
  requestOptions: RequestOptions(path: '/attendance'),
  reason: 'no signal',
);

DioException _rejected(int status) => DioException.badResponse(
  statusCode: status,
  requestOptions: RequestOptions(path: '/attendance'),
  response: Response<dynamic>(
    statusCode: status,
    requestOptions: RequestOptions(path: '/attendance'),
  ),
);

void main() {
  late Directory temp;

  setUp(() => temp = Directory.systemTemp.createTempSync('outbox_test'));
  tearDown(() => temp.deleteSync(recursive: true));

  test(
    'keeps a register when there is no signal, and sends it later',
    () async {
      var online = false;
      final sent = <String>[];

      final outbox = Outbox(
        directory: temp,
        send: (register) async {
          if (!online) throw _offline();
          sent.add(register.key);
        },
      );

      // Marked in a classroom the wifi does not reach.
      final delivered = await outbox.submit(_register());

      expect(delivered, isFalse, reason: 'queued, not delivered');
      expect(outbox.pendingCount, 1);
      expect(sent, isEmpty);

      // The teacher walks back to the office.
      online = true;
      await outbox.drain();

      expect(sent, ['class-1@2026-08-10']);
      expect(outbox.pendingCount, 0);
    },
  );

  test('a second marking of the same day replaces the first', () async {
    final bodies = <Map<String, dynamic>>[];
    var online = false;

    final outbox = Outbox(
      directory: temp,
      send: (register) async {
        if (!online) throw _offline();
        bodies.add(register.body);
      },
    );

    await outbox.submit(_register(status: 'PRESENT'));
    // The teacher notices a child is actually absent and marks again, still
    // with no signal. Sending both would deliver the correction and then undo
    // it, because only the latest state of a class on a day is meaningful.
    await outbox.submit(_register(status: 'ABSENT'));

    expect(outbox.pendingCount, 1);

    online = true;
    await outbox.drain();

    expect(bodies, hasLength(1));
    expect((bodies.single['records'] as List).first, {
      'studentId': 'child-1',
      'status': 'ABSENT',
    });
  });

  test('survives the app being closed and reopened', () async {
    // Anything else means a teacher's morning is lost to a phone restart.
    final first = Outbox(directory: temp, send: (_) async => throw _offline());
    await first.submit(_register());
    expect(first.pendingCount, 1);

    final sent = <String>[];
    final second = Outbox(directory: temp, send: (r) async => sent.add(r.key));
    await second.drain();

    expect(sent, ['class-1@2026-08-10']);
    expect(second.pendingCount, 0);
  });

  test(
    'drops a register the server refuses, rather than jamming the queue',
    () async {
      // A 4xx will be a 4xx every time. Retrying it forever would block every
      // later register behind it, which loses far more than the bad one.
      final attempts = <String>[];

      final outbox = Outbox(
        directory: temp,
        send: (register) async {
          attempts.add(register.key);
          if (register.classroomId == 'gone') throw _rejected(404);
        },
      );

      await outbox.submit(_register(classroom: 'gone'));
      await outbox.submit(_register(classroom: 'class-2'));

      expect(outbox.pendingCount, 0);
      expect(attempts, contains('class-2@2026-08-10'));
    },
  );

  test('keeps its place when the server is briefly broken', () async {
    // A 5xx is worth retrying, unlike a 4xx, and the queue must not skip past
    // it and send later registers out of order.
    var failing = true;
    final sent = <String>[];

    final outbox = Outbox(
      directory: temp,
      send: (register) async {
        if (failing) throw _rejected(503);
        sent.add(register.key);
      },
    );

    await outbox.submit(_register(classroom: 'class-1'));
    await outbox.submit(_register(classroom: 'class-2'));
    expect(outbox.pendingCount, 2);
    expect(sent, isEmpty);

    failing = false;
    await outbox.drain();

    expect(sent, ['class-1@2026-08-10', 'class-2@2026-08-10']);
    expect(outbox.pendingCount, 0);
  });

  test('a corrupt queue file does not stop the app starting', () async {
    File('${temp.path}/pending_registers.json').writeAsStringSync('{ not json');

    final sent = <String>[];
    final outbox = Outbox(directory: temp, send: (r) async => sent.add(r.key));

    // The queued registers are lost, which is bad. An app that will not open is
    // worse, and the teacher can mark again.
    await outbox.drain();
    expect(outbox.pendingCount, 0);

    final delivered = await outbox.submit(_register());
    expect(delivered, isTrue);
    expect(sent, ['class-1@2026-08-10']);
  });
}
