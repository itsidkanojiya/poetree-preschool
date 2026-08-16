import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/routes/app_pages.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/async_view.dart';
import '../auth/auth_controller.dart';
import '../notifications/inbox_view.dart';
import 'child_controller.dart';
import 'homework_detail_view.dart';
import 'children_controller.dart';

final _money = NumberFormat.currency(
  locale: 'en_IN',
  symbol: '₹',
  decimalDigits: 0,
);

String _rupees(int paise) => _money.format(paise / 100);

String _day(String iso) {
  final date = DateTime.tryParse(iso);
  return date == null ? iso : DateFormat('d MMM').format(date);
}

const _statusLabels = <String, String>{
  'PRESENT': 'Present',
  'ABSENT': 'Absent',
  'LATE': 'Late',
  'LEAVE': 'Leave',
  'HALF_DAY': 'Half day',
};

const _statusColors = <String, Color>{
  'PRESENT': Color(0xFF16A34A),
  'ABSENT': Color(0xFFDC2626),
  'LATE': Color(0xFFD97706),
  'LEAVE': Color(0xFF7C3AED),
  'HALF_DAY': Color(0xFF0891B2),
};

/// The parent's home.
///
/// A child is chosen by tapping a face, never by typing or logging in as them —
/// students hold no credentials anywhere in this platform. A parent with one
/// child never sees a picker at all.
class ParentHomeView extends StatelessWidget {
  const ParentHomeView({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthController>();
    final children = Get.find<ChildrenController>();
    final child = Get.find<ChildController>();

    return Scaffold(
      appBar: AppBar(
        title: Obx(() => Text(auth.user.value?.schoolName ?? 'School')),
        actions: [
          InboxButton(onOpen: () => Get.toNamed<void>(AppRoutes.inbox)),
          IconButton(
            onPressed: auth.signOut,
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
          ),
        ],
      ),
      body: Obx(() {
        if (children.isLoading.value) {
          return const Center(child: CircularProgressIndicator());
        }

        if (children.children.isEmpty) {
          return AsyncView(
            isLoading: false,
            error: children.error.value,
            isEmpty: true,
            onRetry: children.load,
            emptyTitle: 'No children linked yet',
            emptyMessage:
                'The school links your children to your account. Ask the office if this looks wrong.',
            builder: (_) => const SizedBox.shrink(),
          );
        }

        // Read here, inside the Obx closure, and NOT inside AsyncView's
        // builder. That builder runs when AsyncView itself builds, which is
        // outside this closure — so the tab was read outside the reactive
        // scope, nothing subscribed to it, and tapping the bottom bar moved
        // the highlight while the page underneath stayed put.
        final tab = children.tab.value;

        return Column(
          children: [
            if (children.children.length > 1)
              _ChildSwitcher(children: children),
            Expanded(
              child: AsyncView(
                isLoading: child.isLoading.value,
                error: child.error.value,
                isEmpty: false,
                onRetry: child.load,
                builder: (context) => switch (tab) {
                  ChildrenController.homeTab => _Overview(
                    child: child,
                    children: children,
                  ),
                  ChildrenController.attendanceTab => _AttendanceTab(
                    child: child,
                  ),
                  ChildrenController.homeworkTab => _HomeworkTab(child: child),
                  ChildrenController.feesTab => _FeesTab(child: child),
                  _ => _NoticesTab(child: child),
                },
              ),
            ),
          ],
        );
      }),
      bottomNavigationBar: Obx(
        () => NavigationBar(
          selectedIndex: children.tab.value,
          onDestinationSelected: (index) => children.tab.value = index,
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home),
              label: 'Home',
            ),
            NavigationDestination(
              icon: Icon(Icons.event_available_outlined),
              selectedIcon: Icon(Icons.event_available),
              label: 'Attendance',
            ),
            NavigationDestination(
              icon: Icon(Icons.menu_book_outlined),
              selectedIcon: Icon(Icons.menu_book),
              label: 'Homework',
            ),
            NavigationDestination(
              icon: Icon(Icons.receipt_long_outlined),
              selectedIcon: Icon(Icons.receipt_long),
              label: 'Fees',
            ),
            NavigationDestination(
              icon: Icon(Icons.campaign_outlined),
              selectedIcon: Icon(Icons.campaign),
              label: 'Notices',
            ),
          ],
        ),
      ),
    );
  }
}

