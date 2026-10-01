import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/assets/app_assets.dart';
import '../../core/routes/app_pages.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/art.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/kid_ui.dart';
import '../../core/widgets/squish.dart';
import '../notifications/inbox_controller.dart';
import 'child_controller.dart';
import 'children_controller.dart';
import 'parent_home_view.dart';

final _money = NumberFormat.currency(
  locale: 'en_IN',
  symbol: '₹',
  decimalDigits: 0,
);

/// The child's front page.
///
/// Their face and class at the top, the 2D & 3D Animation banner, a card for
/// everything else a family opens — each showing the one number that matters
/// on it, so most mornings nobody has to open anything at all — then the
/// Game banner.
class KidHome extends StatelessWidget {
  const KidHome({
    required this.child,
    required this.children,
    this.switcher,
    super.key,
  });

  final ChildController child;
  final ChildrenController children;

  /// The row of faces, for a family with more than one child here.
  final Widget? switcher;

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final selected = children.selected;
      if (selected == null) return const SizedBox.shrink();

      final homeworkDue = child.homework.where((h) => h.isOutstanding).length;
      final unreadNotices = child.notices.where((n) => !n.readByMe).length;
      final attendance = child.attendance.value;
      final due = child.ledger.value?.outstandingInPaise ?? 0;

      final args = {'studentId': selected.id, 'childName': selected.firstName};

      final features = <_Feature>[
        _Feature(
          label: 'Subjects',
          art: AppIcons.subjects,
          color: const Color(0xFF3FA9F5),
          note: 'Your books',
          onTap: () => children.tab.value = ChildrenController.learningTab,
        ),
        _Feature(
          label: 'Tracing',
          art: AppIcons.tracing,
          color: const Color(0xFF7B5CF0),
          note: 'A B C',
          onTap: () => Get.toNamed<void>(
            AppRoutes.activities,
            arguments: {'studentId': selected.id, 'type': 'TRACING'},
          ),
        ),
        _Feature(
          label: 'Homework',
          art: AppIcons.homework,
          color: const Color(0xFFFF9F43),
          note: homeworkDue == 0 ? 'All done' : '$homeworkDue to do',
          badge: homeworkDue,
          onTap: () => openParentPage(ParentPage.homework),
        ),
        _Feature(
          label: 'Announcement',
          art: AppIcons.announcement,
          color: const Color(0xFFF0648C),
          note: unreadNotices == 0 ? 'Up to date' : '$unreadNotices new',
          badge: unreadNotices,
          onTap: () => openParentPage(ParentPage.notices),
        ),
        _Feature(
          label: 'Gallery',
          art: AppIcons.gallery,
          color: const Color(0xFF2EC4A0),
          note: 'School photos',
          onTap: () => Get.toNamed<void>(AppRoutes.gallery, arguments: args),
        ),
        _Feature(
          label: 'Attendance',
          art: AppIcons.attendance,
          color: AppTheme.leaf,
          note: attendance == null || attendance.markedDays == 0
              ? 'This month'
              : '${attendance.percentage}% present',
          onTap: () => openParentPage(ParentPage.attendance),
        ),
      ];

      return RefreshIndicator(
        onRefresh: child.load,
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            _Header(
              name: selected.fullName,
              firstName: selected.firstName,
              classLabel: selected.classroomLabel,
              photoPath: selected.photoPath,
              onProfile: () =>
                  children.tab.value = ChildrenController.settingsTab,
            ),
            ?switcher,
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ArtBanner(
                    AppBanners.animation2d3d,
                    semanticLabel: '2D and 3D Animation — watch the stories',
                    onTap: () => Get.toNamed<void>(
                      AppRoutes.filmSubjects,
                      arguments: args,
                    ),
                  ),
                  const SizedBox(height: 20),
                  const _SectionTitle('Explore'),
                  const SizedBox(height: 10),
                  GridView.count(
                    crossAxisCount: 3,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    childAspectRatio: 0.84,
                    children: [
                      for (final feature in features)
                        _FeatureCard(feature: feature),
                    ],
                  ),
                  const SizedBox(height: 20),
                  const _SectionTitle('Play and learn'),
                  const SizedBox(height: 10),
                  ArtBanner(
                    AppBanners.game,
                    semanticLabel: 'Game — play activities from your books',
                    onTap: () => Get.toNamed<void>(
                      AppRoutes.activities,
                      arguments: {'studentId': selected.id},
                    ),
                  ),
                  const SizedBox(height: 16),
                  _FeesCard(
                    due: due,
                    onTap: () => openParentPage(ParentPage.fees),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    });
  }
}

