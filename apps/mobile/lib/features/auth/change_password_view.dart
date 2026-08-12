import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import 'auth_controller.dart';

/// Choosing a password to replace the one the school office set.
///
/// Not skippable, and there is nothing to skip to: the API refuses every route
/// but this one while the temporary password stands, so a "later" button would
/// only lead to a screen full of errors.
class ChangePasswordView extends StatefulWidget {
  const ChangePasswordView({super.key});

  @override
  State<ChangePasswordView> createState() => _ChangePasswordViewState();
}

class _ChangePasswordViewState extends State<ChangePasswordView> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _again = TextEditingController();

  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _again.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final next = _next.text;

    if (next.length < 8) {
      setState(() => _error = 'Use at least 8 characters.');
      return;
    }
    if (!RegExp(r'[A-Za-z]').hasMatch(next) ||
        !RegExp(r'[0-9]').hasMatch(next)) {
      setState(() => _error = 'Use at least one letter and one number.');
      return;
    }
    if (next != _again.text) {
      setState(() => _error = 'The two new passwords do not match.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final tokens = await api.post<Map<String, dynamic>>(
        '/auth/change-password',
        body: {'currentPassword': _current.text, 'newPassword': next},
      );

      // The change ends every session, including this one. These are the
      // replacement keys — without saving them the next request would 401.
      await api.tokens.save(
        access: tokens['accessToken'] as String,
        refresh: tokens['refreshToken'] as String,
      );

      final auth = Get.find<AuthController>();
      await auth.reload();
      if (!mounted) return;
      await auth.goHome();
    } on DioException catch (e) {
      final payload = e.response?.data;
      setState(() {
        _error = payload is Map && payload['error'] is Map
            ? (payload['error'] as Map)['message']?.toString() ??
                  'Could not change it.'
            : 'Could not reach the school. Try again when you have signal.';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      // No back arrow: there is nowhere behind this screen to go.
      appBar: AppBar(
        title: const Text('Choose a password'),
        automaticallyImplyLeading: false,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
        children: [
          Text(
            'The school office set your current password, so somebody else '
            'knows it. Choose one only you know.',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 24),

          TextField(
            controller: _current,
            obscureText: true,
            autofillHints: const [AutofillHints.password],
            decoration: const InputDecoration(
              labelText: 'The password the school gave you',
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _next,
            obscureText: true,
            autofillHints: const [AutofillHints.newPassword],
            decoration: const InputDecoration(
              labelText: 'Your new password',
              helperText: 'At least 8 characters, with a letter and a number',
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _again,
            obscureText: true,
            onSubmitted: (_) => _busy ? null : _save(),
            decoration: const InputDecoration(labelText: 'Type it once more'),
          ),

          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(
              _error!,
              style: TextStyle(color: theme.colorScheme.error, fontSize: 13),
            ),
          ],

          const SizedBox(height: 24),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: _busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Save and carry on'),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: _busy ? null : Get.find<AuthController>().signOut,
            child: const Text('Sign out instead'),
          ),
        ],
      ),
    );
  }
}
