import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_service.dart';
import 'certificate_detail_view.dart';
import 'certificate_style.dart';
import 'results_models.dart';

/// The certificates the school has given a child.
class CertificatesController extends GetxController {
  CertificatesController({required this.studentId, required this.childName});

  final String studentId;
  final String childName;

  final certificates = <ChildCertificate>[].obs;
  final isLoading = true.obs;
  final error = RxnString();

  /// The kind being shown — ACHIEVEMENT, TEST or BEHAVIOUR — or null for all.
  final filter = RxnString();

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
      // A kind the child no longer has would leave an empty list behind a
      // filter nobody can see.
      if (filter.value != null && count(filter.value) == 0) filter.value = null;
    } on DioException catch (e) {
      error.value = apiMessage(e, 'Could not load the certificates.');
    } finally {
      isLoading.value = false;
    }
  }

  /// How many of a kind there are; null counts them all.
  int count(String? category) => category == null
      ? certificates.length
      : certificates.where((c) => c.category == category).length;

  /// The kinds this child has, in the filters' order.
  List<CertificateKind> get kinds =>
      CertificateKind.all.where((kind) => count(kind.category) > 0).toList();

  List<ChildCertificate> get shown => filter.value == null
      ? certificates
      : certificates.where((c) => c.category == filter.value).toList();
}

class CertificatesView extends GetView<CertificatesController> {
  const CertificatesView({super.key});

  @override
  Widget build(BuildContext context) {
    return CertificatePage(
      title: 'Certificates',
      child: Obx(() {
        if (controller.isLoading.value && controller.certificates.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }
        final error = controller.error.value;
        if (error != null && controller.certificates.isEmpty) {
          return _Problem(message: error, onRetry: controller.load);
        }
        if (controller.certificates.isEmpty) {
          return RefreshIndicator(
            onRefresh: controller.load,
            child: const _NoCertificates(),
          );
        }
        return RefreshIndicator(
          onRefresh: controller.load,
          child: CertificateList(
            certificates: controller.shown.toList(),
            childName: controller.childName,
            kinds: controller.kinds,
            filter: controller.filter.value,
            count: controller.count,
            onFilter: (category) => controller.filter.value = category,
          ),
        );
      }),
    );
  }
}

/// The certificates as a list of cards, with a filter for each kind the
/// child has. Public so a test can draw it without the network.
class CertificateList extends StatelessWidget {
  const CertificateList({
    required this.certificates,
    required this.childName,
    required this.kinds,
    required this.filter,
    required this.count,
    required this.onFilter,
    super.key,
  });

  final List<ChildCertificate> certificates;
  final String childName;

  /// The kinds the child has. With one only, there is nothing to filter.
  final List<CertificateKind> kinds;
  final String? filter;
  final int Function(String? category) count;
  final void Function(String? category) onFilter;

