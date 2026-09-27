import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// The bright colours the child-facing screens are drawn in: the home page,
/// the films, and the sign-in and register screens a family meets first.
abstract final class KidPalette {
  static const violet = Color(0xFF6C5CE7);
  static const violetLight = Color(0xFF8E7CF8);
  static const pink = Color(0xFFF0648C);
  static const sun = Color(0xFFFFB547);
  static const mint = Color(0xFF2EC4A0);
  static const sky = Color(0xFF3FA9F5);
  static const coral = Color(0xFFE05A47);

  static const header = [violet, violetLight];
  static const action = [violet, pink];
}

/// The main button on a screen: a violet-to-pink pill with a spinner while it
/// works.
class GradientButton extends StatelessWidget {
  const GradientButton({
    required this.label,
    required this.onPressed,
    this.busy = false,
    this.icon,
    super.key,
  });

  final String label;

  /// Null draws it faded and untappable.
  final VoidCallback? onPressed;
  final bool busy;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !busy;

    return AnimatedOpacity(
      duration: const Duration(milliseconds: 150),
      opacity: enabled || busy ? 1 : 0.5,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: KidPalette.action),
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            if (enabled)
              BoxShadow(
                color: KidPalette.pink.withValues(alpha: 0.32),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
          ],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: enabled ? onPressed : null,
            borderRadius: BorderRadius.circular(18),
            child: SizedBox(
              height: 56,
              child: Center(
                child: busy
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Colors.white,
                        ),
                      )
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            label,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          if (icon != null) ...[
                            const SizedBox(width: 8),
                            Icon(icon, color: Colors.white, size: 20),
                          ],
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The violet header the sign-in and register screens open with.
class AuthHeader extends StatelessWidget {
  const AuthHeader({
    required this.title,
    this.subtitle,
    this.badge,
    this.leading,
    this.bottom,
    this.extraBottom = 0,
    super.key,
  });

  final String title;
  final String? subtitle;

  /// The school's logo, above the title.
  final Widget? badge;

  /// A back button, top left.
  final Widget? leading;

  /// Anything under the subtitle — the register form's steps.
  final Widget? bottom;

  /// Room at the foot for a card that overlaps the header.
  final double extraBottom;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final top = MediaQuery.paddingOf(context).top;

    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: KidPalette.header,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(32)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          // Soft circles, for a bit of play.
          const Positioned(right: -40, top: -30, child: _Blob(160)),
          const Positioned(left: -30, bottom: -50, child: _Blob(120)),
          Padding(
            padding: EdgeInsets.fromLTRB(20, top + 8, 20, 22 + extraBottom),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (leading != null) leading! else const SizedBox(height: 12),
                if (badge != null) ...[
                  const SizedBox(height: 8),
                  Center(child: badge),
                  const SizedBox(height: 16),
                ],
                SizedBox(
                  width: double.infinity,
                  child: Text(
                    title,
                    textAlign: badge != null
                        ? TextAlign.center
                        : TextAlign.start,
                    style: theme.textTheme.headlineSmall?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  SizedBox(
                    width: double.infinity,
                    child: Text(
                      subtitle!,
                      textAlign: badge != null
                          ? TextAlign.center
                          : TextAlign.start,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: Colors.white.withValues(alpha: 0.88),
                      ),
                    ),
                  ),
                ],
                if (bottom != null) ...[const SizedBox(height: 18), bottom!],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Blob extends StatelessWidget {
  const _Blob(this.size);

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        shape: BoxShape.circle,
      ),
    );
  }
}

/// A one-time code, one box per digit.
///
/// Underneath is a single ordinary text field, drawn invisible over the boxes:
/// that is what lets a pasted code, or one the keyboard offers from an SMS,
/// land in every box at once, and Backspace step back naturally. The boxes are
/// only a picture of what is in it.
class OtpInput extends StatefulWidget {
  const OtpInput({
    required this.controller,
    required this.length,
    this.onCompleted,
    this.onChanged,
    this.enabled = true,
    this.hasError = false,
    this.verified = false,
    this.autofocus = false,
    super.key,
  });

