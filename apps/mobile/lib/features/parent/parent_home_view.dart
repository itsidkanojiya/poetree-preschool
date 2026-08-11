import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/routes/app_pages.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/async_view.dart';
import '../auth/auth_controller.dart';
import '../notifications/inbox_view.dart';
import 'child_controller.dart';
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
                builder: (context) => switch (children.tab.value) {
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
                  child: InitialsAvatar(name: child.fullName, radius: 22),
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
              AppRoutes.activities,
              arguments: {'studentId': selected.id},
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
                      'Due ${_day(homework.dueDate)}',
                      style: theme.textTheme.bodySmall,
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

class _AttendanceTab extends StatelessWidget {
  const _AttendanceTab({required this.child});

  final ChildController child;

  @override
  Widget build(BuildContext context) {
    final attendance = child.attendance.value;
    final days = attendance?.days ?? const <AttendanceDay>[];

    if (days.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 80),
          Center(child: Text('No register taken yet.')),
        ],
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: days.length + 1,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, index) {
        if (index == 0) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              '${attendance!.percentage}% present over ${attendance.markedDays} days',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          );
        }

        final day = days[index - 1];
        final color = _statusColors[day.status] ?? Colors.grey;

        return ListTile(
          contentPadding: EdgeInsets.zero,
          leading: CircleAvatar(radius: 6, backgroundColor: color),
          title: Text(_day(day.date)),
          subtitle: day.remark == null ? null : Text(day.remark!),
          trailing: Text(
            _statusLabels[day.status] ?? day.status,
            style: TextStyle(color: color, fontWeight: FontWeight.w600),
          ),
        );
      },
    );
  }
}

class _HomeworkTab extends StatelessWidget {
  const _HomeworkTab({required this.child});

  final ChildController child;

  @override
  Widget build(BuildContext context) {
    if (child.homework.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 80),
          Center(child: Text('Nothing set at the moment.')),
        ],
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: child.homework.length,
      itemBuilder: (context, index) {
        final item = child.homework[index];
        final colors = Theme.of(context).colorScheme;

        return Card(
          margin: const EdgeInsets.only(bottom: 10),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.title,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                    if (item.isDone)
                      Icon(
                        item.myStatus == 'COMPLETED'
                            ? Icons.verified_outlined
                            : Icons.check_circle_outline,
                        size: 20,
                        color: const Color(0xFF16A34A),
                      ),
                  ],
                ),
                if (item.description != null &&
                    item.description!.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(item.description!),
                ],
                const SizedBox(height: 6),
                Text(
                  'Due ${_day(item.dueDate)}${item.subject == null ? '' : ' · ${item.subject}'}',
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: colors.outline),
                ),

                // The teacher's words come back to the parent — otherwise a
                // review is something that happens where nobody can see it.
                if (item.teacherRemark != null &&
                    item.teacherRemark!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: colors.secondaryContainer,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      item.teacherRemark!,
                      style: TextStyle(
                        fontSize: 13,
                        color: colors.onSecondaryContainer,
                      ),
                    ),
                  ),
                ],

                if (item.canSubmit)
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      onPressed: () => _markDone(context, child, item),
                      icon: const Icon(Icons.check, size: 18),
                      label: const Text('Mark as done'),
                    ),
                  )
                else if (item.isDone)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      switch (item.myStatus) {
                        'COMPLETED' => 'The teacher has marked this done.',
                        'LATE' => 'Sent in after the due date.',
                        _ => 'Sent in — waiting for the teacher.',
                      },
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(color: colors.outline),
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

/// Asks for an optional note, then sends it.
///
/// A note rather than a status: whether the work counts as done is the
/// teacher's judgement, and the parent is only reporting that it happened.
Future<void> _markDone(
  BuildContext context,
  ChildController child,
  HomeworkItem item,
) async {
  final noteField = TextEditingController();

  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(item.title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Tell the teacher this is done?'),
          const SizedBox(height: 12),
          TextField(
            controller: noteField,
            maxLines: 2,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Anything to add? (optional)',
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(false),
          child: const Text('Not yet'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(dialogContext).pop(true),
          child: const Text('Mark as done'),
        ),
      ],
    ),
  );

  if (confirmed != true) return;

  final failure = await child.submitHomework(item, note: noteField.text);

  if (!context.mounted) return;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(failure ?? 'Sent to the teacher.')));
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
