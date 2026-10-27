import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';

import '../../core/api/api_service.dart';
import '../tracing_module/tracing_ui.dart';
import 'certificate_style.dart';
import 'certificates_view.dart';
import 'pdf_view.dart';
import 'results_models.dart';

/// One certificate: the school's own copy, drawn as it prints, with Print
/// and Share beneath it.
///
/// The picture is the certificate PDF the school generates — the child's
/// name, class, school, signatures and number exactly as on paper — drawn as
/// an image so it sits in a card. Tapping it opens the full page to zoom.
class CertificateDetailView extends StatefulWidget {
  const CertificateDetailView({
    required this.certificate,
    required this.childName,
    this.loadPdf,
    this.drawPage,
    this.printPdf,
    this.sharePdf,
    super.key,
  });

  final ChildCertificate certificate;

  /// The child's first name, for the words under the picture.
  final String childName;

  /// Where the PDF comes from; the API when null. A test hands in bytes.
  final Future<Uint8List> Function(String path)? loadPdf;

  /// Draws the PDF's first page as a PNG; the printing package when null.
  final Future<Uint8List> Function(Uint8List pdf)? drawPage;

  /// The printer and the share sheet; the printing package's when null.
  final Future<void> Function(Uint8List pdf, String name)? printPdf;
  final Future<void> Function(Uint8List pdf, String name)? sharePdf;

  @override
  State<CertificateDetailView> createState() => _CertificateDetailViewState();
}

class _CertificateDetailViewState extends State<CertificateDetailView> {
  Uint8List? _pdf;
  Uint8List? _picture;
  String? _error;
  bool _loading = true;

  String get _path => '/certificates/awards/${widget.certificate.awardId}/pdf';

