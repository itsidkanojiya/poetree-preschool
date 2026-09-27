import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/config/school_config.dart';
import '../../core/widgets/kid_ui.dart';
import '../../core/widgets/password_field.dart';
import 'registration_controller.dart';

/// A parent registering themselves.
///
/// Four steps rather than one scroll. The form asks for fourteen things, and
/// as a single page it was a wall a parent had to read twice to find what was
/// still missing — the error for a field two screens up is not an error anybody
/// can see. Each step is a screenful, validated before the next one opens.
///
/// The father's mobile is the account: it signs in, it receives the code, and
/// everything the school sends afterwards goes to it. The mother's number is
/// asked for beside it because the first one is not always answered, and the
/// office needs a second one in the afternoon.
///
/// It does not ask which school — this binary belongs to one — and it does not
/// ask for a photograph: that would mean accepting files from somebody with no
/// account, and the office puts the child's photograph on their record itself.
class RegistrationView extends GetView<RegistrationController> {
  const RegistrationView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Obx(
        () =>
            controller.isSent.value ? const _Sent() : const _RegistrationForm(),
      ),
    );
  }
}

/// What a family sees once the school has it. Deliberately a whole screen: it
/// is the end of the job, and a snackbar would be missed.
class _Sent extends StatelessWidget {
  const _Sent();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(
                    colors: [KidPalette.mint, Color(0xFF1FA383)],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: KidPalette.mint.withValues(alpha: 0.35),
                      blurRadius: 24,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.mark_email_read_rounded,
                  size: 58,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 26),
              Text(
                'Sent to the school!',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 10),
              Text(
                '${SchoolConfig.schoolName} will check your details against '
                'their records. You will be able to sign in once they have '
                'approved it.',
                style: theme.textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 30),
              GradientButton(
                label: 'Back to sign in',
                onPressed: () => Get.back<void>(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RegistrationForm extends StatefulWidget {
  const _RegistrationForm();

  @override
  State<_RegistrationForm> createState() => _RegistrationFormState();
}

class _RegistrationFormState extends State<_RegistrationForm> {
  /// One key per step: validating step two must not complain about step three.
  final _childKey = GlobalKey<FormState>();
  final _parentsKey = GlobalKey<FormState>();
  final _passwordKey = GlobalKey<FormState>();

  final _studentFirstName = TextEditingController();
  final _studentMiddleName = TextEditingController();
  final _studentLastName = TextEditingController();
  final _bloodGroup = TextEditingController();

  final _fatherPhone = TextEditingController();
  final _phoneCode = TextEditingController();
  final _motherName = TextEditingController();
  final _motherPhone = TextEditingController();
  final _email = TextEditingController();
  final _emailCode = TextEditingController();
  final _address = TextEditingController();

  final _password = TextEditingController();
  final _confirm = TextEditingController();

  static const _steps = ['Child', 'Parents', 'Confirm', 'Password'];

  static const _titles = [
    'About your child',
    'About the parents',
    'Confirm it’s you',
    'Choose a password',
  ];

  int _step = 0;
  DateTime? _dateOfBirth;
  String? _dateOfBirthError;
  bool _declared = false;
  bool _accepted = false;

  @override
  void initState() {
    super.initState();
    // Editing either one throws away its proof, so an account cannot be opened
    // on a number or an address nobody answered.
    final registration = Get.find<RegistrationController>();

    _fatherPhone.addListener(() {
      if (registration.phoneOtp.isVerified.value &&
          _fatherPhone.text.trim() != registration.phoneOtp.destination.value) {
        registration.forgetProof('PHONE');
      }
    });

    _email.addListener(() {
      if (registration.emailOtp.isVerified.value &&
          _email.text.trim() != registration.emailOtp.destination.value) {
        registration.forgetProof('EMAIL');
      }
    });
  }

  @override
  void dispose() {
    for (final controller in [
      _studentFirstName,
      _studentMiddleName,
      _studentLastName,
      _bloodGroup,
      _fatherPhone,
      _phoneCode,
      _motherName,
      _motherPhone,
      _email,
      _emailCode,
      _address,
      _password,
      _confirm,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  String? _required(String? value, String what) =>
      (value == null || value.trim().isEmpty) ? 'Enter $what' : null;

  String? _phone(String? value, String whose) {
    final trimmed = value?.trim() ?? '';
    if (trimmed.isEmpty) return 'Enter $whose';
    final digits = trimmed.replaceAll(RegExp(r'[^0-9]'), '');
    return digits.length < 10
        ? 'That does not look like a mobile number'
        : null;
  }

  static String _formatDate(DateTime value) =>
      '${value.day.toString().padLeft(2, '0')}/'
      '${value.month.toString().padLeft(2, '0')}/'
      '${value.year}';

  Future<void> _pickDateOfBirth() async {
    final now = DateTime.now();
    final chosen = await showDatePicker(
      context: context,
      // Opens on a plausible birthday for a preschool child rather than on
      // today, which is nobody's.
      initialDate: _dateOfBirth ?? DateTime(now.year - 4, now.month, now.day),
      firstDate: DateTime(now.year - 20),
      lastDate: now,
      helpText: 'Child’s date of birth',
    );

    if (chosen == null) return;
    setState(() {
      _dateOfBirth = chosen;
      _dateOfBirthError = null;
    });
  }

  Future<void> _next() async {
    FocusScope.of(context).unfocus();
    final registration = Get.find<RegistrationController>();

    if (_step == 0) {
      setState(() {
        _dateOfBirthError = _dateOfBirth == null
            ? 'Choose your child’s date of birth'
            : null;
      });
      if (!(_childKey.currentState?.validate() ?? false)) return;
      if (_dateOfBirth == null) return;
    }

    // Leaving the parents step is what sends the codes. There is no button for
    // it: a family who has just typed their number and their address is about
    // to press Continue anyway, and a second button beside each field was two
    // more things to notice and one more way to reach the next screen with
    // nothing sent.
    if (_step == 1) {
      if (!(_parentsKey.currentState?.validate() ?? false)) return;

      final sent = await registration.sendBothCodes(
        phone: _fatherPhone.text,
        email: _email.text,
      );
      if (!sent) return;
      // Codes from an earlier visit to this step belong to challenges that
      // no longer count.
      _phoneCode.clear();
      _emailCode.clear();
    }

    // And leaving the confirm step is what checks them — any the boxes have
    // not already checked by themselves.
    if (_step == 2) {
      final confirmed = await registration.verifyBothCodes(
        phoneCode: _phoneCode.text,
        emailCode: _emailCode.text,
      );
      if (!confirmed) return;
    }

    if (!mounted) return;
    setState(() => _step += 1);
  }

  void _back() {
    FocusScope.of(context).unfocus();
    setState(() => _step -= 1);
  }

  Future<void> _submit() async {
    final registration = Get.find<RegistrationController>();

    if (!(_passwordKey.currentState?.validate() ?? false)) return;
    if (!_declared || !_accepted) {
      setState(() {});
      return;
    }

    FocusScope.of(context).unfocus();

    await registration.submit(
      studentFirstName: _studentFirstName.text,
      studentMiddleName: _studentMiddleName.text,
      studentLastName: _studentLastName.text,
      studentDateOfBirth: _dateOfBirth!,
      // The father's name and the child's surname, which is who the account
      // belongs to.
      guardianName: [
        _studentMiddleName.text.trim(),
        _studentLastName.text.trim(),
      ].where((part) => part.isNotEmpty).join(' '),
      phone: _fatherPhone.text,
      motherPhone: _motherPhone.text,
      email: _email.text,
      password: _password.text,
      confirmPassword: _confirm.text,
      address: _address.text,
      motherName: _motherName.text,
      bloodGroup: _bloodGroup.text,
    );
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<RegistrationController>();
    final theme = Theme.of(context);

    return Column(
      children: [
        AuthHeader(
          title: _titles[_step],
          subtitle: 'Step ${_step + 1} of ${_steps.length}',
          leading: IconButton(
            onPressed: () => Get.back<void>(),
            icon: const Icon(Icons.arrow_back_rounded),
            color: Colors.white,
            tooltip: 'Back to sign in',
            padding: EdgeInsets.zero,
            alignment: Alignment.centerLeft,
          ),
          bottom: _Steps(step: _step, steps: _steps),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_step == 0) ...[
                  _Intro(
                    icon: Icons.waving_hand_rounded,
                    text:
                        'Registering at ${SchoolConfig.schoolName}. The school '
                        'checks it against their records and opens your '
                        'account — you do not need an admission number.',
                  ),
                  const SizedBox(height: 18),
                ],

                Obx(() {
                  final message = controller.errorMessage.value;
                  if (message == null) return const SizedBox.shrink();
                  return Container(
                    margin: const EdgeInsets.only(bottom: 16),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.error_outline_rounded,
                          size: 20,
                          color: theme.colorScheme.onErrorContainer,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            message,
                            style: TextStyle(
                              color: theme.colorScheme.onErrorContainer,
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }),

                if (_step == 0) _childStep(),
                if (_step == 1) _parentsStep(),
                if (_step == 2) _confirmStep(controller, theme),
                if (_step == 3) _passwordStep(theme),
              ],
            ),
          ),
        ),
        _Actions(
          step: _step,
          lastStep: _steps.length - 1,
          onBack: _back,
          onNext: _next,
          onSubmit: _submit,
        ),
      ],
    );
  }

  Widget _childStep() {
    return Form(
      key: _childKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Three boxes rather than one, the way every school form here asks
          // for a name: given name, father's name, surname. Typed into one box
          // they come back in whatever order the parent thought of them, and
          // the office cannot sort a register by surname afterwards.
          TextFormField(
            controller: _studentFirstName,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Child’s name',
              hintText: 'Dishan',
              prefixIcon: Icon(Icons.child_care_rounded),
            ),
            validator: (v) => _required(v, 'your child’s name'),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _studentMiddleName,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Father’s name',
              hintText: 'Krunal',
              prefixIcon: Icon(Icons.person_rounded),
            ),
            validator: (v) => _required(v, 'the father’s name'),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _studentLastName,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Surname',
              hintText: 'Patel',
              prefixIcon: Icon(Icons.badge_rounded),
            ),
            validator: (v) => _required(v, 'your child’s surname'),
          ),
          const SizedBox(height: 14),
          // A picker rather than a typed date: a birthday typed as 04/09 means
          // two different days to two different people, and the office uses
          // this to tell one child from another.
          InkWell(
            onTap: _pickDateOfBirth,
            borderRadius: BorderRadius.circular(18),
            child: InputDecorator(
              decoration: InputDecoration(
                labelText: 'Child’s date of birth',
                helperText: 'So the school can tell which child this is.',
                errorText: _dateOfBirthError,
                prefixIcon: const Icon(Icons.cake_rounded),
                suffixIcon: const Icon(Icons.calendar_month_rounded),
              ),
              child: Text(
                _dateOfBirth == null
                    ? 'Choose a date'
                    : _formatDate(_dateOfBirth!),
                style: _dateOfBirth == null
                    ? TextStyle(color: Theme.of(context).hintColor)
                    : null,
              ),
            ),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _bloodGroup,
            decoration: const InputDecoration(
              labelText: 'Blood group (optional)',
              helperText: 'Used on the ID card if the school has none.',
              prefixIcon: Icon(Icons.bloodtype_rounded),
            ),
          ),
        ],
      ),
    );
  }

  Widget _parentsStep() {
    return Form(
      key: _parentsKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextFormField(
            controller: _fatherPhone,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Father’s mobile number',
              helperText: 'This is what you will sign in with.',
              prefixIcon: Icon(Icons.phone_iphone_rounded),
            ),
            validator: (v) => _phone(v, 'the father’s mobile number'),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _motherName,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Mother’s name (optional)',
              prefixIcon: Icon(Icons.face_3_rounded),
            ),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _motherPhone,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Mother’s mobile number',
              helperText: 'The second number the school rings.',
              prefixIcon: Icon(Icons.phone_android_rounded),
            ),
            validator: (v) => _phone(v, 'the mother’s mobile number'),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Email address',
              helperText: 'The school’s second way to reach you.',
              prefixIcon: Icon(Icons.alternate_email_rounded),
            ),
            validator: (v) {
              final trimmed = v?.trim() ?? '';
              if (trimmed.isEmpty) return 'Enter your email address';
              return trimmed.contains('@') && trimmed.contains('.')
                  ? null
                  : 'That does not look like an email address';
            },
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _address,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Address (optional)',
              prefixIcon: Icon(Icons.home_rounded),
            ),
          ),
          const SizedBox(height: 16),
          const _Intro(
            icon: Icons.sms_rounded,
            text:
                'When you press Continue we send a code to the father’s '
                'mobile and to the email address, to check they reach you.',
          ),
        ],
      ),
    );
  }

  /// Where the two codes are typed. Reached by Continue, which sent them.
  Widget _confirmStep(RegistrationController controller, ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _Intro(
          icon: Icons.verified_user_rounded,
          text:
              'We have sent a code to each of these. Type them in — each one '
              'checks itself as soon as it is complete.',
        ),
        const SizedBox(height: 16),
        _CodeCard(
          channel: 'PHONE',
          code: _phoneCode,
          icon: Icons.sms_rounded,
          title: 'Mobile number',
          destination: _fatherPhone.text.trim(),
          autofocus: true,
          onResend: () {
            _phoneCode.clear();
            return controller.sendOtp('PHONE', _fatherPhone.text);
          },
        ),
        const SizedBox(height: 14),
        _CodeCard(
          channel: 'EMAIL',
          code: _emailCode,
          icon: Icons.mail_rounded,
          title: 'Email address',
          destination: _email.text.trim(),
          onResend: () {
            _emailCode.clear();
            return controller.sendOtp('EMAIL', _email.text);
          },
        ),
      ],
    );
  }

  Widget _passwordStep(ThemeData theme) {
    final missingTicks = !_declared || !_accepted;

    return Form(
      key: _passwordKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Intro(
            icon: Icons.lock_rounded,
            text:
                'You will sign in with ${_fatherPhone.text.trim()} and this '
                'password.',
          ),
          const SizedBox(height: 16),
          PasswordField(
            controller: _password,
            label: 'Choose a password',
            helperText: 'At least 8 characters, with a letter and a number',
            prefixIcon: Icons.lock_rounded,
            autofillHints: const [AutofillHints.newPassword],
            validator: (v) =>
                (v == null || v.length < 8) ? 'At least 8 characters' : null,
          ),
          const SizedBox(height: 14),
          PasswordField(
            controller: _confirm,
            label: 'Type it once more',
            prefixIcon: Icons.lock_reset_rounded,
            validator: (v) =>
                v != _password.text ? 'The two passwords do not match' : null,
          ),
          const SizedBox(height: 16),
          _Tick(
            value: _declared,
            onChanged: (v) => setState(() => _declared = v),
            text: 'Everything I have written here is true and correct.',
          ),
          const SizedBox(height: 8),
          _Tick(
            value: _accepted,
            onChanged: (v) => setState(() => _accepted = v),
            text:
                'I accept ${SchoolConfig.schoolName}’s terms and privacy '
                'policy.',
          ),
          if (missingTicks)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'Both boxes have to be ticked before this can be sent.',
                style: TextStyle(
                  fontSize: 12.5,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// The four steps as numbered dots on the header, done ones ticked.
class _Steps extends StatelessWidget {
  const _Steps({required this.step, required this.steps});

  final int step;
  final List<String> steps;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < steps.length; i++) ...[
          if (i > 0)
            Expanded(
              child: Container(
                height: 3,
                margin: const EdgeInsets.only(top: 15),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: i <= step ? 0.95 : 0.3),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
          SizedBox(
            width: 58,
            child: Column(
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: i <= step
                        ? Colors.white
                        : Colors.white.withValues(alpha: 0.25),
                  ),
                  alignment: Alignment.center,
                  child: i < step
                      ? const Icon(
                          Icons.check_rounded,
                          size: 18,
                          color: KidPalette.mint,
                        )
                      : Text(
                          '${i + 1}',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: i == step ? KidPalette.violet : Colors.white,
                          ),
                        ),
                ),
                const SizedBox(height: 4),
                Text(
                  steps[i],
                  maxLines: 1,
                  overflow: TextOverflow.fade,
                  softWrap: false,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: i == step ? FontWeight.w700 : FontWeight.w500,
                    color: Colors.white.withValues(alpha: i <= step ? 1 : 0.7),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// A friendly line at the top of a step.
class _Intro extends StatelessWidget {
  const _Intro({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: KidPalette.violet.withValues(alpha: isDark ? 0.18 : 0.07),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: KidPalette.violet),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: theme.textTheme.bodySmall)),
        ],
      ),
    );
  }
}

