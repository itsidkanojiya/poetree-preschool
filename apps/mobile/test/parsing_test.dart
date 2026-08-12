import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/core/config/branding.dart';
import 'package:poetree_school/core/models/attached_file.dart';
import 'package:poetree_school/features/parent/child_controller.dart';
import 'package:poetree_school/features/parent/children_controller.dart';
import 'package:poetree_school/features/teacher/homework_controller.dart';
import 'package:poetree_school/features/teacher/register_controller.dart';

/// Response shapes, fixed against what the API actually sends.
///
/// The fee ledger nests its money under `totals`; the app read it from the top
/// level and every family's fee screen showed zero however much they owed. It
/// survived because no bill had been raised yet — with an empty database the
/// wrong answer and the right one are the same number.
///
/// So each fixture below is the real response, and each test asserts a figure
/// that is NOT zero. A parsing bug of that kind cannot pass a test that insists
/// on a specific non-zero value.

void main() {
  group('child photographs', _childPhotoTests);

  group('branding', _brandingTests);

  test('fee ledger reads the money from totals, not the top level', () {
    final ledger = Ledger.fromJson({
      'invoices': [
        {
          'invoiceNo': 'RCP-2026-0001',
          'periodLabel': 'Term 1',
          'dueDate': '2026-07-10',
          'netInPaise': 1500000,
          'paidInPaise': 500000,
          'outstandingInPaise': 1000000,
          'status': 'PARTIAL',
          'overdue': true,
        },
      ],
      'payments': [
        {
          'receiptNo': 'RCP-2026-0001',
          'amountInPaise': 500000,
          'paidOn': '2026-07-02',
          'method': 'CASH',
        },
      ],
      'totals': {'billed': 1500000, 'paid': 500000, 'outstanding': 1000000},
    });

    expect(ledger.billedInPaise, 1500000);
    expect(ledger.paidInPaise, 500000);
    expect(ledger.outstandingInPaise, 1000000);

    expect(ledger.invoices, hasLength(1));
    expect(ledger.invoices.single.invoiceNo, 'RCP-2026-0001');
    expect(ledger.invoices.single.period, 'Term 1');
    expect(ledger.invoices.single.outstandingInPaise, 1000000);
  });

  test('a child comes back with their class', () {
    final child = Child.fromJson({
      'id': 'stu_1',
      'fullName': 'Aarav Joshi',
      'admissionNo': 'SUN-001',
      'avatarUrl': null,
      'rollNo': '4',
      'classroom': {'id': 'cls_1', 'label': 'Nursery — A'},
      'academicYear': {'id': 'ay_1', 'name': '2026-27'},
    });

    expect(child.fullName, 'Aarav Joshi');
    expect(child.firstName, 'Aarav');
    expect(child.classroomId, 'cls_1');
    expect(child.classroomLabel, 'Nursery — A');
  });

  test('attendance carries its days and its totals', () {
    final attendance = ChildAttendance.fromJson({
      'studentId': 'stu_1',
      'from': '2026-06-11',
      'to': '2026-08-11',
      'present': 38,
      'absent': 3,
      'late': 1,
      'leave': 0,
      'halfDay': 0,
      'markedDays': 42,
      'percentage': 93,
      'days': [
        {'date': '2026-08-11', 'status': 'PRESENT', 'remark': null},
        {'date': '2026-08-10', 'status': 'ABSENT', 'remark': 'Unwell'},
      ],
    });

    expect(attendance.percentage, 93);
    expect(attendance.markedDays, 42);
    expect(attendance.days.first.status, 'PRESENT');
    expect(attendance.days.last.remark, 'Unwell');
  });

  test('homework carries this child’s own submission, not the class total', () {
    final item = HomeworkItem.fromJson({
      'id': 'hw_1',
      'title': 'Practice letter A',
      'description': 'One page.',
      'dueDate': '2026-08-20',
      'status': 'PUBLISHED',
      'allowsSubmission': true,
      'subject': {'id': 'sub_1', 'name': 'Language'},
      'progress': {'total': 20, 'completed': 12, 'pending': 8},
      'mySubmission': {
        'id': 'sub_row',
        'status': 'COMPLETED',
        'submittedOn': '2026-08-18',
        'teacherRemark': 'Lovely work',
      },
    });

    // The class being 12/20 done says nothing about whether we did ours.
    expect(item.myStatus, 'COMPLETED');
    expect(item.teacherRemark, 'Lovely work');
    expect(item.isDone, isTrue);
    expect(item.isJudged, isTrue);
    expect(item.canSubmit, isFalse);
  });

  test('homework not yet done can be submitted', () {
    final item = HomeworkItem.fromJson({
      'id': 'hw_2',
      'title': 'Count the ducks',
      'dueDate': '2026-08-22',
      'allowsSubmission': true,
      'progress': {'total': 20, 'completed': 0, 'pending': 20},
    });

    expect(item.myStatus, isNull);
    expect(item.isDone, isFalse);
    expect(item.canSubmit, isTrue);
  });

  test('an attached file is fetchable by the client, not doubled', () {
    final file = AttachedFile.fromJson({
      'id': 'file_1',
      'originalName': 'letter-a.jpg',
      'mimeType': 'image/jpeg',
      'url': '/api/v1/files/file_1',
    });

    // The API answers with a path rooted at the domain, which is right for the
    // web portal. Our base URL already ends in /api/v1, so leaving it alone
    // would fetch /api/v1/api/v1/files/file_1 and every photograph would be a
    // broken box.
    expect(file.path, '/files/file_1');
    expect(file.path.contains('api/v1'), isFalse);
    expect(file.isImage, isTrue);
    expect(file.originalName, 'letter-a.jpg');
  });

  test('homework carries the worksheet and the photos we sent back', () {
    final item = HomeworkItem.fromJson({
      'id': 'hw_3',
      'title': 'Draw your family',
      'dueDate': '2026-08-25',
      'allowsSubmission': true,
      'progress': {'total': 20, 'completed': 3, 'pending': 17},
      'attachments': [
        {
          'id': 'file_w',
          'originalName': 'worksheet.pdf',
          'mimeType': 'application/pdf',
          'url': '/api/v1/files/file_w',
        },
      ],
      'mySubmission': {
        'id': 'sub_row',
        'status': 'SUBMITTED',
        'submittedOn': '2026-08-24',
        'files': [
          {
            'id': 'file_p',
            'originalName': 'ours.jpg',
            'mimeType': 'image/jpeg',
            'url': '/api/v1/files/file_p',
          },
        ],
      },
    });

    // Asserted non-empty on purpose: the fee ledger read zero for every family
    // for a week because every assertion there was also true of nothing.
    expect(item.attachments, hasLength(1));
    expect(item.attachments.first.path, '/files/file_w');
    expect(item.attachments.first.isImage, isFalse);
    expect(item.myFiles, hasLength(1));
    expect(item.myFiles.first.path, '/files/file_p');
    expect(item.myFiles.first.isImage, isTrue);
    expect(item.isOutstanding, isFalse);
  });

  test('a teacher sees the photo and the words the parent sent with it', () {
    final submission = Submission.fromJson({
      'id': 'sub_1',
      'studentId': 'st_1',
      'fullName': 'Aarav Sharma',
      'rollNo': '4',
      'status': 'SUBMITTED',
      'note': 'He did it on his own this time',
      'submittedOn': '2026-08-24T09:12:00.000Z',
      'files': [
        {
          'id': 'file_p',
          'originalName': 'ours.jpg',
          'mimeType': 'image/jpeg',
          'url': '/api/v1/files/file_p',
        },
      ],
    });

    // The note field was read by this screen for months while the API never
    // sent it; assert the value, not merely that parsing survived.
    expect(submission.note, 'He did it on his own this time');
    expect(submission.files, hasLength(1));
    expect(submission.files.first.path, '/files/file_p');
    expect(submission.isWaiting, isTrue);
    expect(submission.isJudged, isFalse);
  });

  test('a notice knows whether this parent has read it', () {
    final notice = NoticeItem.fromJson({
      'id': 'n_1',
      'title': 'School closed Friday',
      'body': 'Founders Day.',
      'type': 'EMERGENCY',
      'audience': 'PARENTS',
      'status': 'PUBLISHED',
      'pinned': true,
      'publishAt': '2026-08-09T04:00:00.000Z',
      'expiresAt': null,
      'createdBy': 'Office',
      'classroomLabels': <String>[],
      'attachmentCount': 0,
      'readByMe': false,
    });

    expect(notice.isEmergency, isTrue);
    expect(notice.pinned, isTrue);
    expect(notice.readByMe, isFalse);
  });

  test('progress carries the working, not just the figure', () {
    final skill = SkillProgress.fromJson({
      'skillId': 'sk_1',
      'skillCode': 'SHAPES',
      'skillName': 'Shapes',
      'masteryPercent': 75,
      'correctCount': 3,
      'totalCount': 4,
      'attemptsCount': 1,
      'lastAssessedAt': '2026-08-11T12:00:00.000Z',
      'basis': '3 of 4 questions across 1 attempt',
    });

    expect(skill.masteryPercent, 75);
    expect(skill.basis, '3 of 4 questions across 1 attempt');
  });

  test('the register sheet parses a row', () {
    final row = RegisterRow.fromJson({
      'studentId': 'stu_1',
      'fullName': 'Aarav Joshi',
      'admissionNo': 'SUN-001',
      'rollNo': '4',
      'avatarUrl': null,
      'status': 'ABSENT',
      'remark': 'Unwell',
      'recordId': 'rec_1',
    });

    expect(row.fullName, 'Aarav Joshi');
    expect(row.status, 'ABSENT');
    expect(row.rollNo, '4');
  });
}

