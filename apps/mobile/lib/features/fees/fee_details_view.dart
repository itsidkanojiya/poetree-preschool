import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/squish.dart';
import '../results/pdf_view.dart';
import 'fee_models.dart';
import 'fees_ui.dart';

/// One installment, opened.
class FeeDetailsController extends GetxController {
  FeeDetailsController({required this.invoiceId});

  final String invoiceId;

  final detail = Rxn<FeeInvoiceDetail>();
  final isLoading = true.obs;
  final error = RxnString();

  @override
  void onInit() {
    super.onInit();
    unawaited(load());
  }

  Future<void> load() async {
    isLoading.value = detail.value == null;
    error.value = null;
    try {
      final data = await api.get<Map<String, dynamic>>(
        '/fees/invoices/$invoiceId',
      );
      detail.value = FeeInvoiceDetail.fromJson(data);
    } on DioException catch (e) {
      final payload = e.response?.data;
      error.value = payload is Map && payload['error'] is Map
          ? (payload['error'] as Map)['message']?.toString() ??
                'Could not open this fee.'
          : 'Cannot reach the school right now.';
    } finally {
      isLoading.value = false;
    }
  }
}

/// Drawn to the designer's Fee Details: the installment and its status, what
/// it is for line by line, the invoice to download, and the payments recorded
/// against it. No Pay button: fees are paid at the school, and a receipt for
/// each payment shows here once it is recorded.
class FeeDetailsView extends GetView<FeeDetailsController> {
  const FeeDetailsView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: FeeBackdrop(
        child: SafeArea(
          bottom: false,
          child: Column(
            children: [
              const FeeHeader(title: 'Fee Details'),
              Expanded(
                child: Obx(() {
                  final detail = controller.detail.value;
                  return AsyncView(
                    isLoading: controller.isLoading.value,
                    error: controller.error.value,
                    isEmpty: detail == null,
                    onRetry: controller.load,
                    builder: (context) => RefreshIndicator(
                      onRefresh: controller.load,
                      child: _Body(detail: detail!),
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
  const _Body({required this.detail});

  final FeeInvoiceDetail detail;

  @override
  Widget build(BuildContext context) {
    final heading = Theme.of(context).textTheme.titleLarge?.copyWith(
      fontWeight: FontWeight.w800,
      color: FeeInk.ink,
    );
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
      children: [
        _TopCard(detail: detail),
        const SizedBox(height: 16),
        _AmountDetails(detail: detail),
        const SizedBox(height: 26),
        Text('Invoice', style: heading),
        const SizedBox(height: 12),
        _DownloadRow(detail: detail),
        const SizedBox(height: 26),
        Text('Payment History', style: heading),
        const SizedBox(height: 12),
        if (detail.payments.isEmpty)
          const _NoPayments()
        else
          for (final payment in detail.payments) ...[
            _PaymentRow(payment: payment),
            const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class _TopCard extends StatelessWidget {
  const _TopCard({required this.detail});

  final FeeInvoiceDetail detail;

  @override
  Widget build(BuildContext context) {
    final plan = detail.planName != null && detail.planPosition != null
        ? '${detail.planPosition} of ${detail.planCount} · ${detail.planName}'
        : null;
    return FeeCard(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFFFFF4EA), Color(0xFFF7EEFF)],
      ),
      child: Row(
        children: [
          const FeeIconTile(
            icon: 'fees',
            color: FeeInk.rose,
            soft: FeeInk.roseSoft,
            size: 58,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${detail.periodLabel} Fee',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: FeeInk.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  detail.invoiceNo,
                  style: const TextStyle(fontSize: 14, color: FeeInk.muted),
                ),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Due on ${feeDate(detail.dueDate)}',
                    style: const TextStyle(fontSize: 14, color: FeeInk.muted),
                  ),
                ),
                if (plan != null)
                  Text(
                    plan,
                    style: const TextStyle(fontSize: 12.5, color: FeeInk.muted),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // A long status — "Partially paid" — shrinks rather than pushing
          // the card off a narrow phone.
          Flexible(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: FeeStatusPill(detail.state, large: true),
            ),
          ),
        ],
      ),
    );
  }
}

class _AmountDetails extends StatelessWidget {
  const _AmountDetails({required this.detail});

  final FeeInvoiceDetail detail;

  @override
  Widget build(BuildContext context) {
    return FeeCard(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(left: 6),
            child: Text(
              'Amount Details',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: FeeInk.ink,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: FeeInk.line),
            ),
            child: Column(
              children: [
                for (final (index, line) in detail.lines.indexed) ...[
                  if (index > 0) const Divider(height: 1, color: FeeInk.line),
                  _Line(
                    label: line.description,
                    amount: rupees(line.amountInPaise),
                  ),
                  if (line.discountInPaise > 0)
                    _Line(
                      label: 'Discount',
                      amount: '− ${rupees(line.discountInPaise)}',
                      quiet: true,
                    ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Total Amount',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: FeeInk.ink,
                    ),
                  ),
                ),
                Text(
                  rupees(detail.netInPaise),
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: FeeInk.ink,
                  ),
                ),
              ],
            ),
          ),
          // What is left once something has been paid — never assumed.
          if (detail.paidInPaise > 0) ...[
            _Line(label: 'Paid', amount: rupees(detail.paidInPaise), inset: 8),
            _Line(
              label: 'Balance',
              amount: rupees(
                detail.outstandingInPaise < 0 ? 0 : detail.outstandingInPaise,
              ),
              inset: 8,
              strong: true,
            ),
          ],
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({
    required this.label,
    required this.amount,
    this.quiet = false,
    this.strong = false,
    this.inset = 0,
  });

  final String label;
  final String amount;
  final bool quiet;
  final bool strong;
  final double inset;

  @override
  Widget build(BuildContext context) {
    final color = quiet
        ? const Color(0xFF16A34A)
        : (strong ? FeeInk.ink : const Color(0xFF4A5180));
    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: inset,
        vertical: quiet ? 4 : 12,
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: quiet ? 13 : 15,
                color: color,
                fontWeight: strong ? FontWeight.w800 : FontWeight.w400,
              ),
            ),
          ),
          Text(
            amount,
            style: TextStyle(
              fontSize: quiet ? 13 : 15,
              fontWeight: FontWeight.w800,
              color: quiet ? color : FeeInk.ink,
            ),
          ),
        ],
      ),
    );
  }
}