/// A tick box that reads as one tappable row.
class _Tick extends StatelessWidget {
  const _Tick({
    required this.value,
    required this.onChanged,
    required this.text,
  });

  final bool value;
  final ValueChanged<bool> onChanged;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;

    return InkWell(
      onTap: () => onChanged(!value),
      borderRadius: BorderRadius.circular(16),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.fromLTRB(6, 6, 12, 6),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: value ? KidPalette.violet : colors.outlineVariant,
            width: value ? 1.6 : 1,
          ),
        ),
        child: Row(
          children: [
            Checkbox(
              value: value,
              onChanged: (v) => onChanged(v ?? false),
              activeColor: KidPalette.violet,
            ),
            Expanded(child: Text(text, style: const TextStyle(fontSize: 13.5))),
          ],
        ),
      ),
    );
  }
}

/// One code: where it went, the boxes to type it in, whether it has been
/// accepted, and a way to ask for another.
///
/// The same widget for the number and the address — they ask the same question,
/// and two copies would be two places to fix whatever is found wrong with it.
class _CodeCard extends StatefulWidget {
  const _CodeCard({
    required this.channel,
    required this.code,
    required this.icon,
    required this.title,
    required this.destination,
    required this.onResend,
    this.autofocus = false,
  });

  final String channel;
  final TextEditingController code;
  final IconData icon;
  final String title;
  final String destination;
  final Future<void> Function() onResend;
  final bool autofocus;

