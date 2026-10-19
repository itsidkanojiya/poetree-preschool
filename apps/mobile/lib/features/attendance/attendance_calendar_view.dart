import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/assets/app_assets.dart';
import '../../core/widgets/art.dart';
import '../parent/child_controller.dart';
import 'attendance_calendar_controller.dart';
import 'attendance_day_view.dart';
import 'attendance_style.dart';
import 'school_day.dart';

/// A child's attendance, a month at a time, and the way into any one day.
///
/// The calendar is the register read by the month: each day in its status
/// colour, with small marks where there was homework or an announcement.
/// Tapping a day opens that day — its register, its homework and its notices —
/// and never today's in its place.
///
/// Days with no register are left plain rather than marked absent: weekends,
/// holidays, and days before the child joined all look the same to a parent,
/// and none of them are the child's doing.
class AttendanceCalendarView extends StatefulWidget {
  const AttendanceCalendarView({required this.child, this.today, super.key});

  final ChildController child;

  /// The school's today, fixed for a test; null asks the clock.
  @visibleForTesting
  final DateTime? today;

  @override
  State<AttendanceCalendarView> createState() => _AttendanceCalendarViewState();
}

class _AttendanceCalendarViewState extends State<AttendanceCalendarView> {
  AttendanceCalendarController? _calendar;
  String? _tag;

  @override
  void initState() {
    super.initState();
    final child = widget.child.child;
    if (child == null) return;
    _tag = 'attendance-${child.id}';
    _calendar = Get.put(
      AttendanceCalendarController(
        studentId: child.id,
        classroomId: child.classroomId,
        childName: child.firstName,
        today: widget.today,
      ),
      tag: _tag,
    );
  }

  @override
  void dispose() {
    if (_tag != null) Get.delete<AttendanceCalendarController>(tag: _tag);
    super.dispose();
  }

  void _openDay(DateTime date) {
    final calendar = _calendar!;
    calendar.selected.value = dayKey(date);
    Get.to<void>(
      () => AttendanceDayView(
        calendar: calendar,
        child: widget.child,
        initialDay: date,
      ),
      // A second tap while the first is opening must not stack two pages.
      preventDuplicates: true,
    );
  }

