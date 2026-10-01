import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import 'results_models.dart';

/// A class's report cards for one term, as the class teacher fills them in.
///
/// The same grid the web portal shows, entered a child at a time: a phone has
/// room for one child's card, not thirty children by twelve areas.
class ReportEntryController extends GetxController {
  ReportEntryController({
    required this.classroomId,
    required this.classroomLabel,
  });

  final String classroomId;
  final String classroomLabel;

  final terms = <Term>[].obs;
  final term = Rxn<Term>();
  final grid = Rxn<ReportGrid>();
  final isLoading = true.obs;
  final error = RxnString();

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> load() async {
    isLoading.value = true;
    error.value = null;
    try {
      final data = await api.get<List<dynamic>>('/results/terms');
      terms.value = data
          .whereType<Map<String, dynamic>>()
          .map(Term.fromJson)
          .toList();
      final chosen =
          terms.firstWhereOrNull((t) => t.id == term.value?.id && t.isActive) ??
          Term.current(terms);
      term.value = chosen;
      if (chosen == null) {
        grid.value = null;
        return;
      }
      await _loadGrid(chosen.id);
    } on DioException catch (e) {
      error.value = apiMessage(e, 'Could not load the report cards.');
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> chooseTerm(Term chosen) async {
    if (chosen.id == term.value?.id) return;
    term.value = chosen;
    isLoading.value = true;
    error.value = null;
    try {
      await _loadGrid(chosen.id);
    } on DioException catch (e) {
      error.value = apiMessage(e, 'Could not load the report cards.');
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> _loadGrid(String termId) async {
    final data = await api.get<Map<String, dynamic>>(
      '/results/classrooms/$classroomId/terms/$termId',
    );
    grid.value = ReportGrid.fromJson(data);
  }

  /// Saves one child's card. Null when it worked, else the reason it did not.
  Future<String?> save(
    String studentId, {
    required Map<String, String?> grades,
    required String remarks,
  }) async {
    final current = grid.value;
    if (current == null) return 'Nothing to save to.';
    try {
      final data = await api.put<Map<String, dynamic>>(
        '/results/report-cards',
        body: {
          'termId': current.term.id,
          'studentId': studentId,
          'grades': [
            for (final entry in grades.entries)
              {'areaId': entry.key, 'gradeLevelId': entry.value},
          ],
          'remarks': remarks.trim().isEmpty ? null : remarks.trim(),
        },
      );
      final saved = GridChild.fromJson(data);
      grid.value = ReportGrid(
        classroomLabel: current.classroomLabel,
        term: current.term,
        areas: current.areas,
        scale: current.scale,
        children: [
          for (final child in current.children)
            child.studentId == studentId ? saved : child,
        ],
      );
      return null;
    } on DioException catch (e) {
      return apiMessage(e, 'Could not save.');
    }
  }

  /// Hands the class's drafts to the office. Null when it worked.
  Future<String?> submit() async {
    final current = grid.value;
    if (current == null) return 'Nothing to send.';
    try {
      final data = await api.post<Map<String, dynamic>>(
        '/results/classrooms/$classroomId/terms/${current.term.id}/submit',
      );
      grid.value = ReportGrid.fromJson(data);
      return null;
    } on DioException catch (e) {
      return apiMessage(e, 'Could not send the class to the office.');
    }
  }
}