  @override
  Widget build(BuildContext context) {
    return ListView(
      // Room at the bottom so the last card scrolls clear of the meadow.
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
      children: [
        if (kinds.length > 1) ...[
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            child: Row(
              children: [
                _FilterChip(
                  label: 'All (${count(null)})',
                  selected: filter == null,
                  onTap: () => onFilter(null),
                ),
                for (final kind in kinds) ...[
                  const SizedBox(width: 10),
                  _FilterChip(
                    label: '${kind.plural} (${count(kind.category)})',
                    selected: filter == kind.category,
                    onTap: () => onFilter(kind.category),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
        for (final certificate in certificates) ...[
          _CertificateCard(
            certificate: certificate,
            onTap: () => Get.to<void>(
              () => CertificateDetailView(
                certificate: certificate,
                childName: childName,
              ),
            ),
          ),
          const SizedBox(height: 14),
        ],
      ],
    );
  }
}

/// "All (3)", "Achievements (2)": gold when chosen, white otherwise.
class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? const Color(0xFFF7A928) : Colors.white,
        borderRadius: BorderRadius.circular(999),
        elevation: selected ? 2 : 0,
        shadowColor: const Color(0x55F7A928),
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 48),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: selected ? Colors.transparent : CertificateInk.line,
              ),
            ),
            child: Text(
              label,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontSize: 14,
                color: selected ? Colors.white : CertificateInk.navy,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CertificateCard extends StatelessWidget {
  const _CertificateCard({required this.certificate, required this.onTap});

  final ChildCertificate certificate;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final kind = CertificateKind.of(certificate.category);
    final date = certificate.issuedOn == null
        ? null
        : DateFormat('d MMM y').format(certificate.issuedOn!);
    final theme = Theme.of(context);

    return CertificateCard(
      onTap: onTap,
      semanticLabel: [certificate.title, ?date, kind.label].join(', '),
      child: ExcludeSemantics(
        child: Row(
          children: [
            CertificateThumb(kind: kind),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    certificate.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: CertificateInk.navy,
                      fontWeight: FontWeight.w800,
                      height: 1.2,
                    ),
                  ),
                  if (date != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      date,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: CertificateInk.quiet,
                      ),
                    ),
                  ],
                  const SizedBox(height: 10),
                  _KindBadge(kind: kind),
                ],
              ),
            ),
            const SizedBox(width: 8),
            const CertificateIcon(CertificateArt.chevron, size: 24),
          ],
        ),
      ),
    );
  }
}

/// A small certificate: a frame in the kind's colour round its icon.
class CertificateThumb extends StatelessWidget {
  const CertificateThumb({required this.kind, this.width = 96, super.key});

  final CertificateKind kind;
  final double width;

  @override
  Widget build(BuildContext context) {
    final height = width * 0.82;
    return Container(
      width: width,
      height: height,
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: kind.wash,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFFFFFDF7),
          border: Border.all(color: kind.colour, width: 3),
          borderRadius: BorderRadius.circular(4),
        ),
        alignment: Alignment.center,
        child: CertificateIcon(
          kind.icon,
          size: width * 0.34,
          colour: kind.colour,
        ),
      ),
    );
  }
}

/// "★ Achievement": the kind, in its colour, on its wash.
class _KindBadge extends StatelessWidget {
  const _KindBadge({required this.kind});

  final CertificateKind kind;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
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
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: CertificateInk.navy,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// Nothing yet: the child holding up a certificate, and what will happen.
class _NoCertificates extends StatelessWidget {
  const _NoCertificates();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return LayoutBuilder(
      builder: (context, box) => ListView(
        // Scrollable even when it fits, so pulling down still refreshes.
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          ConstrainedBox(
            constraints: BoxConstraints(minHeight: box.maxHeight - 120),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 360),
                    child: AspectRatio(
                      aspectRatio: 480 / 345,
                      child: Image.asset(
                        CertificateArt.kid,
                        fit: BoxFit.contain,
                        semanticLabel: 'A child holding up a certificate',
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No certificates yet',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.headlineSmall?.copyWith(
                      color: CertificateInk.navy,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'When the school awards a certificate, it appears here '
                    'to keep, share and print.',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: CertificateInk.quiet,
                      height: 1.45,
                    ),
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

/// Could not load: what went wrong, and a way to try again.
class _Problem extends StatelessWidget {
  const _Problem({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: CertificateCard(
          padding: const EdgeInsets.all(22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.cloud_off_rounded,
                size: 40,
                color: CertificateInk.quiet,
              ),
              const SizedBox(height: 12),
              Text(
                message,
                textAlign: TextAlign.center,
                style: Theme.of(
                  context,
                ).textTheme.bodyLarge?.copyWith(color: CertificateInk.navy),
              ),
              const SizedBox(height: 16),
              FilledButton(onPressed: onRetry, child: const Text('Try again')),
            ],
          ),
        ),
      ),
    );
  }
}