  Future<void> _pickMonth() async {
    final calendar = _calendar!;
    final months = [
      for (
        var m = calendar.latestMonth;
        !m.isBefore(calendar.earliestMonth);
        m = DateTime(m.year, m.month - 1)
      )
        m,
    ];
    final picked = await showModalBottomSheet<DateTime>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final m in months)
              ListTile(
                title: Text(DateFormat('MMMM yyyy').format(m)),
                trailing: m == calendar.month.value
                    ? const Icon(Icons.check_rounded)
                    : null,
                onTap: () => Navigator.of(context).pop(m),
              ),
          ],
        ),
      ),
    );
    if (picked != null) calendar.showMonth(picked);
  }

  @override
  Widget build(BuildContext context) {
    final calendar = _calendar;
    if (calendar == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Attendance')),
        body: const Center(child: Text('Choose a child first.')),
      );
    }

    return Scaffold(
      body: SkyBackground(
        child: SafeArea(
          bottom: false,
          child: Obx(() {
            final month = calendar.month.value;
            final records = calendar.recordsFor(month);
            final loading = calendar.isLoading(month);
            final error = calendar.errorFor(month);

            return RefreshIndicator(
              onRefresh: () => calendar.reload(month),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  _Header(month: month, onPickMonth: _pickMonth),
                  _Hero(
                    childName: calendar.childName,
                    onPrevious: calendar.canGoBack
                        ? () => calendar.showMonth(
                            DateTime(month.year, month.month - 1),
                          )
                        : null,
                    onNext: calendar.canGoForward
                        ? () => calendar.showMonth(
                            DateTime(month.year, month.month + 1),
                          )
                        : null,
                  ),
                  AttendanceCard(
                    padding: const EdgeInsets.fromLTRB(12, 16, 12, 16),
                    child: Column(
                      children: [
                        if (loading && records == null)
                          const Padding(
                            padding: EdgeInsets.only(bottom: 10),
                            child: LinearProgressIndicator(minHeight: 3),
                          ),
                        if (error != null && records == null)
                          _MonthProblem(
                            message: error,
                            onRetry: () => calendar.reload(month),
                          ),
                        _MonthGrid(
                          month: month,
                          today: calendar.today,
                          selected: calendar.selected.value,
                          records: records,
                          onOpen: _openDay,
                        ),
                        const SizedBox(height: 14),
                        const _Legend(),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (records != null) ...[
                    _MonthlySummary(records: records),
                    const SizedBox(height: 16),
                  ],
                  _KeepGoing(childName: calendar.childName),
                ],
              ),
            );
          }),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.month, required this.onPickMonth});

  final DateTime month;
  final VoidCallback onPickMonth;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    return Row(
      children: [
        RoundButton(
          icon: Icons.arrow_back_rounded,
          label: 'Back',
          onTap: () => Get.back<void>(),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Text(
            'Attendance',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              color: palette.ink,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        Material(
          color: palette.card,
          borderRadius: BorderRadius.circular(99),
          elevation: 2,
          shadowColor: const Color(0x331D2560),
          child: InkWell(
            borderRadius: BorderRadius.circular(99),
            onTap: onPickMonth,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 10, 10),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    DateFormat('MMMM yyyy').format(month),
                    style: TextStyle(
                      color: palette.ink,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Icon(Icons.expand_more_rounded, color: palette.ink),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// The waving child between the month arrows.
class _Hero extends StatelessWidget {
  const _Hero({
    required this.childName,
    required this.onPrevious,
    required this.onNext,
  });

  final String childName;
  final VoidCallback? onPrevious;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 150,
      child: Row(
        children: [
          RoundButton(
            icon: Icons.chevron_left_rounded,
            label: 'Previous month',
            size: 40,
            onTap: onPrevious,
          ),
          Expanded(
            child: Stack(
              alignment: Alignment.bottomCenter,
              children: [
                const Positioned(top: 18, right: 26, child: _Sun()),
                const Positioned(
                  top: 30,
                  left: 22,
                  child: Icon(
                    Icons.auto_awesome_rounded,
                    color: Color(0xFFF7B731),
                    size: 22,
                  ),
                ),
                Image.asset(
                  AttendanceArt.wavingKid,
                  height: 140,
                  semanticLabel: '$childName’s month',
                ),
              ],
            ),
          ),
          RoundButton(
            icon: Icons.chevron_right_rounded,
            label: 'Next month',
            size: 40,
            onTap: onNext,
          ),
        ],
      ),
    );
  }
}

class _Sun extends StatelessWidget {
  const _Sun();

  @override
  Widget build(BuildContext context) => Container(
    width: 46,
    height: 46,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      gradient: const RadialGradient(
        colors: [Color(0xFFFFE27A), Color(0xFFF7B731)],
      ),
      boxShadow: [
        BoxShadow(
          color: const Color(0xFFF7B731).withValues(alpha: 0.45),
          blurRadius: 18,
          spreadRadius: 4,
        ),
      ],
    ),
  );
}

class _MonthProblem extends StatelessWidget {
  const _MonthProblem({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(Icons.cloud_off_rounded, color: palette.quiet),
          const SizedBox(width: 10),
          Expanded(
            child: Text(message, style: TextStyle(color: palette.quiet)),
          ),
          TextButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ),
    );
  }
}

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({
    required this.month,
    required this.today,
    required this.selected,
    required this.records,
    required this.onOpen,
  });

  final DateTime month;
  final DateTime today;
  final String? selected;
  final MonthRecords? records;
  final ValueChanged<DateTime> onOpen;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    final first = DateTime(month.year, month.month);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    // DateTime.weekday is 1..7 from Monday, which is the order below.
    final blanks = first.weekday - 1;
    final todayKey = dayKey(today);

    return Column(
      children: [
        Row(
          children: [
            for (final name in const [
              'Mon',
              'Tue',
              'Wed',
              'Thu',
              'Fri',
              'Sat',
              'Sun',
            ])
              Expanded(
                child: Center(
                  child: Text(
                    name,
                    style: TextStyle(
                      color: palette.quiet,
                      fontWeight: FontWeight.w600,
                      fontSize: 12.5,
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: EdgeInsets.zero,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 7,
            mainAxisSpacing: 7,
            crossAxisSpacing: 7,
          ),
          itemCount: blanks + daysInMonth,
          itemBuilder: (context, index) {
            if (index < blanks) return const SizedBox.shrink();
            final date = DateTime(month.year, month.month, index - blanks + 1);
            final key = dayKey(date);
            return _DayCell(
              date: date,
              status: StatusStyle.of(records?.statusOn(key)),
              isToday: key == todayKey,
              isSelected: key == selected,
              isFuture: date.isAfter(today),
              hasHomework: records?.hasHomeworkOn(key) ?? false,
              hasNotice: records?.hasNoticeOn(key) ?? false,
              onTap: () => onOpen(date),
            );
          },
        ),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.date,
    required this.status,
    required this.isToday,
    required this.isSelected,
    required this.isFuture,
    required this.hasHomework,
    required this.hasNotice,
    required this.onTap,
  });

  final DateTime date;
  final StatusStyle? status;
  final bool isToday;
  final bool isSelected;
  final bool isFuture;
  final bool hasHomework;
  final bool hasNotice;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    final style = status;

    final background = isToday
        ? AttendancePalette.today
        : style != null
        ? palette.washOf(context, style)
        : palette.card;
    final number = isToday
        ? Colors.white
        : style?.ink ?? (isFuture ? palette.quiet : palette.ink);

    final heard = [
      DateFormat('d MMMM').format(date),
      if (isToday) 'today',
      style?.label ?? 'no register',
      if (hasHomework) 'homework',
      if (hasNotice) 'announcement',
    ].join(', ');

    return Semantics(
      container: true,
      button: true,
      selected: isSelected,
      label: heard,
      excludeSemantics: true,
      child: Material(
        color: background,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: isSelected
                    ? AttendancePalette.accent
                    : style != null && !isToday
                    ? style.color.withValues(alpha: 0.35)
                    : isToday
                    ? AttendancePalette.today
                    : palette.line,
                width: isSelected ? 2.2 : 1,
              ),
            ),
            child: Stack(
              children: [
                Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '${date.day}',
                        style: TextStyle(
                          color: number,
                          fontSize: 15,
                          fontWeight: style != null || isToday
                              ? FontWeight.w800
                              : FontWeight.w500,
                        ),
                      ),
                      if (style != null) ...[
                        const SizedBox(height: 3),
                        Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            color: isToday ? Colors.white : style.color,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                if (hasHomework || hasNotice)
                  Positioned(
                    top: 4,
                    right: 4,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (hasHomework)
                          const _Mark(color: AttendancePalette.homework),
                        if (hasHomework && hasNotice) const SizedBox(width: 2),
                        if (hasNotice)
                          const _Mark(color: AttendancePalette.notice),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A day's small corner mark: homework, or an announcement.
class _Mark extends StatelessWidget {
  const _Mark({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: 5,
    height: 5,
    decoration: BoxDecoration(color: color, shape: BoxShape.circle),
  );
}

/// Colour alone cannot carry meaning — roughly one man in twelve cannot tell
/// the red from the green — so every colour is named here.
class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    final text = TextStyle(color: palette.quiet, fontSize: 12.5);

    Widget item(Widget mark, String label) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        mark,
        const SizedBox(width: 6),
        Text(label, style: text),
      ],
    );

    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 14,
      runSpacing: 8,
      children: [
        for (final style in StatusStyle.all)
          item(
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(
                color: style.color,
                shape: BoxShape.circle,
              ),
            ),
            style.label,
          ),
        item(const _Mark(color: AttendancePalette.homework), 'Homework'),
        item(const _Mark(color: AttendancePalette.notice), 'Announcement'),
      ],
    );
  }
}

class _MonthlySummary extends StatelessWidget {
  const _MonthlySummary({required this.records});

  final MonthRecords records;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    final counts = records.counts;

    return AttendanceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Monthly summary',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: palette.ink,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            records.markedDays == 0
                ? 'No register taken this month yet.'
                : 'Over ${records.markedDays} school ${records.markedDays == 1 ? 'day' : 'days'} with a register.',
            style: TextStyle(color: palette.quiet, fontSize: 12.5),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final (index, style) in StatusStyle.all.indexed) ...[
                if (index > 0) const SizedBox(width: 6),
                Expanded(
                  child: _SummaryTile(
                    style: style,
                    count: counts[style.status] ?? 0,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _SummaryTile extends StatelessWidget {
  const _SummaryTile({required this.style, required this.count});

  final StatusStyle style;
  final int count;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    return Semantics(
      container: true,
      label: '$count ${style.label}',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        decoration: BoxDecoration(
          color: palette.washOf(context, style),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          children: [
            AttendanceIcon(style.icon, size: 22),
            const SizedBox(height: 4),
            Text(
              '$count',
              style: TextStyle(
                color: style.ink,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                style.label,
                maxLines: 1,
                style: TextStyle(color: style.ink, fontSize: 11.5),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The note the screen ends on, for the child as much as the parent.
class _KeepGoing extends StatelessWidget {
  const _KeepGoing({required this.childName});

  final String childName;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 18, 14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFFDE8F1), Color(0xFFEDE7FF)],
        ),
        borderRadius: BorderRadius.circular(26),
      ),
      child: Row(
        children: [
          const ArtIcon(AppIcons.attendance, size: 76),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Keep going!',
                  style: theme.textTheme.titleLarge?.copyWith(
                    color: const Color(0xFF1D2560),
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Coming to school every day helps $childName learn and grow.',
                  style: const TextStyle(color: Color(0xFF6D28D9)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
