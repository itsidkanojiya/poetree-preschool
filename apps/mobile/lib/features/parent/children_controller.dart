import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';

class Child {
  Child({
    required this.id,
    required this.fullName,
    required this.admissionNo,
    this.classroomId,
    this.classroomLabel,
    this.rollNo,
  });

  factory Child.fromJson(Map<String, dynamic> json) {
    final classroom = json['classroom'] as Map<String, dynamic>?;
    return Child(
      id: json['id'] as String,
      fullName: json['fullName'] as String,
      admissionNo: json['admissionNo'] as String,
      classroomId: classroom?['id'] as String?,
      classroomLabel: classroom?['label'] as String?,
      rollNo: json['rollNo'] as String?,
    );
  }

  final String id;
  final String fullName;
  final String admissionNo;
  final String? classroomId;
  final String? classroomLabel;
  final String? rollNo;

  String get firstName => fullName.split(' ').first;
}

/// Which child the parent is looking at.
///
/// Permanent and shared: every parent screen reads the same selection, so
/// switching child on the home screen changes attendance, homework, fees and
/// progress together rather than each screen keeping its own idea.
class ChildrenController extends GetxController {
  final children = <Child>[].obs;
  final selectedId = RxnString();
  final isLoading = true.obs;
  final error = RxnString();

  /// Which tab the parent is on. Held here rather than in the widget so a push
  /// notification can open the screen it is about — a fee reminder that lands
  /// on the home tab has wasted the tap.
  final tab = 0.obs;

  static const homeTab = 0;
  static const attendanceTab = 1;
  static const homeworkTab = 2;
  static const feesTab = 3;
  static const noticesTab = 4;

  Child? get selected {
    if (children.isEmpty) return null;
    return children.firstWhereOrNull((c) => c.id == selectedId.value) ??
        children.first;
  }

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> load() async {
    isLoading.value = true;
    error.value = null;

    try {
      final data = await api.get<List<dynamic>>('/me/children');
      children.value = data
          .whereType<Map<String, dynamic>>()
          .map(Child.fromJson)
          .toList();

      if (children.isNotEmpty &&
          !children.any((c) => c.id == selectedId.value)) {
        selectedId.value = children.first.id;
      }
    } on DioException catch (e) {
      final data = e.response?.data;
      error.value = data is Map && data['error'] is Map
          ? (data['error'] as Map)['message']?.toString() ??
                'Could not load your children.'
          : 'Could not reach the school. Check your connection.';
    } finally {
      isLoading.value = false;
    }
  }

  void select(String id) => selectedId.value = id;
}
