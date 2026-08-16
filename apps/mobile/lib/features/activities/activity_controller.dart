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

  /// The books this child has still to watch, keyed by book id.
  final animations = <String, ({String videoId, String bookName})>{}.obs;

  /// The film standing between this child and the book they have opened.
  ///
  /// Null when the book has none, when they have watched it, or when this list
  /// is the whole shelf rather than one book.
  ({String videoId, String bookName})? get pendingAnimation =>
      bookId == null ? null : animations[bookId];

  /// Tapping a locked activity: the film that opens its book.
  Future<void> openAnimation(
    BuildContext context,
    ActivityDefinition activity,
  ) => playAnimation(context, activity.bookId);

  /// Opens the film that unlocks a book, then reloads on the way back so the
  /// whole book opens at once rather than the one activity they tapped.
  Future<void> playAnimation(BuildContext context, String forBookId) async {
    final animation = animations[forBookId];
    if (animation == null || studentId == null) return;

    final watched = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AnimationView(
          videoId: animation.videoId,
          bookId: forBookId,
          bookName: animation.bookName,
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
    try {
      final shelf = await api.get<List<dynamic>>(
        '/catalogue/children/$studentId/books',
      );
      animations.value = {
        for (final book in shelf.whereType<Map<String, dynamic>>())
          if ((book['animation'] as Map<String, dynamic>?) != null &&
              book['isUnlocked'] != true)
            book['id'] as String: (
              videoId:
                  (book['animation'] as Map<String, dynamic>)['videoId']
                      as String,
              bookName: book['name'] as String? ?? 'Your book',
            ),
      };
    } on DioException {
      // The shelf is decoration for the lock screen; failing to load it must
      // not take the activity list down with it.
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
