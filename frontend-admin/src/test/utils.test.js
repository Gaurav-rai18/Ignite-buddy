import { describe, it, expect } from 'vitest';

import { getUserDisplayName, getUserInitials, getUserRoleLabel } from '../utils/users';
import { isRequestCancellation, formatErrorMessage } from '../utils/error';
import {
  isValidHttpsUrl,
  validateBroadcastForm,
  validateScheduleForm,
  validateBuddyState,
} from '../utils/validation';

// ---------------------------------------------------------------------------
// Pure utility coverage. No mocking: these helpers are deterministic and take
// plain objects/strings. Assertions target exact return values / strings.
// ---------------------------------------------------------------------------

describe('users utils', () => {
  describe('getUserDisplayName', () => {
    it('returns "User" for null/undefined input', () => {
      expect(getUserDisplayName(null)).toBe('User');
      expect(getUserDisplayName(undefined)).toBe('User');
    });

    it('prefers and trims full_name', () => {
      expect(getUserDisplayName({ full_name: '  Admin User  ' })).toBe('Admin User');
    });

    it('builds a name from first_name + last_name when full_name is absent', () => {
      expect(getUserDisplayName({ first_name: 'John', last_name: 'Doe' })).toBe('John Doe');
      expect(getUserDisplayName({ first_name: 'John', last_name: '' })).toBe('John');
      expect(getUserDisplayName({ first_name: '', last_name: 'Doe' })).toBe('Doe');
    });

    it('ignores a whitespace-only full_name and falls back to other fields', () => {
      expect(getUserDisplayName({ full_name: '   ', username: 'admin' })).toBe('admin');
    });

    it('falls back to the trimmed username', () => {
      expect(getUserDisplayName({ username: '  renju  ' })).toBe('renju');
    });

    it('falls back to the capitalized email local-part', () => {
      expect(getUserDisplayName({ email: 'jdoe@campus.demo' })).toBe('Jdoe');
      expect(getUserDisplayName({ email: 'JOHN@campus.demo' })).toBe('JOHN');
    });

    it('returns "User" when no identifying field is present', () => {
      expect(getUserDisplayName({ role: 'ADMIN' })).toBe('User');
      expect(getUserDisplayName({ email: '' })).toBe('User');
    });
  });

  describe('getUserInitials', () => {
    it('returns "U" for null/undefined input', () => {
      expect(getUserInitials(null)).toBe('U');
      expect(getUserInitials(undefined)).toBe('U');
    });

    it('uses the first and last initials for multi-word names', () => {
      expect(getUserInitials({ full_name: 'Admin User' })).toBe('AU');
      expect(getUserInitials({ full_name: 'mary.jane.watson' })).toBe('MW');
      expect(getUserInitials({ full_name: 'John-Doe' })).toBe('JD');
    });

    it('uses the first two characters for a single long word', () => {
      expect(getUserInitials({ full_name: 'John' })).toBe('JO');
    });

    it('uses the single character for a one-letter name', () => {
      expect(getUserInitials({ full_name: 'J' })).toBe('J');
      expect(getUserInitials({ first_name: 'A', last_name: '' })).toBe('A');
    });

    it('derives initials from the username when no real name exists', () => {
      expect(getUserInitials({ username: 'admin' })).toBe('AD');
    });

    it('falls back to email initials when the display name resolves to "User"', () => {
      expect(getUserInitials({ full_name: 'User', email: 'jdoe@campus.demo' })).toBe('JD');
      expect(getUserInitials({ full_name: 'User', email: 'a@campus.demo' })).toBe('A');
    });

    it('falls back to the raw local-part when the email has no letters', () => {
      expect(getUserInitials({ full_name: 'User', email: '123@campus.demo' })).toBe('12');
    });

    it('returns "U" when nothing usable is provided', () => {
      expect(getUserInitials({})).toBe('U');
    });
  });

  describe('getUserRoleLabel', () => {
    it('always returns "Workspace Owner" for superusers', () => {
      expect(getUserRoleLabel('ADMIN', true)).toBe('Workspace Owner');
      expect(getUserRoleLabel('anything', true)).toBe('Workspace Owner');
    });

    it('maps known roles regardless of casing', () => {
      expect(getUserRoleLabel('ADMIN')).toBe('Ignite Administrator');
      expect(getUserRoleLabel('admin')).toBe('Ignite Administrator');
      expect(getUserRoleLabel('TA')).toBe('Faculty / TA');
      expect(getUserRoleLabel('MANAGER')).toBe('Ignite Manager');
      expect(getUserRoleLabel('HR')).toBe('Human Resources');
      expect(getUserRoleLabel('TRAINEE')).toBe('Student Trainee');
    });

    it('returns the original role for unknown roles', () => {
      expect(getUserRoleLabel('SUPERVISOR')).toBe('SUPERVISOR');
      expect(getUserRoleLabel('member')).toBe('member');
    });

    it('returns "Member" for empty/undefined roles', () => {
      expect(getUserRoleLabel(null)).toBe('Member');
      expect(getUserRoleLabel(undefined)).toBe('Member');
      expect(getUserRoleLabel('')).toBe('Member');
    });
  });
});

