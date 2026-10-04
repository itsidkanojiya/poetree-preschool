import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import '../../core/audio/speech_service.dart';
import 'game_content.dart';
import 'game_models.dart';

/// Says [text] if the app's voice is on. The voice picks Hindi or Gujarati by
/// itself when the text is written in it.
void gameSay(String text) {
  if (Get.isRegistered<SpeechService>()) {
    unawaited(Get.find<SpeechService>().say(text));
  }
}

String _messageOf(DioException error, String fallback) {
  final payload = error.response?.data;
  if (payload is Map && payload['error'] is Map) {
    return (payload['error'] as Map)['message']?.toString() ?? fallback;
  }
  return error.response == null
      ? 'Cannot reach the school right now.'
      : fallback;
}

/// The Games hub: whether games are on, which ones, the language and
/// difficulty chosen, and how far this child has got in each.
class GamesHubController extends GetxController {
  GamesHubController({
    required this.studentId,
    required this.childName,
    FlutterSecureStorage? storage,
  }) : _storage = storage ?? const FlutterSecureStorage();

  final String studentId;
  final String childName;
  final FlutterSecureStorage _storage;

  static const _languageKey = 'games_language';
  static const _difficultyKey = 'games_difficulty';

  final content = Rxn<GameContent>();
  final enabled = true.obs;
  final isLoading = true.obs;
  final error = RxnString();

  /// The games the server has switched on, in its order.
  final activeKeys = <String>[].obs;

  /// language code → game key → progress.
  final progress = <String, Map<String, GameProgress>>{}.obs;
  final stars = 0.obs;
  final played = 0.obs;

  final language = GameLanguage.en.obs;
  final difficulty = GameDifficulty.easy.obs;

  @override
  void onInit() {
    super.onInit();
    unawaited(_restoreChoices());
    unawaited(load());
  }

  Future<void> _restoreChoices() async {
    try {
      language.value = GameLanguage.fromCode(
        await _storage.read(key: _languageKey),
      );
      difficulty.value = GameDifficulty.fromName(
        await _storage.read(key: _difficultyKey),
      );
    } on Object {
      // A preference; the defaults play just as well.
    }
  }

  void chooseLanguage(GameLanguage value) {
    language.value = value;
    unawaited(_save(_languageKey, value.code));
  }

  void chooseDifficulty(GameDifficulty value) {
    difficulty.value = value;
    unawaited(_save(_difficultyKey, value.name));
  }

  Future<void> _save(String key, String value) async {
    try {
      await _storage.write(key: key, value: value);
    } on Object {
      // Applies for this visit either way.
    }
  }

  /// The games to show: those in the content that the server has on.
  List<GameDefinition> get games {
    final loaded = content.value;
    if (loaded == null) return const [];
    return [
      for (final key in activeKeys)
        if (GameKind.fromKey(key) case final kind?) ?loaded.game(kind),
    ];
  }

  GameProgress? progressOf(GameKind kind) =>
      progress[language.value.code]?[kind.key];

  Future<void> load() async {
    isLoading.value = true;
    error.value = null;
    try {
      content.value = await GameContent.load();
      final data = await api.get<Map<String, dynamic>>(
        '/games',
        query: {'studentId': studentId},
      );
      _apply(data);
    } on DioException catch (e) {
      error.value = _messageOf(e, 'Could not load the games.');
    } on Object {
      error.value = 'Could not load the games.';
    } finally {
      isLoading.value = false;
    }
  }

  void _apply(Map<String, dynamic> data) {
    enabled.value = data['enabled'] == true;
    activeKeys.value = [
      for (final game in data['games'] as List<dynamic>? ?? const [])
        (game as Map)['key'] as String,
    ];
    progress.value = {
      for (final MapEntry(key: lang, value: games)
          in (data['progress'] as Map<String, dynamic>? ?? const {}).entries)
        lang: {
          for (final MapEntry(key: game, value: entry)
              in (games as Map<String, dynamic>).entries)
            game: GameProgress.fromJson(entry as Map<String, dynamic>),
        },
    };
    final totals = data['totals'] as Map<String, dynamic>? ?? const {};
    stars.value = (totals['stars'] as num?)?.toInt() ?? 0;
    played.value = (totals['played'] as num?)?.toInt() ?? 0;
  }

  /// Records a finished round. False when it did not reach the school; the
  /// child has still played it.
  Future<bool> record(
    GameKind kind,
    GameLanguage played, {
    required int total,
    required int correct,
    required int wrong,
  }) async {
    try {
      final data = await api.post<Map<String, dynamic>>(
        '/games/sessions',
        body: {
          'studentId': studentId,
          'gameKey': kind.key,
          'language': played.code,
          'total': total,
          'correct': correct,
          'wrong': wrong,
        },
      );
      _apply(data);
      return true;
    } on DioException {
      return false;
    }
  }
}

/// One round of one game.
///
/// A wrong answer is never punished: the question stays, the tapped answer is
/// marked, and the child tries again. "Right" in the score means right the
/// first time; the round still ends only when every question is answered.
class GamePlayController extends GetxController {
  GamePlayController({
    required this.game,
    required this.language,
    required this.difficulty,
    required this.factory,
    required this.recorder,
  }) : questions = factory.round(game.kind, language, difficulty);

  final GameDefinition game;
  final GameLanguage language;
  final GameDifficulty difficulty;
  final QuestionFactory factory;

  /// Records the finished round; false when it did not reach the school.
  final Future<bool> Function({
    required int total,
    required int correct,
    required int wrong,
  })
  recorder;

  List<GameQuestion> questions;

  final index = 0.obs;

  /// Answers tapped wrongly on this question.
  final wrongTaps = <int>{}.obs;

  /// The right answer has been found on this question.
  final solved = false.obs;

  /// Bumped on each wrong tap, so the screen can shake the answer.
  final mistakes = 0.obs;

  final correct = 0.obs;
  final wrong = 0.obs;
  final finished = false.obs;
  final saveFailed = false.obs;

  GameQuestion get question => questions[index.value];
  bool get isLast => index.value >= questions.length - 1;
  int get total => questions.length;

  /// Reads the question out — when it opens, and whenever the speaker is
  /// tapped.
  void sayQuestion() => gameSay(question.say);

  void choose(int option) {
    if (solved.value || finished.value) return;
    final q = question;
    if (option == q.answer) {
      solved.value = true;
      if (wrongTaps.isEmpty) correct.value += 1;
      gameSay(q.successSay);
    } else {
      if (wrongTaps.add(option)) wrong.value += 1;
      mistakes.value += 1;
      final words = factory.content.languages[language];
      gameSay(words?.tryAgain ?? 'Try again!');
    }
  }

  void next() {
    if (!solved.value) return;
    if (isLast) {
      finished.value = true;
      unawaited(_record());
      return;
    }
    index.value += 1;
    wrongTaps.clear();
    solved.value = false;
    sayQuestion();
  }

  Future<void> _record() async {
    saveFailed.value = !await recorder(
      total: total,
      correct: correct.value,
      wrong: wrong.value,
    );
  }

  /// A fresh round of new questions.
  void playAgain() {
    questions = factory.round(game.kind, language, difficulty);
    index.value = 0;
    wrongTaps.clear();
    solved.value = false;
    correct.value = 0;
    wrong.value = 0;
    finished.value = false;
    saveFailed.value = false;
    sayQuestion();
  }
}