class _ChildSwitcher extends StatelessWidget {
  const _ChildSwitcher({required this.children});

  final ChildrenController children;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 92,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: children.children.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          final child = children.children[index];
          final selected = child.id == children.selectedId.value;

          return GestureDetector(
            onTap: () => children.select(child.id),
            child: Column(
              children: [
                Container(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: selected
                          ? Theme.of(context).colorScheme.primary
                          : Colors.transparent,
                      width: 2.5,
                    ),
                  ),
                  padding: const EdgeInsets.all(2),
                  child: InitialsAvatar(
                    name: child.fullName,
                    radius: 22,
                    photoPath: child.photoPath,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  child.firstName,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// The parent's landing screen.
///
/// Was a stack of identical grey rows in which the child's attendance, a
/// worksheet and a link to the timetable all looked equally important. Now it
/// opens on the child, answers the two questions a parent actually has — was
/// my child there, do we owe anything — and only then offers the rest.
class _Overview extends StatelessWidget {
  const _Overview({required this.child, required this.children});

  final ChildController child;
  final ChildrenController children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    final selected = children.selected;
    final attendance = child.attendance.value;
    final ledger = child.ledger.value;
    final due = ledger?.outstandingInPaise ?? 0;

    final nextHomework = child.homework.firstWhereOrNull((h) => !h.isDone);
    final pinned = child.notices.firstWhereOrNull(
      (n) => n.pinned || n.isEmergency,
    );
    final started = child.skills.where((s) => s.attemptsCount > 0).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
      children: [
        // The child, not the app. Their name is the largest thing on screen.
        Row(
          children: [
            InitialsAvatar(name: selected?.fullName ?? '', radius: 26),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    selected?.fullName ?? '',
                    style: theme.textTheme.headlineMedium,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    selected?.classroomLabel ?? 'Not in a class yet',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),

        if (pinned != null) ...[
          _PinnedNotice(
            notice: pinned,
            onTap: () => child.markNoticeRead(pinned),
          ),
          const SizedBox(height: 14),
        ],

        // The two questions a parent opens this app to answer.
        Row(
          children: [
            Expanded(
              child: _StatCard(
                label: 'Attendance',
                value: attendance == null || attendance.markedDays == 0
                    ? '—'
                    : '${attendance.percentage}%',
                caption: attendance == null || attendance.markedDays == 0
                    ? 'No register yet'
                    : 'over ${attendance.markedDays} days',
                // The denominator is days the school actually ran, so a
                // holiday never quietly drags this down.
                progress: attendance == null || attendance.markedDays == 0
                    ? null
                    : attendance.percentage / 100,
                tone: AppTheme.leaf,
                toneSoft: AppTheme.leafSoft,
                icon: Icons.event_available_rounded,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _StatCard(
                label: 'Fees due',
                value: _rupees(due),
                caption: due > 0
                    ? 'Please settle with the office'
                    : 'All clear',
                tone: due > 0 ? AppTheme.coral : AppTheme.leaf,
                toneSoft: due > 0 ? AppTheme.coralSoft : AppTheme.leafSoft,
                icon: Icons.receipt_long_rounded,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),

        if (nextHomework != null) ...[
          _NextUp(
            homework: nextHomework,
            onOpen: () => children.tab.value = ChildrenController.homeworkTab,
          ),
          const SizedBox(height: 14),
        ],

        // The activities. Given the warmest treatment on the screen because it
        // is the only thing here a child does rather than a parent reads.
        if (selected != null)
          _PlayCard(
            firstName: selected.firstName,
            onTap: () => Get.toNamed<void>(
              AppRoutes.books,
              arguments: {
                'studentId': selected.id,
                'childName': selected.firstName,
              },
            ),
          ),

        if (selected?.classroomId != null) ...[
          const SizedBox(height: 14),
          _ActionTile(
            icon: Icons.dynamic_feed_rounded,
            tone: AppTheme.sky,
            toneSoft: AppTheme.skySoft,
            title: 'Class stream',
            subtitle: 'Announcements and materials from the class',
            onTap: () => Get.toNamed<void>(
              AppRoutes.stream,
              arguments: {'classroomId': selected!.classroomId},
            ),
          ),
          const SizedBox(height: 10),
          _ActionTile(
            icon: Icons.schedule_rounded,
            tone: AppTheme.apricot,
            toneSoft: AppTheme.apricotSoft,
            title: 'Timetable',
            subtitle: 'The week for ${selected!.classroomLabel}',
            onTap: () => Get.toNamed<void>(
              AppRoutes.timetable,
              arguments: {'classroomId': selected.classroomId},
            ),
          ),
        ],

        const SizedBox(height: 28),
        Row(
          children: [
            Text('LEARNING', style: theme.textTheme.labelSmall),
            const Spacer(),
            if (started.isNotEmpty)
              Text(
                '${started.length} of ${child.skills.length} started',
                style: theme.textTheme.bodySmall,
              ),
          ],
        ),
        const SizedBox(height: 12),

        if (child.skills.isEmpty)
          Text('Nothing recorded yet.', style: theme.textTheme.bodySmall)
        else ...[
          // Skills they have actually tried come first. A screen that opens on
          // eight rows of "Not attempted yet" reads as a system with nothing
          // in it, whatever the child has done.
          ...started.map((s) => _SkillRow(skill: s)),
          if (started.isNotEmpty && started.length < child.skills.length)
            Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 2),
              child: Text(
                'Not started yet',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colors.outline,
                ),
              ),
            ),
          ...child.skills
              .where((s) => s.attemptsCount == 0)
              .take(4)
              .map((s) => _SkillRow(skill: s)),
        ],
      ],
    );
  }
}

/// An emergency or pinned notice, given the top of the screen because it is
/// the one thing here that cannot wait until a parent goes looking.
class _PinnedNotice extends StatelessWidget {
  const _PinnedNotice({required this.notice, required this.onTap});

  final NoticeItem notice;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final urgent = notice.isEmergency;
    final on = urgent ? colors.onErrorContainer : colors.onSecondaryContainer;

    return Material(
      color: urgent ? colors.errorContainer : colors.secondaryContainer,
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                urgent ? Icons.priority_high_rounded : Icons.push_pin_rounded,
                size: 20,
                color: on,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      notice.title,
                      style: TextStyle(fontWeight: FontWeight.w600, color: on),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      notice.body,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, height: 1.4, color: on),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One figure with what it is made of underneath it.
class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.caption,
    required this.tone,
    required this.toneSoft,
    required this.icon,
    this.progress,
  });

  final String label;
  final String value;
  final String caption;
  final Color tone;
  final Color toneSoft;
  final IconData icon;
  final double? progress;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              // Mixed rather than reused straight: the soft fills are built
              // for a paper ground and would glow on a dark one.
              color: isDark ? tone.withValues(alpha: 0.18) : toneSoft,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(icon, size: 19, color: tone),
          ),
          const SizedBox(height: 12),
          Text(label, style: theme.textTheme.bodySmall),
          const SizedBox(height: 2),
          Text(
            value,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: -0.5,
            ),
          ),
          if (progress != null) ...[
            const SizedBox(height: 9),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: progress!.clamp(0, 1),
                minHeight: 5,
                valueColor: AlwaysStoppedAnimation<Color>(tone),
              ),
            ),
          ],
          const SizedBox(height: 8),
          Text(caption, style: theme.textTheme.bodySmall),
        ],
      ),
    );
  }
}