  @override
  State<_CodeCard> createState() => _CodeCardState();
}

class _CodeCardState extends State<_CodeCard> {
  /// How long before another code can be asked for. Long enough that a slow
  /// SMS arrives before a second one is sent and the first stops counting.
  static const _cooldown = 30;

  Timer? _tick;

  @override
  void initState() {
    super.initState();
    // Redraws once a second so the countdown moves.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  int _secondsLeft(DateTime? sentAt) {
    if (sentAt == null) return 0;
    final gone = DateTime.now().difference(sentAt).inSeconds;
    return (_cooldown - gone).clamp(0, _cooldown);
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<RegistrationController>();
    final state = controller.otpFor(widget.channel);
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return Obx(() {
      final verified = state.isVerified.value;
      final verifying = state.isVerifying.value;
      final sending = state.isSending.value;
      final error = state.error.value;
      final length = state.codeLength.value;
      final wait = _secondsLeft(state.sentAt.value);

      return AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: verified
                ? KidPalette.mint.withValues(alpha: 0.7)
                : colors.outlineVariant,
            width: verified ? 1.6 : 1,
          ),
          boxShadow: [
            BoxShadow(
              color: KidPalette.violet.withValues(alpha: 0.06),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: (verified ? KidPalette.mint : KidPalette.violet)
                        .withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                    verified ? Icons.check_circle_rounded : widget.icon,
                    color: verified ? KidPalette.mint : KidPalette.violet,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        verified ? '${widget.title} confirmed' : widget.title,
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: verified
                              ? const Color(0xFF14876B)
                              : colors.onSurfaceVariant,
                        ),
                      ),
                      Text(
                        widget.destination,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                if (verifying)
                  const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            OtpInput(
              controller: widget.code,
              length: length,
              enabled: !verified && !verifying,
              verified: verified,
              hasError: error != null,
              autofocus: widget.autofocus && !verified,
              // A fresh digit clears the last complaint about the old ones.
              onChanged: (_) {
                if (state.error.value != null) state.error.value = null;
              },
              onCompleted: (code) =>
                  unawaited(controller.verifyOtp(widget.channel, code)),
            ),
            const SizedBox(height: 10),

            if (error != null)
              Text(
                error,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(color: colors.error),
              )
            // Said out loud while no message is really being sent, rather
            // than leaving a family waiting for one that is not coming.
            else if (!verified && !state.delivered.value)
              Text(
                widget.channel == 'PHONE'
                    ? 'Text messages are not switched on yet — enter 1234.'
                    : 'Emails are not switched on yet — enter 1234.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceVariant,
                ),
              ),

            if (!verified)
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'Didn’t get it?',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: colors.onSurfaceVariant,
                    ),
                  ),
                  TextButton(
                    onPressed: sending || wait > 0
                        ? null
                        : () => unawaited(widget.onResend()),
                    style: TextButton.styleFrom(
                      foregroundColor: KidPalette.violet,
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                    ),
                    child: Text(
                      sending
                          ? 'Sending…'
                          : wait > 0
                          ? 'Send again in 0:${wait.toString().padLeft(2, '0')}'
                          : 'Send again',
                    ),
                  ),
                ],
              )
            else
              const SizedBox(height: 6),
          ],
        ),
      );
    });
  }
}

