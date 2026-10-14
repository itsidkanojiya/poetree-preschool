/// Fees as the parent app reads them: the child's installments, one
/// installment opened, and the installment plans the school offers.
///
/// Money is integer paise, as the server sends it. Every status here is the
/// server's — worked out from what has been paid — never the phone's guess.
library;

/// Where an installment stands.
enum InstallmentState {
  paid('Paid'),
  partial('Partially paid'),
  overdue('Overdue'),
  dueToday('Due today'),
  dueSoon('Due soon'),
  upcoming('Upcoming'),
  cancelled('Cancelled');

  const InstallmentState(this.label);
  final String label;

  static InstallmentState fromWire(String? value) => switch (value) {
    'PAID' => paid,
    'PARTIAL' => partial,
    'OVERDUE' => overdue,
    'DUE_TODAY' => dueToday,
    'DUE_SOON' => dueSoon,
    'CANCELLED' => cancelled,
    _ => upcoming,
  };

  /// Still something to pay, and soon or already late.
  bool get pressing => this == overdue || this == dueToday || this == dueSoon;
}

int _int(Object? value) => (value as num?)?.toInt() ?? 0;

DateTime _date(Object? value) =>
    DateTime.tryParse(value as String? ?? '') ?? DateTime(1970);

/// One installment, as the fee list shows it.
class FeeEntry {
  FeeEntry({
    required this.id,
    required this.invoiceNo,
    required this.periodLabel,
    required this.academicYearId,
    required this.academicYearName,
    required this.dueDate,
    required this.netInPaise,
    required this.paidInPaise,
    required this.outstandingInPaise,
    required this.state,
  });

  factory FeeEntry.fromJson(Map<String, dynamic> json) => FeeEntry(
    id: json['id'] as String? ?? '',
    invoiceNo: json['invoiceNo'] as String? ?? '',
    periodLabel: json['periodLabel'] as String? ?? '',
    academicYearId: json['academicYearId'] as String? ?? '',
    academicYearName: json['academicYearName'] as String? ?? '',
    dueDate: _date(json['dueDate']),
    netInPaise: _int(json['netInPaise']),
    paidInPaise: _int(json['paidInPaise']),
    outstandingInPaise: _int(json['outstandingInPaise']),
    state: InstallmentState.fromWire(json['state'] as String?),
  );

  final String id;
  final String invoiceNo;
  final String periodLabel;
  final String academicYearId;
  final String academicYearName;
  final DateTime dueDate;
  final int netInPaise;
  final int paidInPaise;
  final int outstandingInPaise;
  final InstallmentState state;
}

class FeeYear {
  FeeYear({required this.id, required this.name, required this.isCurrent});

  factory FeeYear.fromJson(Map<String, dynamic> json) => FeeYear(
    id: json['id'] as String,
    name: json['name'] as String? ?? '',
    isCurrent: json['isCurrent'] as bool? ?? false,
  );

  final String id;
  final String name;
  final bool isCurrent;
}

/// Everything billed to a child, every year.
class FeeAccount {
  FeeAccount({required this.entries, required this.years});

