import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:get/get.dart';

import '../../core/api/api_service.dart';
import '../../core/config/school_config.dart';

/// A family asking their school for access.
///
/// There is no school to choose. This binary belongs to one school and its code
/// is compiled in, so the request goes to that school's public endpoint — the
/// same way the sign-in screen already fetches its branding before anybody has
/// signed in.
///
/// Nothing here creates an account. The reply says only that the school has the
/// request; the family cannot sign in until somebody in the office agrees.
/// One channel's code: asked for, typed back, and spent.
///
/// A class rather than two sets of fields on the controller, because the phone
/// and the email do exactly the same thing and the screen renders them with one
/// widget. Two copies would be two places to fix the next thing found wrong.
class OtpState {
  /// The challenge a code belongs to. Null until one has been asked for.
  final challengeId = RxnString();

  /// What it was sent to, so changing the field clears the proof.
  final destination = RxnString();

  /// False while no message is really being sent and a fixed code stands in.
  /// The screen says so rather than leaving a family waiting for a text.
  final delivered = true.obs;

  /// How many digits the code has, so the screen draws one box per digit.
  /// Six from a real provider; the fixed code's own length until then.
  final codeLength = 6.obs;

  /// When the last code went out, for the "send again in 0:30" countdown.
  final sentAt = Rxn<DateTime>();

  final isSending = false.obs;
  final isVerifying = false.obs;
  final isVerified = false.obs;
  final error = RxnString();

  void forget() {
    challengeId.value = null;
    destination.value = null;
    isVerified.value = false;
    error.value = null;
  }
}

class RegistrationController extends GetxController {
  final isBusy = false.obs;
  final errorMessage = RxnString();

  /// Set once the school has the request. The form is replaced by a thank-you
  /// rather than cleared, so nobody sends the same thing twice.
  final isSent = false.obs;

  /* ---- Proving the number and the address ------------------------------- */

  /// One of these per channel. They behave identically, which is why the screen
  /// can use one widget for both.
  final phoneOtp = OtpState();
  final emailOtp = OtpState();

  OtpState otpFor(String channel) => channel == 'EMAIL' ? emailOtp : phoneOtp;

  /// Ask for a code. Any earlier one for the same destination stops counting.
  Future<void> sendOtp(String channel, String destination) async {
    final state = otpFor(channel);
    state.isSending.value = true;
    state.error.value = null;
    state.isVerified.value = false;

    try {
      final data = await api.post<Map<String, dynamic>>(
        '/public/schools/${SchoolConfig.schoolCode}/otp/send',
        body: {'channel': channel, 'destination': destination.trim()},
      );

      state.challengeId.value = data['challengeId']?.toString();
      state.destination.value = destination.trim();
      state.delivered.value = data['delivered'] == true;
      // An API from before the field existed: its fixed code was 4 digits.
      state.codeLength.value =
          (data['codeLength'] as num?)?.toInt() ??
          (state.delivered.value ? 6 : 4);
      state.sentAt.value = DateTime.now();
    } on DioException catch (e) {
      state.error.value = messageFor(e);
    } finally {
      state.isSending.value = false;
    }
  }

  /// Type it back. The API says the same thing however it is wrong.
  Future<void> verifyOtp(String channel, String code) async {
    final state = otpFor(channel);
    final challengeId = state.challengeId.value;
    if (challengeId == null) return;

    state.isVerifying.value = true;
    state.error.value = null;

    try {
      await api.post<Map<String, dynamic>>(
        '/public/schools/${SchoolConfig.schoolCode}/otp/verify',
        body: {'challengeId': challengeId, 'code': code.trim()},
      );
      state.isVerified.value = true;
    } on DioException catch (e) {
      state.error.value = messageFor(e);
    } finally {
      state.isVerifying.value = false;
    }
  }

  /// Typing a different number or address throws away the proof for the old one.
  void forgetProof(String channel) => otpFor(channel).forget();

