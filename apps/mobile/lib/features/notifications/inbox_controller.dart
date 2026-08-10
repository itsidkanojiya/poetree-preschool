import 'dart:async';

import 'package:dio/dio.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';

class InboxItem {
  InboxItem({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.createdAt,
    this.entityType,
    this.entityId,
    this.readAt,
  });

  factory InboxItem.fromJson(Map<String, dynamic> json) => InboxItem(
    id: json['id'] as String,
    type: json['type'] as String,
    title: json['title'] as String,
    body: json['body'] as String,
    createdAt: json['createdAt'] as String,
    entityType: json['entityType'] as String?,
    entityId: json['entityId'] as String?,
    readAt: json['readAt'] as String?,
  );

  final String id;
  final String type;
  final String title;
  final String body;
  final String createdAt;
  final String? entityType;
  final String? entityId;
  String? readAt;

  bool get isUnread => readAt == null;
}

/// The durable half of notifications.
///
/// A push is a tap on the shoulder and can be missed — silenced, dismissed on
/// the lock screen, or arriving while the phone is off. The Notification rows
/// are the record, so the app needs somewhere to read them or the school's
/// messages depend on Android's notification tray to survive.
class InboxController extends GetxController {
  final items = <InboxItem>[].obs;
  final unread = 0.obs;
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
      final data = await api.get<Map<String, dynamic>>(
        '/notifications',
        query: {'pageSize': 50},
      );

      items.value = (data['items'] as List<dynamic>? ?? <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(InboxItem.fromJson)
          .toList();
      unread.value = (data['unread'] as num?)?.toInt() ?? 0;
    } on DioException catch (e) {
      final payload = e.response?.data;
      error.value = payload is Map && payload['error'] is Map
          ? (payload['error'] as Map)['message']?.toString() ??
                'Could not load your messages.'
          : 'Cannot reach the school right now.';
    } finally {
      isLoading.value = false;
    }
  }

  /// Marks one message read, optimistically.
  ///
  /// The badge should drop the instant it is opened. If the call fails the row
  /// stays unread on the server and the next load corrects it — a wrong badge
  /// for a minute is better than a list that does not respond to being tapped.
  Future<void> markRead(InboxItem item) async {
    if (!item.isUnread) return;

    item.readAt = DateTime.now().toIso8601String();
    unread.value = (unread.value - 1).clamp(0, 1 << 30);
    items.refresh();

    try {
      await api.post<dynamic>('/notifications/${item.id}/read');
    } on DioException {
      // Left as-is deliberately: the next load is the correction.
    }
  }

  Future<void> markAllRead() async {
    if (unread.value == 0) return;

    for (final item in items) {
      item.readAt ??= DateTime.now().toIso8601String();
    }
    unread.value = 0;
    items.refresh();

    try {
      await api.post<dynamic>('/notifications/read-all');
    } on DioException {
      await load();
    }
  }
}
