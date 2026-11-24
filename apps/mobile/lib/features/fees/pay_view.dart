import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api/api_service.dart';
import 'fee_models.dart';
import 'fees_ui.dart';

/// Picks a screenshot and returns its path, or null when the parent backs out.
/// Swapped in tests, where there is no camera or gallery.
typedef PickScreenshot = Future<String?> Function(ImageSource source);

Future<String?> _pickWithImagePicker(ImageSource source) async {
  final picked = await ImagePicker().pickImage(
    source: source,
    maxWidth: 2000,
    imageQuality: 85,
  );
  return picked?.path;
}

/// Paying the school by UPI or bank transfer, in two steps.
///
/// The money moves outside the app — in the family's own UPI or bank app — so
/// step one shows where to send it, with each detail a tap to copy. Step two
/// sends the school a screenshot of the payment. Nothing is marked paid here:
/// the school checks the screenshot and approves it, and the receipt arrives
/// then.
///
/// The amount is never typed. It is what is owed, so a slip of the thumb cannot
/// send the school a proof for the wrong sum.
class PayView extends StatefulWidget {
  const PayView({
    required this.studentId,
    required this.info,
    required this.title,
    required this.amountInPaise,
    this.invoiceId,
    this.pickImage = _pickWithImagePicker,
    super.key,
  });

  final String studentId;
  final FeePaymentInfo info;

  /// "Q2", or "Full year".
  final String title;
  final int amountInPaise;

  /// The installment paid; null when paying the whole year.
  final String? invoiceId;
  final PickScreenshot pickImage;

  @override
  State<PayView> createState() => _PayViewState();
}