  final TextEditingController controller;
  final int length;

  /// Called once each time every box is filled.
  final ValueChanged<String>? onCompleted;
  final ValueChanged<String>? onChanged;
  final bool enabled;
  final bool hasError;
  final bool verified;
  final bool autofocus;

  @override
  State<OtpInput> createState() => _OtpInputState();
}

class _OtpInputState extends State<OtpInput>
    with SingleTickerProviderStateMixin {
  final _focus = FocusNode();
  // Made in initState, not lazily: a row never focused would otherwise first
  // create it in dispose(), while the tree is being torn down, and throw.
  late final AnimationController _caret;

  String? _completed;

  @override
  void initState() {
    super.initState();
    _caret = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 530),
    )..repeat(reverse: true);
    widget.controller.addListener(_changed);
    _focus.addListener(_refresh);
  }

  @override
  void didUpdateWidget(OtpInput old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller.removeListener(_changed);
      widget.controller.addListener(_changed);
    }
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  void _changed() {
    _refresh();
    final text = widget.controller.text;
    if (text.length == widget.length) {
      // Listeners also hear cursor moves; the code is reported once.
      if (_completed != text) {
        _completed = text;
        _focus.unfocus();
        widget.onCompleted?.call(text);
      }
    } else {
      _completed = null;
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_changed);
    _focus.dispose();
    _caret.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final text = widget.controller.text;
    final active = _focus.hasFocus && widget.enabled ? text.length : -1;

    return LayoutBuilder(
      builder: (context, constraints) {
        const gap = 10.0;
        final width =
            ((constraints.maxWidth - gap * (widget.length - 1)) / widget.length)
                .clamp(36.0, 58.0);

        return SizedBox(
          height: 62,
          child: Stack(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < widget.length; i++) ...[
                    if (i > 0) const SizedBox(width: gap),
                    _box(
                      context,
                      width: width,
                      digit: i < text.length ? text[i] : null,
                      isActive: i == active,
                      colors: colors,
                    ),
                  ],
                ],
              ),
              Positioned.fill(
                child: Opacity(
                  opacity: 0,
                  child: TextField(
                    controller: widget.controller,
                    focusNode: _focus,
                    enabled: widget.enabled,
                    autofocus: widget.autofocus,
                    keyboardType: TextInputType.number,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(widget.length),
                    ],
                    onChanged: widget.onChanged,
                    showCursor: false,
                    enableInteractiveSelection: false,
                    expands: true,
                    maxLines: null,
                    decoration: const InputDecoration(
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      disabledBorder: InputBorder.none,
                      filled: false,
                      counterText: '',
                      isCollapsed: true,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _box(
    BuildContext context, {
    required double width,
    required String? digit,
    required bool isActive,
    required ColorScheme colors,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final Color border;
    final Color fill;
    if (widget.verified) {
      border = KidPalette.mint;
      fill = KidPalette.mint.withValues(alpha: 0.12);
    } else if (widget.hasError) {
      border = KidPalette.coral;
      fill = KidPalette.coral.withValues(alpha: 0.08);
    } else if (isActive) {
      border = KidPalette.violet;
      fill = colors.surface;
    } else if (digit != null) {
      border = KidPalette.violet.withValues(alpha: 0.45);
      fill = KidPalette.violet.withValues(alpha: isDark ? 0.18 : 0.07);
    } else {
      border = colors.outlineVariant;
      fill = colors.surface;
    }

    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      width: width,
      height: 62,
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border, width: isActive ? 2 : 1.4),
        boxShadow: [
          if (isActive)
            BoxShadow(
              color: KidPalette.violet.withValues(alpha: 0.18),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
        ],
      ),
      alignment: Alignment.center,
      child: digit != null
          ? Text(
              digit,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w800,
                color: widget.verified
                    ? const Color(0xFF14876B)
                    : colors.onSurface,
              ),
            )
          : isActive
          ? FadeTransition(
              opacity: _caret,
              child: Container(width: 2, height: 24, color: KidPalette.violet),
            )
          : null,
    );
  }
}
