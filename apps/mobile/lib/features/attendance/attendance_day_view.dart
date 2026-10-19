import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../parent/child_controller.dart';
import '../parent/homework_detail_view.dart';
import '../parent/parent_home_view.dart' show ParentPage, openParentPage;
import 'attendance_calendar_controller.dart';
import 'attendance_style.dart';
import 'school_day.dart';

/// One day, opened from the calendar: its register, the homework set or due
/// that day, and the notices posted that day.
///
/// The day on screen is the only source of truth — the one the parent tapped,
/// or stepped to with the arrows — and every section is read for that day out
/// of the month the calendar already fetched. Nothing here falls back to
/// today, and a day with nothing in it says so plainly rather than showing
/// something else.
class AttendanceDayView extends StatefulWidget {
  const AttendanceDayView({
    required this.calendar,
    required this.child,
    required this.initialDay,
    super.key,
  });

  final AttendanceCalendarController calendar;
  final ChildController child;
  final DateTime initialDay;

  @override
  State<AttendanceDayView> createState() => _AttendanceDayViewState();
}

class _AttendanceDayViewState extends State<AttendanceDayView> {
  late DateTime _day = dateOf(widget.initialDay);

  AttendanceCalendarController get _calendar => widget.calendar;

  @override
  void initState() {
    super.initState();
    unawaited(_calendar.ensure(_day));
  }

  /// Steps a day either way, fetching the next month when the step crosses
  /// into one the calendar has not loaded.
  void _step(int days) {
    final next = DateTime(_day.year, _day.month, _day.day + days);
    final month = DateTime(next.year, next.month);
    if (month.isBefore(_calendar.earliestMonth)) return;
    setState(() => _day = next);
    _calendar.selected.value = dayKey(next);
    unawaited(_calendar.ensure(next));
  }

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);

    return Scaffold(
      body: SkyBackground(
        child: SafeArea(
          bottom: false,
          child: Obx(() {
            final records = _calendar.dayRecords(_day);
            final loading = _calendar.isLoading(_day);
            final error = _calendar.errorFor(_day);
            final isToday = dayKey(_day) == dayKey(_calendar.today);
            final isFuture = _day.isAfter(_calendar.today);

            return RefreshIndicator(
              onRefresh: () => _calendar.reload(_day),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  Row(
                    children: [
                      RoundButton(
                        icon: Icons.arrow_back_rounded,
                        label: 'Back to the calendar',
                        onTap: () => Get.back<void>(),
                      ),
                      Expanded(
                        child: Column(
                          children: [
                            FittedBox(
                              fit: BoxFit.scaleDown,
                              child: Text(
                                DateFormat('d MMMM yyyy').format(_day),
                                style: Theme.of(context).textTheme.headlineSmall
                                    ?.copyWith(
                                      color: palette.ink,
                                      fontWeight: FontWeight.w800,
                                    ),
                              ),
                            ),
                            Text(
                              isToday
                                  ? 'Today, ${DateFormat('EEEE').format(_day)}'
                                  : DateFormat('EEEE').format(_day),
                              style: TextStyle(
                                color: palette.quiet,
                                fontSize: 15,
                              ),
                            ),
                          ],
                        ),
                      ),
                      RoundButton(
                        icon: Icons.chevron_right_rounded,
                        label: 'Next day',
                        onTap: () => _step(1),
                      ),
                    ],
                  ),
                  _Greeting(
                    childName: _calendar.childName,
                    status: records?.attendance?.status,
                    isToday: isToday,
                    isFuture: isFuture,
                    onPrevious:
                        DateTime(
                          _day.year,
                          _day.month,
                          _day.day - 1,
                        ).isBefore(_calendar.earliestMonth)
                        ? null
                        : () => _step(-1),
                  ),
                  if (records == null)
                    AttendanceCard(
                      child: error != null && !loading
                          ? _Problem(
                              message: error,
                              onRetry: () => _calendar.reload(_day),
                            )
                          : const Padding(
                              padding: EdgeInsets.symmetric(vertical: 28),
                              child: Center(child: CircularProgressIndicator()),
                            ),
                    )
                  else ...[
                    _AttendanceSection(
                      day: _day,
                      record: records.attendance,
                      isFuture: isFuture,
                    ),
                    const SizedBox(height: 14),
                    _HomeworkSection(
                      day: _day,
                      isToday: isToday,
                      items: records.homework,
                      child: widget.child,
                    ),
                    const SizedBox(height: 14),
                    _NoticesSection(
                      notices: records.notices,
                      child: widget.child,
                    ),
                  ],
                ],
              ),
            );
          }),
        ),
      ),
    );
  }
}