/// The next thing actually owed, rather than the newest thing set.
class _NextUp extends StatelessWidget {
  const _NextUp({required this.homework, required this.onOpen});

  final HomeworkItem homework;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return Material(
      color: colors.surface,
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onOpen,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: colors.outlineVariant),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('TO DO', style: theme.textTheme.labelSmall),
                    const SizedBox(height: 6),
                    Text(homework.title, style: theme.textTheme.titleMedium),
                    const SizedBox(height: 2),
                    Text(
                      // Which subject, and whose class it came from — the same
                      // line the list and the detail screen carry, so the three
                      // agree about what this piece of work is.
                      [
                        if (homework.subject != null) homework.subject!,
                        if (homework.setBy.isNotEmpty) homework.setBy,
                        'due ${_day(homework.dueDate)}',
                      ].join(' · '),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: homework.isOverdue ? AppTheme.coral : null,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: colors.outline),
            ],
          ),
        ),
      ),
    );
  }
}

/// The one thing on this screen a child does rather than a parent reads, so
/// the one thing given colour rather than a hairline.
class _PlayCard extends StatelessWidget {
  const _PlayCard({required this.firstName, required this.onTap});

  final String firstName;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    return Material(
      color: colors.primaryContainer,
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: colors.surface.withValues(alpha: 0.55),
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(
                  Icons.play_arrow_rounded,
                  size: 28,
                  color: colors.onPrimaryContainer,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Play and learn',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.2,
                        color: colors.onPrimaryContainer,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Letters, numbers and shapes for $firstName',
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.35,
                        color: colors.onPrimaryContainer.withValues(
                          alpha: 0.85,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.tone,
    required this.toneSoft,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final Color tone;
  final Color toneSoft;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    return Material(
      color: colors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: colors.outlineVariant),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: isDark ? tone.withValues(alpha: 0.18) : toneSoft,
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(icon, size: 20, color: tone),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: theme.textTheme.titleSmall),
                    const SizedBox(height: 1),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: colors.outline),
            ],
          ),
        ),
      ),
    );
  }
}

