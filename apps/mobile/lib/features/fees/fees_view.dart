import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/squish.dart';
import 'fee_details_view.dart';
import 'fee_models.dart';
import 'fee_plan_view.dart';
import 'fees_ui.dart';

/// A child's fees: what is billed, what is paid, and each installment.
class FeesController extends GetxController {
  FeesController({required this.studentId, required this.childName});

  final String studentId;
  final String childName;

  final account = Rxn<FeeAccount>();
  final choice = Rxn<FeePlanChoice>();
  final isLoading = true.obs;
  final error = RxnString();

  /// The year shown; null is every year.
  final yearId = RxnString();

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> load() async {
    isLoading.value = account.value == null;
    error.value = null;
    try {
      final data = await api.get<Map<String, dynamic>>(
        '/fees/students/$studentId/ledger',
      );
      account.value = FeeAccount.fromJson(data);
    } on DioException catch (e) {
      final payload = e.response?.data;
      error.value = payload is Map && payload['error'] is Map
          ? (payload['error'] as Map)['message']?.toString() ??
                'Could not load the fees.'
          : 'Cannot reach the school right now.';
    } finally {
      isLoading.value = false;
    }

    // The installment plans are extra: a school without a current year, or
    // without plans, still shows its fees.
    try {
      final data = await api.get<Map<String, dynamic>>(
        '/me/children/$studentId/fee-plan',
      );
      choice.value = FeePlanChoice.fromJson(data);
    } on DioException {
      choice.value = null;
    }
  }

  Future<void> openPlans() async {
    final current = choice.value;
    if (current == null) return;
    final chosen = await Get.to<bool>(
      () => FeePlanView(
        studentId: studentId,
        childName: childName,
        initial: current,
      ),
    );
    if (chosen ?? false) await load();
  }

  Future<void> openInstallment(String invoiceId) async {
    await openFeeDetails(invoiceId);
    // Back from it: anything paid meanwhile shows.
    await load();
  }
}

/// Opens one installment's details.
Future<void> openFeeDetails(String invoiceId) async {
  await Get.to<void>(
    () => const FeeDetailsView(),
    binding: BindingsBuilder(() {
      Get.put<FeeDetailsController>(FeeDetailsController(invoiceId: invoiceId));
    }),
    preventDuplicates: false,
  );
}

/// Opens a child's fees.
Future<void> openFees({
  required String studentId,
  required String childName,
  String? invoiceId,
}) async {
  final opened = Get.to<void>(
    () => const FeesView(),
    binding: BindingsBuilder(() {
      Get.put<FeesController>(
        FeesController(studentId: studentId, childName: childName),
      );
    }),
  );
  // From a reminder: the installment it was about opens on top.
  if (invoiceId != null) unawaited(openFeeDetails(invoiceId));
  await opened;
}

