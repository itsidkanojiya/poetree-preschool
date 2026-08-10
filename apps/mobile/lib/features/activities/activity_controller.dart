import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import 'activity_models.dart';

/// The catalogue of activities a child can be offered.
class ActivityListController extends GetxController {
  ActivityListController({required this.studentId});

  final String? studentId;

  final activities = <ActivityDefinition>[].obs;
  final isLoading = true.obs;
  final error = RxnString();

  /// Only what the app can actually render. An activity with no authored
  /// content must never be offered — a child tapping it would find nothing.
  List<ActivityDefinition> get playable =>
      activities.where((a) => a.isPlayable).toList();

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> load() async {
    isLoading.value = true;
    error.value = null;

    try {
      final data = await api.get<List<dynamic>>('/progress/activities');
      activities.value = data
          .whereType<Map<String, dynamic>>()
          .map(ActivityDefinition.fromJson)
          .toList();
    } on DioException catch (e) {
      final payload = e.response?.data;
      error.value = payload is Map && payload['error'] is Map
          ? (payload['error'] as Map)['message']?.toString() ??
                'Could not load the activities.'
          : 'Cannot reach the school right now.';
    } finally {
      isLoading.value = false;
    }
  }
}

/// One child, one activity, one sitting.
///
/// The whole point of this screen is the last line of it: an attempt reaching
/// the server. Everything above exists so that the number a parent later reads
/// on the progress screen came from a child actually doing something.
class ActivityPlayController extends GetxController {
  ActivityPlayController({required this.activity, required this.studentId});

  final ActivityDefinition activity;
  final String studentId;

  final index = 0.obs;
  final correct = 0.obs;
  final isSaving = false.obs;
  final isFinished = false.obs;
  final saveFailed = false.obs;

  /// Which option the child last tapped, and whether it was right — held so the
  /// answer can be shown before moving on.
  final chosen = RxnInt();
  final wasCorrect = RxnBool();

  int get total => activity.content?.itemCount ?? 0;

  bool get isScored => activity.content?.isScored ?? false;

  bool get isLast => index.value >= total - 1;

  /// Records a tap and shows whether it was right.
  ///
  /// Answers are only counted once per item. A child re-tapping is a child
  /// exploring, not a second wrong answer, and counting it would quietly punish
  /// curiosity.
  void answer(int option, int expected) {
    if (chosen.value != null) return;

    chosen.value = option;
    final right = option == expected;
    wasCorrect.value = right;
    if (right) correct.value += 1;
  }

  /// For cards, which have no right answer — just seen.
  void seen() {
    if (chosen.value != null) return;
    chosen.value = 0;
    wasCorrect.value = true;
  }

  void next() {
    chosen.value = null;
    wasCorrect.value = null;

    if (isLast) {
      isFinished.value = true;
      unawaited(_record());
      return;
    }

    index.value += 1;
  }

  /// Sends the attempt.
  ///
  /// Unscored activities are not sent at all: a flashcard produces no
  /// judgement, and posting a perfect score for looking at a picture would
  /// inflate every mastery figure built on top of it.
  Future<void> _record() async {
    if (!isScored || total == 0) return;

    isSaving.value = true;
    saveFailed.value = false;

    try {
      await api.post<Map<String, dynamic>>(
        '/progress/attempts',
        body: {
          'studentId': studentId,
          'activityId': activity.id,
          'correctCount': correct.value,
          'totalCount': total,
        },
      );
    } on DioException {
      // The child finished; only the record failed. Say so honestly on the
      // results screen rather than silently losing it or blocking them.
      saveFailed.value = true;
    } finally {
      isSaving.value = false;
    }
  }

  Future<void> retrySave() => _record();

  void restart() {
    index.value = 0;
    correct.value = 0;
    chosen.value = null;
    wasCorrect.value = null;
    isFinished.value = false;
    saveFailed.value = false;
  }
}