/// A line for the child, in the spirit of the day's register.
class _Greeting extends StatelessWidget {
  const _Greeting({
    required this.childName,
    required this.status,
    required this.isToday,
    required this.isFuture,
    required this.onPrevious,
  });

  final String childName;
  final String? status;
  final bool isToday;
  final bool isFuture;
  final VoidCallback? onPrevious;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    final when = isToday ? 'today' : 'on this day';

    final (title, line) = switch (status) {
      'PRESENT' => ('Great!', '$childName was at school $when. Keep it up!'),
      'LATE' => ('Nearly there!', '$childName came in a little late $when.'),
      'HALF_DAY' => ('Half a day', '$childName was at school for half of it.'),
      'LEAVE' => ('On leave', '$childName was on leave $when.'),
      'ABSENT' => (
        'Hello!',
        'We missed $childName $when. Here is what was set.',
      ),
      _ when isFuture => ('Coming up', 'Here is what is planned for this day.'),
      _ => ('Hello!', 'Here is what happened $when.'),
    };
    final style = StatusStyle.of(status);

    return SizedBox(
      height: 132,
      child: Row(
        children: [
          RoundButton(
            icon: Icons.chevron_left_rounded,
            label: 'Previous day',
            size: 40,
            onTap: onPrevious,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: style?.ink ?? palette.ink,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  line,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: palette.quiet, fontSize: 14.5),
                ),
              ],
            ),
          ),
          Image.asset(
            AttendanceArt.wavingKid,
            height: 118,
            excludeFromSemantics: true,
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({
    required this.icon,
    required this.tint,
    required this.title,
    this.trailing,
  });

  final String icon;
  final Color tint;
  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    return Row(
      children: [
        Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: tint.withValues(alpha: 0.14),
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: AttendanceIcon(icon, size: 22),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            title,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: palette.ink,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        ?trailing,
      ],
    );
  }
}

class _ViewAll extends StatelessWidget {
  const _ViewAll({required this.onTap, required this.label});

  final VoidCallback onTap;
  final String label;

  @override
  Widget build(BuildContext context) => OutlinedButton(
    onPressed: onTap,
    style: OutlinedButton.styleFrom(
      foregroundColor: const Color(0xFF5B4FE0),
      side: const BorderSide(color: Color(0xFFCFCBFA)),
      shape: const StadiumBorder(),
      visualDensity: VisualDensity.compact,
    ),
    child: Text('View all', semanticsLabel: label),
  );
}

class _AttendanceSection extends StatelessWidget {
  const _AttendanceSection({
    required this.day,
    required this.record,
    required this.isFuture,
  });

  final DateTime day;
  final AttendanceDay? record;
  final bool isFuture;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    final style = StatusStyle.of(record?.status);
    final date = DateFormat('d MMMM yyyy').format(day);
    final remark = record?.remark?.trim();

    final (headline, line) = switch (style?.status) {
      'PRESENT' => ('Present on $date.', 'Well done! Keep up the good work.'),
      'ABSENT' => (
        'Marked absent on $date.',
        'We hope all is well. The day’s homework is below.',
      ),
      'LATE' => (
        'Came in late on $date.',
        'Arriving on time means not missing the morning’s start.',
      ),
      'LEAVE' => (
        'On leave on $date.',
        'The school recorded this day as leave.',
      ),
      'HALF_DAY' => (
        'At school for half the day on $date.',
        'The register shows part of the day at school.',
      ),
      _ when isFuture => (
        'Attendance not recorded',
        'This day has not happened yet.',
      ),
      _ => ('Attendance not recorded', 'No register was taken for this day.'),
    };