/// Drawn to the designer's Fees screen: the outstanding amount large, what
/// was billed and paid, then each installment along a timeline — with no
/// Pay button anywhere: fees are paid at the school.
class FeesView extends GetView<FeesController> {
  const FeesView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: FeeBackdrop(
        child: SafeArea(
          bottom: false,
          child: Column(
            children: [
              const FeeHeader(title: 'Fees'),
              Expanded(
                child: Obx(() {
                  final account = controller.account.value;
                  // Read here, where Obx sees them.
                  final yearId = controller.yearId.value;
                  final choice = controller.choice.value;
                  return AsyncView(
                    isLoading: controller.isLoading.value,
                    error: controller.error.value,
                    isEmpty: false,
                    onRetry: controller.load,
                    builder: (context) => RefreshIndicator(
                      onRefresh: controller.load,
                      child: _Body(
                        account: account ?? FeeAccount(entries: [], years: []),
                        yearId: yearId,
                        choice: choice,
                        controller: controller,
                      ),
                    ),
                  );
                }),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.account,
    required this.yearId,
    required this.choice,
    required this.controller,
  });

  final FeeAccount account;
  final String? yearId;
  final FeePlanChoice? choice;
  final FeesController controller;

  @override
  Widget build(BuildContext context) {
    final entries = account.live(yearId);
    final showPlan =
        choice != null &&
        (choice!.canChoose || choice!.currentPlanName != null) &&
        (yearId == null || yearId == choice!.academicYearId);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
      children: [
        _OutstandingCard(amount: account.outstanding(yearId)),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _SummaryCard(
                icon: 'payment',
                label: 'Total Billed',
                amount: account.billed(yearId),
                color: FeeInk.mint,
                soft: FeeInk.mintSoft,
                wash: const Color(0xFFF1FBF5),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _SummaryCard(
                icon: 'wallet',
                label: 'Total Paid',
                amount: account.paid(yearId),
                color: FeeInk.sky,
                soft: FeeInk.skySoft,
                wash: const Color(0xFFF3F7FF),
              ),
            ),
          ],
        ),
        if (showPlan) ...[
          const SizedBox(height: 14),
          _PlanCard(choice: choice!, onOpen: controller.openPlans),
        ],
        const SizedBox(height: 22),
        Row(
          children: [
            Expanded(
              child: Text(
                'Fee Installments',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: FeeInk.ink,
                ),
              ),
            ),
            _YearPicker(
              years: account.years,
              selected: yearId,
              onChanged: (id) => controller.yearId.value = id,
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (entries.isEmpty)
          const _NoFees()
        else
          for (final (index, entry) in entries.indexed)
            _TimelineRow(
              entry: entry,
              first: index == 0,
              last: index == entries.length - 1,
              onTap: () => unawaited(controller.openInstallment(entry.id)),
            ),
        const SizedBox(height: 22),
        const _StayOnTrack(),
      ],
    );
  }
}

class _OutstandingCard extends StatelessWidget {
  const _OutstandingCard({required this.amount});

  final int amount;

  @override
  Widget build(BuildContext context) {
    return FeeCard(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 22),
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFFFFF4EA), Color(0xFFFFEEF0)],
      ),
      child: Row(
        children: [
          const FeeIconTile(
            icon: 'fees',
            color: FeeInk.rose,
            soft: FeeInk.roseSoft,
            size: 70,
          ),
          const SizedBox(width: 20),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Outstanding Amount',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: FeeInk.ink,
                  ),
                ),
                const SizedBox(height: 2),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    rupees(amount),
                    style: const TextStyle(
                      fontSize: 36,
                      fontWeight: FontWeight.w800,
                      color: FeeInk.ink,
                      height: 1.15,
                    ),
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

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.icon,
    required this.label,
    required this.amount,
    required this.color,
    required this.soft,
    required this.wash,
  });

  final String icon;
  final String label;
  final int amount;
  final Color color;
  final Color soft;
  final Color wash;

  @override
  Widget build(BuildContext context) {
    return FeeCard(
      padding: const EdgeInsets.all(14),
      color: wash,
      child: Row(
        children: [
          FeeIconTile(icon: icon, color: color, soft: soft, size: 46),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, color: FeeInk.muted),
                ),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    rupees(amount),
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: FeeInk.ink,
                    ),
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

/// The year's installment plan: a way to choose one, or the one chosen.
class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.choice, required this.onOpen});

  final FeePlanChoice choice;
  final Future<void> Function() onOpen;

  @override
  Widget build(BuildContext context) {
    final chosen = choice.currentPlanName;
    return Semantics(
      button: chosen == null,
      child: Squish(
        onTap: chosen == null ? () => unawaited(onOpen()) : null,
        child: FeeCard(
          padding: const EdgeInsets.all(14),
          color: const Color(0xFFF6F2FF),
          child: Row(
            children: [
              const FeeIconTile(
                icon: 'installments',
                color: FeeInk.violet,
                soft: FeeInk.violetSoft,
                size: 46,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      chosen == null
                          ? 'Choose an installment plan'
                          : '$chosen installment plan',
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: FeeInk.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      chosen == null
                          ? 'Pay ${choice.academicYearName} fees at once or in parts — the school’s options'
                          : 'For ${choice.academicYearName}. To change it, please contact the school office.',
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: FeeInk.muted,
                      ),
                    ),
                  ],
                ),
              ),
              if (chosen == null)
                const _Chevron(color: FeeInk.violet)
              else
                const FeeIcon('check', size: 22, color: FeeInk.violet),
            ],
          ),
        ),
      ),
    );
  }
}

class _YearPicker extends StatelessWidget {
  const _YearPicker({
    required this.years,
    required this.selected,
    required this.onChanged,
  });

  final List<FeeYear> years;
  final String? selected;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final label = selected == null
        ? 'All Years'
        : years.firstWhereOrNull((y) => y.id == selected)?.name ?? 'All Years';
    return PopupMenuButton<String?>(
      tooltip: 'Academic year',
      onSelected: (id) => onChanged(id == '' ? null : id),
      itemBuilder: (_) => [
        const PopupMenuItem(value: '', child: Text('All Years')),
        for (final year in years)
          PopupMenuItem(value: year.id, child: Text(year.name)),
      ],
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(99),
          border: Border.all(color: const Color(0xFFD9E2FA)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Color(0xFF2747C8),
              ),
            ),
            const SizedBox(width: 6),
            const Icon(
              Icons.keyboard_arrow_down_rounded,
              size: 20,
              color: Color(0xFF2747C8),
            ),
          ],
        ),
      ),
    );
  }
}