class _SkillRow extends StatelessWidget {
  const _SkillRow({required this.skill});

  final SkillProgress skill;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final started = skill.attemptsCount > 0;
    final color = !started
        ? theme.colorScheme.outlineVariant
        : skill.masteryPercent >= 80
        ? AppTheme.leaf
        : skill.masteryPercent >= 50
        ? AppTheme.apricot
        : AppTheme.coral;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(skill.skillName, style: theme.textTheme.bodyMedium),
              ),
              Text(
                started ? '${skill.masteryPercent}%' : '—',
                style: TextStyle(
                  color: started ? color : theme.colorScheme.outline,
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: started ? skill.masteryPercent / 100 : 0,
              minHeight: 6,
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
          const SizedBox(height: 5),
          // The percentage never travels without its working.
          Text(skill.basis, style: theme.textTheme.bodySmall),
        ],
      ),
    );
  }
}

/// A child's attendance, as a month.
///
/// Was a flat list of every marked day, newest first, which meant scrolling
/// thirty-two rows to answer "how has this month gone" and being unable to see
/// a pattern at all. A register is kept by the month and read by the month.
///
/// Days the school did not run are simply blank rather than marked absent —
/// weekends, holidays, and days before the child joined all look the same to a
/// parent, and none of them are the child's doing.
class _AttendanceTab extends StatefulWidget {
  const _AttendanceTab({required this.child});

  final ChildController child;

  @override
  State<_AttendanceTab> createState() => _AttendanceTabState();
}

class _AttendanceTabState extends State<_AttendanceTab> {
  late DateTime _month;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final attendance = widget.child.attendance.value;
    final days = attendance?.days ?? const <AttendanceDay>[];