class _DownloadRow extends StatelessWidget {
  const _DownloadRow({required this.detail});

  final FeeInvoiceDetail detail;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Download invoice as PDF',
      child: Squish(
        onTap: () => Get.to<void>(
          () => SchoolPdfView(
            title: 'Invoice ${detail.invoiceNo}',
            path: '/fees/invoices/${detail.id}/pdf',
            fileName: 'invoice-${detail.invoiceNo}.pdf',
          ),
        ),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: const Color(0xFFF4F7FF),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFFDCE4F8)),
          ),
          child: const Row(
            children: [
              FeeIconTile(
                icon: 'invoice',
                color: FeeInk.sky,
                soft: FeeInk.skySoft,
                size: 44,
              ),
              SizedBox(width: 16),
              Expanded(
                child: Text(
                  'Download Invoice (PDF)',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: FeeInk.ink,
                  ),
                ),
              ),
              FeeIcon('download', size: 24, color: FeeInk.sky),
            ],
          ),
        ),
      ),
    );
  }
}

class _PaymentRow extends StatelessWidget {
  const _PaymentRow({required this.payment});

  final FeePayment payment;

  @override
  Widget build(BuildContext context) {
    return FeeCard(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          FeeIconTile(
            icon: payment.refunded ? 'history' : 'check',
            color: payment.refunded ? FeeInk.muted : const Color(0xFF16A34A),
            soft: payment.refunded
                ? const Color(0xFFEDEFF5)
                : const Color(0xFFDCFCE7),
            size: 44,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  payment.receiptNo,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: FeeInk.ink,
                  ),
                ),
                Text(
                  [
                    feeDate(payment.paidOn),
                    payment.methodLabel,
                    if (payment.reference != null) payment.reference!,
                  ].join(' · '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5, color: FeeInk.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                rupees(payment.amountInPaise),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: FeeInk.ink,
                ),
              ),
              if (payment.refunded)
                const Text(
                  'Refunded',
                  style: TextStyle(fontSize: 12, color: FeeInk.muted),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// No payments yet: the designer's empty state.
class _NoPayments extends StatelessWidget {
  const _NoPayments();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 34),
      decoration: BoxDecoration(
        color: const Color(0xFFF1F4FD),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFE3E8F6)),
      ),
      child: Row(
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 72,
                height: 84,
                decoration: BoxDecoration(
                  color: const Color(0xFFDCE6FF),
                  borderRadius: BorderRadius.circular(14),
                ),
                alignment: Alignment.center,
                child: const FeeIcon(
                  'invoice',
                  size: 46,
                  color: Color(0xFF5B7BE8),
                ),
              ),
              Positioned(
                right: -14,
                bottom: -10,
                child: Container(
                  padding: const EdgeInsets.all(6),
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.search_rounded,
                    size: 30,
                    color: Color(0xFF2747C8),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 28),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'No payments yet',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: FeeInk.ink,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Your payment history will appear here after you make a payment.',
                  style: TextStyle(fontSize: 13.5, color: Color(0xFF4A5180)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
