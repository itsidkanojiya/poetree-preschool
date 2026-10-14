import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/routes/app_pages.dart';
import '../../core/theme/app_theme.dart';
import '../../core/audio/speech_service.dart';
import '../../core/theme/theme_controller.dart';
import '../../core/widgets/async_view.dart';
import '../auth/auth_controller.dart';
import '../fees/fees_ui.dart';
import '../fees/fees_view.dart';
import '../notifications/inbox_controller.dart';
import '../notifications/inbox_view.dart';
import 'child_controller.dart';
import 'homework_detail_view.dart';
import 'children_controller.dart';
import 'parent_tab_bar.dart';
import 'id_card_view.dart';
import '../activities/book_shelf_view.dart';
import '../animation/films_watched_card.dart';
import '../results/certificates_view.dart';
import '../results/report_cards_view.dart';
import 'kid_home_view.dart';

final _money = NumberFormat.currency(
  locale: 'en_IN',
  symbol: '₹',
  decimalDigits: 0,
);

String _rupees(int paise) => _money.format(paise / 100);

String _day(String iso) {
  final date = DateTime.tryParse(iso);
  return date == null ? iso : DateFormat('d MMM').format(date);
}

const _statusLabels = <String, String>{
  'PRESENT': 'Present',
  'ABSENT': 'Absent',
  'LATE': 'Late',
  'LEAVE': 'Leave',
  'HALF_DAY': 'Half day',
};

const _statusColors = <String, Color>{
  'PRESENT': Color(0xFF16A34A),
  'ABSENT': Color(0xFFDC2626),
  'LATE': Color(0xFFD97706),
  'LEAVE': Color(0xFF7C3AED),
  'HALF_DAY': Color(0xFF0891B2),
};

/// The parent's home.
///
/// A child is chosen by tapping a face, never by typing or logging in as them —
/// students hold no credentials anywhere in this platform. A parent with one
/// child never sees a picker at all.
class ParentHomeView extends StatelessWidget {
  const ParentHomeView({super.key});

  @override
  Widget build(BuildContext context) {
    final children = Get.find<ChildrenController>();
    final child = Get.find<ChildController>();

    // The home tab draws its own header — the child's face and the bell — so
    // it has no bar above it. Every other tab says where it is. Absent rather
    // than empty: an empty bar still takes its height.
    return Obx(() => _shell(children, child));
  }