class _Feature {
  const _Feature({
    required this.label,
    required this.art,
    required this.color,
    required this.note,
    required this.onTap,
    this.badge = 0,
  });

  final String label;

  /// One of [AppIcons].
  final String art;
  final Color color;
  final String note;
  final VoidCallback onTap;
  final int badge;
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(
        context,
      ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
    );
  }
}

/// The child's face, name and class, and the bell.
class _Header extends StatelessWidget {
  const _Header({
    required this.name,
    required this.firstName,
    required this.classLabel,
    required this.photoPath,
    required this.onProfile,
  });

  final String name;
  final String firstName;
  final String? classLabel;
  final String? photoPath;
  final VoidCallback onProfile;

  String get _greeting {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final top = MediaQuery.paddingOf(context).top;

    return Container(
      padding: EdgeInsets.fromLTRB(16, top + 14, 12, 22),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: KidPalette.header,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(30)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Squish(
              onTap: onProfile,
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(3),
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                    child: InitialsAvatar(
                      name: name,
                      radius: 28,
                      photoPath: photoPath,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _greeting,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: Colors.white.withValues(alpha: 0.85),
                          ),
                        ),
                        Text(
                          'Hi, $firstName!',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleLarge?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        if (classLabel != null) ...[
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(99),
                            ),
                            child: Text(
                              classLabel!,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const _Bell(),
        ],
      ),
    );
  }
}

/// The pack's bell, with the unread count, opening the inbox.
class _Bell extends StatelessWidget {
  const _Bell();

  @override
  Widget build(BuildContext context) {
    Widget bell(int unread) => Semantics(
      button: true,
      label: unread > 0 ? 'Messages, $unread unread' : 'Messages',
      child: Squish(
        onTap: () => Get.toNamed<void>(AppRoutes.inbox),
        child: SizedBox(
          width: 54,
          height: 54,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 54,
                height: 54,
                padding: const EdgeInsets.all(8),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
                child: const ArtIcon(AppIcons.notifications, size: 38),
              ),
              if (unread > 0)
                Positioned(
                  right: -2,
                  top: -2,
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 22),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 5,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.coral,
                      borderRadius: BorderRadius.circular(99),
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                    child: Text(
                      unread > 99 ? '99+' : '$unread',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );

    if (!Get.isRegistered<InboxController>()) return bell(0);
    final inbox = Get.find<InboxController>();
    return Obx(() => bell(inbox.unread.value));
  }
}

class _FeatureCard extends StatelessWidget {
  const _FeatureCard({required this.feature});

  final _Feature feature;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    return Squish(
      onTap: feature.onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(6, 10, 6, 10),
        decoration: BoxDecoration(
          color: isDark
              ? feature.color.withValues(alpha: 0.16)
              : Color.alphaBlend(
                  feature.color.withValues(alpha: 0.1),
                  colors.surface,
                ),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: feature.color.withValues(alpha: 0.22)),
          boxShadow: [
            BoxShadow(
              color: feature.color.withValues(alpha: 0.12),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                ArtIcon(feature.art, size: 58),
                if (feature.badge > 0)
                  Positioned(
                    right: -6,
                    top: -4,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 20),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 5,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: AppTheme.coral,
                        borderRadius: BorderRadius.circular(99),
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                      child: Text(
                        feature.badge > 9 ? '9+' : '${feature.badge}',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            // Shrunk rather than cut: "Announcement" is the longest word on
            // the page and must still be read whole on a narrow phone.
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                feature.label,
                maxLines: 1,
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(height: 2),
            Text(
              feature.note,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.labelSmall?.copyWith(
                color: colors.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FeesCard extends StatelessWidget {
  const _FeesCard({required this.due, required this.onTap});

  final int due;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final tone = due > 0 ? AppTheme.coral : AppTheme.leaf;

    return Squish(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Color.alphaBlend(
            KidPalette.sun.withValues(alpha: 0.12),
            colors.surface,
          ),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: KidPalette.sun.withValues(alpha: 0.35)),
        ),
        child: Row(
          children: [
            const ArtIcon(AppIcons.fees, size: 52),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Fees',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    due > 0
                        ? '${_money.format(due / 100)} due'
                        : 'Nothing outstanding',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: tone,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: colors.outline),
          ],
        ),
      ),
    );
  }
}
