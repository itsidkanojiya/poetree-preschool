import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/config/school_config.dart';
import '../../core/widgets/password_field.dart';
import 'registration_controller.dart';

/// A parent registering themselves.
///
/// Three steps rather than one scroll. The form asks for fourteen things, and
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
      appBar: AppBar(title: const Text('Register')),
      body: SafeArea(
        child: Obx(
          () => controller.isSent.value
              ? const _Sent()
              : const _RegistrationForm(),
        ),
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

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.hourglass_top_rounded,
              size: 56,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(height: 18),
            Text(
              'Sent to the school',
              style: theme.textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 10),
            Text(
              '${SchoolConfig.schoolName} will check your details against their '
              'records. You will be able to sign in once they have approved it.',
              style: theme.textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 28),
            FilledButton(
              onPressed: () => Get.back<void>(),
              child: const Text('Back to sign in'),
            ),
          ],
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

  static const _steps = ['Your child', 'Parents', 'Confirm', 'Password'];

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
    }

    // And leaving the confirm step is what checks them.
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
        _Progress(step: _step, steps: _steps),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_step == 0) ...[
                  Text(
                    'Registering at ${SchoolConfig.schoolName}',
                    style: theme.textTheme.titleMedium,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Tell us about your child and yourself. The school checks '
                    'it against their records and opens your account — you do '
                    'not need an admission number.',
                    style: theme.textTheme.bodySmall,
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
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Text(
                      message,
                      style: TextStyle(
                        color: theme.colorScheme.onErrorContainer,
                      ),
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
            decoration: const InputDecoration(
              labelText: 'Child’s name',
              hintText: 'Dishan',
            ),
            validator: (v) => _required(v, 'your child’s name'),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _studentMiddleName,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Father’s name',
              hintText: 'Krunal',
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
            ),
            validator: (v) => _required(v, 'your child’s surname'),
          ),
          const SizedBox(height: 14),
          // A picker rather than a typed date: a birthday typed as 04/09 means
          // two different days to two different people, and the office uses
          // this to tell one child from another.
          InkWell(
            onTap: _pickDateOfBirth,
            borderRadius: BorderRadius.circular(12),
            child: InputDecorator(
              decoration: InputDecoration(
                labelText: 'Child’s date of birth',
                helperText: 'So the school can tell which child this is.',
                errorText: _dateOfBirthError,
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
            decoration: const InputDecoration(
              labelText: 'Father’s mobile number',
              helperText: 'This is what you will sign in with.',
            ),
            validator: (v) => _phone(v, 'the father’s mobile number'),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _motherName,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Mother’s name (optional)',
            ),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _motherPhone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Mother’s mobile number',
              helperText: 'The second number the school rings.',
            ),
            validator: (v) => _phone(v, 'the mother’s mobile number'),
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
              labelText: 'Email address',
              helperText: 'The school’s second way to reach you.',
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
            decoration: const InputDecoration(labelText: 'Address (optional)'),
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
        Text(
          'We have sent a code to each of these. Type them in to confirm they '
          'reach you.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 18),
        _CodeBox(
          channel: 'PHONE',
          code: _phoneCode,
          label: 'Code sent to ${_fatherPhone.text.trim()}',
          onResend: () => controller.sendOtp('PHONE', _fatherPhone.text),
        ),
        const SizedBox(height: 18),
        _CodeBox(
          channel: 'EMAIL',
          code: _emailCode,
          label: 'Code sent to ${_email.text.trim()}',
          onResend: () => controller.sendOtp('EMAIL', _email.text),
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
          Text(
            'You will sign in with ${_fatherPhone.text.trim()} and this '
            'password.',
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          PasswordField(
            controller: _password,
            label: 'Choose a password',
            helperText: 'At least 8 characters, with a letter and a number',
            autofillHints: const [AutofillHints.newPassword],
            validator: (v) =>
                (v == null || v.length < 8) ? 'At least 8 characters' : null,
          ),
          const SizedBox(height: 14),
          PasswordField(
            controller: _confirm,
            label: 'Type it once more',
            validator: (v) =>
                v != _password.text ? 'The two passwords do not match' : null,
          ),
          const SizedBox(height: 20),
          CheckboxListTile(
            value: _declared,
            onChanged: (v) => setState(() => _declared = v ?? false),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: const Text(
              'Everything I have written here is true and correct.',
              style: TextStyle(fontSize: 13.5),
            ),
          ),
          CheckboxListTile(
            value: _accepted,
            onChanged: (v) => setState(() => _accepted = v ?? false),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: Text(
              'I accept ${SchoolConfig.schoolName}’s terms and privacy policy.',
              style: const TextStyle(fontSize: 13.5),
            ),
          ),
          if (missingTicks)
            Padding(
              padding: const EdgeInsets.only(top: 4),
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

/// Where they are, and how much is left.
class _Progress extends StatelessWidget {
  const _Progress({required this.step, required this.steps});

  final int step;
  final List<String> steps;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                steps[step],
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                'Step ${step + 1} of ${steps.length}',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: (step + 1) / steps.length,
              minHeight: 6,
            ),
          ),
        ],
      ),
    );
  }
}

/// One code: the box to type it in, whether it has been accepted, and a way
/// to ask for another.
///
/// The same widget for the number and the address — they ask the same question,
/// and two copies would be two places to fix whatever is found wrong with it.
class _CodeBox extends StatelessWidget {
  const _CodeBox({
    required this.channel,
    required this.code,
    required this.label,
    required this.onResend,
  });

  final String channel;
  final TextEditingController code;
  final String label;
  final VoidCallback onResend;

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<RegistrationController>();
    final state = controller.otpFor(channel);
    final theme = Theme.of(context);

    return Obx(() {
      final verified = state.isVerified.value;

      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextFormField(
            controller: code,
            enabled: !verified,
            keyboardType: TextInputType.number,
            maxLength: 6,
            decoration: InputDecoration(
              labelText: label,
              counterText: '',
              suffixIcon: verified
                  ? Icon(Icons.check_circle, color: theme.colorScheme.primary)
                  : null,
            ),
          ),

          // Said out loud while no message is really being sent, rather than
          // leaving a family waiting for one that is not coming.
          if (!verified && !state.delivered.value)
            Text(
              channel == 'PHONE'
                  ? 'Text messages are not switched on yet — enter 1234.'
                  : 'Emails are not switched on yet — enter 1234.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),

          if (state.error.value != null)
            Text(
              state.error.value!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),

          if (!verified)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: state.isSending.value ? null : onResend,
                child: Text(
                  state.isSending.value ? 'Sending…' : 'Send it again',
                ),
              ),
            ),
        ],
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

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
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
          if (step > 0)
            Expanded(
              child: OutlinedButton(
                onPressed: onBack,
                child: const Text('Back'),
              ),
            ),
          if (step > 0) const SizedBox(width: 12),
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

              return FilledButton(
                onPressed: working
                    ? null
                    : (step == lastStep ? () => onSubmit() : onNext),
                child: working
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(
                        step == lastStep ? 'Send to the school' : 'Continue',
                      ),
              );
            }),
          ),
        ],
      ),
    );
  }
}
