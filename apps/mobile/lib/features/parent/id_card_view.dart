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
/// And the same layout the school chose, so the card on the screen is
/// recognisably the one on the lanyard.
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
          builder: (context) =>
              _CardPage(card: _Card.from(controller.card.value ?? const {})),
        ),
      ),
    );
  }
}

/// The response, read once, so the layouts below deal in fields not map keys.
class _Card {
  const _Card({
    required this.layout,
    required this.schoolName,
    required this.schoolLogo,
    required this.schoolAddress,
    required this.schoolPhone,
    required this.brand,
    required this.name,
    required this.admissionNo,
    required this.classroom,
    required this.batch,
    required this.dateOfBirth,
    required this.photo,
    required this.bloodGroup,
    required this.guardianName,
    required this.guardianPhone,
    required this.address,
  });

  factory _Card.from(Map<String, dynamic> data) {
    String? text(String key) => data[key]?.toString();
    final hex = text('primaryColor')?.replaceFirst('#', '');
    final value = int.tryParse(hex ?? '', radix: 16);

    return _Card(
      layout: text('layout') ?? 'CLASSIC',
      schoolName: text('schoolName') ?? '',
      schoolLogo: text('schoolLogoUrl'),
      schoolAddress: text('schoolAddress'),
      schoolPhone: text('schoolPhone'),
      brand: value == null
          ? const Color(0xFF16307C)
          : Color(0xFF000000 | value),
      name: text('name') ?? '',
      admissionNo: text('admissionNo') ?? '—',
      classroom: text('classroom'),
      batch: text('batch'),
      dateOfBirth: text('dateOfBirth'),
      photo: text('photoUrl'),
      bloodGroup: text('bloodGroup'),
      guardianName: text('guardianName'),
      guardianPhone: text('guardianPhone'),
      address: text('address'),
    );
  }

  final String layout;
  final String schoolName;
  final String? schoolLogo;
  final String? schoolAddress;
  final String? schoolPhone;
  final Color brand;
  final String name;
  final String admissionNo;
  final String? classroom;
  final String? batch;
  final String? dateOfBirth;
  final String? photo;
  final String? bloodGroup;
  final String? guardianName;
  final String? guardianPhone;
  final String? address;

  /// White or near-black, whichever contrasts more with the school's colour —
  /// the same rule as the printed card, so a saffron gets dark text.
  Color get onBrand {
    final l = brand.computeLuminance();
    const inkLuminance = 0.0118;
    return (l + 0.05) / (inkLuminance + 0.05) > 1.05 / (l + 0.05)
        ? const Color(0xFF1A1D29)
        : Colors.white;
  }

  /// Pale wash of the school's colour, for card grounds.
  Color tint(double amount) => Color.lerp(brand, Colors.white, amount)!;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    if (parts.isEmpty) return '?';
    final list = parts.toList();
    return (list.first[0] + (list.length > 1 ? list[1][0] : '')).toUpperCase();
  }
}

class _CardPage extends StatelessWidget {
  const _CardPage({required this.card});

  final _Card card;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          // Drawn as a card rather than a list, because that is what it is —
          // a parent holds the phone up at the gate and somebody looks at it.
          switch (card.layout) {
            'BANNER' => _Shell(child: _BannerCard(card: card)),
            'FRONT_BACK' => Column(
              children: [
                _Shell(child: _FrontCard(card: card)),
                const SizedBox(height: 8),
                Text('Back', style: theme.textTheme.labelMedium),
                const SizedBox(height: 8),
                _Shell(child: _BackCard(card: card)),
              ],
            ),
            _ => _Shell(child: _ClassicCard(card: card)),
          },
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
}

class _Shell extends StatelessWidget {
  const _Shell({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
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
      child: child,
    );
  }
}

/// The child's photograph, or their initials where the school holds none —
/// exactly as the printed card does.
class _Photo extends StatelessWidget {
  const _Photo({
    required this.card,
    required this.size,
    this.round = false,
    this.aspect = 1.15,
  });

