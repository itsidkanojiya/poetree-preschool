import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/async_view.dart';
import 'pdf_view.dart';
import 'results_models.dart';

/// A child's report cards, one per term, as the school published them.
class ReportCardsController extends GetxController {
  ReportCardsController({required this.studentId, required this.childName});

  final String studentId;
  final String childName;

  final cards = <ReportCardListItem>[].obs;
  final isLoading = true.obs;
  final error = RxnString();

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
        '/me/children/$studentId/report-cards',
      );
      cards.value = data
          .whereType<Map<String, dynamic>>()
          .map(ReportCardListItem.fromJson)
          .toList();
    } on DioException catch (e) {
      error.value = apiMessage(e, 'Could not load the report cards.');
    } finally {
      isLoading.value = false;
    }
  }
}

class ReportCardsView extends GetView<ReportCardsController> {
  const ReportCardsView({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Report cards')),
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.cards.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'No report cards yet',
          emptyMessage:
              '${controller.childName}’s report card appears here when the school sends it at the end of a term.',
          builder: (context) => RefreshIndicator(
            onRefresh: controller.load,
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              itemCount: controller.cards.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final card = controller.cards[index];
                return Card(
                  margin: EdgeInsets.zero,
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 6,
                    ),
                    leading: Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: theme.brightness == Brightness.dark
                            ? AppTheme.sky.withValues(alpha: 0.18)
                            : AppTheme.skySoft,
                        borderRadius: BorderRadius.circular(13),
                      ),
                      child: const Icon(
                        Icons.assignment_rounded,
                        color: AppTheme.sky,
                      ),
                    ),
                    title: Text(card.term, style: theme.textTheme.titleSmall),
                    subtitle: Text(
                      [
                        card.academicYear,
                        if (card.publishedAt != null)
                          'sent ${DateFormat('d MMM').format(card.publishedAt!.toLocal())}',
                      ].where((s) => s.isNotEmpty).join(' · '),
                    ),
                    trailing: const Icon(Icons.chevron_right_rounded),
                    onTap: () => Get.to<void>(
                      () => ReportCardDetailView(
                        studentId: controller.studentId,
                        item: card,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

/// One report card, drawn on the phone rather than as a picture of paper: the
/// grades are readable at arm's length, and the PDF is a tap away for printing.
class ReportCardDetailView extends StatefulWidget {
  const ReportCardDetailView({
    required this.studentId,
    required this.item,
    super.key,
  });

  final String studentId;
  final ReportCardListItem item;

  @override
  State<ReportCardDetailView> createState() => _ReportCardDetailViewState();
}

class _ReportCardDetailViewState extends State<ReportCardDetailView> {
  ReportCard? _card;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await api.get<Map<String, dynamic>>(
        '/me/children/${widget.studentId}/report-cards/${widget.item.termId}',
      );
      if (!mounted) return;
      setState(() => _card = ReportCard.fromJson(data));
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _error = apiMessage(e, 'Could not load the report card.'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openPdf() {
    final card = _card!;
    Get.to<void>(
      () => SchoolPdfView(
        title: '${card.term} report card',
        path: '/results/report-cards/${card.id}/pdf',
        fileName: '${card.childName} ${card.term} report card.pdf'.replaceAll(
          RegExp(r'[\\/:*?"<>|]'),
          '',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.item.term)),
      body: AsyncView(
        isLoading: _loading,
        error: _error,
        isEmpty: false,
        onRetry: _load,
        builder: (context) =>
            ReportCardBody(card: _card!, onDownload: _openPdf),
      ),
    );
  }
}

/// The card itself. Separate from the page so a preview test can draw it
/// without the network.
class ReportCardBody extends StatelessWidget {
  const ReportCardBody({
    required this.card,
    required this.onDownload,
    super.key,
  });

  final ReportCard card;
  final VoidCallback onDownload;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: colors.primaryContainer,
            borderRadius: BorderRadius.circular(22),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${card.term} · ${card.academicYear}'.toUpperCase(),
                style: theme.textTheme.labelSmall?.copyWith(
                  color: colors.onPrimaryContainer.withValues(alpha: 0.75),
                  letterSpacing: 0.8,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                card.childName,
                style: theme.textTheme.headlineSmall?.copyWith(
                  color: colors.onPrimaryContainer,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                [
                  card.classroom,
                  if (card.rollNo != null) 'Roll ${card.rollNo}',
                ].where((s) => s.isNotEmpty).join(' · '),
                style: TextStyle(
                  color: colors.onPrimaryContainer.withValues(alpha: 0.85),
                ),
              ),
            ],
          ),
        ),

        for (final group in card.groups) ...[
          const SizedBox(height: 20),
          Text(group.group.toUpperCase(), style: theme.textTheme.labelSmall),
          const SizedBox(height: 6),
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Column(
                children: [
                  for (final (index, row) in group.rows.indexed) ...[
                    if (index > 0)
                      Divider(height: 1, color: colors.outlineVariant),
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 11),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              row.area,
                              style: theme.textTheme.bodyMedium,
                            ),
                          ),
                          const SizedBox(width: 10),
                          GradePill(
                            grade: row.grade,
                            standing: card.standing(row.grade),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],

        if (card.remarks != null && card.remarks!.trim().isNotEmpty) ...[
          const SizedBox(height: 20),
          Text('FROM THE CLASS TEACHER', style: theme.textTheme.labelSmall),
          const SizedBox(height: 6),
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.format_quote_rounded, color: colors.primary),
                  const SizedBox(height: 4),
                  Text(
                    card.remarks!,
                    style: theme.textTheme.bodyLarge?.copyWith(height: 1.45),
                  ),
                  if (card.classTeacher != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      '— ${card.classTeacher}',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],

        if (card.scale.isNotEmpty) ...[
          const SizedBox(height: 20),
          Text('WHAT THE GRADES MEAN', style: theme.textTheme.labelSmall),
          const SizedBox(height: 8),
          for (final (index, key) in card.scale.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  GradePill(
                    grade: key.label,
                    standing: card.scale.length <= 1
                        ? 0
                        : index / (card.scale.length - 1),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      key.description ?? '',
                      style: theme.textTheme.bodySmall,
                    ),
                  ),
                ],
              ),
            ),
        ],

        if (card.principal != null || card.classTeacher != null) ...[
          const SizedBox(height: 12),
          Text(
            [
              if (card.classTeacher != null)
                'Class teacher: ${card.classTeacher}',
              if (card.principal != null) 'Principal: ${card.principal}',
            ].join('   ·   '),
            style: theme.textTheme.bodySmall,
          ),
        ],

        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: onDownload,
          icon: const Icon(Icons.picture_as_pdf_rounded),
          label: const Text('Open the printable copy'),
        ),
      ],
    );
  }
}

/// A grade, coloured by where it sits on the school's scale: the best green,
/// the middle blue, the last amber — never red, which says "failed" to a
/// parent of a four-year-old.
class GradePill extends StatelessWidget {
  const GradePill({required this.grade, required this.standing, super.key});

  final String? grade;

  /// 0 for the best grade on the scale, 1 for the last.
  final double? standing;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final colors = Theme.of(context).colorScheme;
    // The ink is a step darker than the tone on paper: apricot on its own
    // soft tint is too faint to read in sunlight.
    final (tone, soft, ink) = switch (standing) {
      null => (colors.outline, colors.surfaceContainerHighest, colors.outline),
      < 0.34 => (AppTheme.leaf, AppTheme.leafSoft, const Color(0xFF1F6E4C)),
      < 0.67 => (AppTheme.sky, AppTheme.skySoft, const Color(0xFF256E96)),
      _ => (AppTheme.apricot, AppTheme.apricotSoft, const Color(0xFF8F5A12)),
    };

    return Container(
      constraints: const BoxConstraints(minWidth: 44),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: isDark ? tone.withValues(alpha: 0.2) : soft,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        grade ?? '—',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 13,
          color: isDark ? tone : ink,
        ),
      ),
    );
  }
}
