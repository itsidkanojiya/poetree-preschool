import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import '../../core/routes/app_pages.dart';
import '../../core/theme/play_palette.dart';
import 'film_controllers.dart';
import 'film_widgets.dart';

/// How many films a child has watched, subject by subject.
///
/// For the Progress tab. It asks for the same subject list the animation
/// screens use, so the two can never disagree about a number.
class FilmsWatchedCard extends StatefulWidget {
  const FilmsWatchedCard({
    required this.studentId,
    required this.childName,
    super.key,
  });

  final String studentId;
  final String childName;

  @override
  State<FilmsWatchedCard> createState() => _FilmsWatchedCardState();
}

class _FilmsWatchedCardState extends State<FilmsWatchedCard> {
  List<FilmSubject>? _subjects;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final rows = await api.get<List<dynamic>>(
        '/catalogue/children/${widget.studentId}/subjects',
      );
      if (!mounted) return;
      setState(() {
        _failed = false;
        _subjects = rows
            .whereType<Map<String, dynamic>>()
            .map(FilmSubject.fromJson)
            .where((s) => s.filmCount > 0)
            .toList();
      });
    } on DioException {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final subjects = _subjects;

    final films = subjects?.fold(0, (sum, s) => sum + s.filmCount) ?? 0;
    final watched = subjects?.fold(0, (sum, s) => sum + s.filmsWatched) ?? 0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: FilmColors.banner,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.movie_filter_rounded, color: Colors.white),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Films watched',
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (subjects != null && films > 0)
                Text(
                  '$watched / $films',
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (_failed)
            TextButton(
              onPressed: () => unawaited(_load()),
              style: TextButton.styleFrom(foregroundColor: Colors.white),
              child: const Text('Could not load — tap to try again'),
            )
          else if (subjects == null)
            const LinearProgressIndicator(color: Colors.white)
          else if (subjects.isEmpty)
            Text(
              'No films in ${widget.childName}’s books yet.',
              style: const TextStyle(color: Colors.white),
            )
          else ...[
            FilmProgressBar(
              done: watched,
              total: films,
              color: Colors.white,
              track: Colors.white.withValues(alpha: 0.3),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Column(
                children: [
                  for (final subject in subjects)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        children: [
                          SubjectBadge(
                            icon: subject.icon,
                            name: subject.name,
                            tone: toneFor(subject.name),
                            size: 34,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  subject.name,
                                  style: theme.textTheme.titleSmall?.copyWith(
                                    color: const Color(0xFF1E2230),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                FilmProgressBar(
                                  done: subject.filmsWatched,
                                  total: subject.filmCount,
                                  color: toneFor(subject.name).ink,
                                  track: toneFor(subject.name).wash,
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            '${subject.filmsWatched}/${subject.filmCount}',
                            style: theme.textTheme.labelLarge?.copyWith(
                              color: toneFor(subject.name).deep,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () async {
                  await Get.toNamed<void>(
                    AppRoutes.filmSubjects,
                    arguments: {
                      'studentId': widget.studentId,
                      'childName': widget.childName,
                    },
                  );
                  if (mounted) unawaited(_load());
                },
                style: TextButton.styleFrom(foregroundColor: Colors.white),
                icon: const Icon(Icons.play_circle_fill_rounded),
                label: const Text('Watch films'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
