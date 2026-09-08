import 'package:flutter/material.dart';

/// A password box you can look at.
///
/// Typing a password blind onto a phone keyboard, on a form that answers a
/// wrong one with "check your details", is how a parent ends up locked out by
/// a typo they could have seen. Every password field in this app uses this.
///
/// Hidden to start with, always. The eye is there for the moment somebody wants
/// to check what they typed, not a setting that leaves a password on screen in
/// a room full of other parents.
class PasswordField extends StatefulWidget {
  const PasswordField({
    required this.controller,
    required this.label,
    super.key,
    this.helperText,
    this.autofillHints,
    this.textInputAction,
    this.onSubmitted,
    this.validator,
  });

  final TextEditingController controller;
  final String label;
  final String? helperText;
  final Iterable<String>? autofillHints;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;

  /// Given when the field sits in a Form; without it this is a plain field.
  final FormFieldValidator<String>? validator;

  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool _hidden = true;

  @override
  Widget build(BuildContext context) {
    final decoration = InputDecoration(
      labelText: widget.label,
      helperText: widget.helperText,
      suffixIcon: IconButton(
        onPressed: () => setState(() => _hidden = !_hidden),
        icon: Icon(
          _hidden ? Icons.visibility_rounded : Icons.visibility_off_rounded,
        ),
        // Said as an action, because a screen reader announcing "visibility"
        // tells somebody nothing about what the button will do.
        tooltip: _hidden ? 'Show password' : 'Hide password',
      ),
    );

    return TextFormField(
      controller: widget.controller,
      obscureText: _hidden,
      autofillHints: widget.autofillHints,
      textInputAction: widget.textInputAction,
      onFieldSubmitted: widget.onSubmitted,
      validator: widget.validator,
      decoration: decoration,
    );
  }
}