    // Keyed by calendar day so the grid is a lookup rather than a scan.
    final byDay = <String, AttendanceDay>{for (final d in days) d.date: d};

    final earliest = days.isEmpty
        ? DateTime.now()
        : DateTime.parse(
            days
                .map((d) => d.date)
                .reduce((a, b) => a.compareTo(b) < 0 ? a : b),
          );
    final firstMonth = DateTime(earliest.year, earliest.month);
    final now = DateTime.now();
    final thisMonth = DateTime(now.year, now.month);

    final canGoBack = _month.isAfter(firstMonth);
    final canGoForward = _month.isBefore(thisMonth);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        if (attendance != null && attendance.markedDays > 0)
          _AttendanceSummary(attendance: attendance),

        const SizedBox(height: 16),

        Row(
          children: [
            IconButton(
              onPressed: canGoBack
                  ? () => setState(
                      () => _month = DateTime(_month.year, _month.month - 1),
                    )
                  : null,
              icon: const Icon(Icons.chevron_left_rounded),
            ),
            Expanded(
              child: Text(
                DateFormat('MMMM yyyy').format(_month),
                textAlign: TextAlign.center,
                style: theme.textTheme.titleMedium,
              ),
            ),
            IconButton(
              onPressed: canGoForward
                  ? () => setState(
                      () => _month = DateTime(_month.year, _month.month + 1),
                    )
                  : null,
              icon: const Icon(Icons.chevron_right_rounded),
            ),
          ],
        ),
        const SizedBox(height: 6),

        _MonthGrid(month: _month, byDay: byDay),

        const SizedBox(height: 20),
        const _AttendanceKey(),

        const SizedBox(height: 22),
        Text('DAYS AWAY', style: theme.textTheme.labelSmall),
        const SizedBox(height: 8),

        // Only the exceptions are listed. Thirty rows saying "Present" is not
        // information a parent needs spelled out — the grid already says it.
        ...() {
          final away = days.where((d) => d.status != 'PRESENT').toList()
            ..sort((a, b) => b.date.compareTo(a.date));

          if (away.isEmpty) {
            return [
              Text(
                'Not a single day missed.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppTheme.leaf,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ];
          }

          return away.map((day) {
            final colour =
                _statusColors[day.status] ?? theme.colorScheme.outline;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                      color: colour,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      DateFormat(
                        'EEEE d MMMM',
                      ).format(DateTime.parse(day.date)),
                      style: theme.textTheme.bodyMedium,
                    ),
                  ),
                  Text(
                    _statusLabels[day.status] ?? day.status,
                    style: TextStyle(
                      color: colour,
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            );
          }).toList();
        }(),

        // A remark is the teacher explaining themselves, and worth surfacing.
        ...days
            .where((d) => d.remark != null && d.remark!.isNotEmpty)
            .map(
              (d) => Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 8, left: 21),
                child: Text(
                  '“${d.remark}” — ${DateFormat('d MMM').format(DateTime.parse(d.date))}',
                  style: theme.textTheme.bodySmall,
                ),
              ),
            ),
      ],
    );
  }
}

class _AttendanceSummary extends StatelessWidget {
  const _AttendanceSummary({required this.attendance});