  factory FeeAccount.fromJson(Map<String, dynamic> json) => FeeAccount(
    entries: (json['invoices'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(FeeEntry.fromJson)
        .toList(),
    years: (json['years'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(FeeYear.fromJson)
        .toList(),
  );

  final List<FeeEntry> entries;
  final List<FeeYear> years;

  /// The installments of one year, or all of them; cancelled ones are left
  /// out — they were withdrawn, and are not owed.
  List<FeeEntry> live(String? yearId) => entries
      .where(
        (e) =>
            e.state != InstallmentState.cancelled &&
            (yearId == null || e.academicYearId == yearId),
      )
      .toList();

  int billed(String? yearId) =>
      live(yearId).fold(0, (sum, e) => sum + e.netInPaise);
  int paid(String? yearId) =>
      live(yearId).fold(0, (sum, e) => sum + e.paidInPaise);
  int outstanding(String? yearId) =>
      live(yearId).fold(0, (sum, e) => sum + e.outstandingInPaise);
}

/// One installment opened: its lines and the money recorded against it.
class FeeInvoiceDetail {
  FeeInvoiceDetail({
    required this.id,
    required this.invoiceNo,
    required this.periodLabel,
    required this.academicYearName,
    required this.dueDate,
    required this.state,
    required this.grossInPaise,
    required this.discountInPaise,
    required this.netInPaise,
    required this.paidInPaise,
    required this.outstandingInPaise,
    required this.lines,
    required this.payments,
    this.planName,
    this.planPosition,
    this.planCount,
  });

  factory FeeInvoiceDetail.fromJson(Map<String, dynamic> json) {
    final plan = json['plan'] as Map<String, dynamic>?;
    return FeeInvoiceDetail(
      id: json['id'] as String,
      invoiceNo: json['invoiceNo'] as String? ?? '',
      periodLabel: json['periodLabel'] as String? ?? '',
      academicYearName: json['academicYearName'] as String? ?? '',
      dueDate: _date(json['dueDate']),
      state: InstallmentState.fromWire(json['state'] as String?),
      grossInPaise: _int(json['grossInPaise']),
      discountInPaise: _int(json['discountInPaise']),
      netInPaise: _int(json['netInPaise']),
      paidInPaise: _int(json['paidInPaise']),
      outstandingInPaise: _int(json['outstandingInPaise']),
      lines: (json['lines'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(
            (line) => FeeLine(
              description: line['description'] as String? ?? '',
              amountInPaise: _int(line['amountInPaise']),
              discountInPaise: _int(line['discountInPaise']),
            ),
          )
          .toList(),
      payments: (json['payments'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(
            (p) => FeePayment(
              receiptNo: p['receiptNo'] as String? ?? '',
              paidOn: _date(p['paidOn']),
              method: p['method'] as String? ?? '',
              reference: p['reference'] as String?,
              amountInPaise: _int(p['amountInPaise']),
              refunded: p['status'] == 'REFUNDED',
            ),
          )
          .toList(),
      planName: plan?['name'] as String?,
      planPosition: (plan?['position'] as num?)?.toInt(),
      planCount: (plan?['count'] as num?)?.toInt(),
    );
  }

  final String id;
  final String invoiceNo;
  final String periodLabel;
  final String academicYearName;
  final DateTime dueDate;
  final InstallmentState state;
  final int grossInPaise;
  final int discountInPaise;
  final int netInPaise;
  final int paidInPaise;
  final int outstandingInPaise;
  final List<FeeLine> lines;
  final List<FeePayment> payments;
  final String? planName;
  final int? planPosition;
  final int? planCount;
}

class FeeLine {
  FeeLine({
    required this.description,
    required this.amountInPaise,
    required this.discountInPaise,
  });

  final String description;
  final int amountInPaise;
  final int discountInPaise;
}

class FeePayment {
  FeePayment({
    required this.receiptNo,
    required this.paidOn,
    required this.method,
    required this.amountInPaise,
    required this.refunded,
    this.reference,
  });

  final String receiptNo;
  final DateTime paidOn;
  final String method;
  final String? reference;
  final int amountInPaise;
  final bool refunded;

  String get methodLabel => switch (method) {
    'CASH' => 'Cash',
    'CHEQUE' => 'Cheque',
    'BANK_TRANSFER' => 'Bank transfer',
    'UPI' => 'UPI',
    'CARD' => 'Card',
    'ONLINE' => 'Online',
    _ => method,
  };
}

/// A plan the school offers this child, priced for them.
class FeePlanOption {
  FeePlanOption({
    required this.id,
    required this.name,
    required this.installments,
  });

  factory FeePlanOption.fromJson(Map<String, dynamic> json) => FeePlanOption(
    id: json['id'] as String,
    name: json['name'] as String? ?? '',
    installments: (json['installments'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(
          (i) => PlanInstallment(
            label: i['label'] as String? ?? '',
            dueDate: _date(i['dueDate']),
            amountInPaise: _int(i['amountInPaise']),
          ),
        )
        .toList(),
  );

  final String id;
  final String name;
  final List<PlanInstallment> installments;

  int get count => installments.length;

  /// Every installment the same amount — the usual case — or not.
  bool get even => installments.map((i) => i.amountInPaise).toSet().length <= 1;
}

class PlanInstallment {
  PlanInstallment({
    required this.label,
    required this.dueDate,
    required this.amountInPaise,
  });

  final String label;
  final DateTime dueDate;
  final int amountInPaise;
}

/// What this child's family may choose this year, and what it has chosen.
class FeePlanChoice {
  FeePlanChoice({
    required this.academicYearId,
    required this.academicYearName,
    required this.yearInPaise,
    required this.paidInPaise,
    required this.remainingInPaise,
    required this.canChoose,
    required this.options,
    this.currentPlanId,
    this.currentPlanName,
    this.reason,
  });

  factory FeePlanChoice.fromJson(Map<String, dynamic> json) {
    final current = json['current'] as Map<String, dynamic>?;
    return FeePlanChoice(
      academicYearId: json['academicYearId'] as String? ?? '',
      academicYearName: json['academicYearName'] as String? ?? '',
      yearInPaise: _int(json['yearInPaise']),
      paidInPaise: _int(json['paidInPaise']),
      remainingInPaise: _int(json['remainingInPaise']),
      canChoose: json['canChoose'] as bool? ?? false,
      reason: json['reason'] as String?,
      currentPlanId: current?['planId'] as String?,
      currentPlanName: current?['planName'] as String?,
      options: (json['options'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(FeePlanOption.fromJson)
          .toList(),
    );
  }

  final String academicYearId;
  final String academicYearName;
  final int yearInPaise;
  final int paidInPaise;
  final int remainingInPaise;
  final bool canChoose;
  final String? reason;
  final String? currentPlanId;
  final String? currentPlanName;
  final List<FeePlanOption> options;
}

/// "₹12,000", or "₹3,333.34" when there are paise — Indian grouping.
String rupees(int paise) {
  final negative = paise < 0;
  final whole = paise.abs() ~/ 100;
  final fraction = paise.abs() % 100;
  final digits = whole.toString();
  String grouped;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    final last3 = digits.substring(digits.length - 3);
    var rest = digits.substring(0, digits.length - 3);
    final parts = <String>[];
    while (rest.length > 2) {
      parts.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    if (rest.isNotEmpty) parts.insert(0, rest);
    grouped = '${parts.join(',')},$last3';
  }
  final cents = fraction == 0 ? '' : '.${fraction.toString().padLeft(2, '0')}';
  return '${negative ? '-' : ''}₹$grouped$cents';
}