void _brandingTests() {
  test('branding falls back rather than showing a wrong colour', () {
    // A school that has not set a colour gets Poetree navy, not black or a
    // crash — this parses whatever the API sends, including nothing.
    final none = Branding.fromJson({'name': 'Sunrise Preschool'});

    expect(none.name, 'Sunrise Preschool');
    expect(none.primaryColor, const Color(0xFF16307C));
    expect(none.logoUrl, isNull);
    expect(none.absoluteLogoUrl, isNull);
  });

  test('branding takes the colour the Super Admin set', () {
    final set = Branding.fromJson({
      'name': 'Sunrise Preschool',
      'primaryColor': '#B4451F',
      'logoUrl': '/api/v1/public/schools/sunrise/logo',
    });

    expect(set.primaryColor, const Color(0xFFB4451F));
  });

  test('the logo url is joined without doubling /api/v1', () {
    final set = Branding.fromJson({
      'name': 'Sunrise Preschool',
      'logoUrl': '/api/v1/public/schools/sunrise/logo',
    });

    // The same doubling that would have broken every homework photograph: the
    // base URL already ends in /api/v1.
    expect(set.absoluteLogoUrl, isNotNull);
    expect('api/v1'.allMatches(set.absoluteLogoUrl!).length, 1);
    expect(
      set.absoluteLogoUrl!.endsWith('/api/v1/public/schools/sunrise/logo'),
      isTrue,
    );
  });

  test('branding survives a round trip through the cache', () {
    // Written to disk on every fetch and read back before the first frame, so
    // a mangled round trip would show the wrong colour on every cold start.
    final original = Branding.fromJson({
      'name': 'Sunrise Preschool',
      'primaryColor': '#B4451F',
      'logoUrl': '/api/v1/public/schools/sunrise/logo',
    });
    final restored = Branding.fromJson(original.toJson());

    expect(restored.name, original.name);
    expect(restored.primaryColor, original.primaryColor);
    expect(restored.logoUrl, original.logoUrl);
  });
}

void _childPhotoTests() {
  test('a child’s photograph is fetchable, not doubled', () {
    final child = Child.fromJson({
      'id': 'st_1',
      'fullName': 'Aarav Joshi',
      'admissionNo': 'A-0001',
      'avatarUrl': '/api/v1/files/photo_1',
    });

    // Same trim as every other file path: the client's base URL already ends
    // in /api/v1, and leaving it would 404 every face in the app.
    expect(child.photoPath, '/files/photo_1');
  });

  test('a child with no photograph falls back to initials', () {
    final child = Child.fromJson({
      'id': 'st_2',
      'fullName': 'Diya Nair',
      'admissionNo': 'A-0002',
    });

    expect(child.photoPath, isNull);
  });
}