  final ChildAttendance attendance;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final percent = attendance.percentage;
    final tone = percent >= 90
        ? AppTheme.leaf
        : percent >= 75
        ? AppTheme.apricot
        : AppTheme.coral;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '$percent%',
                style: theme.textTheme.displaySmall?.copyWith(color: tone),
              ),
              const SizedBox(width: 10),
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text('present', style: theme.textTheme.bodyMedium),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(5),
            child: LinearProgressIndicator(
              value: percent / 100,
              minHeight: 7,
              valueColor: AlwaysStoppedAnimation<Color>(tone),
            ),
          ),
          const SizedBox(height: 10),
          // The denominator is days the school actually ran. Counting calendar
          // days would make every percentage wrong the moment a holiday fell
          // inside the range.
          Text(
            '${attendance.present} present · ${attendance.absent} away · over ${attendance.markedDays} school days',
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({required this.month, required this.byDay});

  final DateTime month;
  final Map<String, AttendanceDay> byDay;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final firstOfMonth = DateTime(month.year, month.month);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    // DateTime.weekday is 1..7 Monday-first, which is the order below.
    final leadingBlanks = firstOfMonth.weekday - 1;
    final today = DateTime.now();

    return Column(
      children: [
        Row(
          children: ['M', 'T', 'W', 'T', 'F', 'S', 'S']
              .map(
                (d) => Expanded(
                  child: Center(
                    child: Text(
                      d,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 6),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 7,
            mainAxisSpacing: 6,
            crossAxisSpacing: 6,
            childAspectRatio: 1,
          ),
          itemCount: leadingBlanks + daysInMonth,
          itemBuilder: (context, index) {
            if (index < leadingBlanks) return const SizedBox.shrink();

            final dayNumber = index - leadingBlanks + 1;
            final date = DateTime(month.year, month.month, dayNumber);
            final key = date.toIso8601String().substring(0, 10);
            final record = byDay[key];
            final isToday =
                date.year == today.year &&
                date.month == today.month &&
                date.day == today.day;

            return _DayCell(
              day: dayNumber,
              status: record?.status,
              isToday: isToday,
              hasRemark: record?.remark != null && record!.remark!.isNotEmpty,
            );
          },
        ),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.day,
    required this.status,
    required this.isToday,
    required this.hasRemark,
  });

  final int day;
  final String? status;
  final bool isToday;
  final bool hasRemark;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final colour = status == null ? null : _statusColors[status];

    // No register is not the same as an absence, and must not look like one.
    final background = colour == null
        ? Colors.transparent
        : isDark
        ? colour.withValues(alpha: 0.22)
        : colour.withValues(alpha: 0.14);

    return Container(
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(12),
        border: isToday
            ? Border.all(color: theme.colorScheme.primary, width: 1.6)
            : colour == null
            ? Border.all(color: theme.colorScheme.outlineVariant)
            : null,
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Text(
            '$day',
            style: TextStyle(
              fontSize: 13.5,
              fontWeight: colour == null ? FontWeight.w400 : FontWeight.w700,
              color: colour ?? theme.colorScheme.outline,
            ),
          ),
          if (hasRemark)
            Positioned(
              bottom: 5,
              child: Container(
                width: 4,
                height: 4,
                decoration: BoxDecoration(
                  color: colour ?? theme.colorScheme.outline,
                  shape: BoxShape.circle,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Colour alone cannot carry meaning — roughly one man in twelve cannot
/// separate the red from the green.
class _AttendanceKey extends StatelessWidget {
  const _AttendanceKey();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Wrap(
      spacing: 14,
      runSpacing: 8,
      children: _statusLabels.entries.map((entry) {
        final colour = _statusColors[entry.key]!;
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 13,
              height: 13,
              decoration: BoxDecoration(
                color: colour.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: colour, width: 1.2),
              ),
            ),
            const SizedBox(width: 6),
            Text(entry.value, style: theme.textTheme.bodySmall),
          ],
        );
      }).toList(),
    );
  }
}

/// The parent's list of work, in the shape Google Classroom taught everyone:
/// filter first, then work grouped by when it is due, each row saying who set
/// it and for which subject. Tapping a row opens it — nothing is acted on from
/// the list, which is what made the old cards so tall.
class _HomeworkTab extends StatefulWidget {
  const _HomeworkTab({required this.child});

  final ChildController child;

  @override
  State<_HomeworkTab> createState() => _HomeworkTabState();
}

enum _Filter { todo, sent, done }

class _HomeworkTabState extends State<_HomeworkTab> {
  _Filter _filter = _Filter.todo;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final child = widget.child;

    if (child.homework.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 80),
          Center(child: Text('Nothing set at the moment.')),
        ],
      );
    }

    final todo = child.homework.where((h) => h.isOutstanding).toList();
    final sent = child.homework.where((h) => h.isWaiting).toList();
    final done = child.homework.where((h) => h.isJudged).toList();
    // Work with nothing to send back still has to live somewhere, or a parent
    // reading the list would never see it at all.
    final toRead = child.homework
        .where((h) => !h.allowsSubmission && !h.isJudged && !h.isWaiting)
        .toList();

    final showing = switch (_filter) {
      _Filter.todo => [...todo, ...toRead],
      _Filter.sent => sent,
      _Filter.done => done,
    };

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        Row(
          children: [
            _FilterChip(
              label: 'To do',
              count: todo.length + toRead.length,
              selected: _filter == _Filter.todo,
              onTap: () => setState(() => _filter = _Filter.todo),
            ),
            const SizedBox(width: 8),
            _FilterChip(
              label: 'Sent in',
              count: sent.length,
              selected: _filter == _Filter.sent,
              onTap: () => setState(() => _filter = _Filter.sent),
            ),
            const SizedBox(width: 8),
            _FilterChip(
              label: 'Done',
              count: done.length,
              selected: _filter == _Filter.done,
              onTap: () => setState(() => _filter = _Filter.done),
            ),
          ],
        ),
        const SizedBox(height: 16),

        if (showing.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 60),
            child: Center(
              child: Text(switch (_filter) {
                _Filter.todo => 'Nothing to do. All caught up.',
                _Filter.sent => 'Nothing waiting with the teacher.',
                _Filter.done => 'Nothing marked yet.',
              }, style: theme.textTheme.bodyMedium),
            ),
          )
        else
          ..._grouped(showing).entries.expand(
            (group) => [
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 6, 4, 8),
                child: Text(
                  group.key,
                  style: theme.textTheme.labelSmall?.copyWith(
                    letterSpacing: 0.8,
                    color: group.key == 'OVERDUE'
                        ? AppTheme.coral
                        : theme.colorScheme.outline,
                  ),
                ),
              ),
              ...group.value.map(
                (item) => _HomeworkRow(child: child, item: item),
              ),
              const SizedBox(height: 6),
            ],
          ),
      ],
    );
  }

  /// Overdue first, then by how soon it is due.
  ///
  /// A flat list sorted by date buries the one thing that is actually late
  /// among ten that are not, which is how homework gets missed.
  Map<String, List<HomeworkItem>> _grouped(List<HomeworkItem> items) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final groups = <String, List<HomeworkItem>>{};

    final sorted = [...items]
      ..sort((a, b) => (a.due ?? today).compareTo(b.due ?? today));

    for (final item in sorted) {
      final due = item.due;
      final label = switch (due) {
        null => 'NO DATE',
        _ when item.isOverdue => 'OVERDUE',
        _ when due == today => 'DUE TODAY',
        _ when due.difference(today).inDays <= 7 => 'THIS WEEK',
        _ => 'LATER',
      };
      groups.putIfAbsent(label, () => []).add(item);
    }

    // A fixed order, so the list does not reshuffle itself as dates pass.
    const order = ['OVERDUE', 'DUE TODAY', 'THIS WEEK', 'LATER', 'NO DATE'];
    return {
      for (final key in order)
        if (groups.containsKey(key)) key: groups[key]!,
    };
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? colors.primary : colors.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          count == 0 ? label : '$label · $count',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: selected ? colors.onPrimary : colors.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

