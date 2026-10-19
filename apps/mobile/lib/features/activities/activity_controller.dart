import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import 'activity_models.dart';

/// The catalogue of activities a child can be offered.
class ActivityListController extends GetxController {
  ActivityListController({
    required this.studentId,
    this.bookId,
    this.bookName,
    this.chapterId,
    this.type,
  });

  final String? studentId;

  /// Set when this list is one book rather than everything the school has.
  final String? bookId;
  final String? bookName;

  /// Set when it is one chapter of that book, which is how a child arrives.
  final String? chapterId;

  /// Set when the list is one kind of page across every book — the home
  /// page's Tracing card, which is "let me trace letters", not "open a book".
  final String? type;

  final activities = <ActivityDefinition>[].obs;
  final isLoading = true.obs;
  final error = RxnString();

  /// Only what the app can actually render. An activity with no authored
  /// content must never be offered — a child tapping it would find nothing.
  List<ActivityDefinition> get playable => activities
      .where((a) => a.isPlayable)
      // Filtered here rather than by the API: the same request answers the
      // chapter list's counts, and one round trip is worth more to a phone on
      // a school's wifi than a shorter response body.
      .where((a) => chapterId == null || a.chapterId == chapterId)
      .where((a) => type == null || a.type == type)
      .toList();

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> load() async {
    isLoading.value = true;
    error.value = null;

    try {
      final data = await api.get<List<dynamic>>(
        '/progress/activities',
        query: {
          if (studentId != null) 'studentId': studentId,
          if (bookId != null) 'bookId': bookId,
        },
      );
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
  ActivityPlayController({
    required this.activity,
    required this.studentId,
    this.recorder,
  });

  final ActivityDefinition activity;
  final String studentId;

  /// Records the finished sitting somewhere other than an activity attempt —
  /// the tracing module's letters, which are not a book's activity. Returns
  /// false when the record did not reach the school.
  final Future<bool> Function(int correct, int total)? recorder;

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

  /// Which tracing items have actually been traced well enough to count.
  ///
  /// Tracing is the one activity where the items are a sequence rather than a
  /// set: you learn to write one before two. So they unlock in order, and the
  /// only way to unlock the next is to draw the current one properly —
  /// separate from `correct`, which is the score, because a child may come
  /// back to a number they have already done.
  final traced = <int>{}.obs;

  /// A number is open if it is the first, or the one before it is done.
  bool isUnlocked(int item) => item == 0 || traced.contains(item - 1);

  /// Records that this number was traced well enough, and unlocks the next.
  void traceAccepted() {
    if (traced.add(index.value)) correct.value += 1;
    // Held so the page can show it is done and offer the way on. Tracing has
    // no wrong answer to reveal — an attempt that misses simply is not
    // accepted — so this only ever becomes true.
    chosen.value = 0;
    wasCorrect.value = true;
  }

  /// Jumps to a number the child has unlocked. Refuses the rest.
  void goTo(int item) {
    if (item < 0 || item >= total || !isUnlocked(item)) return;

    index.value = item;
    // Re-tracing a finished number starts it clean rather than showing it
    // already ticked, which would be a page with nothing to do on it.
    chosen.value = null;
    wasCorrect.value = null;
    picked.clear();
  }

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

    final record = recorder;
    if (record != null) {
      saveFailed.value = !await record(correct.value, total);
      isSaving.value = false;
      return;
    }

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
