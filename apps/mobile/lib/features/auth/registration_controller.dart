import 'package:dio/dio.dart';
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
    required String admissionNo,
    required String studentName,
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
          'admissionNo': admissionNo.trim(),
          'studentName': studentName.trim(),
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
      errorMessage.value = _messageFor(e);
    } finally {
      isBusy.value = false;
    }
  }

  /// The API's own words wherever it has any.
  ///
  /// Its refusals are the useful part of this screen — a wrong admission number
  /// and an account that already exists are the two things a family actually
  /// gets wrong, and both come back with a sentence worth showing verbatim.
  static String _messageFor(DioException e) {
    final data = e.response?.data;

    if (data is Map && data['error'] is Map) {
      final error = data['error'] as Map;

      final details = error['details'];
      if (details is List && details.isNotEmpty) {
        final first = details.first;
        if (first is Map && first['message'] != null) {
          return first['message'].toString();
        }
      }

      return error['message']?.toString() ?? 'Could not send your registration.';
    }

    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.connectionError) {
      return 'Cannot reach the school right now. Check your connection.';
    }

    return 'Could not send your registration. Please try again.';
  }
}
