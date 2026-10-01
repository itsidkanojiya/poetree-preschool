import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_service.dart';
import '../../core/widgets/async_view.dart';
import 'pdf_view.dart';
import 'results_models.dart';

/// The certificates the school has given a child.
class CertificatesController extends GetxController {
  CertificatesController({required this.studentId, required this.childName});

  final String studentId;
  final String childName;

  final certificates = <ChildCertificate>[].obs;
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
        '/me/children/$studentId/certificates',
      );
      certificates.value = data
          .whereType<Map<String, dynamic>>()
          .map(ChildCertificate.fromJson)
          .toList();
    } on DioException catch (e) {
      error.value = apiMessage(e, 'Could not load the certificates.');
    } finally {
      isLoading.value = false;
    }
  }
}

class CertificatesView extends GetView<CertificatesController> {
  const CertificatesView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Certificates')),
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: controller.certificates.isEmpty,
          onRetry: controller.load,
          emptyTitle: 'No certificates yet',
          emptyMessage:
              'When the school awards ${controller.childName} a certificate, it appears here to keep, share and print.',
          builder: (context) => RefreshIndicator(
            onRefresh: controller.load,
            child: CertificateGrid(
              certificates: controller.certificates.toList(),
              childName: controller.childName,
            ),
          ),
        ),
      ),
    );
  }
}

/// The certificates as a wall of small frames. Public so a preview test can
/// draw it without the network.
class CertificateGrid extends StatelessWidget {
  const CertificateGrid({
    required this.certificates,
    required this.childName,
    super.key,
  });

  final List<ChildCertificate> certificates;
  final String childName;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 260,
        mainAxisSpacing: 14,
        crossAxisSpacing: 14,
        childAspectRatio: 0.92,
      ),
      itemCount: certificates.length,
      itemBuilder: (context, index) {
        final certificate = certificates[index];
        return _CertificateTile(
          certificate: certificate,
          onTap: () => Get.to<void>(
            () => SchoolPdfView(
              title: certificate.title,
              path: '/certificates/awards/${certificate.awardId}/pdf',
              fileName: '$childName ${certificate.title}.pdf'.replaceAll(
                RegExp(r'[\\/:*?"<>|]'),
                '',
              ),
            ),
          ),
        );
      },
    );
  }
}

const _gold = Color(0xFFC9A227);

class _CertificateTile extends StatelessWidget {
  const _CertificateTile({required this.certificate, required this.onTap});

  final ChildCertificate certificate;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final brand = theme.colorScheme.primary;

    return Material(
      color: theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: _Frame(design: certificate.design, brand: brand),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    certificate.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall?.copyWith(height: 1.2),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    certificate.issuedOn == null
                        ? ''
                        : DateFormat('d MMM y').format(certificate.issuedOn!),
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A suggestion of the certificate's design: its border, in the school's
/// colour, around a rosette. The real thing is the PDF one tap away.
class _Frame extends StatelessWidget {
  const _Frame({required this.design, required this.brand});

  final String design;
  final Color brand;

  @override
  Widget build(BuildContext context) {
    final (background, border, accent) = switch (design) {
      'STARS' => (
        Colors.white,
        Border(
          top: BorderSide(color: brand, width: 8),
          bottom: BorderSide(color: brand, width: 8),
        ),
        _gold,
      ),
      'PLAYFUL' => (
        Color.alphaBlend(brand.withValues(alpha: 0.08), Colors.white),
        Border.all(color: brand.withValues(alpha: 0.5), width: 3),
        const Color(0xFFFF6B6B),
      ),
      'ELEGANT' => (
        const Color(0xFFFFFEFB),
        Border.all(color: Color.lerp(brand, Colors.black, 0.25)!, width: 7),
        _gold,
      ),
      _ => (const Color(0xFFFFFCF5), Border.all(color: brand, width: 5), _gold),
    };

    return Container(
      margin: const EdgeInsets.fromLTRB(10, 10, 10, 0),
      decoration: BoxDecoration(
        color: background,
        border: border,
        // None for the banded design: Flutter draws a radius only on a border
        // that is the same all the way round.
        borderRadius: switch (design) {
          'STARS' => null,
          'PLAYFUL' => BorderRadius.circular(14),
          _ => BorderRadius.circular(4),
        },
      ),
      alignment: Alignment.center,
      child: Icon(Icons.workspace_premium_rounded, size: 44, color: accent),
    );
  }
}
