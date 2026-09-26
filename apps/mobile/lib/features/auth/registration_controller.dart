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
class RegistrationController extends GetxController {
  final isBusy = false.obs;
  final errorMessage = RxnString();

  /// Set once the school has the request. The form is replaced by a thank-you
  /// rather than cleared, so nobody sends the same thing twice.
  final isSent = false.obs;

  Future<void> submit({
    required String studentFirstName,
    required String studentMiddleName,
    required String studentLastName,
    required DateTime studentDateOfBirth,
    required String guardianName,
    required String relation,
    required String phone,
    required String password,
    required String confirmPassword,
    String? email,
    String? address,
    String? fatherName,
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
          'relation': relation,
          'phone': phone.trim(),
          'password': password,
          'confirmPassword': confirmPassword,
          if (given(email) != null) 'email': given(email),
          if (given(address) != null) 'address': given(address),
          if (given(fatherName) != null) 'fatherName': given(fatherName),
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
  /// A field we know by name is named. One we do not — a version of the app
  /// older than the API it is talking to, which is exactly when this is hardest
  /// to work out — at least says that it is a field and not the family's fault.
  static String _fieldMessage(String? path, String message) {
    final label = _fieldLabels[path];
    final required = message.toLowerCase() == 'required';

    if (label == null) {
      return required
          ? 'The school needs something this version of the app did not ask '
                'for ($path). Please update the app.'
          : message;
    }

    if (required) return 'Please fill in $label.';

    // Anything else is already a sentence written for a person — "The two
    // passwords do not match" — and saying it twice would be worse.
    return message.length > 24 ? message : 'Please check $label — $message.';
  }
}
