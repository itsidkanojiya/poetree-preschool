import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/config/school_config.dart';
import '../../core/widgets/password_field.dart';
import 'registration_controller.dart';

/// A parent registering themselves.
///
/// The form asks who the child is and who the guardian is, and nothing else.
/// It used to demand the child's admission number, which meant a family could
/// only register if the office had already handed them one — the wrong way
/// round for a family joining the school. The office issues that number when it
/// approves, and until then this is a request, not a claim.
///
/// It does not ask which school: this binary belongs to one, and its name is on
/// the screen above. It does not ask for a photograph either — that would mean
/// accepting files from somebody with no account, and the office puts the
/// child's photograph on their record itself.
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
  final _formKey = GlobalKey<FormState>();

  final _studentName = TextEditingController();
  final _guardianName = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _address = TextEditingController();
  final _fatherName = TextEditingController();
  final _motherName = TextEditingController();
  final _bloodGroup = TextEditingController();
  final _emergencyName = TextEditingController();
  final _emergencyPhone = TextEditingController();

  String _relation = 'MOTHER';
  DateTime? _dateOfBirth;
  bool _declared = false;
  bool _accepted = false;

  @override
  void dispose() {
    for (final controller in [
      _studentName,
      _guardianName,
      _phone,
      _email,
      _password,
      _confirm,
      _address,
      _fatherName,
      _motherName,
      _bloodGroup,
      _emergencyName,
      _emergencyPhone,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  String? _required(String? value, String what) =>
      (value == null || value.trim().isEmpty) ? 'Enter $what' : null;

  /// Shown only once they have tried to send, like the two tick boxes below —
  /// scolding somebody for a field they have not reached yet is not help.
  String? _dateOfBirthError;

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

  Future<void> _submit() async {
    final registration = Get.find<RegistrationController>();

    setState(() {
      _dateOfBirthError = _dateOfBirth == null
          ? 'Choose your child’s date of birth'
          : null;
    });

    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_dateOfBirth == null || !_declared || !_accepted) {
      // Said where the boxes are rather than in a banner at the top, which on a
      // form this long is off the screen by the time you reach the button.
      setState(() {});
      return;
    }

    FocusScope.of(context).unfocus();

    await registration.submit(
      studentName: _studentName.text,
      studentDateOfBirth: _dateOfBirth!,
      guardianName: _guardianName.text,
      relation: _relation,
      phone: _phone.text,
      password: _password.text,
      confirmPassword: _confirm.text,
      email: _email.text,
      address: _address.text,
      fatherName: _fatherName.text,
      motherName: _motherName.text,
      bloodGroup: _bloodGroup.text,
      emergencyContactName: _emergencyName.text,
      emergencyContactPhone: _emergencyPhone.text,
    );
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<RegistrationController>();
    final theme = Theme.of(context);
    final missingTicks = !_declared || !_accepted;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Registering at ${SchoolConfig.schoolName}',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 6),
            Text(
              'Tell us about your child and yourself. The school checks it '
              'against their records and opens your account — you do not need '
              'an admission number.',
              style: theme.textTheme.bodySmall,
            ),
            const SizedBox(height: 20),

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
                  style: TextStyle(color: theme.colorScheme.onErrorContainer),
                ),
              );
            }),

            _Section(title: 'Your child'),
            TextFormField(
              controller: _studentName,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Child’s full name'),
              validator: (v) => _required(v, 'your child’s name'),
            ),
            const SizedBox(height: 14),
            // A picker rather than a typed date: a birthday typed as 04/09
            // means two different days to two different people, and the office
            // uses this to tell one child from another.
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
                      ? TextStyle(color: theme.hintColor)
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

            _Section(title: 'You'),
            TextFormField(
              controller: _guardianName,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Your full name'),
              validator: (v) => _required(v, 'your name'),
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: _relation,
              decoration: const InputDecoration(
                labelText: 'You are the child’s',
              ),
              items: const [
                DropdownMenuItem(value: 'MOTHER', child: Text('Mother')),
                DropdownMenuItem(value: 'FATHER', child: Text('Father')),
                DropdownMenuItem(value: 'GUARDIAN', child: Text('Guardian')),
                DropdownMenuItem(value: 'OTHER', child: Text('Other')),
              ],
              onChanged: (value) =>
                  setState(() => _relation = value ?? 'GUARDIAN'),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Your mobile number',
                helperText: 'This is what you will sign in with.',
              ),
              validator: (v) => _required(v, 'your mobile number'),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email (optional)'),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _address,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Address (optional)',
              ),
            ),

            _Section(title: 'Parents'),
            TextFormField(
              controller: _fatherName,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Father’s name (optional)',
              ),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _motherName,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Mother’s name (optional)',
              ),
            ),

            _Section(title: 'In an emergency'),
            TextFormField(
              controller: _emergencyName,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Who to call (optional)',
              ),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _emergencyPhone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Their number (optional)',
              ),
            ),

            _Section(title: 'Your password'),
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

            const SizedBox(height: 24),
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
                padding: const EdgeInsets.only(top: 4, bottom: 4),
                child: Text(
                  'Both boxes have to be ticked before this can be sent.',
                  style: TextStyle(
                    fontSize: 12.5,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),

            const SizedBox(height: 16),
            Obx(
              () => FilledButton(
                onPressed: controller.isBusy.value ? null : _submit,
                child: controller.isBusy.value
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Send to the school'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 26, bottom: 12),
      child: Text(
        title.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}