  final _Card card;
  final double size;
  final bool round;

  /// Height over width. A passport photograph is taller than it is wide.
  final double aspect;

  @override
  Widget build(BuildContext context) {
    final photo = card.photo;
    final content = photo != null
        ? AuthedImage(path: photo, fit: BoxFit.cover)
        : ColoredBox(
            color: card.tint(0.85),
            child: Center(
              child: Text(
                card.initials,
                style: TextStyle(
                  fontSize: size * 0.34,
                  fontWeight: FontWeight.w800,
                  color: card.brand,
                ),
              ),
            ),
          );

    return SizedBox(
      width: size,
      height: round ? size : size * aspect,
      child: round
          ? ClipOval(child: content)
          : ClipRRect(borderRadius: BorderRadius.circular(4), child: content),
    );
  }
}

class _Logo extends StatelessWidget {
  const _Logo({required this.card, required this.size});

  final _Card card;
  final double size;

  @override
  Widget build(BuildContext context) {
    final logo = card.schoolLogo;
    if (logo == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(right: 10),
      child: SizedBox(
        width: size,
        height: size,
        child: AuthedImage(path: logo, fit: BoxFit.contain),
      ),
    );
  }
}

/// "Label : value", with the labels in the school's colour.
class _ColonRows extends StatelessWidget {
  const _ColonRows({
    required this.rows,
    required this.colour,
    this.upper = false,
  });

