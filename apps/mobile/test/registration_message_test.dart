import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:poetree_school/features/auth/registration_controller.dart';

/// What a family is told when the school's API refuses their registration.
///
/// This exists because of a real screen: a parent had filled in every field on
/// the form and got a red box containing the single word "Required". The word
/// is Zod's, meant for a programmer, and the half that says *which* field —
/// the path beside it — was being thrown away.
void main() {
  DioException refusal(
    List<Map<String, String>> details, {
    String message = 'Some fields need attention',
  }) {
    return DioException(
      requestOptions: RequestOptions(path: '/registrations'),
      response: Response<dynamic>(
        requestOptions: RequestOptions(path: '/registrations'),
        statusCode: 400,
        data: {
          'error': {
            'code': 'BAD_REQUEST',
            'message': message,
            'details': details,
          },
        },
      ),
    );
  }

  group('registration refusals', () {
    test('names the field that is missing', () {
      final message = RegistrationController.messageFor(
        refusal([
          {'path': 'studentDateOfBirth', 'message': 'Required'},
        ]),
      );

      expect(message, 'Please fill in your child’s date of birth.');
      expect(message, isNot(contains('Required')));
    });

    test('says a sentence written for a person as it is', () {
      final message = RegistrationController.messageFor(
        refusal([
          {
            'path': 'confirmPassword',
            'message': 'The two passwords do not match',
          },
        ]),
      );

      expect(message, 'The two passwords do not match');
    });

    test('pairs a terse complaint with the field it is about', () {
      final message = RegistrationController.messageFor(
        refusal([
          {'path': 'phone', 'message': 'Invalid phone number'},
        ]),
      );

      expect(message, contains('your mobile number'));
      expect(message, contains('Invalid phone number'));
    });

    test('blames neither side when the app and the server disagree', () {
      // The real case: a family holding the newest app there was, while the
      // school's own server was the stale one. "Please update the app" was
      // advice they had already taken.
      final message = RegistrationController.messageFor(
        refusal([
          {'path': 'admissionNo', 'message': 'Required'},
        ]),
      );

      expect(message, contains('admissionNo'));
      expect(message, contains('school office'));
      expect(message, isNot(contains('update the app')));
    });

    test('falls back to the API’s own sentence when there are no details', () {
      final message = RegistrationController.messageFor(
        refusal(
          [],
          message: 'There is already an account with that phone number.',
        ),
      );

      expect(message, 'There is already an account with that phone number.');
    });

    test('says something useful when the school cannot be reached', () {
      final offline = DioException(
        requestOptions: RequestOptions(path: '/registrations'),
        type: DioExceptionType.connectionError,
      );

      expect(
        RegistrationController.messageFor(offline),
        contains('Cannot reach the school'),
      );
    });
  });
}