/// One line of work: what it is, who set it, when it is due.
class _HomeworkRow extends StatelessWidget {
  const _HomeworkRow({required this.child, required this.item});

  final ChildController child;
  final HomeworkItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final tone = statusColours(item, colors);

    final line = [
      if (item.subject != null) item.subject!,
      if (item.setBy.isNotEmpty) item.setBy,
    ].join(' · ');

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => HomeworkDetailPage(child: child, id: item.id),
          ),
        ),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: colors.outlineVariant),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: tone.bg,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  item.isJudged
                      ? Icons.assignment_turned_in_outlined
                      : Icons.assignment_outlined,
                  size: 20,
                  color: tone.fg,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall,
                    ),
                    if (line.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        line,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Text(
                          'Due ${_day(item.dueDate)}',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: item.isOverdue
                                ? AppTheme.coral
                                : colors.outline,
                            fontWeight: item.isOverdue ? FontWeight.w600 : null,
                          ),
                        ),
                        if (item.attachments.isNotEmpty) ...[
                          const SizedBox(width: 8),
                          Icon(
                            Icons.attach_file_rounded,
                            size: 13,
                            color: colors.outline,
                          ),
                        ],
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: tone.bg,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            item.statusLabel,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: tone.fg,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: colors.outline),
            ],
          ),
        ),
      ),
    );
  }
}