    return AttendanceCard(
      child: Column(
        children: [
          _SectionTitle(
            icon: style?.icon ?? 'calendar',
            tint: style?.color ?? const Color(0xFF4F46E5),
            title: 'Attendance',
            trailing: AttendancePill(
              text: style?.label ?? 'Not recorded',
              color: style?.ink ?? palette.quiet,
              wash: style == null
                  ? palette.line
                  : palette.washOf(context, style),
            ),
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: style == null
                  ? palette.line.withValues(alpha: 0.5)
                  : palette.washOf(context, style),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: palette.card,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  alignment: Alignment.center,
                  child: AttendanceIcon(style?.icon ?? 'calendar', size: 32),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        headline,
                        style: TextStyle(
                          color: style?.ink ?? palette.ink,
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(line, style: TextStyle(color: palette.quiet)),
                      if (remark != null && remark.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          'Teacher’s note: “$remark”',
                          style: TextStyle(
                            color: palette.ink,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HomeworkSection extends StatelessWidget {
  const _HomeworkSection({
    required this.day,
    required this.isToday,
    required this.items,
    required this.child,
  });

  final DateTime day;
  final bool isToday;
  final List<HomeworkItem> items;
  final ChildController child;

  @override
  Widget build(BuildContext context) {
    return AttendanceCard(
      child: Column(
        children: [
          _SectionTitle(
            icon: 'homework',
            tint: AttendancePalette.homework,
            title: items.isEmpty ? 'Homework' : 'Homework (${items.length})',
            trailing: _ViewAll(
              label: 'View all homework',
              onTap: () => openParentPage(ParentPage.homework),
            ),
          ),
          const SizedBox(height: 8),
          if (items.isEmpty)
            const _Empty(
              icon: 'empty_homework',
              text: 'No homework for this day',
            )
          else
            for (final (index, item) in items.indexed) ...[
              if (index > 0) const Divider(height: 1),
              _HomeworkRow(
                item: item,
                day: day,
                isToday: isToday,
                onTap: () => Get.to<void>(
                  () => HomeworkDetailPage(
                    child: child,
                    id: item.id,
                    fallback: item,
                  ),
                  preventDuplicates: true,
                ),
              ),
            ],
        ],
      ),
    );
  }
}

class _HomeworkRow extends StatelessWidget {
  const _HomeworkRow({
    required this.item,
    required this.day,
    required this.isToday,
    required this.onTap,
  });

  final HomeworkItem item;
  final DateTime day;
  final bool isToday;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    final dueKey = dateOnly(item.dueDate);
    final due = item.due;

    // Said from the day on screen, not from today: on 8 October, work due on
    // the 8th is due "this day", whatever today is.
    final dueThisDay = dueKey == dayKey(day);
    final dueText = dueThisDay
        ? (isToday ? 'Due today' : 'Due this day')
        : due == null
        ? 'Set this day'
        : 'Due ${DateFormat('d MMM').format(due)}';

    final icon = item.isActivity
        ? 'book'
        : item.attachments.isNotEmpty
        ? 'worksheet'
        : 'homework';
    final tint = icon == 'homework'
        ? AttendancePalette.homework
        : const Color(0xFF1687F8);

    final statusColour = item.isDone
        ? const Color(0xFF15803D)
        : item.isOverdue
        ? const Color(0xFFDC2626)
        : palette.quiet;

    final summary = (item.description?.trim().isNotEmpty ?? false)
        ? item.description!.trim()
        : [?item.subject, if (item.setBy.isNotEmpty) item.setBy].join(' · ');

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: tint.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              alignment: Alignment.center,
              child: AttendanceIcon(icon, size: 28),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: palette.ink,
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
                  if (summary.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      summary,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: palette.quiet),
                    ),
                  ],
                  const SizedBox(height: 6),
                  Text(
                    item.statusLabel,
                    style: TextStyle(
                      color: statusColour,
                      fontWeight: FontWeight.w700,
                      fontSize: 12.5,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                // Red only for work due on the day itself; work due another
                // day is information, not an alarm.
                AttendancePill(
                  text: dueText,
                  color: dueThisDay
                      ? const Color(0xFFDC2626)
                      : const Color(0xFF1D6FD8),
                  wash: dueThisDay
                      ? const Color(0xFFFDECEC)
                      : const Color(0xFFE6F0FD),
                ),
                const SizedBox(height: 10),
                Icon(Icons.chevron_right_rounded, color: palette.quiet),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _NoticesSection extends StatefulWidget {
  const _NoticesSection({required this.notices, required this.child});

  final List<NoticeItem> notices;
  final ChildController child;

  @override
  State<_NoticesSection> createState() => _NoticesSectionState();
}

class _NoticesSectionState extends State<_NoticesSection> {
  Future<void> _open(NoticeItem notice) async {
    // Opening it is what tells the school it has been seen.
    await widget.child.markNoticeRead(notice);
    if (!mounted) return;
    setState(() {});
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => _NoticeSheet(notice: notice),
    );
  }

  @override
  Widget build(BuildContext context) {
    final notices = widget.notices;
    return AttendanceCard(
      child: Column(
        children: [
          _SectionTitle(
            icon: 'notification',
            tint: const Color(0xFFF59E0B),
            title: notices.isEmpty
                ? 'Notifications'
                : 'Notifications (${notices.length})',
            trailing: _ViewAll(
              label: 'View all announcements',
              onTap: () => openParentPage(ParentPage.notices),
            ),
          ),
          const SizedBox(height: 8),
          if (notices.isEmpty)
            const _Empty(
              icon: 'empty_notifications',
              text: 'No notifications for this day',
            )
          else
            for (final (index, notice) in notices.indexed) ...[
              if (index > 0) const Divider(height: 1),
              _NoticeRow(notice: notice, onTap: () => _open(notice)),
            ],
        ],
      ),
    );
  }
}

class _NoticeRow extends StatelessWidget {
  const _NoticeRow({required this.notice, required this.onTap});

  final NoticeItem notice;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    final time = schoolTime(notice.publishAt);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AttendancePalette.notice.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              alignment: Alignment.center,
              child: const AttendanceIcon('announcement', size: 28),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          notice.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: notice.isEmergency
                                ? const Color(0xFFDC2626)
                                : palette.ink,
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                          ),
                        ),
                      ),
                      if (!notice.readByMe)
                        Container(
                          width: 8,
                          height: 8,
                          margin: const EdgeInsets.only(left: 6),
                          decoration: const BoxDecoration(
                            color: AttendancePalette.notice,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                  if (time != null)
                    Text(
                      DateFormat('h:mm a').format(time),
                      style: TextStyle(color: palette.quiet, fontSize: 12.5),
                    ),
                  const SizedBox(height: 4),
                  Text(
                    notice.body,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: palette.quiet),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 6),
            Icon(Icons.chevron_right_rounded, color: palette.quiet),
          ],
        ),
      ),
    );
  }
}

/// A notice opened in full.
class _NoticeSheet extends StatelessWidget {
  const _NoticeSheet({required this.notice});

  final NoticeItem notice;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final time = schoolTime(notice.publishAt);
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.8,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(notice.title, style: theme.textTheme.titleLarge),
              if (time != null) ...[
                const SizedBox(height: 4),
                Text(
                  DateFormat('d MMMM yyyy, h:mm a').format(time),
                  style: theme.textTheme.bodySmall,
                ),
              ],
              const SizedBox(height: 14),
              SelectableText(notice.body, style: theme.textTheme.bodyLarge),
            ],
          ),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.text});

  final String icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: const BoxDecoration(
              color: Color(0xFFF1EBFE),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: AttendanceIcon(icon, size: 34),
          ),
          const SizedBox(height: 10),
          Text(
            text,
            style: TextStyle(color: palette.quiet, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _Problem extends StatelessWidget {
  const _Problem({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final palette = AttendancePalette.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Column(
        children: [
          Icon(Icons.cloud_off_rounded, size: 40, color: palette.quiet),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(color: palette.quiet),
          ),
          const SizedBox(height: 10),
          FilledButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ),
    );
  }
}
