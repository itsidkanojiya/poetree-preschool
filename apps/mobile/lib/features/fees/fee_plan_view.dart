import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import '../../core/widgets/squish.dart';
import 'fee_models.dart';
import 'fees_ui.dart';

/// Choosing how to pay a year's fees: the plans the school offers this
/// child, what each comes to, and a clear choice confirmed once.
///
/// Confirming bills the plan's installments — it pays nothing, and the money
/// still goes to the school. Once confirmed, only the office can change it,
/// which the confirmation says before anybody taps it.
class FeePlanView extends StatefulWidget {
  const FeePlanView({
    required this.studentId,
    required this.childName,
    required this.initial,
    super.key,
  });

  final String studentId;
  final String childName;
  final FeePlanChoice initial;

  @override
  State<FeePlanView> createState() => _FeePlanViewState();
}

class _FeePlanViewState extends State<FeePlanView> {
  late FeePlanChoice _choice = widget.initial;
  String? _selected;

  /// Confirming: the button stays down so a second tap sends nothing.
  bool _busy = false;
  String? _problem;

  FeePlanOption? get _option =>
      _choice.options.firstWhereOrNull((o) => o.id == _selected);

  Future<void> _confirm() async {
    final option = _option;
    if (option == null || _busy) return;

    final sure = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text('Pay by the ${option.name} plan?'),
        content: Text(
          '${_summary(option)} for ${widget.childName}’s ${_choice.academicYearName} fees. '
          'The installments are added to your fees now, to be paid at the school. '
          'Once confirmed, only the school office can change the plan.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Not now'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    if (!(sure ?? false) || !mounted) return;

    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      final data = await api.post<Map<String, dynamic>>(
        '/me/children/${widget.studentId}/fee-plan',
        body: {'academicYearId': _choice.academicYearId, 'planId': option.id},
      );
      _choice = FeePlanChoice.fromJson(data);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('${option.name} plan confirmed.')));
      Navigator.of(context).pop(true);
    } on DioException catch (e) {
      final payload = e.response?.data;
      setState(() {
        _problem = payload is Map && payload['error'] is Map
            ? (payload['error'] as Map)['message']?.toString()
            : 'Could not reach the school. Try again when you have signal.';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final choice = _choice;
    return Scaffold(
      body: FeeBackdrop(
        child: SafeArea(
          child: Column(
            children: [
              const FeeHeader(title: 'Installment Plan'),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
                  children: [
                    _YearSummary(choice: choice),
                    const SizedBox(height: 22),
                    Text(
                      'Choose how to pay',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: FeeInk.ink,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'The plans the school offers ${widget.childName}’s class${choice.academicYearName.isEmpty ? '' : ' for ${choice.academicYearName}'}.',
                      style: const TextStyle(
                        fontSize: 13.5,
                        color: FeeInk.muted,
                      ),
                    ),
                    const SizedBox(height: 14),
                    if (!choice.canChoose)
                      FeeCard(
                        child: Text(
                          choice.reason ?? 'There is nothing to choose here.',
                          style: const TextStyle(
                            fontSize: 14,
                            color: FeeInk.ink,
                          ),
                        ),
                      )
                    else
                      for (final option in choice.options) ...[
                        _OptionCard(
                          option: option,
                          selected: option.id == _selected,
                          onTap: () => setState(() => _selected = option.id),
                        ),
                        const SizedBox(height: 12),
                      ],
                    if (_problem != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        _problem!,
                        style: const TextStyle(
                          color: Color(0xFFDC2626),
                          fontSize: 13.5,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (choice.canChoose)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                  child: SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: FeeInk.violet,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(18),
                        ),
                      ),
                      onPressed: _selected == null || _busy
                          ? null
                          : () => unawaited(_confirm()),
                      child: _busy
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              _option == null
                                  ? 'Choose a plan'
                                  : 'Confirm ${_option!.name} plan',
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "₹3,000 × 4 installments", or the count when they differ.
String _summary(FeePlanOption option) {
  if (option.count == 1) {
    return 'One payment of ${rupees(option.installments.first.amountInPaise)}';
  }
  return option.even
      ? '${option.count} installments of ${rupees(option.installments.first.amountInPaise)}'
      : '${option.count} installments';
}

class _YearSummary extends StatelessWidget {
  const _YearSummary({required this.choice});

  final FeePlanChoice choice;

  @override
  Widget build(BuildContext context) {
    Widget cell(String label, int amount, Color color) => Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Shrinks rather than running into its neighbour on a narrow phone.
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                label,
                style: const TextStyle(fontSize: 12.5, color: FeeInk.muted),
              ),
            ),
          ),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              rupees(amount),
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );

    return FeeCard(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFFFFF4EA), Color(0xFFF4EEFF)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${choice.academicYearName} fees',
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: FeeInk.ink,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              cell('Total annual fee', choice.yearInPaise, FeeInk.ink),
              cell('Total paid', choice.paidInPaise, const Color(0xFF16A34A)),
              cell('Remaining', choice.remainingInPaise, FeeInk.rose),
            ],
          ),
        ],
      ),
    );
  }
}

class _OptionCard extends StatelessWidget {
  const _OptionCard({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  final FeePlanOption option;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: '${option.name}: ${_summary(option)}',
      child: Squish(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: selected ? const Color(0xFFF6F2FF) : Colors.white,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: selected ? FeeInk.violet : const Color(0xFFE6EAF4),
              width: selected ? 2 : 1,
            ),
            boxShadow: FeeInk.lift(),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: selected ? FeeInk.violet : Colors.white,
                      border: Border.all(
                        color: selected
                            ? FeeInk.violet
                            : const Color(0xFFC9D0E0),
                        width: 2,
                      ),
                    ),
                    child: selected
                        ? const Icon(Icons.check, size: 16, color: Colors.white)
                        : null,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          option.name,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            color: FeeInk.ink,
                          ),
                        ),
                        Text(
                          _summary(option),
                          style: const TextStyle(
                            fontSize: 13.5,
                            color: FeeInk.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  FeeIconTile(
                    icon: option.count == 1 ? 'payment' : 'installments',
                    color: FeeInk.violet,
                    soft: FeeInk.violetSoft,
                    size: 42,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // Every due date, so nothing about the plan is a surprise.
              for (final installment in option.installments)
                Padding(
                  padding: const EdgeInsets.only(left: 36, top: 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${installment.label} · due ${feeDate(installment.dueDate)}',
                          style: const TextStyle(
                            fontSize: 13,
                            color: Color(0xFF4A5180),
                          ),
                        ),
                      ),
                      Text(
                        rupees(installment.amountInPaise),
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: FeeInk.ink,
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