  /// Both codes at once, because Continue sends them together.
  ///
  /// Either failing stops the family moving on — carrying them to a screen
  /// asking for a code that was never sent is worse than keeping them here
  /// with the reason.
  ///
  /// The reason is put in the banner at the top of the form, not only on the
  /// field. The two code boxes live on the NEXT step, so a failure reported
  /// only there is reported nowhere: pressing Continue did nothing at all, and
  /// looked like a dead button.
  Future<bool> sendBothCodes({
    required String phone,
    required String email,
  }) async {
    errorMessage.value = null;

    await sendOtp('PHONE', phone);
    if (phoneOtp.error.value != null) {
      errorMessage.value = phoneOtp.error.value;
      return false;
    }

    await sendOtp('EMAIL', email);
    if (emailOtp.error.value != null) {
      errorMessage.value = emailOtp.error.value;
      return false;
    }

    return true;
  }

  /// And checks them together. Each says for itself what is wrong with it.
  Future<bool> verifyBothCodes({
    required String phoneCode,
    required String emailCode,
  }) async {
    if (!phoneOtp.isVerified.value) {
      if (phoneCode.trim().isEmpty) {
        phoneOtp.error.value = 'Enter the code sent to your mobile.';
      } else {
        await verifyOtp('PHONE', phoneCode);
      }
    }

    if (!emailOtp.isVerified.value) {
      if (emailCode.trim().isEmpty) {
        emailOtp.error.value = 'Enter the code sent to your email.';
      } else {
        await verifyOtp('EMAIL', emailCode);
      }
    }

    return phoneOtp.isVerified.value && emailOtp.isVerified.value;
  }

  Future<void> submit({
    required String studentFirstName,
    required String studentMiddleName,
    required String studentLastName,
    required DateTime studentDateOfBirth,
    required String guardianName,
    required String phone,
    required String motherPhone,
    required String email,
    required String password,
    required String confirmPassword,
    String? address,
    String? motherName,
    String? bloodGroup,
    String? emergencyContactName,
    String? emergencyContactPhone,
  }) async {
    isBusy.value = true;
    errorMessage.value = null;

    /// Empty is not a value. The API's optional fields reject an empty string,
    /// and sending one would turn "left blank" into a validation error.
    String? given(String? value) {
      final trimmed = value?.trim() ?? '';
      return trimmed.isEmpty ? null : trimmed;
    }

    try {
      await api.post<dynamic>(
        '/public/schools/${SchoolConfig.schoolCode}/registrations',
        body: {
          'studentFirstName': studentFirstName.trim(),
          if (given(studentMiddleName) != null)
            'studentMiddleName': given(studentMiddleName),
          if (given(studentLastName) != null)
            'studentLastName': given(studentLastName),
          // Date only. The API takes the day, and a time zone on a birthday is
          // how a child born on the 1st is recorded as the 31st.
          'studentDateOfBirth': studentDateOfBirth.toIso8601String().substring(
            0,
            10,
          ),
          'guardianName': guardianName.trim(),
          // The father, always: his is the number that signs in. The form no
          // longer asks, because asking a question with one answer is a
          // question a family has to read.
          'relation': 'FATHER',
          'phone': phone.trim(),
          'phoneChallengeId': phoneOtp.challengeId.value,
          'emailChallengeId': emailOtp.challengeId.value,
          'motherPhone': motherPhone.trim(),
          'email': email.trim(),
          'password': password,
          'confirmPassword': confirmPassword,
          if (given(address) != null) 'address': given(address),
          // The father's name is the child's middle name, already sent above.
          'fatherName': studentMiddleName.trim().isEmpty
              ? null
              : studentMiddleName.trim(),
          if (given(motherName) != null) 'motherName': given(motherName),
          if (given(bloodGroup) != null) 'bloodGroup': given(bloodGroup),
          if (given(emergencyContactName) != null)
            'emergencyContactName': given(emergencyContactName),
          if (given(emergencyContactPhone) != null)
            'emergencyContactPhone': given(emergencyContactPhone),
          // The form will not submit without these; sent as literals because
          // the API stores the fact that they were agreed to.
          'declarationAccepted': true,
          'termsAccepted': true,
        },
      );

      isSent.value = true;
    } on DioException catch (e) {
      errorMessage.value = messageFor(e);
    } finally {
      isBusy.value = false;
    }
  }

