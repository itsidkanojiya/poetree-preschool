import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/authed_image.dart';

/// The child's ID card, on the phone.
///
/// The same fields the printed card carries, including the school's switches:
/// if the office has taken the guardian's phone number off the card, it is off
/// here too, or the screen would say more than the thing in the child's bag.
class IdCardController extends GetxController {
  IdCardController({required this.studentId, required this.childName});

  final String studentId;
  final String childName;

  final card = Rxn<Map<String, dynamic>>();
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
      card.value = await api.get<Map<String, dynamic>>(
        '/me/children/$studentId/id-card',
      );
    } on DioException catch (e) {
      final payload = e.response?.data;
      error.value = payload is Map && payload['error'] is Map
          ? (payload['error'] as Map)['message']?.toString() ??
                'Could not load the card.'
          : 'Cannot reach the school right now.';
    } finally {
      isLoading.value = false;
    }
  }
}

class IdCardView extends GetView<IdCardController> {
  const IdCardView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ID card')),
      body: Obx(
        () => AsyncView(
          isLoading: controller.isLoading.value,
          error: controller.error.value,
          isEmpty: false,
          onRetry: controller.load,
          builder: (context) => _Card(data: controller.card.value ?? const {}),
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.data});

  final Map<String, dynamic> data;

  Color get _brand {
    final hex = (data['primaryColor'] as String?)?.replaceFirst('#', '');
    final value = int.tryParse(hex ?? '', radix: 16);
    return value == null ? const Color(0xFF16307C) : Color(0xFF000000 | value);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final photo = data['photoUrl'] as String?;
    final name = data['name'] as String? ?? '';

    final rows = <(String, String)>[
      if (data['classroom'] != null) ('Class', data['classroom'].toString()),
      ('Admission no.', data['admissionNo']?.toString() ?? '—'),
      if (data['bloodGroup'] != null) ('Blood group', data['bloodGroup'].toString()),
      if (data['guardianPhone'] != null)
        (data['guardianName']?.toString() ?? 'Guardian', data['guardianPhone'].toString()),
      if (data['address'] != null) ('Address', data['address'].toString()),
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          // Drawn as a card rather than a list, because that is what it is —
          // a parent holds the phone up at the gate and somebody looks at it.
          Container(
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.12),
                  blurRadius: 18,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                Container(
                  width: double.infinity,
                  color: _brand,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                  child: Text(
                    data['schoolName']?.toString() ?? '',
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),

                Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    children: [
                      SizedBox(
                        width: 128,
                        height: 128,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(16),
                          child: photo != null
                              ? AuthedImage(path: photo, fit: BoxFit.cover)
                              : ColoredBox(
                                  // Initials, exactly as the printed card does
                                  // when the school holds no photograph.
                                  color: theme.colorScheme.surfaceContainerHighest,
                                  child: Center(
                                    child: Text(
                                      _initials(name),
                                      style: theme.textTheme.headlineMedium
                                          ?.copyWith(
                                            color: _brand,
                                            fontWeight: FontWeight.w800,
                                          ),
                                    ),
                                  ),
                                ),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        name,
                        textAlign: TextAlign.center,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 16),

                      for (final (label, value) in rows)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(
                                width: 108,
                                child: Text(
                                  label,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ),
                              Expanded(
                                child: Text(
                                  value,
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 18),
          Text(
            'The school can print this card. Ask the office if you need a '
            'physical one.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    if (parts.isEmpty) return '?';
    final list = parts.toList();
    return (list.first[0] + (list.length > 1 ? list[1][0] : '')).toUpperCase();
  }
}