  Widget _shell(ChildrenController children, ChildController child) {
    final tab = children.tab.value;

    return Scaffold(
      // Home and Settings draw their own headers — the child's face and the
      // bell — so they have no bar above them. The other tabs say where they
      // are. Absent rather than empty: an empty bar still takes its height.
      appBar:
          tab == ChildrenController.homeTab ||
              tab == ChildrenController.settingsTab
          ? null
          : AppBar(
              title: Text(switch (tab) {
                ChildrenController.learningTab => 'Learning',
                ChildrenController.progressTab => 'Progress',
                _ => 'Settings',
              }),
              actions: [
                InboxButton(onOpen: () => Get.toNamed<void>(AppRoutes.inbox)),
              ],
            ),
      body: Obx(() {
        if (children.isLoading.value) {
          return const Center(child: CircularProgressIndicator());
        }

        if (children.children.isEmpty) {
          return AsyncView(
            isLoading: false,
            error: children.error.value,
            isEmpty: true,
            onRetry: children.load,
            emptyTitle: 'No children linked yet',
            emptyMessage:
                'The school links your children to your account. Ask the office if this looks wrong.',
            builder: (_) => const SizedBox.shrink(),
          );
        }

        // Read here, inside the Obx closure, and NOT inside AsyncView's
        // builder. That builder runs when AsyncView itself builds, which is
        // outside this closure — so the tab was read outside the reactive
        // scope, nothing subscribed to it, and tapping the bottom bar moved
        // the highlight while the page underneath stayed put.
        final tab = children.tab.value;

        return Column(
          children: [
            // On Home and Settings the switcher sits inside the header instead.
            if (children.children.length > 1 &&
                tab != ChildrenController.homeTab &&
                tab != ChildrenController.settingsTab)
              _ChildSwitcher(children: children),
            Expanded(
              child: AsyncView(
                isLoading: child.isLoading.value,
                error: child.error.value,
                isEmpty: false,
                onRetry: child.load,
                builder: (context) => switch (tab) {
                  ChildrenController.homeTab => KidHome(
                    child: child,
                    children: children,
                    switcher: children.children.length > 1
                        ? _ChildSwitcher(children: children)
                        : null,
                  ),
                  ChildrenController.learningTab => _LearnTab(
                    children: children,
                  ),
                  ChildrenController.progressTab => _ProgressTab(
                    child: child,
                    children: children,
                  ),
                  _ => _ProfileTab(
                    child: child,
                    children: children,
                    switcher: children.children.length > 1
                        ? _ChildSwitcher(children: children)
                        : null,
                  ),
                },
              ),
            ),
          ],
        );
      }),
      bottomNavigationBar: Builder(
        builder: (context) => Obx(
          // A phone gets the designed bar. Anything wider — a tablet, a big
          // screen — keeps the standard one below, untouched.
          () => MediaQuery.sizeOf(context).shortestSide < 600
              ? ParentTabBar(
                  selected: children.tab.value,
                  onSelect: (index) => children.tab.value = index,
                )
              : NavigationBar(
                  selectedIndex: children.tab.value,
                  onDestinationSelected: (index) => children.tab.value = index,
                  destinations: const [
                    NavigationDestination(
                      icon: Icon(Icons.home_outlined),
                      selectedIcon: Icon(Icons.home_rounded),
                      label: 'Home',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.school_outlined),
                      selectedIcon: Icon(Icons.school_rounded),
                      label: 'Learning',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.insights_outlined),
                      selectedIcon: Icon(Icons.insights_rounded),
                      label: 'Progress',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.settings_outlined),
                      selectedIcon: Icon(Icons.settings_rounded),
                      label: 'Settings',
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

/// The books, in a tab of their own.
///
/// This was a card on the home page, behind everything a parent reads first.
/// It is the only thing in the app a child does, so it gets a place on the bar
/// — and the shelf is the same one either way, which is why this is a shelf and
/// not a copy of it.
class _LearnTab extends StatelessWidget {
  const _LearnTab({required this.children});

  final ChildrenController children;

  @override
  Widget build(BuildContext context) {
    final selected = children.selected;
    if (selected == null) {
      return const Center(child: Text('Choose a child first.'));
    }

    // Rebuilt when the chosen child changes, so the shelf is always theirs:
    // two children at one school can be in different years with different books.
    return BookShelfEmbedded(
      key: ValueKey(selected.id),
      studentId: selected.id,
      childName: selected.firstName,
    );
  }
}

/// Everything a parent looks up rather than checks.
///
/// Fees used to sit on the bottom bar between attendance and notices, which put
/// money one thumb away at all times in an app that is handed to a four-year-old
/// to play in. It lives here with the rest of the office business.
class _ProfileTab extends StatelessWidget {
  const _ProfileTab({
    required this.child,
    required this.children,
    this.switcher,
  });

  final ChildController child;
  final ChildrenController children;

  /// Which child, for a family with more than one.
  final Widget? switcher;

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthController>();
    final selected = children.selected;
    final due = child.ledger.value?.outstandingInPaise ?? 0;

    return FeeBackdrop(
      child: SafeArea(
        bottom: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              children: [
                const _SettingsHeader(),
                ?switcher,
                if (selected != null) ...[
                  _ProfileCard(selected: selected, children: children),
                  const SizedBox(height: 12),
                ],
                _MenuCard(
                  icon: 'fees',
                  color: FeeInk.rose,
                  wash: const Color(0xFFFFEEF1),
                  title: 'Fees',
                  subtitle: due > 0
                      ? '${_rupees(due)} due · View fee details'
                      : 'View fee details and payment status',
                  onTap: selected == null
                      ? null
                      : () => openFees(
                          studentId: selected.id,
                          childName: selected.firstName,
                        ),
                ),
                _MenuCard(
                  icon: 'notices',
                  color: FeeInk.amber,
                  wash: const Color(0xFFFFF6E5),
                  title: 'Notices',
                  subtitle: 'Announcements from the school',
                  onTap: () => Get.to<void>(() => _NoticesPage(child: child)),
                ),
                if (selected?.classroomId != null) ...[
                  _MenuCard(
                    icon: 'timetable',
                    color: FeeInk.sky,
                    wash: const Color(0xFFEDF4FF),
                    title: 'Timetable',
                    subtitle: 'Your class schedule',
                    onTap: () => Get.toNamed<void>(
                      AppRoutes.timetable,
                      arguments: {'classroomId': selected!.classroomId},
                    ),
                  ),
                  _MenuCard(
                    icon: 'class_stream',
                    color: FeeInk.violet,
                    wash: const Color(0xFFF3EEFF),
                    title: 'Class Stream',
                    subtitle: 'Updates, photos and materials',
                    onTap: () => Get.toNamed<void>(
                      AppRoutes.stream,
                      arguments: {'classroomId': selected!.classroomId},
                    ),
                  ),
                ],
                if (selected != null) ...[
                  _MenuCard(
                    icon: 'id_card',
                    color: FeeInk.mint,
                    wash: const Color(0xFFEAFAF1),
                    title: 'ID Card',
                    subtitle: 'View your digital ID card',
                    onTap: () => Get.to<void>(
                      () => const IdCardView(),
                      binding: BindingsBuilder(() {
                        Get.put<IdCardController>(
                          IdCardController(
                            studentId: selected.id,
                            childName: selected.firstName,
                          ),
                        );
                      }),
                    ),
                  ),
                  _MenuCard(
                    icon: 'certificate',
                    color: FeeInk.amber,
                    wash: const Color(0xFFFFF7E6),
                    title: 'Certificates',
                    subtitle: 'Your achievements and awards',
                    onTap: () => openParentPage(ParentPage.certificates),
                  ),
                ],
                _MenuCard(
                  icon: 'settings',
                  color: const Color(0xFF6366F1),
                  wash: const Color(0xFFF0EFFF),
                  title: 'App Settings',
                  subtitle: 'App appearance and preferences',
                  onTap: () => Get.to<void>(() => const _SettingsPage()),
                ),
                const SizedBox(height: 10),
                _SignOutButton(onPressed: auth.signOut),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "Settings", a line under it, the child waving, and the bell.
class _SettingsHeader extends StatelessWidget {
  const _SettingsHeader();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 168,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            right: 40,
            top: 6,
            bottom: 0,
            child: Image.asset(
              'assets/images/characters/waving_kid.png',
              fit: BoxFit.contain,
              excludeFromSemantics: true,
            ),
          ),
          const Positioned(
            left: 4,
            top: 18,
            right: 150,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Settings',
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    color: FeeInk.ink,
                    height: 1.1,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  'Manage your account and app preferences',
                  style: TextStyle(fontSize: 15, color: Color(0xFF4A5180)),
                ),
              ],
            ),
          ),
          const Positioned(right: 0, top: 6, child: _Bell()),
        ],
      ),
    );
  }
}

/// The bell, with how many messages are unread.
class _Bell extends StatelessWidget {
  const _Bell();