class _PayViewState extends State<PayView> {
  late String _method = widget.info.upiId != null ? 'UPI' : 'BANK_TRANSFER';
  final _reference = TextEditingController();
  String? _photo;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _reference.dispose();
    super.dispose();
  }

  Future<void> _pick(ImageSource source) async {
    final path = await widget.pickImage(source);
    if (path != null && mounted) setState(() => _photo = path);
  }

  Future<void> _send() async {
    final photo = _photo;
    if (photo == null || _sending) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      // The picture first: a proof the school cannot see is no proof.
      final uploaded = await api.upload<Map<String, dynamic>>('/files', photo);
      await api.post<dynamic>(
        '/me/children/${widget.studentId}/fee-payment-proofs',
        body: {
          'kind': widget.invoiceId == null ? 'PAY_IN_FULL' : 'INSTALLMENT',
          'invoiceId': ?widget.invoiceId,
          'method': _method,
          if (_reference.text.trim().isNotEmpty)
            'reference': _reference.text.trim(),
          'screenshotFileId': uploaded['id'],
        },
      );
      if (!mounted) return;
      // Said on the way back, where it stays while the Fees screen reloads.
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Sent to the school. They will check it and send your receipt.',
          ),
        ),
      );
      Navigator.of(context).pop(true);
    } on DioException catch (e) {
      final payload = e.response?.data;
      setState(() {
        _sending = false;
        _error = payload is Map && payload['error'] is Map
            ? (payload['error'] as Map)['message']?.toString() ??
                  'Could not send it.'
            : 'Could not reach the school. Try again when you have signal.';
      });
    } on FileSystemException {
      setState(() {
        _sending = false;
        _error = 'Could not read that picture. Choose it again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final info = widget.info;
    final both = info.upiId != null && info.bank != null;

    return Scaffold(
      body: FeeBackdrop(
        child: SafeArea(
          bottom: false,
          child: Column(
            children: [
              FeeHeader(title: widget.title),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
                  children: [
                    const _Step(number: 1, of: 2),
                    Text(
                      'Pay ${rupees(widget.amountInPaise)} to the school',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: FeeInk.ink,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Use your UPI or bank app, then come back here.',
                      style: TextStyle(fontSize: 13.5, color: FeeInk.muted),
                    ),
                    const SizedBox(height: 12),
                    if (info.upiId != null)
                      _PayTo(
                        title: 'UPI',
                        selected: _method == 'UPI',
                        onSelect: both
                            ? () => setState(() => _method = 'UPI')
                            : null,
                        rows: [
                          ('UPI ID', info.upiId!),
                          if (info.upiName != null) ('Name', info.upiName!),
                        ],
                      ),
                    if (both) const SizedBox(height: 10),
                    if (info.bank != null)
                      _PayTo(
                        title: 'Bank transfer',
                        selected: _method == 'BANK_TRANSFER',
                        onSelect: both
                            ? () => setState(() => _method = 'BANK_TRANSFER')
                            : null,
                        rows: [
                          if (info.bank!.accountName != null)
                            ('Account name', info.bank!.accountName!),
                          ('Account no.', info.bank!.accountNo),
                          ('IFSC', info.bank!.ifsc),
                          if (info.bank!.bankName != null)
                            ('Bank', info.bank!.bankName!),
                        ],
                      ),
                    const SizedBox(height: 22),
                    const _Step(number: 2, of: 2),
                    Text(
                      'Send the school a screenshot',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: FeeInk.ink,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        OutlinedButton.icon(
                          onPressed: _sending
                              ? null
                              : () => unawaited(_pick(ImageSource.camera)),
                          icon: const Icon(Icons.photo_camera_outlined),
                          label: const Text('Take photo'),
                        ),
                        OutlinedButton.icon(
                          onPressed: _sending
                              ? null
                              : () => unawaited(_pick(ImageSource.gallery)),
                          icon: const Icon(Icons.photo_library_outlined),
                          label: const Text('Choose from gallery'),
                        ),
                      ],
                    ),
                    if (_photo != null) ...[
                      const SizedBox(height: 12),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Image.file(
                          File(_photo!),
                          height: 220,
                          fit: BoxFit.contain,
                          semanticLabel: 'The screenshot you chose',
                          errorBuilder: (_, _, _) => const SizedBox(
                            height: 60,
                            child: Center(child: Text('Screenshot chosen')),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 14),
                    TextField(
                      controller: _reference,
                      maxLength: 80,
                      decoration: const InputDecoration(
                        labelText: 'Reference / UTR (optional)',
                        helperText: 'The number your bank or UPI app shows',
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(),
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        _error!,
                        style: const TextStyle(
                          color: FeeInk.rose,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                    const SizedBox(height: 14),
                    SizedBox(
                      height: 54,
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: FeeInk.violet,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(18),
                          ),
                        ),
                        onPressed: _photo == null || _sending
                            ? null
                            : () => unawaited(_send()),
                        child: Text(_sending ? 'Sending…' : 'Send to school'),
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

class _Step extends StatelessWidget {
  const _Step({required this.number, required this.of});

  final int number;
  final int of;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text(
        'Step $number of $of',
        style: const TextStyle(
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
          color: FeeInk.violet,
        ),
      ),
    );
  }
}

/// One way to pay, each detail with a Copy button.
class _PayTo extends StatelessWidget {
  const _PayTo({
    required this.title,
    required this.rows,
    required this.selected,
    this.onSelect,
  });

  final String title;
  final List<(String, String)> rows;
  final bool selected;

  /// Null when it is the only way: nothing to choose between.
  final VoidCallback? onSelect;

  @override
  Widget build(BuildContext context) {
    return FeeCard(
      padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: onSelect,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 44),
              child: Row(
                children: [
                  if (onSelect != null)
                    Icon(
                      selected
                          ? Icons.radio_button_checked
                          : Icons.radio_button_unchecked,
                      color: FeeInk.violet,
                      size: 22,
                    ),
                  if (onSelect != null) const SizedBox(width: 8),
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: FeeInk.ink,
                    ),
                  ),
                ],
              ),
            ),
          ),
          for (final (label, value) in rows)
            Row(
              children: [
                SizedBox(
                  width: 96,
                  child: Text(
                    label,
                    style: const TextStyle(fontSize: 13, color: FeeInk.muted),
                  ),
                ),
                Expanded(
                  child: SelectableText(
                    value,
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                      color: FeeInk.ink,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Copy $label',
                  icon: const Icon(Icons.copy_rounded, size: 20),
                  onPressed: () {
                    unawaited(Clipboard.setData(ClipboardData(text: value)));
                    ScaffoldMessenger.of(
                      context,
                    ).showSnackBar(SnackBar(content: Text('$label copied')));
                  },
                ),
              ],
            ),
        ],
      ),
    );
  }
}