describe('error utils', () => {
  describe('isRequestCancellation', () => {
    it('returns false for falsy or unrelated errors', () => {
      expect(isRequestCancellation(null)).toBe(false);
      expect(isRequestCancellation(undefined)).toBe(false);
      expect(isRequestCancellation({})).toBe(false);
      expect(isRequestCancellation({ name: 'Error', message: 'boom' })).toBe(false);
      expect(isRequestCancellation('canceled')).toBe(false);
    });

    it('detects axios and fetch cancellation shapes', () => {
      expect(isRequestCancellation({ name: 'CanceledError' })).toBe(true);
      expect(isRequestCancellation({ name: 'AbortError' })).toBe(true);
      expect(isRequestCancellation({ code: 'ERR_CANCELED' })).toBe(true);
      expect(isRequestCancellation({ message: 'canceled' })).toBe(true);
    });
  });

  describe('formatErrorMessage', () => {
    it('handles null/undefined with a generic message', () => {
      expect(formatErrorMessage(null)).toBe('An unexpected error occurred. Please try again.');
      expect(formatErrorMessage(undefined)).toBe('An unexpected error occurred. Please try again.');
    });

    it('passes through plain string errors', () => {
      expect(formatErrorMessage('Something went wrong')).toBe('Something went wrong');
    });

    it('returns an empty string for request cancellations', () => {
      expect(formatErrorMessage({ name: 'CanceledError' })).toBe('');
      expect(formatErrorMessage({ code: 'ERR_CANCELED', message: 'x' })).toBe('');
    });

    it('formats "Failed to fetch" / NetworkError as an unreachable-server message', () => {
      expect(formatErrorMessage({ message: 'Failed to fetch' })).toBe(
        'Unable to reach the server. Check that the Ignite Buddy backend is running.'
      );
      expect(formatErrorMessage({ message: 'NetworkError when attempting to fetch resource.' })).toBe(
        'Unable to reach the server. Check that the Ignite Buddy backend is running.'
      );
    });

    it('formats "Network Error" / ECONNREFUSED as a backend-not-running message', () => {
      expect(formatErrorMessage({ message: 'Network Error' })).toBe(
        'Cannot connect to the backend. Check that the Django server is running on port 8765.'
      );
      expect(formatErrorMessage({ message: 'connect ECONNREFUSED 127.0.0.1:8765' })).toBe(
        'Cannot connect to the backend. Check that the Django server is running on port 8765.'
      );
    });

    it('sanitizes an HTML error dump with an unknown status', () => {
      const result = formatErrorMessage({
        details: '<html><body>Internal Server Error</body></html>',
      });
      expect(result).toBe(
        'Backend returned an unexpected HTML response (HTTP unknown). Check backend server logs.'
      );
    });

    it('reports the HTTP status inside an HTML dump when a status is present', () => {
      const result = formatErrorMessage({
        status: 502,
        details: '<!DOCTYPE html><html><body>Bad Gateway</body></html>',
      });
      expect(result).toBe(
        'Backend returned an unexpected HTML response (HTTP 502). Check backend server logs.'
      );
    });

    it('returns a non-HTML string detail verbatim', () => {
      expect(formatErrorMessage({ details: 'Plain backend message' })).toBe('Plain backend message');
    });

    it('uses details.detail when present', () => {
      expect(formatErrorMessage({ details: { detail: 'Authentication credentials were not provided.' } })).toBe(
        'Authentication credentials were not provided.'
      );
    });

    it('formats a DRF field-error dictionary with array and scalar values', () => {
      const result = formatErrorMessage({
        details: { title: ['Title is required.'], deadline: 'Must be in the future.' },
      });
      expect(result).toBe('title: Title is required. | deadline: Must be in the future.');
    });

    it('falls through an empty details object to status handling', () => {
      expect(formatErrorMessage({ details: {}, status: 401 })).toBe('Session expired. Please sign in again.');
    });

    it('maps common HTTP status codes to friendly messages', () => {
      expect(formatErrorMessage({ status: 401 })).toBe('Session expired. Please sign in again.');
      expect(formatErrorMessage({ status: 403 })).toBe('You do not have permission to perform this action.');
      expect(formatErrorMessage({ status: 404 })).toBe(
        'The requested resource was not found (404). Verify the backend endpoint exists.'
      );
      expect(formatErrorMessage({ status: 500 })).toBe(
        'Server error (500). Please try again or check the backend logs.'
      );
      expect(formatErrorMessage({ status: 503 })).toBe(
        'Server error (503). Please try again or check the backend logs.'
      );
    });

    it('falls back to error.message, then to a generic request-failed message', () => {
      expect(formatErrorMessage({ message: 'Bad request payload', status: 400 })).toBe('Bad request payload');
      expect(formatErrorMessage({ status: 400 })).toBe('Request failed. Please try again.');
      expect(formatErrorMessage({})).toBe('Request failed. Please try again.');
    });
  });
});