  @override
  Widget build(BuildContext context) {
    void open() => Get.toNamed<void>(AppRoutes.inbox);
    final bell = FeeIcon('notification', size: 26, color: Color(0xFF2747C8));
    if (!Get.isRegistered<InboxController>()) {
      return FeeRoundButton(label: 'Messages', onTap: open, child: bell);
    }
    final inbox = Get.find<InboxController>();
    return Obx(() {
      final count = inbox.unread.value;
      return Stack(
        clipBehavior: Clip.none,
        children: [
          FeeRoundButton(
            label: count > 0 ? 'Messages, $count unread' : 'Messages',
            onTap: open,
            child: bell,
          ),
          if (count > 0)
            Positioned(
              top: -2,
              right: -2,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                constraints: const BoxConstraints(minWidth: 19),
                decoration: BoxDecoration(
                  color: const Color(0xFFFF5A1F),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.white, width: 1.5),
                ),
                child: Text(
                  count > 99 ? '99+' : '$count',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
        ],
      );
    });
  }
}

/// The child: their photo — tap it to change it — their name and class.
class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.selected, required this.children});

  final Child selected;
  final ChildrenController children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 14, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE6EAF4)),
        boxShadow: FeeInk.lift(),
      ),
      child: Row(
        children: [
          _ChildPhoto(child: selected, children: children),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  selected.fullName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: FeeInk.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    if (selected.classroomLabel != null)
                      selected.classroomLabel!,
                    'Tap the photo to change it',
                  ].join(' · '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, color: FeeInk.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// One of Settings' rows: a tinted card, its icon on a soft tile, and a
/// coloured arrow.
class _MenuCard extends StatelessWidget {
  const _MenuCard({
    required this.icon,
    required this.color,
    required this.wash,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final String icon;
  final Color color;
  final Color wash;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Semantics(
        button: true,
        label: '$title. $subtitle',
        excludeSemantics: true,
        child: Material(
          color: wash,
          borderRadius: BorderRadius.circular(24),
          child: InkWell(
            borderRadius: BorderRadius.circular(24),
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: color.withValues(alpha: 0.16)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 58,
                    height: 58,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    alignment: Alignment.center,
                    child: FeeIcon(icon, size: 28, color: color),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            color: FeeInk.ink,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 13.5,
                            color: Color(0xFF4A5180),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.75),
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: const FeeIcon(
                      'chevron_right',
                      size: 18,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SignOutButton extends StatelessWidget {
  const _SignOutButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    const red = Color(0xFFF0442A);
    return SizedBox(
      height: 58,
      child: OutlinedButton.icon(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          backgroundColor: const Color(0xFFFFF7F5),
          foregroundColor: red,
          side: const BorderSide(color: red, width: 1.4),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(22),
          ),
        ),
        icon: const Icon(Icons.logout_rounded, size: 24),
        label: const Text(
          'Sign Out',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
      ),
    );
  }
}

/// The child's face, with a camera on it: tap to take or choose their
/// photograph, or take it off. It is the face on the home page, the class
/// register and the ID card, so the family can keep it up to date.
class _ChildPhoto extends StatefulWidget {
  const _ChildPhoto({required this.child, required this.children});

  final Child child;
  final ChildrenController children;

  @override
  State<_ChildPhoto> createState() => _ChildPhotoState();
}

class _ChildPhotoState extends State<_ChildPhoto> {
  bool _saving = false;

  Future<void> _change() async {
    final hasPhoto = widget.child.photoPath != null;
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text(
                '${widget.child.firstName}’s photo',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(context, 'camera'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(context, 'gallery'),
            ),
            if (hasPhoto)
              ListTile(
                leading: const Icon(Icons.delete_outline_rounded),
                title: const Text('Remove photo'),
                onTap: () => Navigator.pop(context, 'remove'),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;

    String? path;
    if (choice != 'remove') {
      // A face, not a poster: small enough to send on a school's wifi and
      // still sharp on the ID card.
      final picked = await ImagePicker().pickImage(
        source: choice == 'camera' ? ImageSource.camera : ImageSource.gallery,
        imageQuality: 85,
        maxWidth: 1024,
      );
      if (picked == null || !mounted) return;
      path = picked.path;
    }

    setState(() => _saving = true);
    final failure = await widget.children.setPhoto(widget.child.id, path);
    if (!mounted) return;
    setState(() => _saving = false);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            failure ??
                (path == null
                    ? 'Photo removed.'
                    : 'Photo saved. The school sees it too.'),
          ),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      label: 'Change ${widget.child.firstName}’s photo',
      child: GestureDetector(
        onTap: _saving ? null : _change,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            InitialsAvatar(
              name: widget.child.fullName,
              radius: 30,
              photoPath: widget.child.photoPath,
            ),
            if (_saving)
              const Positioned.fill(
                child: CircularProgressIndicator(strokeWidth: 3),
              ),
            Positioned(
              right: -4,
              bottom: -4,
              child: Container(
                padding: const EdgeInsets.all(5),
                decoration: BoxDecoration(
                  color: colors.primary,
                  shape: BoxShape.circle,
                  border: Border.all(color: colors.surface, width: 2),
                ),
                child: Icon(
                  Icons.photo_camera_rounded,
                  size: 15,
                  color: colors.onPrimary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Settings, which is the theme and nothing else so far.
///
/// A page rather than a switch buried in Profile: there will be more than one
/// setting eventually, and a family looking for "how do I stop it being black"
/// looks for Settings.
class _SettingsPage extends StatelessWidget {
  const _SettingsPage();

  @override
  Widget build(BuildContext context) {
    final theme = Get.find<ThemeController>();
    final voice = Get.isRegistered<SpeechService>()
        ? Get.find<SpeechService>()
        : null;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          if (voice != null) ...[
            Text('Sound', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 4),
            Text(
              'The app reads each activity out loud, for children who cannot '
              'read it themselves.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            Obx(
              () => Card(
                margin: EdgeInsets.zero,
                child: SwitchListTile(
                  value: voice.isOn.value,
                  onChanged: (on) => voice.setOn(on),
                  secondary: Icon(
                    voice.isOn.value
                        ? Icons.volume_up_rounded
                        : Icons.volume_off_rounded,
                  ),
                  title: const Text('Read activities aloud'),
                  subtitle: Text(
                    voice.isOn.value
                        // Said plainly: a room of twenty phones all saying
                        // "well done" at once is a real place.
                        ? 'Turn this off in a classroom'
                        : 'The app stays silent',
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],

          Text('Appearance', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 4),
          Text(
            'The app opens light. Choose dark if you prefer it, or let your '
            'phone decide.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),

          // Obx here rather than around a returned widget: the tiles read
          // `mode`, so this is where the subscription has to be.
          Obx(
            () => Card(
              margin: EdgeInsets.zero,
              child: Column(
                children: [
                  // Tap the row, not a small circle beside it. Radio's own
                  // tile wants a RadioGroup ancestor in this Flutter version,
                  // and a tick on the chosen row says the same thing with a
                  // target a thumb can actually hit.
                  for (final option in ThemeMode.values)
                    ListTile(
                      onTap: () => theme.choose(option),
                      leading: Icon(
                        switch (option) {
                          ThemeMode.light => Icons.light_mode_rounded,
                          ThemeMode.dark => Icons.dark_mode_rounded,
                          ThemeMode.system => Icons.phone_android_rounded,
                        },
                        color: theme.mode.value == option
                            ? Theme.of(context).colorScheme.primary
                            : Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                      title: Text(switch (option) {
                        ThemeMode.light => 'Light',
                        ThemeMode.dark => 'Dark',
                        ThemeMode.system => 'Match my phone',
                      }),
                      subtitle: Text(switch (option) {
                        ThemeMode.light => 'Warm paper, the way it was drawn',
                        ThemeMode.dark => 'Easier at bedtime',
                        ThemeMode.system => 'Follows your phone’s setting',
                      }),
                      trailing: theme.mode.value == option
                          ? Icon(
                              Icons.check_circle_rounded,
                              color: Theme.of(context).colorScheme.primary,
                            )
                          : null,
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

/// Fees on their own page, reached from Profile.
/// Where a card on the home page, or a notification, can take a parent.
enum ParentPage {
  attendance,
  homework,
  fees,
  notices,
  reportCards,
  certificates,
}

/// Opens one of the parent's pages over the tabs.
///
/// Public so the home page's cards and a push notification open the same
/// screens: attendance and homework used to be tabs, and a notification set the
/// tab. They are pages now, reached the same way from either door.
void openParentPage(ParentPage page, {String? invoiceId}) {
  final child = Get.find<ChildController>();
  final selected = Get.find<ChildrenController>().selected;

  switch (page) {
    case ParentPage.attendance:
      Get.to<void>(() => _AttendancePage(child: child));
    case ParentPage.homework:
      Get.to<void>(() => _HomeworkPage(child: child));
    case ParentPage.fees:
      if (selected != null) {
        unawaited(
          openFees(
            studentId: selected.id,
            childName: selected.firstName,
            invoiceId: invoiceId,
          ),
        );
      }
    case ParentPage.notices:
      Get.to<void>(() => _NoticesPage(child: child));
    case ParentPage.reportCards:
      if (selected != null) _openReportCards(selected);
    case ParentPage.certificates:
      if (selected != null) _openCertificates(selected);
  }
}

void _openReportCards(Child selected) {
  Get.to<void>(
    () => const ReportCardsView(),
    binding: BindingsBuilder(() {
      Get.put<ReportCardsController>(
        ReportCardsController(
          studentId: selected.id,
          childName: selected.firstName,
        ),
      );
    }),
  );
}

void _openCertificates(Child selected) {
  Get.to<void>(
    () => const CertificatesView(),
    binding: BindingsBuilder(() {
      Get.put<CertificatesController>(
        CertificatesController(
          studentId: selected.id,
          childName: selected.firstName,
        ),
      );
    }),
  );
}

class _AttendancePage extends StatelessWidget {
  const _AttendancePage({required this.child});

  final ChildController child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Attendance')),
      body: _AttendanceTab(child: child),
    );
  }
}

class _HomeworkPage extends StatelessWidget {
  const _HomeworkPage({required this.child});

  final ChildController child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Homework')),
      body: _HomeworkTab(child: child),
    );
  }
}

/// How the child is getting on.
///
/// Skills first — what they can do — then the films they have watched, which is
/// the one number a four-year-old is proud of.
class _ProgressTab extends StatelessWidget {
  const _ProgressTab({required this.child, required this.children});

  final ChildController child;
  final ChildrenController children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final selected = children.selected;

    return Obx(() {
      final skills = child.skills.toList();

      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          if (selected != null) ...[
            // What the school says, before what the app has counted.
            _ActionTile(
              icon: Icons.assignment_rounded,
              tone: AppTheme.sky,
              toneSoft: AppTheme.skySoft,
              title: 'Report cards',
              subtitle:
                  '${selected.firstName}’s report from the school, each term',
              onTap: () => openParentPage(ParentPage.reportCards),
            ),
            const SizedBox(height: 14),
            FilmsWatchedCard(
              key: ValueKey(selected.id),
              studentId: selected.id,
              childName: selected.firstName,
            ),
          ],
          const SizedBox(height: 18),
          Text('SKILLS', style: theme.textTheme.labelSmall),
          const SizedBox(height: 6),
          if (skills.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Text(
                'Nothing yet. Skills fill in as '
                '${selected?.firstName ?? 'your child'} plays.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            )
          else
            Card(
              margin: EdgeInsets.zero,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: Column(
                  children: [
                    for (final skill in skills) _SkillRow(skill: skill),
                  ],
                ),
              ),
            ),
        ],
      );
    });
  }
}

/// Notices on their own page, reached from Profile.
class _NoticesPage extends StatelessWidget {
  const _NoticesPage({required this.child});

  final ChildController child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notices')),
      body: _NoticesTab(child: child),
    );
  }
}

class _ChildSwitcher extends StatelessWidget {
  const _ChildSwitcher({required this.children});

  final ChildrenController children;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 92,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: children.children.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          final child = children.children[index];
          final selected = child.id == children.selectedId.value;

          return GestureDetector(
            onTap: () => children.select(child.id),
            child: Column(
              children: [
                Container(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: selected
                          ? Theme.of(context).colorScheme.primary
                          : Colors.transparent,
                      width: 2.5,
                    ),
                  ),
                  padding: const EdgeInsets.all(2),
                  child: InitialsAvatar(
                    name: child.fullName,
                    radius: 22,
                    photoPath: child.photoPath,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  child.firstName,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.tone,
    required this.toneSoft,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final Color tone;
  final Color toneSoft;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    return Material(
      color: colors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: colors.outlineVariant),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: isDark ? tone.withValues(alpha: 0.18) : toneSoft,
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(icon, size: 20, color: tone),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: theme.textTheme.titleSmall),
                    const SizedBox(height: 1),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: colors.outline),
            ],
          ),
        ),
      ),
    );
  }
}

class _SkillRow extends StatelessWidget {
  const _SkillRow({required this.skill});

  final SkillProgress skill;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final started = skill.attemptsCount > 0;
    final color = !started
        ? theme.colorScheme.outlineVariant
        : skill.masteryPercent >= 80
        ? AppTheme.leaf
        : skill.masteryPercent >= 50
        ? AppTheme.apricot
        : AppTheme.coral;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(skill.skillName, style: theme.textTheme.bodyMedium),
              ),
              Text(
                started ? '${skill.masteryPercent}%' : '—',
                style: TextStyle(
                  color: started ? color : theme.colorScheme.outline,
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: started ? skill.masteryPercent / 100 : 0,
              minHeight: 6,
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
          const SizedBox(height: 5),
          // The percentage never travels without its working.
          Text(skill.basis, style: theme.textTheme.bodySmall),
        ],
      ),
    );
  }
}

/// A child's attendance, as a month.
///
/// Was a flat list of every marked day, newest first, which meant scrolling
/// thirty-two rows to answer "how has this month gone" and being unable to see
/// a pattern at all. A register is kept by the month and read by the month.
///
/// Days the school did not run are simply blank rather than marked absent —
/// weekends, holidays, and days before the child joined all look the same to a
/// parent, and none of them are the child's doing.
class _AttendanceTab extends StatefulWidget {
  const _AttendanceTab({required this.child});

  final ChildController child;

  @override
  State<_AttendanceTab> createState() => _AttendanceTabState();
}

class _AttendanceTabState extends State<_AttendanceTab> {
  late DateTime _month;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final attendance = widget.child.attendance.value;
    final days = attendance?.days ?? const <AttendanceDay>[];

    // Keyed by calendar day so the grid is a lookup rather than a scan.
    final byDay = <String, AttendanceDay>{for (final d in days) d.date: d};

    final earliest = days.isEmpty
        ? DateTime.now()
        : DateTime.parse(
            days
                .map((d) => d.date)
                .reduce((a, b) => a.compareTo(b) < 0 ? a : b),
          );
    final firstMonth = DateTime(earliest.year, earliest.month);
    final now = DateTime.now();
    final thisMonth = DateTime(now.year, now.month);

    final canGoBack = _month.isAfter(firstMonth);
    final canGoForward = _month.isBefore(thisMonth);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      children: [
        if (attendance != null && attendance.markedDays > 0)
          _AttendanceSummary(attendance: attendance),

        const SizedBox(height: 16),

        Row(
          children: [
            IconButton(
              onPressed: canGoBack
                  ? () => setState(
                      () => _month = DateTime(_month.year, _month.month - 1),
                    )
                  : null,
              icon: const Icon(Icons.chevron_left_rounded),
            ),
            Expanded(
              child: Text(
                DateFormat('MMMM yyyy').format(_month),
                textAlign: TextAlign.center,
                style: theme.textTheme.titleMedium,
              ),
            ),
            IconButton(
              onPressed: canGoForward
                  ? () => setState(
                      () => _month = DateTime(_month.year, _month.month + 1),
                    )
                  : null,
              icon: const Icon(Icons.chevron_right_rounded),
            ),
          ],
        ),
        const SizedBox(height: 6),

        _MonthGrid(month: _month, byDay: byDay),

        const SizedBox(height: 20),
        const _AttendanceKey(),

        const SizedBox(height: 22),
        Text('DAYS AWAY', style: theme.textTheme.labelSmall),
        const SizedBox(height: 8),

        // Only the exceptions are listed. Thirty rows saying "Present" is not
        // information a parent needs spelled out — the grid already says it.
        ...() {
          final away = days.where((d) => d.status != 'PRESENT').toList()
            ..sort((a, b) => b.date.compareTo(a.date));

          if (away.isEmpty) {
            return [
              Text(
                'Not a single day missed.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppTheme.leaf,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ];
          }

          return away.map((day) {
            final colour =
                _statusColors[day.status] ?? theme.colorScheme.outline;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                      color: colour,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      DateFormat(
                        'EEEE d MMMM',
                      ).format(DateTime.parse(day.date)),
                      style: theme.textTheme.bodyMedium,
                    ),
                  ),
                  Text(
                    _statusLabels[day.status] ?? day.status,
                    style: TextStyle(
                      color: colour,
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            );
          }).toList();
        }(),

        // A remark is the teacher explaining themselves, and worth surfacing.
        ...days
            .where((d) => d.remark != null && d.remark!.isNotEmpty)
            .map(
              (d) => Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 8, left: 21),
                child: Text(
                  '“${d.remark}” — ${DateFormat('d MMM').format(DateTime.parse(d.date))}',
                  style: theme.textTheme.bodySmall,
                ),
              ),
            ),
      ],
    );
  }
}

class _AttendanceSummary extends StatelessWidget {
  const _AttendanceSummary({required this.attendance});

  final ChildAttendance attendance;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final percent = attendance.percentage;
    final tone = percent >= 90
        ? AppTheme.leaf
        : percent >= 75
        ? AppTheme.apricot
        : AppTheme.coral;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '$percent%',
                style: theme.textTheme.displaySmall?.copyWith(color: tone),
              ),
              const SizedBox(width: 10),
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text('present', style: theme.textTheme.bodyMedium),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(5),
            child: LinearProgressIndicator(
              value: percent / 100,
              minHeight: 7,
              valueColor: AlwaysStoppedAnimation<Color>(tone),
            ),
          ),
          const SizedBox(height: 10),
          // The denominator is days the school actually ran. Counting calendar
          // days would make every percentage wrong the moment a holiday fell
          // inside the range.
          Text(
            '${attendance.present} present · ${attendance.absent} away · over ${attendance.markedDays} school days',
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({required this.month, required this.byDay});

  final DateTime month;
  final Map<String, AttendanceDay> byDay;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final firstOfMonth = DateTime(month.year, month.month);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    // DateTime.weekday is 1..7 Monday-first, which is the order below.
    final leadingBlanks = firstOfMonth.weekday - 1;
    final today = DateTime.now();

    return Column(
      children: [
        Row(
          children: ['M', 'T', 'W', 'T', 'F', 'S', 'S']
              .map(
                (d) => Expanded(
                  child: Center(
                    child: Text(
                      d,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 6),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 7,
            mainAxisSpacing: 6,
            crossAxisSpacing: 6,
            childAspectRatio: 1,
          ),
          itemCount: leadingBlanks + daysInMonth,
          itemBuilder: (context, index) {
            if (index < leadingBlanks) return const SizedBox.shrink();

            final dayNumber = index - leadingBlanks + 1;
            final date = DateTime(month.year, month.month, dayNumber);
            final key = date.toIso8601String().substring(0, 10);
            final record = byDay[key];
            final isToday =
                date.year == today.year &&
                date.month == today.month &&
                date.day == today.day;

            return _DayCell(
              day: dayNumber,
              status: record?.status,
              isToday: isToday,
              hasRemark: record?.remark != null && record!.remark!.isNotEmpty,
            );
          },
        ),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.day,
    required this.status,
    required this.isToday,
    required this.hasRemark,
  });

  final int day;
  final String? status;
  final bool isToday;
  final bool hasRemark;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final colour = status == null ? null : _statusColors[status];

    // No register is not the same as an absence, and must not look like one.
    final background = colour == null
        ? Colors.transparent
        : isDark
        ? colour.withValues(alpha: 0.22)
        : colour.withValues(alpha: 0.14);

    return Container(
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(12),
        border: isToday
            ? Border.all(color: theme.colorScheme.primary, width: 1.6)
            : colour == null
            ? Border.all(color: theme.colorScheme.outlineVariant)
            : null,
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Text(
            '$day',
            style: TextStyle(
              fontSize: 13.5,
              fontWeight: colour == null ? FontWeight.w400 : FontWeight.w700,
              color: colour ?? theme.colorScheme.outline,
            ),
          ),
          if (hasRemark)
            Positioned(
              bottom: 5,
              child: Container(
                width: 4,
                height: 4,
                decoration: BoxDecoration(
                  color: colour ?? theme.colorScheme.outline,
                  shape: BoxShape.circle,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Colour alone cannot carry meaning — roughly one man in twelve cannot
/// separate the red from the green.
class _AttendanceKey extends StatelessWidget {
  const _AttendanceKey();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Wrap(
      spacing: 14,
      runSpacing: 8,
      children: _statusLabels.entries.map((entry) {
        final colour = _statusColors[entry.key]!;
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 13,
              height: 13,
              decoration: BoxDecoration(
                color: colour.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: colour, width: 1.2),
              ),
            ),
            const SizedBox(width: 6),
            Text(entry.value, style: theme.textTheme.bodySmall),
          ],
        );
      }).toList(),
    );
  }
}

/// The parent's list of work, in the shape Google Classroom taught everyone:
/// filter first, then work grouped by when it is due, each row saying who set
/// it and for which subject. Tapping a row opens it — nothing is acted on from
/// the list, which is what made the old cards so tall.
class _HomeworkTab extends StatefulWidget {
  const _HomeworkTab({required this.child});

  final ChildController child;

  @override
  State<_HomeworkTab> createState() => _HomeworkTabState();
}

enum _Filter { todo, sent, done }

class _HomeworkTabState extends State<_HomeworkTab> {
  _Filter _filter = _Filter.todo;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final child = widget.child;

    if (child.homework.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 80),
          Center(child: Text('Nothing set at the moment.')),
        ],
      );
    }

    final todo = child.homework.where((h) => h.isOutstanding).toList();
    final sent = child.homework.where((h) => h.isWaiting).toList();
    final done = child.homework.where((h) => h.isJudged).toList();
    // Work with nothing to send back still has to live somewhere, or a parent
    // reading the list would never see it at all.
    final toRead = child.homework
        .where((h) => !h.allowsSubmission && !h.isJudged && !h.isWaiting)
        .toList();

    final showing = switch (_filter) {
      _Filter.todo => [...todo, ...toRead],
      _Filter.sent => sent,
      _Filter.done => done,
    };

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        Row(
          children: [
            _FilterChip(
              label: 'To do',
              count: todo.length + toRead.length,
              selected: _filter == _Filter.todo,
              onTap: () => setState(() => _filter = _Filter.todo),
            ),
            const SizedBox(width: 8),
            _FilterChip(
              label: 'Sent in',
              count: sent.length,
              selected: _filter == _Filter.sent,
              onTap: () => setState(() => _filter = _Filter.sent),
            ),
            const SizedBox(width: 8),
            _FilterChip(
              label: 'Done',
              count: done.length,
              selected: _filter == _Filter.done,
              onTap: () => setState(() => _filter = _Filter.done),
            ),
          ],
        ),
        const SizedBox(height: 16),

        if (showing.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 60),
            child: Center(
              child: Text(switch (_filter) {
                _Filter.todo => 'Nothing to do. All caught up.',
                _Filter.sent => 'Nothing waiting with the teacher.',
                _Filter.done => 'Nothing marked yet.',
              }, style: theme.textTheme.bodyMedium),
            ),
          )
        else
          ..._grouped(showing).entries.expand(
            (group) => [
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 6, 4, 8),
                child: Text(
                  group.key,
                  style: theme.textTheme.labelSmall?.copyWith(
                    letterSpacing: 0.8,
                    color: group.key == 'OVERDUE'
                        ? AppTheme.coral
                        : theme.colorScheme.outline,
                  ),
                ),
              ),
              ...group.value.map(
                (item) => _HomeworkRow(child: child, item: item),
              ),
              const SizedBox(height: 6),
            ],
          ),
      ],
    );
  }

  /// Overdue first, then by how soon it is due.
  ///
  /// A flat list sorted by date buries the one thing that is actually late
  /// among ten that are not, which is how homework gets missed.
  Map<String, List<HomeworkItem>> _grouped(List<HomeworkItem> items) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final groups = <String, List<HomeworkItem>>{};

    final sorted = [...items]
      ..sort((a, b) => (a.due ?? today).compareTo(b.due ?? today));

    for (final item in sorted) {
      final due = item.due;
      final label = switch (due) {
        null => 'NO DATE',
        _ when item.isOverdue => 'OVERDUE',
        _ when due == today => 'DUE TODAY',
        _ when due.difference(today).inDays <= 7 => 'THIS WEEK',
        _ => 'LATER',
      };
      groups.putIfAbsent(label, () => []).add(item);
    }

    // A fixed order, so the list does not reshuffle itself as dates pass.
    const order = ['OVERDUE', 'DUE TODAY', 'THIS WEEK', 'LATER', 'NO DATE'];
    return {
      for (final key in order)
        if (groups.containsKey(key)) key: groups[key]!,
    };
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? colors.primary : colors.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          count == 0 ? label : '$label · $count',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: selected ? colors.onPrimary : colors.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