/// Back and forward, pinned to the bottom so they are always in reach.
class _Actions extends StatelessWidget {
  const _Actions({
    required this.step,
    required this.lastStep,
    required this.onBack,
    required this.onNext,
    required this.onSubmit,
  });

  final int step;
  final int lastStep;
  final VoidCallback onBack;
  final VoidCallback onNext;
  final Future<void> Function() onSubmit;

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<RegistrationController>();
    final bottom = MediaQuery.paddingOf(context).bottom;

    return Container(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 16 + bottom),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 12,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Row(
        children: [
          if (step > 0) ...[
            Expanded(
              child: OutlinedButton(
                onPressed: onBack,
                style: OutlinedButton.styleFrom(
                  foregroundColor: KidPalette.violet,
                  minimumSize: const Size.fromHeight(56),
                  side: const BorderSide(color: KidPalette.violet, width: 1.4),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                child: const Text('Back'),
              ),
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            flex: 2,
            child: Obx(() {
              // Sending the codes and checking them both happen behind this
              // button now, so it is the thing that has to look busy.
              final working =
                  controller.isBusy.value ||
                  controller.phoneOtp.isSending.value ||
                  controller.emailOtp.isSending.value ||
                  controller.phoneOtp.isVerifying.value ||
                  controller.emailOtp.isVerifying.value;

              return GradientButton(
                label: step == lastStep ? 'Send to the school' : 'Continue',
                icon: step == lastStep
                    ? Icons.send_rounded
                    : Icons.arrow_forward_rounded,
                busy: working,
                onPressed: step == lastStep ? () => onSubmit() : onNext,
              );
            }),
          ),
        ],
      ),
    );
  }
}