  /// What each field is called, in the words on the form.
  ///
  /// A validation failure arrives as a path and a message written for a
  /// programmer — `{"path": "studentDateOfBirth", "message": "Required"}`. On
  /// its own that message is the word "Required" in a red box, which tells a
  /// parent nothing at all; it was on screen for a family who had filled in
  /// every field they could see. The path is the half that says where to look.
  static const Map<String, String> _fieldLabels = {
    'studentFirstName': 'your child’s name',
    'motherPhone': 'the mother’s mobile number',
    'phoneChallengeId': 'the code sent to your mobile',
    'emailChallengeId': 'the code sent to your email',
    'studentMiddleName': 'the father’s name',
    'studentLastName': 'your child’s surname',
    'studentDateOfBirth': 'your child’s date of birth',
    'guardianName': 'your name',
    'relation': 'how you are related to the child',
    'phone': 'your mobile number',
    'email': 'your email address',
    'password': 'your password',
    'confirmPassword': 'the repeated password',
    'address': 'your address',
    'bloodGroup': 'the blood group',
    'fatherName': 'the father’s name',
    'motherName': 'the mother’s name',
    'emergencyContactName': 'the emergency contact’s name',
    'emergencyContactPhone': 'the emergency contact’s number',
    'declarationAccepted': 'the declaration',
    'termsAccepted': 'the terms',
  };

  /// The API's own words wherever it has any.
  ///
  /// Its refusals are the useful part of this screen — an account that already
  /// exists, and a request already waiting, are the two things a family
  /// actually runs into, and both come back with a sentence worth showing
  /// verbatim.
  @visibleForTesting
  static String messageFor(DioException e) {
    final outOfStep = _outOfStep(e);
    if (outOfStep != null) return outOfStep;

    final data = e.response?.data;

    if (data is Map && data['error'] is Map) {
      final error = data['error'] as Map;

      final details = error['details'];
      if (details is List && details.isNotEmpty) {
        final first = details.first;
        if (first is Map && first['message'] != null) {
          return _fieldMessage(
            first['path']?.toString(),
            first['message'].toString(),
          );
        }
      }

      return error['message']?.toString() ??
          'Could not send your registration.';
    }

    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.connectionError) {
      return 'Cannot reach the school right now. Check your connection.';
    }

    return 'Could not send your registration. Please try again.';
  }

  /// One field's refusal, as a sentence.
  ///
  /// A field we know by name is named. A field we have never heard of means the
  /// app and the school's server disagree about what a registration is — and
  /// the message must not guess which of the two is behind. It said "update the
  /// app" once, to somebody holding the newest app there was, while the school's
  /// own server was the stale one; they had no way to know that and nothing
  /// they could do about it either way.
  /// A refusal that is not about a field at all.
  ///
  /// A public route answering "not found" means the school's server does not
  /// have it — an app talking to a system older than itself. Saying so is the
  /// only useful thing: nobody holding the phone can fix it, and "No route for
  /// POST /api/v1/..." tells a parent nothing.
  static String? _outOfStep(DioException e) {
    final status = e.response?.statusCode;
    final path = e.requestOptions.path;

    if ((status == 404 || status == 401) && path.startsWith('/public/')) {
      return 'The school’s system has not been updated for this app yet. '
          'Please tell the school office.';
    }
    return null;
  }

  static String _fieldMessage(String? path, String message) {
    final label = _fieldLabels[path];
    final required = message.toLowerCase() == 'required';

    if (label == null) {
      return required
          ? 'This app and the school’s system are out of step over “$path”. '
                'Please tell the school office — they need to update their '
                'system, or there may be a newer app to install.'
          : message;
    }

    if (required) return 'Please fill in $label.';

    // Anything else is already a sentence written for a person — "The two
    // passwords do not match" — and saying it twice would be worse.
    return message.length > 24 ? message : 'Please check $label — $message.';
  }
}
