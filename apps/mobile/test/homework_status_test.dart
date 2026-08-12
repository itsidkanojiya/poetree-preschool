import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/features/parent/child_controller.dart';

HomeworkItem item({
  required String due,
  String? status,
  bool allowsSubmission = true,
}) => HomeworkItem.fromJson({
  'id': 'hw_$due$status',
  'title': 'Draw your family',
  'dueDate': due,
  'allowsSubmission': allowsSubmission,
  'subject': {'id': 's', 'name': 'Language'},
  'assignedBy': 'Anita Desai',
  'classroom': {'id': 'c', 'label': 'Junior KG - A'},
  'progress': {'total': 12, 'completed': 0, 'pending': 12},
  if (status != null) 'mySubmission': {'id': 'sub', 'status': status},
});

String iso(int daysFromToday) {
  final now = DateTime.now();
  final date = DateTime(now.year, now.month, now.day + daysFromToday);
  return date.toIso8601String().substring(0, 10);
}

void main() {
  test('a parent is told who set the work and for which subject', () {
    // The screen said only "Draw your family"; a parent with two children in
    // the school could not tell whose class it came from.
    final work = item(due: iso(3));

    expect(work.setBy, 'Anita Desai');
    expect(work.subject, 'Language');
    expect(work.className, 'Junior KG - A');
  });

  test('work past its date and not sent is overdue', () {
    expect(item(due: iso(-2)).isOverdue, isTrue);
    expect(item(due: iso(-2)).statusLabel, 'Overdue');
  });

  test('work already sent is never overdue, however late it was', () {
    // Sent yesterday for something due last week is the teacher's problem now,
    // not a red flag on the parent's list.
    final sent = item(due: iso(-9), status: 'LATE');

    expect(sent.isOverdue, isFalse);
    expect(sent.isWaiting, isTrue);
    expect(sent.statusLabel, 'Sent in late');
  });

  test('work the teacher has judged is out of the to-do list for good', () {
    final done = item(due: iso(-1), status: 'COMPLETED');
    final not = item(due: iso(-1), status: 'NOT_COMPLETED');

    expect(done.isOutstanding, isFalse);
    expect(done.isOverdue, isFalse);
    expect(done.statusLabel, 'Done');
    // Not done is judged too: the API refuses a resubmission, so putting it
    // back in "to do" would point a parent at something they cannot act on.
    expect(not.isOutstanding, isFalse);
    expect(not.statusLabel, 'Not done');
  });

  test('work with nothing to hand back says so rather than looking broken', () {
    final reading = item(due: iso(2), allowsSubmission: false);

    expect(reading.isOutstanding, isFalse);
    expect(reading.canSubmit, isFalse);
    expect(reading.statusLabel, 'To read');
  });

  test('today is not yet late', () {
    // The one every date comparison gets wrong: due today at 9am is not
    // overdue at 8am, and to a preschool parent it is not overdue at 6pm
    // either.
    expect(item(due: iso(0)).isOverdue, isFalse);
    expect(item(due: iso(0)).statusLabel, 'To do');
  });
}