/// One line of work: what it is, who set it, when it is due.
class _HomeworkRow extends StatelessWidget {
  const _HomeworkRow({required this.child, required this.item});

  final ChildController child;
  final HomeworkItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final tone = statusColours(item, colors);

    final line = [
      if (item.subject != null) item.subject!,
      if (item.setBy.isNotEmpty) item.setBy,
    ].join(' · ');

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => HomeworkDetailPage(child: child, id: item.id),
          ),
        ),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: colors.outlineVariant),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: tone.bg,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  item.isJudged
                      ? Icons.assignment_turned_in_outlined
                      : Icons.assignment_outlined,
                  size: 20,
                  color: tone.fg,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall,
                    ),
                    if (line.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        line,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Text(
                          'Due ${_day(item.dueDate)}',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: item.isOverdue
                                ? AppTheme.coral
                                : colors.outline,
                            fontWeight: item.isOverdue ? FontWeight.w600 : null,
                          ),
                        ),
                        if (item.attachments.isNotEmpty) ...[
                          const SizedBox(width: 8),
                          Icon(
                            Icons.attach_file_rounded,
                            size: 13,
                            color: colors.outline,
                          ),
                        ],
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: tone.bg,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            item.statusLabel,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: tone.fg,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: colors.outline),
            ],
          ),
        ),
      ),
    );
  }
}

