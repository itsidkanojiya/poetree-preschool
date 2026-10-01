import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:printing/printing.dart';

import '../../core/api/api_service.dart';
import '../../core/widgets/async_view.dart';
import 'results_models.dart';

/// A PDF the school drew — a report card or a certificate — on the phone,
/// with the share sheet and the printer one tap away.
///
/// The bytes come through the API client rather than a URL handed to a viewer:
/// the route needs the bearer token, and the client is what refreshes it.
class SchoolPdfView extends StatefulWidget {
  const SchoolPdfView({
    required this.title,
    required this.path,
    required this.fileName,
    super.key,
  });

  final String title;

  /// The API path, e.g. /certificates/awards/:id/pdf.
  final String path;

  /// What the file is called when it is shared or saved.
  final String fileName;

  @override
  State<SchoolPdfView> createState() => _SchoolPdfViewState();
}

class _SchoolPdfViewState extends State<SchoolPdfView> {
  Uint8List? _bytes;
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
      final bytes = await api.bytes(widget.path);
      if (!mounted) return;
      setState(() => _bytes = bytes);
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _error = apiMessage(e, 'Could not open it.'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bytes = _bytes;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          if (bytes != null)
            IconButton(
              tooltip: 'Share',
              icon: const Icon(Icons.ios_share_rounded),
              onPressed: () =>
                  Printing.sharePdf(bytes: bytes, filename: widget.fileName),
            ),
        ],
      ),
      body: AsyncView(
        isLoading: _loading,
        error: _error,
        isEmpty: false,
        onRetry: _load,
        builder: (context) => PdfPreview(
          build: (_) async => bytes!,
          pdfFileName: widget.fileName,
          // The school chose the page; a parent reshaping it would only make
          // the printout differ from the one the office handed out.
          canChangePageFormat: false,
          canChangeOrientation: false,
          canDebug: false,
          allowSharing: true,
          allowPrinting: true,
          loadingWidget: const CircularProgressIndicator(),
        ),
      ),
    );
  }
}
