import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/routes/app_pages.dart';
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

class _Overview extends StatelessWidget {
  const _Overview({required this.child, required this.children});

  final ChildController child;
  final ChildrenController children;

  @override
  Widget build(BuildContext context) {
    final selected = children.selected;
    final attendance = child.attendance.value;
    final ledger = child.ledger.value;
    final due = ledger?.outstandingInPaise ?? 0;

    final nextHomework = child.homework.isEmpty ? null : child.homework.first;
    final pinned = child.notices.firstWhereOrNull(
      (n) => n.pinned || n.isEmergency,
    );

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        Text(
          selected == null ? '' : selected.fullName,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        Text(
          selected?.classroomLabel ?? 'Not in a class yet',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: Theme.of(context).colorScheme.outline,
          ),
        ),
        const SizedBox(height: 16),

        if (pinned != null) ...[
          Card(
            color: pinned.isEmergency
                ? Theme.of(context).colorScheme.errorContainer
                : Theme.of(context).colorScheme.secondaryContainer,
            child: ListTile(
              leading: Icon(
                pinned.isEmergency
                    ? Icons.warning_amber
                    : Icons.push_pin_outlined,
              ),
              title: Text(pinned.title),
              subtitle: Text(
                pinned.body,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],

        Row(
          children: [
            Expanded(
              child: _Tile(
                label: 'Attendance',
                value: attendance == null || attendance.markedDays == 0
                    ? '—'
                    : '${attendance.percentage}%',
                // The denominator is days the school actually ran, so a holiday
                // never quietly drags this down.
                hint: attendance == null || attendance.markedDays == 0
                    ? 'No register yet'
                    : 'over ${attendance.markedDays} days',
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _Tile(
                label: 'Fees due',
                value: _rupees(due),
                hint: due > 0
                    ? 'Please settle with the office'
                    : 'Nothing outstanding',
                tone: due > 0 ? Theme.of(context).colorScheme.error : null,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        Card(
          child: ListTile(
            leading: const Icon(Icons.menu_book_outlined),
            title: Text(nextHomework?.title ?? 'No homework set'),
            subtitle: Text(
              nextHomework == null
                  ? 'Nothing due at the moment.'
                  : 'Due ${_day(nextHomework.dueDate)}',
            ),
          ),
        ),

        if (selected?.classroomId != null) ...[
          Card(
            child: ListTile(
              leading: const Icon(Icons.dynamic_feed_outlined),
              title: const Text('Class stream'),
              subtitle: const Text('Announcements and materials'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Get.toNamed<void>(
                AppRoutes.stream,
                arguments: {'classroomId': selected!.classroomId},
              ),
            ),
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.schedule_outlined),
              title: const Text('Timetable'),
              subtitle: Text('${selected!.classroomLabel}’s week'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Get.toNamed<void>(
                AppRoutes.timetable,
                arguments: {'classroomId': selected.classroomId},
              ),
            ),
          ),
        ],

        // The way in to the activities themselves. Without this the whole
        // progress module below is a screen of zeroes forever.
        if (selected != null)
          Card(
            color: Theme.of(context).colorScheme.primaryContainer,
            child: ListTile(
              leading: const Icon(Icons.play_circle_outline),
              title: const Text('Play and learn'),
              subtitle: Text('Activities for ${selected.firstName}'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Get.toNamed<void>(
                AppRoutes.activities,
                arguments: {'studentId': selected.id},
              ),
            ),
          ),

        const SizedBox(height: 20),
        Text('Learning', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (child.skills.isEmpty)
          Text(
            'Nothing recorded yet.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.outline,
            ),
          )
        else
          ...child.skills.take(6).map((skill) => _SkillRow(skill: skill)),
      ],
    );
  }
}

class _SkillRow extends StatelessWidget {
  const _SkillRow({required this.skill});

  final SkillProgress skill;

  @override
  Widget build(BuildContext context) {
    final started = skill.attemptsCount > 0;
    final color = !started
        ? Theme.of(context).colorScheme.outlineVariant
        : skill.masteryPercent >= 80
        ? const Color(0xFF16A34A)
        : skill.masteryPercent >= 50
        ? const Color(0xFFD97706)
        : const Color(0xFFDC2626);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(skill.skillName)),
              Text(
                started ? '${skill.masteryPercent}%' : '—',
                style: TextStyle(color: color, fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 5),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: started ? skill.masteryPercent / 100 : 0,
              minHeight: 5,
              backgroundColor: Theme.of(
                context,
              ).colorScheme.surfaceContainerHighest,
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
          const SizedBox(height: 3),
          // A bare percentage invites an argument; the working lets a parent and
          // a teacher discuss the same thing.
          Text(
            skill.basis,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.outline,
            ),
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.label,
    required this.value,
    required this.hint,
    this.tone,
  });

  final String label;
  final String value;
  final String hint;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.outline,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(color: tone),
            ),
            const SizedBox(height: 4),
            Text(
              hint,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.outline,
              ),
            ),
          ],
        ),
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