class _NoticesTab extends StatelessWidget {
  const _NoticesTab({required this.child});

  final ChildController child;

  /// See [_FeesTab.build] — same reason, same fix.
  @override
  Widget build(BuildContext context) => Obx(() => _body(context));

  Widget _body(BuildContext context) {
    if (child.notices.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 80),
          Center(child: Text('No notices from the school.')),
        ],
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: child.notices.length,
      itemBuilder: (context, index) {
        final notice = child.notices[index];
        return Card(
          margin: const EdgeInsets.only(bottom: 10),
          color: notice.isEmergency
              ? Theme.of(context).colorScheme.errorContainer
              : null,
          child: ListTile(
            // Opening it is what tells the school it has been seen — the
            // answer to "who has not read this" for an emergency notice.
            onTap: () => child.markNoticeRead(notice),
            leading: notice.pinned
                ? const Icon(Icons.push_pin_outlined)
                : notice.isEmergency
                ? const Icon(Icons.warning_amber)
                : const Icon(Icons.campaign_outlined),
            title: Row(
              children: [
                Expanded(child: Text(notice.title)),
                if (!notice.readByMe)
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primary,
                      shape: BoxShape.circle,
                    ),
                  ),
              ],
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(notice.body),
                const SizedBox(height: 4),
                Text(
                  _day(notice.publishAt),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.outline,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
