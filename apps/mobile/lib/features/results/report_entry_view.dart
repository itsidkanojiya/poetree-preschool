import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/async_view.dart';
import 'report_entry_controller.dart';
import 'results_models.dart';

const _statusLabels = <String, String>{
  'NOT_STARTED': 'Not started',
  'DRAFT': 'Draft',
  'SUBMITTED': 'With the office',
  'PUBLISHED': 'Sent home',
};

/// The class for one term: every child, how far their card has got, and the
/// button that hands the class to the office.
class ReportEntryView extends GetView<ReportEntryController> {
  const ReportEntryView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Report cards · ${controller.classroomLabel}'),
      ),
      body: Obx(() {
        final grid = controller.grid.value;
        return AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.term.value == null,
          onRetry: controller.load,
          emptyTitle: 'No terms yet',
          emptyMessage:
              'The office sets up the terms for this year. Ask them to add one.',
          builder: (context) => grid == null
              ? const SizedBox.shrink()
              : _ClassList(controller: controller, grid: grid),
        );
      }),
    );
  }
}

class _ClassList extends StatelessWidget {
  const _ClassList({required this.controller, required this.grid});

  final ReportEntryController controller;
  final ReportGrid grid;

  Future<void> _submit(BuildContext context) async {
    final drafts = grid.count('DRAFT');
    final notStarted = grid.count('NOT_STARTED');
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Send to the office?'),
        content: Text(
          '$drafts ${drafts == 1 ? 'card goes' : 'cards go'} to the office to be checked and sent to families. '
          'You cannot change ${drafts == 1 ? 'it' : 'them'} after this unless the office hands the class back.'
          '${notStarted > 0 ? '\n\n$notStarted ${notStarted == 1 ? 'child has' : 'children have'} no card yet.' : ''}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Not yet'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Send'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final failure = await controller.submit();
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(failure ?? 'Sent to the office.')));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final activeTerms = controller.terms.where((t) => t.isActive).toList();
    final drafts = grid.count('DRAFT');

    return RefreshIndicator(
      onRefresh: controller.load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
        children: [
          if (activeTerms.length > 1)
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final t in activeTerms)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(t.name),
                        selected: t.id == grid.term.id,
                        onSelected: (_) => controller.chooseTerm(t),
                      ),
                    ),
                ],
              ),
            ),
          const SizedBox(height: 8),
          Text(
            '${grid.term.name} · ${grid.term.academicYearName}',
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: 2),
          Text(
            '${grid.children.length - grid.count('NOT_STARTED')} of ${grid.children.length} started · '
            '${grid.count('SUBMITTED') + grid.count('PUBLISHED')} with the office',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 14),

          if (grid.areas.isEmpty)
            Text(
              'Nothing is set up to grade for this class yet. Ask the office to set up the report card.',
              style: theme.textTheme.bodyMedium,
            )
          else
            for (final (index, child) in grid.children.indexed)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Card(
                  margin: EdgeInsets.zero,
                  child: ListTile(
                    title: Text(child.fullName),
                    subtitle: Text(
                      '${_statusLabels[child.status] ?? child.status} · ${child.graded}/${grid.areas.length} graded',
                    ),
                    leading: _StatusDot(status: child.status),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => Get.to<void>(
                      () => ReportChildEntryView(
                        controller: controller,
                        startAt: index,
                      ),
                    ),
                  ),
                ),
              ),

          if (grid.areas.isNotEmpty) ...[
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: drafts == 0 ? null : () => _submit(context),
              icon: const Icon(Icons.send_rounded),
              label: Text(
                drafts == 0
                    ? 'Nothing to send yet'
                    : 'Send $drafts to the office',
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (icon, tone) = switch (status) {
      'DRAFT' => (Icons.edit_note_rounded, AppTheme.apricot),
      'SUBMITTED' => (Icons.outbox_rounded, AppTheme.sky),
      'PUBLISHED' => (Icons.check_circle_rounded, AppTheme.leaf),
      _ => (
        Icons.radio_button_unchecked_rounded,
        Theme.of(context).colorScheme.outline,
      ),
    };
    return Icon(icon, color: tone);
  }
}

/// One child's card, then the next: grades as chips under each heading, a
/// box for remarks, and Save & next at the bottom.
class ReportChildEntryView extends StatefulWidget {
  const ReportChildEntryView({
    required this.controller,
    required this.startAt,
    super.key,
  });

  final ReportEntryController controller;
  final int startAt;

  @override
  State<ReportChildEntryView> createState() => _ReportChildEntryViewState();
}

