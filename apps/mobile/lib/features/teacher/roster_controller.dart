import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';

class RosterChild {
  RosterChild({
    required this.studentId,
    required this.fullName,
    required this.skillsAttempted,
    required this.averageMastery,
    required this.needsAttention,
  });

  factory RosterChild.fromJson(Map<String, dynamic> json) => RosterChild(
    studentId: json['studentId'] as String,
    fullName: json['fullName'] as String,
    skillsAttempted: (json['skillsAttempted'] as num?)?.toInt() ?? 0,
    averageMastery: (json['averageMastery'] as num?)?.toInt() ?? 0,
    needsAttention: (json['needsAttention'] as List<dynamic>? ?? <dynamic>[])
        .map((e) => e.toString())
        .toList(),
  );

  final String studentId;
  final String fullName;
  final int skillsAttempted;
  final int averageMastery;

  /// Skills below 50% with at least one attempt — where help is needed.
  final List<String> needsAttention;

  bool get hasStarted => skillsAttempted > 0;
}

class ChildSkill {
  ChildSkill({
    required this.skillId,
    required this.skillName,
    required this.masteryPercent,
    required this.attemptsCount,
    required this.basis,
  });

  factory ChildSkill.fromJson(Map<String, dynamic> json) => ChildSkill(
    skillId: json['skillId'] as String,
    skillName: json['skillName'] as String,
    masteryPercent: (json['masteryPercent'] as num?)?.toInt() ?? 0,
    attemptsCount: (json['attemptsCount'] as num?)?.toInt() ?? 0,
    basis: json['basis'] as String? ?? '',
  );

  final String skillId;
  final String skillName;
  final int masteryPercent;
  final int attemptsCount;
  final String basis;
}

/// The class, and what each child can do.
///
/// The question this answers is what to revisit tomorrow — not who is ahead.
/// There is no ranking here and no class average worth quoting, because a
/// four-year-old's percentage compared to another four-year-old's teaches
/// nobody anything.
class RosterController extends GetxController {
  RosterController({required this.classroomId});

  final String? classroomId;

  final children = <RosterChild>[].obs;
  final skills = <ChildSkill>[].obs;
  final openChild = RxnString();
  final isLoading = true.obs;
  final error = RxnString();

  /// Skills that more than one child is struggling with — the ones worth a
  /// whole-class revisit rather than a quiet word.
  List<MapEntry<String, int>> get commonGaps {
    final counts = <String, int>{};
    for (final child in children) {
      for (final skill in child.needsAttention) {
        counts[skill] = (counts[skill] ?? 0) + 1;
      }
    }

    final shared = counts.entries.where((e) => e.value > 1).toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return shared;
  }

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> load() async {
    if (classroomId == null) {
      isLoading.value = false;
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      final data = await api.get<Map<String, dynamic>>(
        '/progress/classrooms/$classroomId',
      );
      children.value = (data['students'] as List<dynamic>? ?? <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(RosterChild.fromJson)
          .toList();
    } on DioException catch (e) {
      final payload = e.response?.data;
      error.value = payload is Map && payload['error'] is Map
          ? (payload['error'] as Map)['message']?.toString() ??
                'Could not load the class.'
          : 'Cannot reach the school right now.';
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> openSkills(String studentId) async {
    openChild.value = studentId;
    skills.clear();

    try {
      final data = await api.get<Map<String, dynamic>>(
        '/progress/students/$studentId',
      );
      skills.value = (data['skills'] as List<dynamic>? ?? <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(ChildSkill.fromJson)
          .toList();
    } on DioException {
      // The sheet shows its own empty state rather than replacing the roster
      // behind it with an error.
      skills.clear();
    }
  }
}
