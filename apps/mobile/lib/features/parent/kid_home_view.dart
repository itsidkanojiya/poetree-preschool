import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/routes/app_pages.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/async_view.dart';
import '../../core/widgets/squish.dart';
import '../animation/film_widgets.dart';
import '../notifications/inbox_view.dart';
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
/// Their face and class at the top, a big button to play, and a card for
/// everything else a family opens — each card showing the one number that
/// matters on it, so most mornings nobody has to open anything at all.
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
          icon: Icons.menu_book_rounded,
          color: const Color(0xFF3FA9F5),
          note: 'Your books',
          onTap: () => children.tab.value = ChildrenController.learningTab,
        ),
        _Feature(
          label: 'Tracing',
          icon: Icons.gesture_rounded,
          color: const Color(0xFF7B5CF0),
          note: 'A B C',
          onTap: () => Get.toNamed<void>(
            AppRoutes.activities,
            arguments: {'studentId': selected.id, 'type': 'TRACING'},
          ),
        ),
        _Feature(
          label: 'Homework',
          icon: Icons.edit_note_rounded,
          color: const Color(0xFFFF9F43),
          note: homeworkDue == 0 ? 'All done' : '$homeworkDue to do',
          badge: homeworkDue,
          onTap: () => openParentPage(ParentPage.homework),
        ),
        _Feature(
          label: 'Announcements',
          icon: Icons.campaign_rounded,
          color: const Color(0xFFF0648C),
          note: unreadNotices == 0 ? 'Up to date' : '$unreadNotices new',
          badge: unreadNotices,
          onTap: () => openParentPage(ParentPage.notices),
        ),
        _Feature(
          label: 'Gallery',
          icon: Icons.photo_library_rounded,
          color: const Color(0xFF2EC4A0),
          note: 'School photos',
          onTap: () => Get.toNamed<void>(AppRoutes.gallery, arguments: args),
        ),
        _Feature(
          label: 'Attendance',
          icon: Icons.event_available_rounded,
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
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _BigBanner(
                    title: 'Let’s play!',
                    subtitle: 'Games and activities from your books',
                    icon: Icons.sports_esports_rounded,
                    colors: const [Color(0xFFFFB547), Color(0xFFFF7A45)],
                    action: 'Play',
                    tall: true,
                    onTap: () => Get.toNamed<void>(
                      AppRoutes.activities,
                      arguments: {'studentId': selected.id},
                    ),
                  ),
                  const SizedBox(height: 18),
                  GridView.count(
                    crossAxisCount: 3,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    childAspectRatio: 0.86,
                    children: [
                      for (final feature in features)
                        _FeatureCard(feature: feature),
                    ],
                  ),
                  const SizedBox(height: 18),
                  _BigBanner(
                    title: '2D & 3D Animation',
                    subtitle: 'Watch the stories from your books',
                    icon: Icons.movie_filter_rounded,
                    colors: FilmColors.banner,
                    action: 'Watch',
                    onTap: () => Get.toNamed<void>(
                      AppRoutes.filmSubjects,
                      arguments: args,
                    ),
                  ),
                  const SizedBox(height: 14),
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
    required this.icon,
    required this.color,
    required this.note,
    required this.onTap,
    this.badge = 0,
  });

  final String label;
  final IconData icon;
  final Color color;
  final String note;
  final VoidCallback onTap;
  final int badge;
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
      padding: EdgeInsets.fromLTRB(16, top + 14, 8, 22),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF6C5CE7), Color(0xFF8E7CF8)],
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
          Container(
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              shape: BoxShape.circle,
            ),
            child: IconButtonTheme(
              data: IconButtonThemeData(
                style: IconButton.styleFrom(foregroundColor: Colors.white),
              ),
              child: InboxButton(
                onOpen: () => Get.toNamed<void>(AppRoutes.inbox),
              ),
            ),
          ),
          const SizedBox(width: 8),
        ],
      ),
    );
  }
}

/// A wide, bright button — the game and the films.
class _BigBanner extends StatelessWidget {
  const _BigBanner({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.colors,
    required this.action,
    required this.onTap,
    this.tall = false,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final List<Color> colors;
  final String action;
  final VoidCallback onTap;
  final bool tall;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Squish(
      onTap: onTap,
      child: Container(
        height: tall ? 150 : 112,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: colors,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(28),
          boxShadow: [
            BoxShadow(
              color: colors.last.withValues(alpha: 0.35),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            // Soft circles for a bit of play in the background.
            Positioned(
              right: -30,
              top: -30,
              child: _Blob(size: tall ? 150 : 120),
            ),
            Positioned(left: -20, bottom: -40, child: const _Blob(size: 90)),
            Positioned(
              right: 18,
              top: 0,
              bottom: 0,
              child: Icon(
                icon,
                size: tall ? 96 : 70,
                color: Colors.white.withValues(alpha: 0.95),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 130, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style:
                        (tall
                                ? theme.textTheme.headlineSmall
                                : theme.textTheme.titleLarge)
                            ?.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                            ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: Colors.white.withValues(alpha: 0.92),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.play_arrow_rounded,
                          size: 18,
                          color: colors.last,
                        ),
                        const SizedBox(width: 2),
                        Text(
                          action,
                          style: TextStyle(
                            color: colors.last,
                            fontWeight: FontWeight.w800,
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
    );
  }
}

class _Blob extends StatelessWidget {
  const _Blob({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        shape: BoxShape.circle,
      ),
    );
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
        padding: const EdgeInsets.fromLTRB(8, 12, 8, 10),
        decoration: BoxDecoration(
          color: isDark
              ? feature.color.withValues(alpha: 0.16)
              : Color.alphaBlend(
                  feature.color.withValues(alpha: 0.1),
                  colors.surface,
                ),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: feature.color.withValues(alpha: 0.22)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    color: feature.color,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: feature.color.withValues(alpha: 0.35),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Icon(feature.icon, color: Colors.white, size: 28),
                ),
                if (feature.badge > 0)
                  Positioned(
                    right: -6,
                    top: -6,
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
            const SizedBox(height: 10),
            Text(
              feature.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w800,
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
          color: colors.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: colors.outlineVariant),
        ),
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: tone.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(Icons.receipt_long_rounded, color: tone),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Fees',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    due > 0
                        ? '${_money.format(due / 100)} due'
                        : 'Nothing outstanding',
                    style: theme.textTheme.bodySmall?.copyWith(color: tone),
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
