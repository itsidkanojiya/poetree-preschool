import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_service.dart';
import '../../core/config/branding.dart';
import '../../core/widgets/kid_ui.dart';

/// A request the parent has sent for another child.
class ChildRequest {
  const ChildRequest({
    required this.id,
    required this.studentName,
    required this.status,
    this.classLevel,
    this.rejectionReason,
  });

  factory ChildRequest.fromJson(Map<String, dynamic> json) => ChildRequest(
    id: json['id'] as String,
    studentName: json['studentName'] as String? ?? '',
    status: json['status'] as String? ?? 'PENDING',
    classLevel: json['classLevel'] as String?,
    rejectionReason: json['rejectionReason'] as String?,
  );

  final String id;
  final String studentName;

  /// PENDING, APPROVED or REJECTED.
  final String status;
  final String? classLevel;
  final String? rejectionReason;
}

/// Asking the school to add a brother or sister to this account.
///
/// No new account and no new password: the request goes to the office like a
/// registration, and once they approve it the child appears in the switcher
/// beside the others. The requests already sent are listed underneath, so a
/// parent can see one is waiting rather than send it twice.
class AddChildView extends StatefulWidget {
  const AddChildView({super.key});

  @override
  State<AddChildView> createState() => _AddChildViewState();
}

class _AddChildViewState extends State<AddChildView> {
  final _formKey = GlobalKey<FormState>();
  final _firstName = TextEditingController();
  final _middleName = TextEditingController();
  final _lastName = TextEditingController();

  DateTime? _dateOfBirth;
  String? _dateError;
  String? _classLevelId;

  List<({String id, String name})> _standards = const [];
  List<ChildRequest> _requests = const [];
  bool _sending = false;
  String? _problem;
  String? _sent;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _firstName.dispose();
    _middleName.dispose();
    _lastName.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final code = BrandingService.current.code;
    try {
      final results = await Future.wait([
        api.get<List<dynamic>>('/public/schools/$code/standards'),
        api.get<List<dynamic>>('/me/child-requests'),
      ]);
      if (!mounted) return;
      setState(() {
        _standards = [
          for (final row in results[0].whereType<Map<String, dynamic>>())
            (id: row['id'] as String, name: row['name'] as String? ?? ''),
        ];
        _requests = results[1]
            .whereType<Map<String, dynamic>>()
            .map(ChildRequest.fromJson)
            .toList();
      });
    } on DioException catch (e) {
      if (mounted) setState(() => _problem = _messageFor(e));
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final chosen = await showDatePicker(
      context: context,
      initialDate: _dateOfBirth ?? DateTime(now.year - 3, now.month, now.day),
      firstDate: DateTime(now.year - 20),
      lastDate: now,
      helpText: 'Child’s date of birth',
    );
    if (chosen != null) {
      setState(() {
        _dateOfBirth = chosen;
        _dateError = null;
      });
    }
  }

  Future<void> _send() async {
    setState(() {
      _dateError = _dateOfBirth == null
          ? 'Choose your child’s date of birth'
          : null;
      _problem = null;
      _sent = null;
    });
    if (!(_formKey.currentState?.validate() ?? false) || _dateOfBirth == null) {
      return;
    }

    setState(() => _sending = true);
    try {
      final data = await api.post<Map<String, dynamic>>(
        '/me/child-requests',
        body: {
          'studentFirstName': _firstName.text.trim(),
          if (_middleName.text.trim().isNotEmpty)
            'studentMiddleName': _middleName.text.trim(),
          if (_lastName.text.trim().isNotEmpty)
            'studentLastName': _lastName.text.trim(),
          // The day only: a time zone on a birthday moves it.
          'studentDateOfBirth': _dateOfBirth!.toIso8601String().substring(
            0,
            10,
          ),
          'classLevelId': _classLevelId,
        },
      );
      final request = ChildRequest.fromJson(data);
      setState(() {
        _requests = [request, ..._requests];
        _sent =
            'Sent. The school will check it, and ${request.studentName} '
            'will appear beside your other children once they approve it.';
        _firstName.clear();
        _dateOfBirth = null;
      });
    } on DioException catch (e) {
      setState(() => _problem = _messageFor(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  static String _messageFor(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] is Map) {
      return (data['error'] as Map)['message']?.toString() ??
          'Could not send the request.';
    }
    return 'Cannot reach the school right now. Check your connection.';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Add another child')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 32),
        children: [
          Text(
            'For a brother or sister joining the school. The school checks '
            'it and adds the child to your account — no new password.',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          if (_problem != null) _Note(text: _problem!, error: true),
          if (_sent != null) _Note(text: _sent!, error: false),
          Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: _firstName,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Child’s name',
                    prefixIcon: Icon(Icons.child_care_rounded),
                  ),
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? 'Enter your child’s name'
                      : null,
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _middleName,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Father’s name',
                    prefixIcon: Icon(Icons.person_rounded),
                  ),
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _lastName,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Surname',
                    prefixIcon: Icon(Icons.badge_rounded),
                  ),
                ),
                const SizedBox(height: 14),
                InkWell(
                  onTap: _pickDate,
                  borderRadius: BorderRadius.circular(18),
                  child: InputDecorator(
                    decoration: InputDecoration(
                      labelText: 'Child’s date of birth',
                      errorText: _dateError,
                      prefixIcon: const Icon(Icons.cake_rounded),
                      suffixIcon: const Icon(Icons.calendar_month_rounded),
                    ),
                    child: Text(
                      _dateOfBirth == null
                          ? 'Choose a date'
                          : '${_dateOfBirth!.day.toString().padLeft(2, '0')}/'
                                '${_dateOfBirth!.month.toString().padLeft(2, '0')}/'
                                '${_dateOfBirth!.year}',
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  initialValue: _classLevelId,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Class',
                    prefixIcon: Icon(Icons.school_rounded),
                  ),
                  items: [
                    for (final standard in _standards)
                      DropdownMenuItem(
                        value: standard.id,
                        child: Text(standard.name),
                      ),
                  ],
                  onChanged: (value) => setState(() => _classLevelId = value),
                  validator: (value) =>
                      value == null ? 'Choose your child’s class' : null,
                ),
                const SizedBox(height: 20),
                GradientButton(
                  label: 'Send to the school',
                  icon: Icons.send_rounded,
                  busy: _sending,
                  onPressed: _send,
                ),
              ],
            ),
          ),
          if (_requests.isNotEmpty) ...[
            const SizedBox(height: 28),
            Text(
              'Sent before',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            for (final request in _requests) _RequestRow(request: request),
          ],
        ],
      ),
    );
  }
}

class _RequestRow extends StatelessWidget {
  const _RequestRow({required this.request});

  final ChildRequest request;

  @override
  Widget build(BuildContext context) {
    final (label, colour) = switch (request.status) {
      'APPROVED' => ('Added', const Color(0xFF15803D)),
      'REJECTED' => ('Turned down', const Color(0xFFB42318)),
      _ => ('Waiting for the school', const Color(0xFFB45309)),
    };
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.child_care_rounded),
      title: Text(request.studentName),
      subtitle: Text(
        [
          if (request.classLevel != null) request.classLevel!,
          if (request.status == 'REJECTED' && request.rejectionReason != null)
            request.rejectionReason!,
        ].join(' · '),
      ),
      trailing: Text(
        label,
        style: TextStyle(color: colour, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.text, required this.error});

  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: error ? scheme.errorContainer : scheme.secondaryContainer,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: error ? scheme.onErrorContainer : scheme.onSecondaryContainer,
        ),
      ),
    );
  }
}
