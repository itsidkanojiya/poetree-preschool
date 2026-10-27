import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:intl/intl.dart';

import '../../core/widgets/kid_sky.dart';
import '../parent/child_controller.dart';

/// The school's announcements, for a family: each a card coloured by what it
/// is about, the unread ones marked New, and each opening to the whole
/// message.

abstract final class AnnouncementArt {
  static const _dir = 'assets/announcements_settings_ui';
  static const megaphone = '$_dir/megaphone.svg';
  static const trophy = '$_dir/trophy.svg';
  static const calendar = '$_dir/calendar.svg';
  static const book = '$_dir/book.svg';
  static const info = '$_dir/info.svg';
  static const chevron = '$_dir/chevron_right.svg';
  static const star = '$_dir/star.svg';
}

/// What an announcement is about, as the school chose it: its name, colour
/// and picture.
class AnnouncementKind {
  const AnnouncementKind._(this.label, this.colour, this.icon);

  final String label;
  final Color colour;
  final String icon;

  static const general = AnnouncementKind._(
    'School notice',
    Color(0xFF8B5CF6),
    AnnouncementArt.megaphone,
  );
  static const event = AnnouncementKind._(
    'Event',
    Color(0xFFF59E0B),
    AnnouncementArt.trophy,
  );
  static const holiday = AnnouncementKind._(
    'Holiday',
    Color(0xFF3B9EE8),
    AnnouncementArt.calendar,
  );
  static const academic = AnnouncementKind._(
    'Learning',
    Color(0xFFE5508A),
    AnnouncementArt.book,
  );
  static const emergency = AnnouncementKind._(
    'Urgent',
    Color(0xFFE5484D),
    AnnouncementArt.info,
  );

  static AnnouncementKind of(String type) => switch (type) {
    'EVENT' => event,
    'HOLIDAY' => holiday,
    'ACADEMIC' => academic,
    'EMERGENCY' => emergency,
    _ => general,
  };
}

String _date(String publishAt) {
  final at = DateTime.tryParse(publishAt)?.toLocal();
  return at == null ? '' : DateFormat('d MMM y').format(at);
}

/// The list.
class AnnouncementsView extends StatelessWidget {
  const AnnouncementsView({required this.child, super.key});

  final ChildController child;