describe('validation utils — uncovered branches', () => {
  describe('isValidHttpsUrl', () => {
    it('rejects non-string inputs', () => {
      expect(isValidHttpsUrl(123)).toBe(false);
      expect(isValidHttpsUrl({})).toBe(false);
      expect(isValidHttpsUrl(undefined)).toBe(false);
    });

    it('accepts HTTPS URLs with surrounding whitespace', () => {
      expect(isValidHttpsUrl('   https://1drv.ms/u/s!Al7812903   ')).toBe(true);
    });
  });

  describe('validateBroadcastForm', () => {
    it('requires a cohort when targeting by cohort', () => {
      const missing = validateBroadcastForm({
        title: 'Exam info',
        message: 'Details here',
        recipientMode: 'By cohort',
      });
      expect(missing.isValid).toBe(false);
      expect(missing.errors.recipients).toBe('Please select a cohort.');

      const provided = validateBroadcastForm({
        title: 'Exam info',
        message: 'Details here',
        recipientMode: 'By cohort',
        cohort_id: 7,
      });
      expect(provided.isValid).toBe(true);
    });

    it('requires at least one sub-batch when targeting by sub-batch', () => {
      const missing = validateBroadcastForm({
        title: 'Exam info',
        message: 'Details here',
        recipientMode: 'By sub-batch',
        selectedSubBatchIds: [],
      });
      expect(missing.isValid).toBe(false);
      expect(missing.errors.recipients).toBe('Please select at least one sub-batch.');

      const fallback = validateBroadcastForm({
        title: 'Exam info',
        message: 'Details here',
        recipientMode: 'By sub-batch',
        sub_batch_id: 'A1',
      });
      expect(fallback.isValid).toBe(true);
    });

    it('requires at least one stream when targeting by stream', () => {
      const missing = validateBroadcastForm({
        title: 'Exam info',
        message: 'Details here',
        recipientMode: 'By stream',
        selectedStreamIds: [],
      });
      expect(missing.isValid).toBe(false);
      expect(missing.errors.recipients).toBe('Please select at least one elective stream.');

      const provided = validateBroadcastForm({
        title: 'Exam info',
        message: 'Details here',
        recipientMode: 'By stream',
        selectedStreamIds: [1, 2],
      });
      expect(provided.isValid).toBe(true);
    });

    it('accepts a single batch_id fallback for "By batch"', () => {
      const result = validateBroadcastForm({
        title: 'Exam info',
        message: 'Details here',
        recipientMode: 'By batch',
        batch_id: 3,
      });
      expect(result.isValid).toBe(true);
    });

    it('emits the exact max-length messages for title and message', () => {
      const result = validateBroadcastForm({
        title: 'a'.repeat(161),
        message: 'b'.repeat(2001),
      });
      expect(result.errors.title).toBe('Title must not exceed 160 characters.');
      expect(result.errors.message).toBe('Message must not exceed 2000 characters.');
    });

    it('accepts values exactly at the maximum length', () => {
      const result = validateBroadcastForm({
        title: 'a'.repeat(160),
        message: 'b'.repeat(2000),
      });
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateScheduleForm', () => {
    it('requires a publish time when only a publish date is supplied', () => {
      const result = validateScheduleForm({
        title: 'Syllabus PDF',
        onedrive_url: 'https://1drv.ms/abc',
        publish_date: '2026-11-01',
        publish_time: '',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.publish_time).toBe('Publish time is required.');
      expect(result.errors.publish_date).toBeUndefined();
    });

    it('requires a publish date when only a publish time is supplied', () => {
      const result = validateScheduleForm({
        title: 'Syllabus PDF',
        onedrive_url: 'https://1drv.ms/abc',
        publish_date: '',
        publish_time: '10:00',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.publish_date).toBe('Publish date is required.');
      expect(result.errors.publish_time).toBeUndefined();
    });

    it('flags an unparseable date/time combination', () => {
      const result = validateScheduleForm({
        title: 'Syllabus PDF',
        onedrive_url: 'https://1drv.ms/abc',
        publish_date: 'garbage',
        publish_time: '10:00',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.publish_at).toBe('Invalid publish date and time.');
    });

    it('flags an invalid publish_at string when date/time fields are absent', () => {
      const result = validateScheduleForm({
        title: 'Syllabus PDF',
        onedrive_url: 'https://1drv.ms/abc',
        publish_at: 'not-a-real-date',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.publish_at).toBe('Invalid publish date and time.');
    });

    it('enforces the schedule title max length', () => {
      const result = validateScheduleForm({
        title: 'a'.repeat(161),
        onedrive_url: 'https://1drv.ms/abc',
        publish_at: '2026-11-01T10:00',
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBe('Title must not exceed 160 characters.');
    });
  });

  describe('validateBuddyState', () => {
    it('rejects non-boolean values', () => {
      expect(validateBuddyState(undefined)).toBe(false);
      expect(validateBuddyState(0)).toBe(false);
      expect(validateBuddyState({})).toBe(false);
    });
  });
});