  final List<(String, String)> rows;
  final Color colour;
  final bool upper;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Table(
      columnWidths: const {
        0: IntrinsicColumnWidth(),
        1: FixedColumnWidth(14),
        2: FlexColumnWidth(),
      },
      children: [
        for (final (label, value) in rows)
          TableRow(
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  label,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: colour,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Text(
                ':',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colour,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  upper ? value.toUpperCase() : value,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// Classic
// -----------------------------------------------------------------------------

class _ClassicCard extends StatelessWidget {
  const _ClassicCard({required this.card});

  final _Card card;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const ink = Color(0xFF1A1D29);

    // Guardian and phone side by side, never split across rows — as printed.
    final facts = <(String, String)>[
      ('Admission no.', card.admissionNo),
      if (card.bloodGroup != null) ('Blood group', card.bloodGroup!),
      if (card.dateOfBirth != null) ('Date of birth', card.dateOfBirth!),
      if (card.batch != null) ('Academic year', card.batch!),
    ];
    final rows = <List<(String, String)>>[
      facts.take(2).toList(),
      if (card.guardianPhone != null)
        [
          ('Guardian', card.guardianName ?? '—'),
          ('Phone', card.guardianPhone!),
        ],
      if (facts.length > 2) facts.skip(2).toList(),
      if (card.address != null) [('Address', card.address!)],
    ];

    final contact = [
      card.schoolAddress,
      if (card.schoolPhone != null) 'Ph. ${card.schoolPhone}',
    ].whereType<String>().join('  ·  ');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ClassicHeader(card: card),
        Stack(
          children: [
            // A faint wash in the corner, so the white is not a blank.
            Positioned(
              right: -80,
              bottom: -90,
              child: Container(
                width: 260,
                height: 260,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: card.tint(0.94),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
              child: Column(
                children: [
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: card.tint(0.72),
                      borderRadius: BorderRadius.circular(22),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(18),
                      child: _Photo(card: card, size: 132, aspect: 1.18),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    card.name,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: ink,
                    ),
                  ),
                  if (card.classroom != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: card.tint(0.84),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        card.classroom!,
                        style: theme.textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: Color.lerp(card.brand, ink, 0.55),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
                  for (final row in rows)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          for (final (i, (label, value)) in row.indexed) ...[
                            if (i > 0) const SizedBox(width: 16),
                            Expanded(
                              child: _Fact(label: label, value: value),
                            ),
                          ],
                          // A lone fact keeps its column width; only the
                          // address takes the whole row.
                          if (row.length == 1 && row.first.$1 != 'Address') ...[
                            const SizedBox(width: 16),
                            const Expanded(child: SizedBox.shrink()),
                          ],
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        Container(
          color: card.brand,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Text(
            contact.isEmpty
                ? 'If found, please return to ${card.schoolName}'
                : contact,
            textAlign: TextAlign.center,
            style: theme.textTheme.labelSmall?.copyWith(
              color: card.onBrand,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }
}

/// The school's band: a white badge with the logo or initials, the name, and
/// what the card is.
class _ClassicHeader extends StatelessWidget {
  const _ClassicHeader({required this.card});

  final _Card card;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final logo = card.schoolLogo;
    final schoolInitials = card.schoolName
        .trim()
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .take(2)
        .map((w) => w[0])
        .join()
        .toUpperCase();

    return Container(
      color: card.brand,
      child: Stack(
        children: [
          Positioned(
            right: -40,
            top: -50,
            child: CircleAvatar(
              radius: 70,
              backgroundColor: card.onBrand.withValues(alpha: 0.12),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(13),
                  ),
                  alignment: Alignment.center,
                  child: logo != null
                      ? AuthedImage(path: logo, fit: BoxFit.contain)
                      : Text(
                          schoolInitials,
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: Color.lerp(
                              card.brand,
                              const Color(0xFF1A1D29),
                              card.brand.computeLuminance() > 0.4 ? 0.45 : 0,
                            ),
                          ),
                        ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        card.schoolName,
                        style: theme.textTheme.titleLarge?.copyWith(
                          color: card.onBrand,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'STUDENT IDENTITY CARD',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: card.onBrand.withValues(alpha: 0.75),
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.4,
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
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: theme.textTheme.labelSmall?.copyWith(
            color: const Color(0xFF6B7280),
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w700,
            color: const Color(0xFF1A1D29),
          ),
        ),
      ],
    );
  }
}

// -----------------------------------------------------------------------------
// Banner
// -----------------------------------------------------------------------------

class _BannerCard extends StatelessWidget {
  const _BannerCard({required this.card});

  final _Card card;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final contact = [
      card.schoolAddress,
      if (card.schoolPhone != null) 'Ph. ${card.schoolPhone}',
    ].whereType<String>().join('  ·  ');

    final rows = <(String, String)>[
      ('Name', card.name),
      if (card.classroom != null) ('Grade', card.classroom!),
      ('Adm. no.', card.admissionNo),
      if (card.dateOfBirth != null) ('Birth date', card.dateOfBirth!),
      if (card.bloodGroup != null) ('Blood', card.bloodGroup!),
      if (card.guardianPhone != null) ('Mobile', card.guardianPhone!),
      if (card.address != null) ('Address', card.address!),
    ];

    return ColoredBox(
      color: card.tint(0.94),
      child: Column(
        children: [
          Container(
            width: double.infinity,
            color: card.brand,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _Logo(card: card, size: 40),
                Flexible(
                  child: Text(
                    card.schoolName.toUpperCase(),
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleLarge?.copyWith(
                      color: card.onBrand,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white,
              border: Border.all(color: card.brand, width: 4),
            ),
            child: _Photo(card: card, size: 124, round: true),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 18, 22, 12),
            child: _ColonRows(rows: rows, colour: card.brand, upper: true),
          ),
          if (contact.isNotEmpty)
            Container(
              width: double.infinity,
              color: Color.lerp(card.brand, Colors.black, 0.25),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Text(
                contact,
                textAlign: TextAlign.center,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// -----------------------------------------------------------------------------
// Front & back
// -----------------------------------------------------------------------------

/// The angled bands both faces share, as on the printed card.
class _Backdrop extends CustomPainter {
  _Backdrop(this.card);

  final _Card card;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    Path shape(List<Offset> points) => Path()..addPolygon(points, true);

    canvas
      ..drawPath(
        shape([
          Offset(0, h * 0.12),
          Offset(w, h * 0.55),
          Offset(w, h * 0.95),
          Offset(0, h * 0.52),
        ]),
        Paint()..color = card.tint(0.88),
      )
      ..drawPath(
        shape([
          Offset(0, h * 0.52),
          Offset(w, h * 0.95),
          Offset(w, h),
          Offset(0, h),
        ]),
        Paint()..color = card.tint(0.94),
      )
      ..drawPath(
        shape([
          Offset(w, h * 0.3),
          Offset(w, h * 0.62),
          Offset(w * 0.84, h * 0.46),
        ]),
        Paint()..color = card.tint(0.62),
      );
  }

  @override
  bool shouldRepaint(_Backdrop old) => old.card.brand != card.brand;
}

class _Foot extends StatelessWidget {
  const _Foot({required this.card, this.text});

  final _Card card;
  final String? text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: Color.lerp(card.brand, Colors.black, 0.2),
      padding: EdgeInsets.symmetric(
        horizontal: 14,
        vertical: text == null ? 8 : 10,
      ),
      child: text == null
          ? null
          : Text(
              text!,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: const Color(0xFFFFE66D),
                fontWeight: FontWeight.w700,
              ),
            ),
    );
  }
}

class _FrontCard extends StatelessWidget {
  const _FrontCard({required this.card});

  final _Card card;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final rows = <(String, String)>[
      ('Adm. no.', card.admissionNo),
      if (card.dateOfBirth != null) ('Birth date', card.dateOfBirth!),
      if (card.batch != null) ('Batch', card.batch!),
      if (card.bloodGroup != null) ('Blood group', card.bloodGroup!),
    ];

    return CustomPaint(
      painter: _Backdrop(card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Row(
              children: [
                _Logo(card: card, size: 42),
                Expanded(
                  child: Text(
                    card.schoolName,
                    style: theme.textTheme.titleLarge?.copyWith(
                      color: card.brand,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Center(
            child: Container(
              decoration: BoxDecoration(
                border: Border.all(color: const Color(0xFF1A1D29), width: 3),
              ),
              child: _Photo(card: card, size: 130),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            card.name.toUpperCase(),
            textAlign: TextAlign.center,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: const Color(0xFF1A1D29),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(28, 12, 28, 8),
            child: _ColonRows(rows: rows, colour: card.brand),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                color: Colors.white,
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: Text(
                  (card.classroom ?? '').toUpperCase(),
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: card.brand,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const Spacer(),
              Padding(
                padding: const EdgeInsets.fromLTRB(0, 0, 16, 8),
                child: Column(
                  children: [
                    Container(
                      width: 110,
                      height: 1,
                      color: const Color(0xFF6B7280),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'Authorised signature',
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFF1A1D29),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _Foot(card: card),
        ],
      ),
    );
  }
}

class _BackCard extends StatelessWidget {
  const _BackCard({required this.card});

  final _Card card;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final logo = card.schoolLogo;

    final rows = <(String, String)>[
      if (card.address != null) ('Address', card.address!),
      if (card.guardianPhone != null) ('Mobile', card.guardianPhone!),
    ];

    final school = [
      card.schoolName,
      if (card.schoolPhone != null) 'Contact: ${card.schoolPhone}',
      card.schoolAddress,
    ].whereType<String>();

    return CustomPaint(
      painter: _Backdrop(card),
      child: Column(
        children: [
          const SizedBox(height: 18),
          if (logo != null)
            SizedBox(
              width: 110,
              height: 110,
              child: AuthedImage(path: logo, fit: BoxFit.contain),
            )
          else
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                card.schoolName,
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineSmall?.copyWith(
                  color: card.brand,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.92),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (rows.isNotEmpty) ...[
                  _ColonRows(rows: rows, colour: card.brand),
                  const SizedBox(height: 8),
                ],
                for (final line in school)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Text(
                      line,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFF1A1D29),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          _Foot(
            card: card,
            text: card.address != null
                ? 'If found, please return to the address above'
                : 'If found, please return to the school',
          ),
        ],
      ),
    );
  }
}