class _FeesTab extends StatelessWidget {
  const _FeesTab({required this.child});

  final ChildController child;

  @override
  Widget build(BuildContext context) {
    final ledger = child.ledger.value;

    if (ledger == null || ledger.invoices.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 80),
          Center(child: Text('No fee bills raised yet.')),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                _LedgerLine(
                  label: 'Billed',
                  value: _rupees(ledger.billedInPaise),
                ),
                const SizedBox(height: 6),
                _LedgerLine(label: 'Paid', value: _rupees(ledger.paidInPaise)),
                const Divider(height: 20),
                _LedgerLine(
                  label: 'Outstanding',
                  value: _rupees(ledger.outstandingInPaise),
                  emphasise: true,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text('Bills', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        ...ledger.invoices.map(
          (invoice) => Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              title: Text(
                invoice.period.isEmpty ? invoice.invoiceNo : invoice.period,
              ),
              subtitle: Text(
                '${invoice.invoiceNo} · due ${_day(invoice.dueDate)}',
              ),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    _rupees(invoice.outstandingInPaise),
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  Text(
                    invoice.status.toLowerCase(),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.outline,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _LedgerLine extends StatelessWidget {
  const _LedgerLine({
    required this.label,
    required this.value,
    this.emphasise = false,
  });

  final String label;
  final String value;
  final bool emphasise;

  @override
  Widget build(BuildContext context) {
    final style = emphasise
        ? Theme.of(context).textTheme.titleMedium
        : Theme.of(context).textTheme.bodyMedium;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: style),
        Text(value, style: style),
      ],
    );
  }
}

class _NoticesTab extends StatelessWidget {
  const _NoticesTab({required this.child});

  final ChildController child;

  @override
  Widget build(BuildContext context) {
    if (child.notices.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 80),
          Center(child: Text('No notices from the school.')),
        ],
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: child.notices.length,
      itemBuilder: (context, index) {
        final notice = child.notices[index];
        return Card(
          margin: const EdgeInsets.only(bottom: 10),
          color: notice.isEmergency
              ? Theme.of(context).colorScheme.errorContainer
              : null,
          child: ListTile(
            // Opening it is what tells the school it has been seen — the
            // answer to "who has not read this" for an emergency notice.
            onTap: () => child.markNoticeRead(notice),
            leading: notice.pinned
                ? const Icon(Icons.push_pin_outlined)
                : notice.isEmergency
                ? const Icon(Icons.warning_amber)
                : const Icon(Icons.campaign_outlined),
            title: Row(
              children: [
                Expanded(child: Text(notice.title)),
                if (!notice.readByMe)
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primary,
                      shape: BoxShape.circle,
                    ),
                  ),
              ],
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(notice.body),
                const SizedBox(height: 4),
                Text(
                  _day(notice.publishAt),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.outline,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
