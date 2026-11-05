import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/widgets/kid_ui.dart';
import 'auth_controller.dart';

/// For someone who is both a parent and a teacher at the school: which of the
/// two to open as.
///
/// One account, one password, two homes. Each is its own session — the
/// teacher's register is never on screen with the family's children — and the
/// other is a tap away later, from Settings or the teacher's home.
class ChooseRoleView extends GetView<AuthController> {
  const ChooseRoleView({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final first = controller.user.value?.name.split(' ').first ?? '';

    return Scaffold(
      body: SingleChildScrollView(
        child: Column(
          children: [
            AuthHeader(
              title: first.isEmpty ? 'Welcome!' : 'Welcome, $first!',
              subtitle: 'You are a parent and a teacher here. Open as:',
              extraBottom: 24,
            ),
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(18, 0, 18, 24),
                  child: Obx(
                    () => Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _RoleCard(
                          icon: Icons.family_restroom_rounded,
                          colour: KidPalette.violet,
                          title: 'Parent',
                          text: 'Your children’s day, homework, fees and more.',
                          busy: controller.isBusy.value,
                          onTap: () => controller.continueAs('PARENT'),
                        ),
                        const SizedBox(height: 14),
                        _RoleCard(
                          icon: Icons.co_present_rounded,
                          colour: const Color(0xFF0E9F6E),
                          title: 'Teacher',
                          text: 'Your classes, the register and homework.',
                          busy: controller.isBusy.value,
                          onTap: () => controller.continueAs('TEACHER'),
                        ),
                        const SizedBox(height: 18),
                        Text(
                          'You can switch at any time.',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({
    required this.icon,
    required this.colour,
    required this.title,
    required this.text,
    required this.busy,
    required this.onTap,
  });

  final IconData icon;
  final Color colour;
  final String title;
  final String text;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      button: true,
      label: 'Open as $title',
      excludeSemantics: true,
      child: Material(
        color: colour.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(24),
        child: InkWell(
          borderRadius: BorderRadius.circular(24),
          onTap: busy ? null : onTap,
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Row(
              children: [
                Container(
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    color: colour,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(icon, color: Colors.white, size: 30),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: colour,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(text, style: theme.textTheme.bodyMedium),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: colour),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