class _ReportChildEntryViewState extends State<ReportChildEntryView> {
  late int _index = widget.startAt;
  late Map<String, String?> _grades;
  final _remarks = TextEditingController();
  bool _dirty = false;
  bool _saving = false;

  ReportGrid get _grid => widget.controller.grid.value!;
  GridChild get _child => _grid.children[_index];

  @override
  void initState() {
    super.initState();
    _take();
  }

  @override
  void dispose() {
    _remarks.dispose();
    super.dispose();
  }

  /// Loads the child at [_index] into the form.
  void _take() {
    _grades = Map.of(_child.grades);
    _remarks.text = _child.remarks ?? '';
    _dirty = false;
  }

  Future<void> _save({required bool next}) async {
    setState(() => _saving = true);
    final failure = await widget.controller.save(
      _child.studentId,
      grades: _grades,
      remarks: _remarks.text,
    );
    if (!mounted) return;
    setState(() => _saving = false);

    if (failure != null) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(failure)));
      return;
    }

    final last = _index >= _grid.children.length - 1;
    if (next && !last) {
      setState(() {
        _index += 1;
        _take();
      });
    } else {
      _dirty = false;
      Navigator.of(context).pop();
    }
  }

  Future<bool> _mayLeave() async {
    if (!_dirty) return true;
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Leave without saving?'),
        content: Text(
          'The grades you picked for ${_child.firstName} have not been saved.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Stay'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Leave'),
          ),
        ],
      ),
    );
    return leave ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final child = _child;
    final editable = child.editable;
    final last = _index >= _grid.children.length - 1;

    final groups = <String, List<ReportArea>>{};
    for (final area in _grid.areas) {
      groups.putIfAbsent(area.group, () => []).add(area);
    }

    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _mayLeave() && context.mounted) {
          setState(() => _dirty = false);
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(child.fullName),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(18),
            child: Container(
              alignment: AlignmentDirectional.centerStart,
              padding: const EdgeInsetsDirectional.only(start: 16, bottom: 8),
              child: Text(
                '${_index + 1} of ${_grid.children.length}'
                '${child.rollNo != null ? ' · Roll ${child.rollNo}' : ''}',
                style: theme.textTheme.bodySmall,
              ),
            ),
          ),
        ),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            if (!editable)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.secondaryContainer,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    child.status == 'PUBLISHED'
                        ? 'This card has been sent to the family. Ask the office if it needs correcting.'
                        : 'This card is with the office. Ask them to hand the class back to change it.',
                    style: TextStyle(
                      color: theme.colorScheme.onSecondaryContainer,
                    ),
                  ),
                ),
              ),
            for (final entry in groups.entries) ...[
              Text(entry.key.toUpperCase(), style: theme.textTheme.labelSmall),
              const SizedBox(height: 6),
              for (final area in entry.value)
                Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(area.name, style: theme.textTheme.titleSmall),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: [
                          for (final level in _grid.scale)
                            ChoiceChip(
                              label: Text(level.label),
                              selected: _grades[area.id] == level.id,
                              tooltip: level.description,
                              // Tap the chosen grade again to clear it.
                              onSelected: editable
                                  ? (on) => setState(() {
                                      _grades[area.id] = on ? level.id : null;
                                      _dirty = true;
                                    })
                                  : null,
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 6),
            ],
            Text('REMARKS', style: theme.textTheme.labelSmall),
            const SizedBox(height: 6),
            TextField(
              controller: _remarks,
              enabled: editable,
              minLines: 3,
              maxLines: 6,
              maxLength: 1500,
              textCapitalization: TextCapitalization.sentences,
              // Rebuilt once, on the first keystroke, so Back starts asking.
              onChanged: (_) {
                if (!_dirty) setState(() => _dirty = true);
              },
              decoration: InputDecoration(
                hintText: 'A few words about ${child.firstName} this term',
              ),
            ),
          ],
        ),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(
              children: [
                if (_index > 0)
                  OutlinedButton(
                    onPressed: _saving
                        ? null
                        : () async {
                            if (!await _mayLeave()) return;
                            setState(() {
                              _index -= 1;
                              _take();
                            });
                          },
                    child: const Text('Previous'),
                  ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    onPressed: _saving
                        ? null
                        : editable
                        ? () => _save(next: true)
                        : last
                        ? () => Navigator.of(context).pop()
                        : () => setState(() {
                            _index += 1;
                            _take();
                          }),
                    child: Text(
                      _saving
                          ? 'Saving…'
                          : editable
                          ? (last ? 'Save and finish' : 'Save & next')
                          : (last ? 'Done' : 'Next'),
                    ),
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