  /// What the file is called when it is shared or saved: "Aarav Star of
  /// the Month.pdf", without the characters a phone refuses in a name.
  String get _fileName => '${widget.childName} ${widget.certificate.title}.pdf'
      .replaceAll(RegExp(r'[\\/:*?"<>|]'), '');

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
      final pdf = await (widget.loadPdf ?? api.bytes)(_path);
      final picture = await (widget.drawPage ?? _firstPage)(pdf);
      if (!mounted) return;
      setState(() {
        _pdf = pdf;
        _picture = picture;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _error = apiMessage(e, 'Could not open the certificate.'));
    } on Exception {
      if (!mounted) return;
      setState(() => _error = 'Could not draw the certificate. Try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// The first page, sharp enough for a phone held close.
  static Future<Uint8List> _firstPage(Uint8List pdf) async {
    await for (final page in Printing.raster(pdf, pages: const [0], dpi: 150)) {
      return page.toPng();
    }
    throw const FormatException('The certificate has no pages');
  }

  Future<void> _print() async {
    final pdf = _pdf;
    if (pdf == null) return;
    final printer =
        widget.printPdf ??
        (Uint8List bytes, String name) =>
            Printing.layoutPdf(onLayout: (_) async => bytes, name: name);
    await printer(pdf, _fileName);
  }

  Future<void> _share() async {
    final pdf = _pdf;
    if (pdf == null) return;
    final sharer =
        widget.sharePdf ??
        (Uint8List bytes, String name) =>
            Printing.sharePdf(bytes: bytes, filename: name);
    await sharer(pdf, _fileName);
  }

  void _openFullPage() {
    Get.to<void>(
      () => SchoolPdfView(
        title: widget.certificate.title,
        path: _path,
        fileName: _fileName,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ready = _pdf != null;
    return CertificatePage(
      title: widget.certificate.title,
      trailing: Opacity(
        opacity: ready ? 1 : 0.5,
        child: RoundButton(
          tooltip: 'Share',
          size: 48,
          onTap: _share,
          child: const CertificateIcon(CertificateArt.share, size: 22),
        ),
      ),
      child: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                CertificateCard(
                  padding: const EdgeInsets.all(12),
                  radius: 26,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _Preview(
                        picture: _picture,
                        loading: _loading,
                        error: _error,
                        kind: CertificateKind.of(widget.certificate.category),
                        onRetry: _load,
                        onOpen: ready ? _openFullPage : null,
                        label:
                            '${widget.certificate.title}, for '
                            '${widget.childName}',
                      ),
                      const SizedBox(height: 16),
                      _Details(
                        certificate: widget.certificate,
                        childName: widget.childName,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: CertificateCard(
                padding: const EdgeInsets.all(10),
                radius: 28,
                child: Row(
                  children: [
                    Expanded(
                      child: _ActionButton(
                        label: 'Print',
                        icon: CertificateArt.print,
                        background: CertificateInk.printWash,
                        foreground: CertificateInk.printInk,
                        onTap: ready ? _print : null,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _ActionButton(
                        label: 'Share',
                        icon: CertificateArt.share,
                        background: CertificateInk.share,
                        foreground: Colors.white,
                        onTap: ready ? _share : null,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The certificate as it prints, or a frame waiting for it.
class _Preview extends StatelessWidget {
  const _Preview({
    required this.picture,
    required this.loading,
    required this.error,
    required this.kind,
    required this.onRetry,
    required this.onOpen,
    required this.label,
  });

  final Uint8List? picture;
  final bool loading;
  final String? error;
  final CertificateKind kind;
  final Future<void> Function() onRetry;
  final VoidCallback? onOpen;
  final String label;

  @override
  Widget build(BuildContext context) {
    final picture = this.picture;
    if (picture != null) {
      return Semantics(
        image: true,
        button: onOpen != null,
        label: 'Certificate: $label. Tap to see it bigger.',
        child: GestureDetector(
          onTap: onOpen,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Image.memory(picture, fit: BoxFit.contain),
          ),
        ),
      );
    }

    // A landscape A4 page's shape, so nothing jumps when it arrives.
    return AspectRatio(
      aspectRatio: 841.89 / 595.28,
      child: Container(
        decoration: BoxDecoration(
          color: kind.wash,
          borderRadius: BorderRadius.circular(14),
        ),
        alignment: Alignment.center,
        child: loading
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CertificateThumb(kind: kind, width: 84),
                  const SizedBox(height: 14),
                  const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.5),
                  ),
                ],
              )
            : Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      error ?? 'Could not open the certificate.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: CertificateInk.navy,
                      ),
                    ),
                    const SizedBox(height: 10),
                    FilledButton(
                      onPressed: onRetry,
                      child: const Text('Try again'),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}

/// What the certificate says, in words: for whom, why, when, its number.
class _Details extends StatelessWidget {
  const _Details({required this.certificate, required this.childName});

  final ChildCertificate certificate;
  final String childName;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final kind = CertificateKind.of(certificate.category);
    final date = certificate.issuedOn == null
        ? null
        : DateFormat('d MMMM y').format(certificate.issuedOn!);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: kind.wash,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CertificateIcon(kind.icon, size: 16, colour: kind.colour),
                    const SizedBox(width: 6),
                    Text(
                      kind.label,
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: CertificateInk.navy,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            certificate.title,
            style: theme.textTheme.titleLarge?.copyWith(
              color: CertificateInk.navy,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Presented to $childName',
            style: theme.textTheme.bodyLarge?.copyWith(
              color: CertificateInk.navy,
            ),
          ),
          if (certificate.body.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              certificate.body,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: CertificateInk.quiet,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 16,
            runSpacing: 6,
            children: [
              if (date != null) _Fact(icon: Icons.event_rounded, text: date),
              if (certificate.number != null)
                _Fact(icon: Icons.tag_rounded, text: certificate.number!),
            ],
          ),
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 18, color: CertificateInk.quiet),
        const SizedBox(width: 6),
        Text(
          text,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: CertificateInk.quiet),
        ),
      ],
    );
  }
}

/// Print or Share: a tall rounded button with its icon.
class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.icon,
    required this.background,
    required this.foreground,
    required this.onTap,
  });

  final String label;
  final String icon;
  final Color background;
  final Color foreground;
  final Future<void> Function()? onTap;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      excludeSemantics: true,
      child: Opacity(
        opacity: enabled ? 1 : 0.5,
        child: Material(
          color: background,
          borderRadius: BorderRadius.circular(22),
          child: InkWell(
            borderRadius: BorderRadius.circular(22),
            onTap: onTap,
            child: SizedBox(
              height: 56,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CertificateIcon(icon, size: 22, colour: foreground),
                  const SizedBox(width: 10),
                  Text(
                    label,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: foreground,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