  @override
  Widget build(BuildContext context) {
    return KidSkyPage(
      title: 'Announcements',
      subtitle: 'Stay updated with the latest news from your child’s school.',
      badge: AnnouncementArt.megaphone,
      badgeColour: const Color(0xFFF7A928),
      child: Obx(() {
        final notices = child.notices.toList();
        if (child.isLoading.value && notices.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }
        final error = child.error.value;
        if (error != null && notices.isEmpty) {
          return _Message(
            title: 'Could not load the announcements',
            text: error,
            action: 'Try again',
            onAction: child.load,
          );
        }
        if (notices.isEmpty) {
          return RefreshIndicator(
            onRefresh: child.load,
            child: const _Message(
              title: 'No announcements yet',
              text:
                  'When the school shares news or a reminder, it appears '
                  'here.',
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: child.load,
          child: ListView.separated(
            // Room at the bottom so the last card scrolls clear of the grass.
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
            itemCount: notices.length,
            separatorBuilder: (_, _) => const SizedBox(height: 12),
            itemBuilder: (context, index) => AnnouncementCard(
              notice: notices[index],
              onTap: () => Get.to<void>(
                () => AnnouncementDetailView(
                  notice: notices[index],
                  child: child,
                ),
              ),
            ),
          ),
        );
      }),
    );
  }
}

/// One announcement in the list.
class AnnouncementCard extends StatelessWidget {
  const AnnouncementCard({
    required this.notice,
    required this.onTap,
    super.key,
  });

  final NoticeItem notice;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = KidSkyPalette.of(context);
    final kind = AnnouncementKind.of(notice.type);
    final theme = Theme.of(context);
    final date = _date(notice.publishAt);

    return Semantics(
      button: true,
      container: true,
      label: [
        notice.title,
        if (!notice.readByMe) 'New',
        kind.label,
        date,
      ].join(', '),
      excludeSemantics: true,
      child: KidCard(
        onTap: onTap,
        colour: notice.isEmergency ? palette.wash(kind.colour) : null,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _KindTile(kind: kind),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          notice.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: palette.ink,
                            fontWeight: FontWeight.w800,
                            height: 1.2,
                          ),
                        ),
                      ),
                      if (!notice.readByMe) ...[
                        const SizedBox(width: 8),
                        const NewBadge(),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    notice.body,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: palette.quiet,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      KidIconArt(
                        AnnouncementArt.calendar,
                        colour: palette.quiet,
                        size: 16,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        date,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: palette.quiet,
                        ),
                      ),
                      if (notice.pinned) ...[
                        const SizedBox(width: 12),
                        Icon(
                          Icons.push_pin_rounded,
                          size: 14,
                          color: palette.quiet,
                        ),
                        const SizedBox(width: 3),
                        Text(
                          'Pinned',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: palette.quiet,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 6),
            Padding(
              padding: const EdgeInsets.only(top: 20),
              child: KidIconArt(
                AnnouncementArt.chevron,
                colour: palette.ink,
                size: 22,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The kind's picture on its pastel tile.
class _KindTile extends StatelessWidget {
  const _KindTile({required this.kind});

  final AnnouncementKind kind;

  static const size = 60.0;

  @override
  Widget build(BuildContext context) {
    final palette = KidSkyPalette.of(context);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: palette.wash(kind.colour),
        borderRadius: BorderRadius.circular(size * 0.3),
      ),
      alignment: Alignment.center,
      child: KidIconArt(kind.icon, colour: kind.colour, size: size * 0.5),
    );
  }
}

/// "New": an announcement this parent has not opened yet.
class NewBadge extends StatelessWidget {
  const NewBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0xFFFF5A6E),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        'New',
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

/// One announcement, all of it. Opening it is what tells the school it has
/// been seen.
class AnnouncementDetailView extends StatefulWidget {
  const AnnouncementDetailView({
    required this.notice,
    required this.child,
    super.key,
  });

  final NoticeItem notice;
  final ChildController child;

  @override
  State<AnnouncementDetailView> createState() => _AnnouncementDetailViewState();
}

class _AnnouncementDetailViewState extends State<AnnouncementDetailView> {
  /// Whether it was new when opened: it is marked read at once, and the
  /// badge should still say what it was.
  late final bool _wasNew = !widget.notice.readByMe;

  @override
  void initState() {
    super.initState();
    // The read receipt the school's "who has not seen this" is built from.
    // After the first frame: marking it read refreshes the list behind, and
    // that list may not be told to rebuild while this page is being built.
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => widget.child.markNoticeRead(widget.notice),
    );
  }

  @override
  Widget build(BuildContext context) {
    final notice = widget.notice;
    final palette = KidSkyPalette.of(context);
    final kind = AnnouncementKind.of(notice.type);
    final theme = Theme.of(context);

    return KidSkyPage(
      title: 'Announcement',
      showChild: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 120),
        children: [
          _Megaphone(kind: kind),
          const SizedBox(height: 14),
          KidCard(
            padding: const EdgeInsets.all(18),
            radius: 26,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Semantics(
                        header: true,
                        child: Text(
                          notice.title,
                          style: theme.textTheme.titleLarge?.copyWith(
                            color: palette.ink,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                    if (_wasNew) ...[
                      const SizedBox(width: 10),
                      const NewBadge(),
                    ],
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 14,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    _Fact(
                      icon: AnnouncementArt.calendar,
                      text: _date(notice.publishAt),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: palette.wash(kind.colour),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        kind.label,
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: palette.dark ? Colors.white : kind.colour,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    if (notice.pinned)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.push_pin_rounded,
                            size: 16,
                            color: palette.quiet,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'Pinned by the school',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: palette.quiet,
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
                if (notice.classroomLabels.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    'For ${notice.classroomLabels.join(', ')}',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: palette.quiet,
                    ),
                  ),
                ],
                const SizedBox(height: 14),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: palette.wash(const Color(0xFF6B7FD7)),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: SelectableText(
                    notice.body,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: palette.ink,
                      height: 1.5,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: () async {
                      await Clipboard.setData(
                        ClipboardData(
                          text: '${notice.title}\n\n${notice.body}',
                        ),
                      );
                      if (context.mounted) {
                        ScaffoldMessenger.of(
                          context,
                        ).showSnackBar(const SnackBar(content: Text('Copied')));
                      }
                    },
                    icon: const Icon(Icons.copy_rounded, size: 18),
                    label: const Text('Copy'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.text});

  final String icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final palette = KidSkyPalette.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        KidIconArt(icon, colour: palette.quiet, size: 18),
        const SizedBox(width: 6),
        Text(
          text,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: palette.quiet),
        ),
      ],
    );
  }
}

/// The big megaphone at the top of an announcement, in its kind's colour,
/// with a few stars and confetti.
class _Megaphone extends StatelessWidget {
  const _Megaphone({required this.kind});

  final AnnouncementKind kind;

  @override
  Widget build(BuildContext context) {
    final palette = KidSkyPalette.of(context);
    return ExcludeSemantics(
      child: SizedBox(
        height: 150,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Container(
              width: 128,
              height: 128,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: palette.dark
                    ? Colors.white.withValues(alpha: 0.06)
                    : Colors.white.withValues(alpha: 0.75),
              ),
            ),
            KidIconArt(kind.icon, colour: kind.colour, size: 76),
            for (final (x, y, size, colour) in const [
              (-0.55, -0.6, 22.0, Color(0xFFFFC83D)),
              (0.6, -0.75, 16.0, Color(0xFFFFC83D)),
              (0.7, 0.55, 20.0, Color(0xFFFFC83D)),
              (-0.7, 0.5, 14.0, Color(0xFF7DD3FC)),
            ])
              Align(
                alignment: Alignment(x, y),
                child: KidIconArt(
                  AnnouncementArt.star,
                  colour: colour,
                  size: size,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Nothing to show, or something went wrong — in a card, with a way on.
class _Message extends StatelessWidget {
  const _Message({
    required this.title,
    required this.text,
    this.action,
    this.onAction,
  });

  final String title;
  final String text;
  final String? action;
  final Future<void> Function()? onAction;

  @override
  Widget build(BuildContext context) {
    final palette = KidSkyPalette.of(context);
    final theme = Theme.of(context);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 120),
      children: [
        KidCard(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 22),
          child: Column(
            children: [
              const _Megaphone(kind: AnnouncementKind.general),
              Text(
                title,
                textAlign: TextAlign.center,
                style: theme.textTheme.titleLarge?.copyWith(
                  color: palette.ink,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                text,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: palette.quiet,
                ),
              ),
              if (action != null && onAction != null) ...[
                const SizedBox(height: 16),
                FilledButton(onPressed: onAction, child: Text(action!)),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
