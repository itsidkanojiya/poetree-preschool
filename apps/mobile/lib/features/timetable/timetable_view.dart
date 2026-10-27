import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../tracing_module/tracing_ui.dart';
import 'timetable_controller.dart';
import 'timetable_style.dart';

/// The week.
///
/// A phone is too narrow for a seven-by-eight grid, so this is a day at a time
/// rather than a shrunken version of the web portal's grid. Today is selected
/// on open, because "what is happening now" is the question being asked.
///
/// The whole week is loaded once; choosing a day only changes which of it is
/// shown.
class TimetableView extends GetView<TimetableController> {
  const TimetableView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TimetableInk.page,
      body: Stack(
        children: [
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    TimetableInk.skyTop,
                    TimetableInk.skyBottom,
                    TimetableInk.page,
                  ],
                  stops: [0, 0.3, 0.6],
                ),
              ),
            ),
          ),
          const Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: 230,
            child: CustomPaint(painter: _Clouds()),
          ),
          // Behind everything that scrolls: the cards pass over the grass,
          // never under it.
          const Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: TracingHills(height: 120),
          ),
          SafeArea(
            bottom: false,
            child: Column(
              children: [
                TimetableHeader(
                  subtitle: controller.forTeacher
                      ? 'Your classes, day by day'
                      : 'Here’s your child’s daily class schedule',
                  onBack: () => Navigator.of(context).maybePop(),
                ),
                Expanded(
                  child: Obx(() {
                    if (controller.isLoading.value &&
                        controller.slots.isEmpty) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    final error = controller.error.value;
                    if (error != null && controller.slots.isEmpty) {
                      return _Notice(
                        title: 'Could not load the timetable',
                        message: error,
                        onRetry: controller.load,
                      );
                    }
                    if (controller.slots.isEmpty) {
                      return _Notice(
                        title: 'No timetable yet',
                        message: controller.forTeacher
                            ? 'You have no classes on the timetable yet.'
                            : 'The school has not filled in the week.',
                        onRetry: controller.load,
                        retryLabel: 'Check again',
                      );
                    }
                    return _Week(
                      controller: controller,
                      days: controller.activeDays,
                    );
                  }),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Week extends StatefulWidget {
  const _Week({required this.controller, required this.days});

  final TimetableController controller;
  final List<int> days;

  @override
  State<_Week> createState() => _WeekState();
}

class _WeekState extends State<_Week> {
  late int _day;

  @override
  void initState() {
    super.initState();
    // DateTime.weekday is already 1..7 with Monday first, matching the API.
    final today = DateTime.now().weekday;
    _day = widget.days.contains(today)
        ? today
        : (widget.days.isEmpty ? 1 : widget.days.first);
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    // After a refresh the chosen day may have gone; fall back to the first.
    final day = widget.days.contains(_day) || widget.days.isEmpty
        ? _day
        : widget.days.first;

    return Column(
      children: [
        SizedBox(
          height: 72,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 14),
            itemCount: widget.days.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (context, index) {
              final each = widget.days[index];
              return DayPill(
                label: TimetableController.days[each] ?? '',
                selected: each == day,
                onTap: () => setState(() => _day = each),
              );
            },
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: controller.load,
            child: ListView(
              // Room at the bottom so the last card scrolls clear of the
              // grass.
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 130),
              children: [
                _Panel(
                  child: controller.forTeacher
                      ? _TeacherDay(controller: controller, day: day)
                      : _ClassDay(controller: controller, day: day),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// The white sheet the day's cards sit on.
class _Panel extends StatelessWidget {
  const _Panel({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(28),
        boxShadow: const [
          BoxShadow(
            color: Color(0x141D2560),
            blurRadius: 18,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: child,
    );
  }
}

String _time(String? start, String? end) =>
    [start, end].where((t) => t != null && t.isNotEmpty).join(' – ');

/// The period's first two letters, as the timetable has always shown them.
String _code(String? name) =>
    (name ?? '').trim().characters.take(2).toString().toUpperCase();

/// A child's day: every period, including the ones with nothing scheduled, so a
/// parent can see the shape of the day rather than a list of fragments. Breaks
/// sit where the school put them.
class _ClassDay extends StatelessWidget {
  const _ClassDay({required this.controller, required this.day});

  final TimetableController controller;
  final int day;

  @override
  Widget build(BuildContext context) {
    final subjects = controller.subjects;
    final periods = controller.periods;
    final anyLesson = periods.any(
      (period) => controller.slotAt(day, period.id) != null,
    );
    if (!anyLesson) {
      return _NoClasses(day: day);
    }

    return Column(
      children: [
        for (final (index, period) in periods.indexed) ...[
          if (index > 0) const SizedBox(height: 12),
          _period(period, subjects),
        ],
      ],
    );
  }

  Widget _period(Period period, List<String> subjects) {
    final time = _time(period.startTime, period.endTime);
    if (period.isBreak) return BreakBanner(name: period.name, time: time);

    final slot = controller.slotAt(day, period.id);
    final subject = slot?.subject;
    if (slot == null || subject == null) return FreePeriodCard(time: time);

    final colours = SubjectColours.at(
      subjects.indexOf(slot.subjectId ?? subject),
    );
    return SubjectCard(
      title: subject,
      time: time,
      colours: colours,
      tile: SubjectTile(
        code: _code(period.name),
        subject: subject,
        colours: colours,
      ),
      lines: [
        if (slot.teacher != null)
          (asset: TimetableArt.user, icon: null, text: slot.teacher!),
        if (slot.room != null)
          (asset: null, icon: Icons.meeting_room_rounded, text: slot.room!),
      ],
    );
  }
}

/// A teacher's day, across every class they take — the answer to "where am I
/// meant to be next".
class _TeacherDay extends StatelessWidget {
  const _TeacherDay({required this.controller, required this.day});

  final TimetableController controller;
  final int day;

  @override
  Widget build(BuildContext context) {
    final slots = controller.teacherDay(day);
    if (slots.isEmpty) return _NoClasses(day: day);
    final subjects = controller.subjects;

    return Column(
      children: [
        for (final (index, slot) in slots.indexed) ...[
          if (index > 0) const SizedBox(height: 12),
          _card(slot, subjects),
        ],
      ],
    );
  }

  Widget _card(Slot slot, List<String> subjects) {
    final subject = slot.subject;
    final colours = SubjectColours.at(
      subject == null ? 0 : subjects.indexOf(slot.subjectId ?? subject),
    );
    return SubjectCard(
      title: slot.classroomLabel ?? 'Class',
      time: _time(slot.startTime, slot.endTime),
      colours: colours,
      tile: SubjectTile(
        code: _code(slot.periodName),
        subject: subject ?? slot.classroomLabel ?? 'Class',
        colours: colours,
      ),
      lines: [
        if (subject != null)
          (asset: TimetableArt.book, icon: null, text: subject),
        if (slot.room != null)
          (asset: null, icon: Icons.meeting_room_rounded, text: slot.room!),
      ],
    );
  }
}

/// A day the school has nothing on.
class _NoClasses extends StatelessWidget {
  const _NoClasses({required this.day});

  final int day;

  @override
  Widget build(BuildContext context) {
    const names = {
      1: 'Monday',
      2: 'Tuesday',
      3: 'Wednesday',
      4: 'Thursday',
      5: 'Friday',
      6: 'Saturday',
      7: 'Sunday',
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 12),
      child: Column(
        children: [
          const TimetableIcon(TimetableArt.star, size: 36),
          const SizedBox(height: 10),
          Text(
            'No classes on ${names[day] ?? 'this day'}',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: TimetableInk.navy,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

/// Nothing to show yet, or something went wrong: what, and a way to look
/// again.
class _Notice extends StatelessWidget {
  const _Notice({
    required this.title,
    required this.message,
    required this.onRetry,
    this.retryLabel = 'Try again',
  });

  final String title;
  final String message;
  final Future<void> Function() onRetry;
  final String retryLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 140),
      children: [
        _Panel(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 8),
            child: Column(
              children: [
                const TimetableIcon(TimetableArt.book, size: 54),
                const SizedBox(height: 14),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleLarge?.copyWith(
                    color: TimetableInk.navy,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: TimetableInk.quiet,
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton(onPressed: onRetry, child: Text(retryLabel)),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Soft clouds across the top of the sky.
class _Clouds extends CustomPainter {
  const _Clouds();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white.withValues(alpha: 0.75);
    void cloud(double x, double y, double r) {
      canvas
        ..drawCircle(Offset(x, y), r, paint)
        ..drawCircle(Offset(x + r * 0.95, y + r * 0.2), r * 0.78, paint)
        ..drawCircle(Offset(x - r * 0.95, y + r * 0.25), r * 0.66, paint);
    }

    // In the header's sky only: none drifts down behind the days or the
    // cards.
    cloud(size.width * 0.03, size.height * 0.52, 18);
    cloud(size.width * 0.5, size.height * 0.3, 15);
    cloud(size.width * 1.0, size.height * 0.46, 20);
  }

  @override
  bool shouldRepaint(_Clouds oldDelegate) => false;
}
