import 'package:dio/dio.dart';

/// Term report cards and certificates, as the API sends them. Mirrors the
/// shapes in packages/shared/src/schemas/results.ts and certificate.ts.

/// The API's own sentence for a refusal, or a plain one for no signal.
String apiMessage(DioException error, String fallback) {
  final payload = error.response?.data;
  if (payload is Map && payload['error'] is Map) {
    return (payload['error'] as Map)['message']?.toString() ?? fallback;
  }
  return error.response == null
      ? 'Cannot reach the school right now.'
      : fallback;
}

List<Map<String, dynamic>> _maps(Object? value) =>
    (value as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();

/* -------------------------------------------------------------------------- */
/* What a family reads                                                        */
/* -------------------------------------------------------------------------- */

/// A published card in a family's list.
class ReportCardListItem {
  ReportCardListItem({
    required this.id,
    required this.termId,
    required this.term,
    required this.academicYear,
    required this.publishedAt,
  });

  factory ReportCardListItem.fromJson(Map<String, dynamic> json) =>
      ReportCardListItem(
        id: json['id'] as String,
        termId: json['termId'] as String,
        term: json['term'] as String,
        academicYear: json['academicYear'] as String? ?? '',
        publishedAt: DateTime.tryParse(json['publishedAt'] as String? ?? ''),
      );

  final String id;
  final String termId;
  final String term;
  final String academicYear;
  final DateTime? publishedAt;
}

class ReportRow {
  ReportRow({required this.area, required this.grade});

  final String area;
  final String? grade;
}

class ReportGroup {
  ReportGroup({required this.group, required this.rows});

  factory ReportGroup.fromJson(Map<String, dynamic> json) => ReportGroup(
    group: json['group'] as String? ?? '',
    rows: _maps(json['rows'])
        .map(
          (r) => ReportRow(
            area: r['area'] as String,
            grade: r['grade'] as String?,
          ),
        )
        .toList(),
  );

  final String group;
  final List<ReportRow> rows;
}

class GradeKey {
  GradeKey({required this.label, this.description});

  final String label;
  final String? description;
}

/// A report card as a family reads it — frozen when it was published.
class ReportCard {
  ReportCard({
    required this.id,
    required this.term,
    required this.academicYear,
    required this.childName,
    required this.admissionNo,
    required this.rollNo,
    required this.classroom,
    required this.groups,
    required this.scale,
    required this.remarks,
    required this.classTeacher,
    required this.principal,
    required this.publishedAt,
  });

  factory ReportCard.fromJson(Map<String, dynamic> json) {
    final student = json['student'] as Map<String, dynamic>? ?? const {};
    return ReportCard(
      id: json['id'] as String,
      term: json['term'] as String? ?? '',
      academicYear: json['academicYear'] as String? ?? '',
      childName: student['fullName'] as String? ?? '',
      admissionNo: student['admissionNo'] as String? ?? '',
      rollNo: student['rollNo'] as String?,
      classroom: json['classroom'] as String? ?? '',
      groups: _maps(json['groups']).map(ReportGroup.fromJson).toList(),
      scale: _maps(json['scale'])
          .map(
            (s) => GradeKey(
              label: s['label'] as String,
              description: s['description'] as String?,
            ),
          )
          .toList(),
      remarks: json['remarks'] as String?,
      classTeacher: json['classTeacher'] as String?,
      principal: json['principal'] as String?,
      publishedAt: DateTime.tryParse(json['publishedAt'] as String? ?? ''),
    );
  }

  final String id;
  final String term;
  final String academicYear;
  final String childName;
  final String admissionNo;
  final String? rollNo;
  final String classroom;
  final List<ReportGroup> groups;

  /// Best first, so a grade's place in it says how good it is.
  final List<GradeKey> scale;
  final String? remarks;
  final String? classTeacher;
  final String? principal;
  final DateTime? publishedAt;

  /// 0 for the best grade, 1 for the last; null for a grade not on the scale.
  double? standing(String? grade) {
    final index = scale.indexWhere((s) => s.label == grade);
    if (index < 0) return null;
    return scale.length <= 1 ? 0 : index / (scale.length - 1);
  }
}

/// A certificate as the family has it.
class ChildCertificate {
  ChildCertificate({
    required this.awardId,
    required this.title,
    required this.body,
    required this.design,
    required this.issuedOn,
    required this.number,
  });

  factory ChildCertificate.fromJson(Map<String, dynamic> json) =>
      ChildCertificate(
        awardId: json['awardId'] as String,
        title: json['title'] as String? ?? '',
        body: json['body'] as String? ?? '',
        design: json['design'] as String? ?? 'CLASSIC',
        issuedOn: DateTime.tryParse(json['issuedOn'] as String? ?? ''),
        number: json['number'] as String?,
      );

  final String awardId;
  final String title;
  final String body;

  /// CLASSIC, STARS, PLAYFUL or ELEGANT.
  final String design;
  final DateTime? issuedOn;
  final String? number;
}

/* -------------------------------------------------------------------------- */
/* What a teacher fills in                                                    */
/* -------------------------------------------------------------------------- */

class Term {
  Term({
    required this.id,
    required this.name,
    required this.academicYearName,
    required this.isActive,
    this.startsOn,
  });

  factory Term.fromJson(Map<String, dynamic> json) => Term(
    id: json['id'] as String,
    name: json['name'] as String,
    academicYearName: json['academicYearName'] as String? ?? '',
    isActive: json['isActive'] as bool? ?? true,
    startsOn: DateTime.tryParse(json['startsOn'] as String? ?? ''),
  );

  final String id;
  final String name;
  final String academicYearName;
  final bool isActive;
  final DateTime? startsOn;

  /// The term a school is most likely in: the latest that has started, else
  /// the first. The web portal picks the same way.
  static Term? current(List<Term> terms) {
    final active = terms.where((t) => t.isActive).toList();
    final now = DateTime.now();
    final started = active
        .where((t) => t.startsOn != null && !t.startsOn!.isAfter(now))
        .toList();
    if (started.isNotEmpty) return started.last;
    return active.isEmpty ? null : active.first;
  }
}

class GradeLevel {
  GradeLevel({required this.id, required this.label, this.description});

  factory GradeLevel.fromJson(Map<String, dynamic> json) => GradeLevel(
    id: json['id'] as String,
    label: json['label'] as String,
    description: json['description'] as String?,
  );

  final String id;
  final String label;
  final String? description;
}

class ReportArea {
  ReportArea({required this.id, required this.group, required this.name});

  factory ReportArea.fromJson(Map<String, dynamic> json) => ReportArea(
    id: json['id'] as String,
    group: json['group'] as String? ?? '',
    name: json['name'] as String,
  );

  final String id;
  final String group;
  final String name;
}

/// One child's row of the class grid.
class GridChild {
  GridChild({
    required this.studentId,
    required this.fullName,
    required this.rollNo,
    required this.reportCardId,
    required this.status,
    required this.remarks,
    required this.grades,
    required this.graded,
  });

  factory GridChild.fromJson(Map<String, dynamic> json) => GridChild(
    studentId: json['studentId'] as String,
    fullName: json['fullName'] as String,
    rollNo: json['rollNo'] as String?,
    reportCardId: json['reportCardId'] as String?,
    status: json['status'] as String? ?? 'NOT_STARTED',
    remarks: json['remarks'] as String?,
    grades: (json['grades'] as Map<String, dynamic>? ?? const {}).map(
      (key, value) => MapEntry(key, value as String?),
    ),
    graded: (json['graded'] as num?)?.toInt() ?? 0,
  );

  final String studentId;
  final String fullName;
  final String? rollNo;
  final String? reportCardId;

  /// NOT_STARTED, DRAFT, SUBMITTED or PUBLISHED.
  final String status;
  final String? remarks;

  /// Area id to grade id; areas not yet graded are absent or null.
  final Map<String, String?> grades;
  final int graded;

  String get firstName => fullName.split(' ').first;

  /// Still the teacher's to change: not handed over, not sent home.
  bool get editable => status == 'NOT_STARTED' || status == 'DRAFT';
}

class ReportGrid {
  ReportGrid({
    required this.classroomLabel,
    required this.term,
    required this.areas,
    required this.scale,
    required this.children,
  });

  factory ReportGrid.fromJson(Map<String, dynamic> json) => ReportGrid(
    classroomLabel:
        (json['classroom'] as Map<String, dynamic>?)?['label'] as String? ?? '',
    term: Term.fromJson(json['term'] as Map<String, dynamic>),
    areas: _maps(json['areas']).map(ReportArea.fromJson).toList(),
    scale: _maps(json['scale']).map(GradeLevel.fromJson).toList(),
    children: _maps(json['children']).map(GridChild.fromJson).toList(),
  );

  final String classroomLabel;
  final Term term;
  final List<ReportArea> areas;
  final List<GradeLevel> scale;
  final List<GridChild> children;

  int count(String status) => children.where((c) => c.status == status).length;
}
