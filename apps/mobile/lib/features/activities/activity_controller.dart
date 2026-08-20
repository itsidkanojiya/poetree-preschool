import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import 'package:flutter/material.dart';

import 'activity_models.dart';
import 'animation_view.dart';

/// The catalogue of activities a child can be offered.
class ActivityListController extends GetxController {
  ActivityListController({required this.studentId, this.bookId, this.bookName});

  final String? studentId;

  /// Set when this list is one book rather than everything the school has.
  final String? bookId;
  final String? bookName;

  final activities = <ActivityDefinition>[].obs;
  final isLoading = true.obs;
  final error = RxnString();

  /// Only what the app can actually render. An activity with no authored
  /// content must never be offered — a child tapping it would find nothing.
  ///
  /// Locked ones stay in the list: a book that disappeared until its film had
  /// been watched would look like a book with nothing in it, and nobody would
  /// find the film that opens it.
  List<ActivityDefinition> get playable =>
      activities.where((a) => a.isPlayable).toList();

  /// The chapters of this book with a film still to watch, keyed by chapter id.
  ///
  /// A film belongs to a chapter, not to a whole book: one video standing in
  /// for everything between two covers was never how a workbook is taught.
  final animations = <String, ({String videoId, String chapterName})>{}.obs;

  /// Tapping a locked page: the film that opens its chapter.
  Future<void> openAnimation(
    BuildContext context,
    ActivityDefinition activity,
  ) => playAnimation(context, activity.chapterId);

  /// Opens the film that unlocks a chapter, then reloads on the way back so the
  /// whole chapter opens at once rather than the one page they tapped.
  Future<void> playAnimation(BuildContext context, String forChapterId) async {
    final animation = animations[forChapterId];
    if (animation == null || studentId == null) return;

    final watched = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AnimationView(
          videoId: animation.videoId,
          chapterId: forChapterId,
          chapterName: animation.chapterName,
          studentId: studentId!,
        ),
      ),
    );

    if (watched == true) await load();
  }

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> _loadAnimations() async {
    if (bookId == null) {
      animations.clear();
      return;
    }

    try {
      final chapters = await api.get<List<dynamic>>(
        '/catalogue/children/$studentId/books/$bookId/chapters',
      );
      animations.value = {
        for (final chapter in chapters.whereType<Map<String, dynamic>>())
          if ((chapter['animation'] as Map<String, dynamic>?) != null &&
              chapter['isUnlocked'] != true)
            chapter['id'] as String: (
              videoId:
                  (chapter['animation'] as Map<String, dynamic>)['videoId']
                      as String,
              chapterName: chapter['name'] as String? ?? 'This chapter',
            ),
      };
    } on DioException {
      // The films are decoration for the lock screen; failing to load them must
      // not take the page list down with it.
      animations.clear();
    }
  }

  Future<void> load() async {
    isLoading.value = true;
    error.value = null;

    try {
      final data = await api.get<List<dynamic>>(
        '/progress/activities',
        query: {
          // Named, so the answer says which of these this child may open yet.
          if (studentId != null) 'studentId': studentId,
          if (bookId != null) 'bookId': bookId,
        },
      );
      activities.value = data
          .whereType<Map<String, dynamic>>()
          .map(ActivityDefinition.fromJson)
          .toList();

      // The films behind the locks, so tapping a locked activity has somewhere
      // to go rather than being a dead end.
      if (studentId != null) await _loadAnimations();
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

  /// Which options are ticked so far on a multiple-choice question.
  ///
  /// Nothing is judged until the child says they are done, so a first tap is
  /// never a mistake and can always be taken back.
  final picked = <int>{}.obs;

  void toggle(int option) {
    if (chosen.value != null) return;
    if (picked.contains(option)) {
      picked.remove(option);
    } else {
      picked.add(option);
    }
  }

  /// Marks a multiple-choice question, once the child says they have finished.
  ///
  /// Right means exactly the right set: every answer found and none of the
  /// wrong ones. Partly right is still shown as the whole answer afterwards,
  /// because being told only "no" teaches nothing.
  void finishMulti(Set<int> answers) {
    if (chosen.value != null) return;

    chosen.value = 0;
    final right =
        picked.length == answers.length && picked.every(answers.contains);
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
    picked.clear();

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