/// One installment on the timeline: a dot on the line, and its card.
class _TimelineRow extends StatelessWidget {
  const _TimelineRow({
    required this.entry,
    required this.first,
    required this.last,
    required this.onTap,
  });

  final FeeEntry entry;
  final bool first;
  final bool last;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final pressing =
        entry.state.pressing || entry.state == InstallmentState.partial;
    final paid = entry.state == InstallmentState.paid;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 30,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Positioned(
                  top: first ? 40 : 0,
                  bottom: last ? null : 0,
                  height: last ? 40 : null,
                  child: Container(width: 2, color: const Color(0xFFDDE3F0)),
                ),
                if (paid)
                  Container(
                    width: 20,
                    height: 20,
                    decoration: const BoxDecoration(
                      color: Color(0xFF16A34A),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.check,
                      size: 13,
                      color: Colors.white,
                    ),
                  )
                else
                  Container(
                    width: pressing ? 20 : 16,
                    height: pressing ? 20 : 16,
                    decoration: BoxDecoration(
                      color: pressing ? FeeInk.rose : Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: pressing
                            ? const Color(0xFFFFD0D8)
                            : const Color(0xFFC9D0E0),
                        width: pressing ? 4 : 2.5,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Semantics(
                button: true,
                label:
                    '${entry.periodLabel}, ${rupees(entry.netInPaise)}, ${FeeStatusPill.labelFor(entry.state)}',
                child: Squish(
                  onTap: onTap,
                  child: FeeCard(
                    padding: const EdgeInsets.fromLTRB(18, 14, 10, 14),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                entry.periodLabel,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                  color: FeeInk.ink,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                pressing
                                    ? '${entry.invoiceNo} • due ${feeDate(entry.dueDate)}'
                                    : 'Due ${feeDate(entry.dueDate)}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: FeeInk.muted,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              rupees(entry.netInPaise),
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: FeeInk.ink,
                              ),
                            ),
                            const SizedBox(height: 4),
                            FeeStatusPill(entry.state),
                          ],
                        ),
                        const SizedBox(width: 6),
                        const Icon(
                          Icons.chevron_right_rounded,
                          color: Color(0xFF5B7BD8),
                          size: 26,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Chevron extends StatelessWidget {
  const _Chevron({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 30,
      height: 30,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.85),
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: const FeeIcon('chevron_right', size: 18, color: Colors.white),
    );
  }
}

class _NoFees extends StatelessWidget {
  const _NoFees();

  @override
  Widget build(BuildContext context) {
    return const FeeCard(
      child: Row(
        children: [
          FeeIconTile(icon: 'invoice', color: FeeInk.sky, soft: FeeInk.skySoft),
          SizedBox(width: 14),
          Expanded(
            child: Text(
              'No fees billed yet. They will appear here once the school issues them.',
              style: TextStyle(fontSize: 13.5, color: FeeInk.muted),
            ),
          ),
        ],
      ),
    );
  }
}

/// "Stay on Track!" — the friendly note at the foot of the page.
class _StayOnTrack extends StatelessWidget {
  const _StayOnTrack();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 150,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFE2F1FF), Color(0xFFEFF7FF)],
        ),
        boxShadow: FeeInk.lift(),
      ),
      clipBehavior: Clip.antiAlias,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Image.asset(
                'assets/images/characters/waving_kid.png',
                height: 150,
                fit: BoxFit.contain,
              ),
              // A coin — what the child is saving for.
              const Positioned(right: 4, top: 26, child: _Coin()),
            ],
          ),
          const Expanded(
            child: Padding(
              padding: EdgeInsets.fromLTRB(6, 0, 16, 0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Stay on Track!',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: FeeInk.ink,
                    ),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'Pay your fees on time to ensure uninterrupted learning.',
                    style: TextStyle(fontSize: 13.5, color: Color(0xFF2747C8)),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Coin extends StatelessWidget {
  const _Coin();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 30,
      height: 30,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const LinearGradient(
          colors: [Color(0xFFFFD45C), Color(0xFFF5A623)],
        ),
        border: Border.all(color: const Color(0xFFFFE9A8), width: 2),
      ),
      alignment: Alignment.center,
      child: const Text(
        '₹',
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w800,
          fontSize: 15,
        ),
      ),
    );
  }
}
