import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Service layer mocks. Each hook imports its service via `../services/<name>`
// relative to `src/hooks/`; from this test file the same specifier resolves to
// the identical module id, so these mocks are applied to the hooks.
// ---------------------------------------------------------------------------
vi.mock('../services/authService', () => ({
  authService: {
    getCurrentUser: vi.fn(),
    subscribe: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    clearSession: vi.fn(),
  },
}));

vi.mock('../services/dashboardService', () => ({
  dashboardService: { getSummary: vi.fn() },
}));

vi.mock('../services/broadcastService', () => ({
  broadcastService: { getBroadcasts: vi.fn(), createBroadcast: vi.fn() },
}));

vi.mock('../services/buddyService', () => ({
  buddyService: { getBuddySetting: vi.fn(), updateBuddySetting: vi.fn() },
}));

vi.mock('../services/usersService', () => ({
  usersService: {
    getUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

vi.mock('../services/scheduleService', () => ({
  scheduleService: { getSchedules: vi.fn(), createSchedule: vi.fn() },
}));

vi.mock('../services/assignmentService', () => ({
  assignmentService: {
    getAssignments: vi.fn(),
    createAssignment: vi.fn(),
    updateAssignmentDeadline: vi.fn(),
  },
}));

vi.mock('../services/documentsService', () => ({
  documentsService: {
    getDocuments: vi.fn(),
    getKnowledgeBaseStats: vi.fn(),
    uploadDocument: vi.fn(),
    deleteDocument: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports of the mocked services (used to configure per-test behaviour)
// ---------------------------------------------------------------------------
import { authService } from '../services/authService';
import { dashboardService } from '../services/dashboardService';
import { broadcastService } from '../services/broadcastService';
import { buddyService } from '../services/buddyService';
import { usersService } from '../services/usersService';
import { scheduleService } from '../services/scheduleService';
import { assignmentService } from '../services/assignmentService';
import { documentsService } from '../services/documentsService';

// ---------------------------------------------------------------------------
// Hooks + utilities under test
// ---------------------------------------------------------------------------
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { useDashboard } from '../hooks/useDashboard';
import { useBuddy } from '../hooks/useBuddy';
import { useUsers } from '../hooks/useUsers';
import { useSchedules } from '../hooks/useSchedules';
import {
  useAssignments,
  getTodayStr,
  getInitialAssignmentForm,
  validateAssignmentForm,
} from '../hooks/useAssignments';
import { useBroadcasts } from '../hooks/useBroadcasts';
import { useDocuments } from '../hooks/useDocuments';
import { formatDate, getMinDateTimeLocal, toIsoUtcString } from '../utils/date';

const AuthWrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// useAuth / AuthProvider
// ===========================================================================
describe('useAuth', () => {
  const authedUser = { email: 'admin@campus.demo', role: 'ADMIN', access: 'tok-123' };

  beforeEach(() => {
    vi.resetAllMocks();
    authService.getCurrentUser.mockReturnValue(null);
    authService.subscribe.mockReturnValue(() => {});
  });

  it('starts anonymous when no in-memory session exists', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.sessionTimeoutNotice).toBe(false);
  });

  it('login() resolves, stores the user, and reports authenticated', async () => {
    authService.login.mockResolvedValue(authedUser);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });

    let returned;
    await act(async () => {
      returned = await result.current.login({ email: 'admin@campus.demo', password: 'password123' });
    });

    expect(authService.login).toHaveBeenCalledWith({
      email: 'admin@campus.demo',
      password: 'password123',
    });
    expect(returned).toEqual(authedUser);
    expect(result.current.user).toEqual(authedUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('logout() clears the user', async () => {
    authService.getCurrentUser.mockReturnValue(authedUser);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.logout();
    });

    expect(authService.logout).toHaveBeenCalledTimes(1);
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('synchronises state via the authService subscription', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
    expect(authService.subscribe).toHaveBeenCalledTimes(1);

    const notify = authService.subscribe.mock.calls[0][0];
    act(() => notify(authedUser));
    expect(result.current.user).toEqual(authedUser);

    act(() => notify(null));
    expect(result.current.user).toBeNull();
  });

  it('locks the session and exposes a notice after the inactivity timeout', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    authService.getCurrentUser.mockReturnValue(authedUser);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthWrapper });
    expect(result.current.sessionTimeoutNotice).toBe(false);

    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });

    expect(authService.logout).toHaveBeenCalledTimes(1);
    expect(result.current.sessionTimeoutNotice).toBe(true);

    act(() => result.current.clearNotice());
    expect(result.current.sessionTimeoutNotice).toBe(false);
  });
});

// ===========================================================================
// useDashboard
// ===========================================================================
describe('useDashboard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dashboardService.getSummary.mockResolvedValue({ broadcast_count: 5, total_users: 10 });
    broadcastService.getBroadcasts.mockResolvedValue([{ id: 1, title: 'Hello' }]);
    buddyService.getBuddySetting.mockResolvedValue({ enabled: true });
  });

  it('loads summary, broadcasts and buddy state', async () => {
    const { result } = renderHook(() => useDashboard());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.summary).toEqual({ broadcast_count: 5, total_users: 10 });
    expect(result.current.recentBroadcasts).toEqual([{ id: 1, title: 'Hello' }]);
    expect(result.current.buddy).toBe(true);
    expect(result.current.error).toBe('');
  });

  it('surfaces an error message when the summary fails', async () => {
    dashboardService.getSummary.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useDashboard());

    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.loading).toBe(false);
  });

  it('ignores request cancellations (does not surface an error)', async () => {
    const cancelErr = new Error('canceled');
    cancelErr.name = 'CanceledError';
    dashboardService.getSummary.mockRejectedValue(cancelErr);
    const { result } = renderHook(() => useDashboard());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('');
  });

  it('toggleBuddy() flips state and invokes the success callback', async () => {
    buddyService.updateBuddySetting.mockResolvedValue({ enabled: false });
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const onSuccess = vi.fn();
    await act(async () => {
      await result.current.toggleBuddy(onSuccess);
    });

    expect(buddyService.updateBuddySetting).toHaveBeenCalledWith(false);
    expect(result.current.buddy).toBe(false);
    expect(onSuccess).toHaveBeenCalledWith(false);
  });

  it('toggleBuddy() surfaces an error on failure', async () => {
    buddyService.updateBuddySetting.mockRejectedValue(new Error('toggle failed'));
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleBuddy();
    });

    expect(result.current.error).toBe('toggle failed');
    expect(result.current.isTogglingBuddy).toBe(false);
  });

  it('refetch() re-requests the dashboard and clearError() resets the error', async () => {
    dashboardService.getSummary.mockRejectedValueOnce(new Error('first fail'));
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.error).toBe('first fail'));

    act(() => result.current.clearError());
    expect(result.current.error).toBe('');

    dashboardService.getSummary.mockResolvedValue({ broadcast_count: 9 });
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.summary).toEqual({ broadcast_count: 9 });
    expect(result.current.error).toBe('');
  });
});

// ===========================================================================
// useBuddy
// ===========================================================================
describe('useBuddy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    buddyService.getBuddySetting.mockResolvedValue({ enabled: true, temperature: 0.9 });
  });

  it('merges fetched settings over defaults', async () => {
    const { result } = renderHook(() => useBuddy());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.buddy).toBe(true);
    expect(result.current.settings.temperature).toBe(0.9);
    // untouched defaults remain
    expect(result.current.settings.ai_provider).toBe('gemini');
  });

  it('surfaces an error when the setting fetch fails', async () => {
    buddyService.getBuddySetting.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useBuddy());

    await waitFor(() => expect(result.current.error).toBe('nope'));
    expect(result.current.loading).toBe(false);
  });

  it('toggleBuddy() flips the enabled flag', async () => {
    buddyService.updateBuddySetting.mockResolvedValue({ enabled: false });
    const { result } = renderHook(() => useBuddy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const onSuccess = vi.fn();
    await act(async () => {
      await result.current.toggleBuddy(onSuccess);
    });

    expect(buddyService.updateBuddySetting).toHaveBeenCalledWith({ enabled: false });
    expect(result.current.buddy).toBe(false);
    expect(onSuccess).toHaveBeenCalledWith(false);
  });

  it('updateSetting() patches a single field', async () => {
    buddyService.updateBuddySetting.mockResolvedValue({ enabled: true, temperature: 0.5 });
    const { result } = renderHook(() => useBuddy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateSetting('temperature', 0.5);
    });

    expect(buddyService.updateBuddySetting).toHaveBeenCalledWith({ temperature: 0.5 });
    expect(result.current.settings.temperature).toBe(0.5);
    expect(result.current.isUpdating).toBe(false);
  });

  it('saveBatchSettings() applies a bulk patch', async () => {
    buddyService.updateBuddySetting.mockResolvedValue({
      enabled: false,
      exam_mode: true,
      temperature: 0.2,
    });
    const { result } = renderHook(() => useBuddy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveBatchSettings({ enabled: false, exam_mode: true });
    });

    expect(result.current.buddy).toBe(false);
    expect(result.current.settings.exam_mode).toBe(true);
    expect(result.current.settings.temperature).toBe(0.2);
  });

  it('updateSetting() surfaces an error on failure', async () => {
    buddyService.updateBuddySetting.mockRejectedValue(new Error('bad setting'));
    const { result } = renderHook(() => useBuddy());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateSetting('temperature', 2);
    });

    expect(result.current.error).toBe('bad setting');
    expect(result.current.isUpdating).toBe(false);
  });
});

// ===========================================================================
// useUsers
// ===========================================================================
describe('useUsers', () => {
  const sampleUsers = [
    { id: 1, username: 'alice', email: 'alice@campus.demo', role: 'TA', full_batch_name: 'B1' },
    { id: 2, username: 'bob', email: 'bob@campus.demo', role: 'HR', cohort_code: 'C9' },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    usersService.getUsers.mockResolvedValue(sampleUsers);
  });

  it('loads users and exposes them', async () => {
    const { result } = renderHook(() => useUsers());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users).toEqual(sampleUsers);
    expect(result.current.filteredUsers).toEqual(sampleUsers);
  });

  it('handles an empty user list', async () => {
    usersService.getUsers.mockResolvedValue([]);
    const { result } = renderHook(() => useUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users).toEqual([]);
    expect(result.current.filteredUsers).toEqual([]);
  });

  it('surfaces an error when loading fails', async () => {
    usersService.getUsers.mockRejectedValue(new Error('load fail'));
    const { result } = renderHook(() => useUsers());
    await waitFor(() => expect(result.current.error).toBe('load fail'));
  });

  it('addUser() prepends the created user', async () => {
    const { result } = renderHook(() => useUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    usersService.createUser.mockResolvedValue({ id: 3, username: 'carol' });
    let created;
    await act(async () => {
      created = await result.current.addUser({ username: 'carol' });
    });

    expect(created).toEqual({ id: 3, username: 'carol' });
    expect(result.current.users[0]).toEqual({ id: 3, username: 'carol' });
    expect(result.current.users).toHaveLength(3);
  });

  it('editUser() replaces the matching user in place', async () => {
    const { result } = renderHook(() => useUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    usersService.updateUser.mockResolvedValue({ id: 1, username: 'alice2', role: 'MANAGER' });
    await act(async () => {
      await result.current.editUser(1, { role: 'MANAGER' });
    });

    expect(usersService.updateUser).toHaveBeenCalledWith(1, { role: 'MANAGER' });
    expect(result.current.users[0]).toMatchObject({
      id: 1,
      username: 'alice2',
      role: 'MANAGER',
    });
    // untouched fields from the original record are preserved
    expect(result.current.users[0].email).toBe('alice@campus.demo');
  });

  it('deleteUser() removes the matching user', async () => {
    const { result } = renderHook(() => useUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    usersService.deleteUser.mockResolvedValue({});
    await act(async () => {
      await result.current.deleteUser(1);
    });

    expect(usersService.deleteUser).toHaveBeenCalledWith(1);
    expect(result.current.users).toEqual([sampleUsers[1]]);
  });

  it('filters users by the search query', async () => {
    const { result } = renderHook(() => useUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setSearchQuery('bob'));
    expect(result.current.filteredUsers).toEqual([sampleUsers[1]]);

    act(() => result.current.setSearchQuery('MANAGER'));
    expect(result.current.filteredUsers).toEqual([]);

    act(() => result.current.setSearchQuery(''));
    expect(result.current.filteredUsers).toEqual(sampleUsers);
  });
});

// ===========================================================================
// useSchedules
// ===========================================================================
describe('useSchedules', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    scheduleService.getSchedules.mockResolvedValue([{ id: 1, title: 'Week 1' }]);
    scheduleService.createSchedule.mockResolvedValue({ id: 2 });
  });

  it('loads schedules on mount', async () => {
    const { result } = renderHook(() => useSchedules());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.schedules).toEqual([{ id: 1, title: 'Week 1' }]);
  });

  it('surfaces an error when loading fails', async () => {
    scheduleService.getSchedules.mockRejectedValue(new Error('schedules down'));
    const { result } = renderHook(() => useSchedules());
    await waitFor(() => expect(result.current.error).toBe('schedules down'));
  });

  it('updateFormField() clears the field error', async () => {
    const { result } = renderHook(() => useSchedules());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateFormField('title', ''));
    // Force an error by submitting the incomplete form.
    await act(async () => {
      await result.current.submitSchedule();
    });
    expect(result.current.formErrors.title).toBeTruthy();

    act(() => result.current.updateFormField('title', 'Week 2'));
    expect(result.current.formErrors.title).toBeUndefined();
  });

  it('blocks submission and reports validation errors for an incomplete form', async () => {
    const { result } = renderHook(() => useSchedules());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.submitSchedule();
    });

    expect(scheduleService.createSchedule).not.toHaveBeenCalled();
    expect(result.current.formErrors.onedrive_url).toBeTruthy();
    expect(result.current.formErrors.publish_at).toBeTruthy();
  });

  it('submitSchedule() creates the schedule, refetches and resets the form', async () => {
    const { result } = renderHook(() => useSchedules());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateFormField('title', 'Week 2'));
    act(() => result.current.updateFormField('onedrive_url', 'https://1drv.ms/x'));
    act(() => result.current.updateFormField('publish_date', '2099-11-20'));
    act(() => result.current.updateFormField('publish_time', '10:00'));

    const onSuccess = vi.fn();
    await act(async () => {
      await result.current.submitSchedule(onSuccess);
    });

    expect(scheduleService.createSchedule).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith('Schedule published successfully');
    expect(result.current.form.title).toBe('');
    // Fetch happens once on mount and once after a successful publish.
    expect(scheduleService.getSchedules).toHaveBeenCalledTimes(2);
  });

  it('submitSchedule() surfaces an error when creation fails', async () => {
    scheduleService.createSchedule.mockRejectedValue(new Error('create failed'));
    const { result } = renderHook(() => useSchedules());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateFormField('title', 'Week 2'));
    act(() => result.current.updateFormField('onedrive_url', 'https://1drv.ms/x'));
    act(() => result.current.updateFormField('publish_date', '2099-11-20'));
    act(() => result.current.updateFormField('publish_time', '10:00'));

    await act(async () => {
      await result.current.submitSchedule();
    });

    expect(result.current.error).toBe('create failed');
    expect(result.current.isSubmitting).toBe(false);
  });

  it('resetForm() restores the initial form and clears errors', async () => {
    const { result } = renderHook(() => useSchedules());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateFormField('title', 'Something'));
    act(() => result.current.resetForm());

    expect(result.current.form.title).toBe('');
    expect(result.current.formErrors).toEqual({});
  });
});

// ===========================================================================
// useAssignments
// ===========================================================================
describe('useAssignments', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    assignmentService.getAssignments.mockResolvedValue([]);
    assignmentService.createAssignment.mockResolvedValue({ id: 10 });
    assignmentService.updateAssignmentDeadline.mockResolvedValue({});
  });

  it('loads assignments on mount', async () => {
    assignmentService.getAssignments.mockResolvedValue([{ id: 1, topic: 'T1' }]);
    const { result } = renderHook(() => useAssignments());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assignments).toEqual([{ id: 1, topic: 'T1' }]);
  });

  it('surfaces an error when loading fails', async () => {
    assignmentService.getAssignments.mockRejectedValue(new Error('assignments down'));
    const { result } = renderHook(() => useAssignments());
    await waitFor(() => expect(result.current.error).toBe('assignments down'));
  });

  it('updateFormField() sets the audience label from the recipient mode', async () => {
    const { result } = renderHook(() => useAssignments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateFormField('recipientMode', 'By cohort'));
    expect(result.current.form.audience).toBe('By Cohort');

    act(() => result.current.updateFormField('recipientMode', 'By batch'));
    expect(result.current.form.audience).toBe('Targeted Batches');

    act(() => result.current.updateFormField('recipientMode', 'All Trainees'));
    expect(result.current.form.audience).toBe('All Trainees');
  });

  it('rejects an incomplete assignment and populates form errors', async () => {
    const { result } = renderHook(() => useAssignments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok;
    await act(async () => {
      ok = await result.current.submitAssignment();
    });

    expect(ok).toBe(false);
    expect(assignmentService.createAssignment).not.toHaveBeenCalled();
    expect(result.current.formErrors.topic).toBeTruthy();
    expect(result.current.formErrors.deadline).toBeTruthy();
  });

  it('submitAssignment() posts a valid assignment and resets the form', async () => {
    const { result } = renderHook(() => useAssignments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateFormField('topic', 'Loops'));
    act(() => result.current.updateFormField('subject', 'CS101'));
    act(() => result.current.updateFormField('message', 'Solve exercises'));
    act(() => result.current.updateFormField('deadline', '2099-12-31'));

    let ok;
    const onSuccess = vi.fn();
    await act(async () => {
      ok = await result.current.submitAssignment(onSuccess);
    });

    expect(ok).toBe(true);
    expect(assignmentService.createAssignment).toHaveBeenCalledTimes(1);
    const payload = assignmentService.createAssignment.mock.calls[0][0];
    expect(payload.topic).toBe('Loops');
    expect(payload.recipient_mode).toBe('ALL');
    expect(onSuccess).toHaveBeenCalledWith('Assignment published successfully');
    expect(result.current.form.topic).toBe('');
  });

  it('submitAssignment() returns false and surfaces an error on failure', async () => {
    assignmentService.createAssignment.mockRejectedValue(new Error('publish failed'));
    const { result } = renderHook(() => useAssignments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateFormField('topic', 'Loops'));
    act(() => result.current.updateFormField('subject', 'CS101'));
    act(() => result.current.updateFormField('message', 'Solve exercises'));
    act(() => result.current.updateFormField('deadline', '2099-12-31'));

    let ok;
    await act(async () => {
      ok = await result.current.submitAssignment();
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('publish failed');
    expect(result.current.isSubmitting).toBe(false);
  });

  it('updateDeadline() validates empty and past dates', async () => {
    const { result } = renderHook(() => useAssignments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateDeadline(1, '');
    });
    expect(result.current.error).toBe('Deadline date cannot be empty.');

    act(() => result.current.clearError());
    await act(async () => {
      await result.current.updateDeadline(1, '2000-01-01');
    });
    expect(result.current.error).toBe('Deadline cannot be in the past.');
    expect(assignmentService.updateAssignmentDeadline).not.toHaveBeenCalled();
  });

  it('updateDeadline() persists a valid date and updates state', async () => {
    assignmentService.getAssignments.mockResolvedValue([{ id: 1, deadline: '2099-01-01' }]);
    const { result } = renderHook(() => useAssignments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const onSuccess = vi.fn();
    await act(async () => {
      await result.current.updateDeadline(1, '2099-12-31', onSuccess);
    });

    expect(assignmentService.updateAssignmentDeadline).toHaveBeenCalledWith(1, '2099-12-31');
    expect(result.current.assignments[0].deadline).toBe('2099-12-31');
    expect(onSuccess).toHaveBeenCalledWith('Deadline updated successfully');
    expect(result.current.deadlineUpdating[1]).toBe(false);
  });

  it('getTodayStr() returns a YYYY-MM-DD string matching the local day', () => {
    const today = getTodayStr();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    expect(today).toBe(expected);
  });

  it('getInitialAssignmentForm() defaults the start date to today', () => {
    const form = getInitialAssignmentForm();
    expect(form.start_date).toBe(getTodayStr());
    expect(form.recipientMode).toBe('All Trainees');
    expect(form.audience).toBe('All Trainees');
  });

  it('validateAssignmentForm() flags past dates and missing fields', () => {
    const invalid = validateAssignmentForm({
      topic: '',
      subject: '',
      start_date: '2000-01-01',
      deadline: '2000-02-01',
      message: '',
      recipientMode: 'All Trainees',
    });
    expect(invalid.isValid).toBe(false);
    expect(invalid.errors.start_date).toMatch(/past/);
    expect(invalid.errors.topic).toBeTruthy();

    const valid = validateAssignmentForm({
      topic: 'Loops',
      subject: 'CS101',
      start_date: '2099-01-01',
      deadline: '2099-02-01',
      message: 'Do it',
      recipientMode: 'All Trainees',
    });
    expect(valid.isValid).toBe(true);
  });

  it('validateAssignmentForm() requires a deadline on/after the start date', () => {
    const res = validateAssignmentForm({
      topic: 'Loops',
      subject: 'CS101',
      start_date: '2099-05-10',
      deadline: '2099-05-01',
      message: 'Do it',
      recipientMode: 'All Trainees',
    });
    expect(res.errors.deadline).toMatch(/on or after/);
  });

  it('validateAssignmentForm() requires cohort/batch targets for targeted modes', () => {
    const res = validateAssignmentForm({
      topic: 'Loops',
      subject: 'CS101',
      start_date: '2099-01-01',
      deadline: '2099-02-01',
      message: 'Do it',
      recipientMode: 'By cohort',
      cohort_id: '',
    });
    expect(res.errors.recipients).toBeTruthy();
  });
});

// ===========================================================================
// useBroadcasts
// ===========================================================================
describe('useBroadcasts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    broadcastService.getBroadcasts.mockResolvedValue([{ id: 1, title: 'Announcement' }]);
    broadcastService.createBroadcast.mockResolvedValue({ id: 2 });
  });

  it('loads broadcast history on mount', async () => {
    const { result } = renderHook(() => useBroadcasts());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.broadcasts).toEqual([{ id: 1, title: 'Announcement' }]);
  });

  it('surfaces an error when loading fails', async () => {
    broadcastService.getBroadcasts.mockRejectedValue(new Error('history down'));
    const { result } = renderHook(() => useBroadcasts());
    await waitFor(() => expect(result.current.error).toBe('history down'));
  });

  it('updateFormField() keeps the audience label in sync with the recipient mode', async () => {
    const { result } = renderHook(() => useBroadcasts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateFormField('recipientMode', 'All users'));
    expect(result.current.form.audience).toBe('All students');

    act(() => result.current.updateFormField('role', 'TA'));
    act(() => result.current.updateFormField('recipientMode', 'By role'));
    expect(result.current.form.audience).toBe('TA');
  });

  it('toggleRecipient() adds and removes a selected user', async () => {
    const { result } = renderHook(() => useBroadcasts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.updateFormField('recipientMode', 'Specific users'));

    const user = { username: 'alice' };
    act(() => result.current.toggleRecipient(user));
    expect(result.current.form.selectedUsers).toEqual([user]);
    expect(result.current.form.audience).toBe('Selected users (1)');

    act(() => result.current.toggleRecipient(user));
    expect(result.current.form.selectedUsers).toEqual([]);
    expect(result.current.form.audience).toBe('Selected users (0)');
  });

  it('setRecipients() replaces the selected users', async () => {
    const { result } = renderHook(() => useBroadcasts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.updateFormField('recipientMode', 'Specific users'));

    act(() => result.current.setRecipients([{ username: 'a' }, { username: 'b' }]));
    expect(result.current.form.selectedUsers).toHaveLength(2);
    expect(result.current.form.audience).toBe('Selected users (2)');
  });

  it('submitBroadcast() posts an "All users" announcement and resets the form', async () => {
    const { result } = renderHook(() => useBroadcasts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateFormField('title', 'Holiday'));
    act(() => result.current.updateFormField('message', 'Campus closed'));

    let ok;
    const onSuccess = vi.fn();
    await act(async () => {
      ok = await result.current.submitBroadcast(onSuccess);
    });

    expect(ok).toBe(true);
    const payload = broadcastService.createBroadcast.mock.calls[0][0];
    expect(payload).toEqual({ title: 'Holiday', message: 'Campus closed', recipient_type: 'ALL' });
    expect(onSuccess).toHaveBeenCalledWith('Broadcast announcement posted successfully');
    expect(result.current.form.title).toBe('');
  });

  it('submitBroadcast() sends to specific users when provided', async () => {
    const { result } = renderHook(() => useBroadcasts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateFormField('title', 'Hi'));
    act(() => result.current.updateFormField('message', 'Direct note'));
    act(() => result.current.updateFormField('recipientMode', 'Specific users'));
    act(() => result.current.setRecipients([{ username: 'alice' }, { username: 'bob' }]));

    await act(async () => {
      await result.current.submitBroadcast();
    });

    const payload = broadcastService.createBroadcast.mock.calls[0][0];
    expect(payload.recipient_type).toBe('USERS');
    expect(payload.target_usernames).toEqual(['alice', 'bob']);
  });

  it('submitBroadcast() returns false on validation failure', async () => {
    const { result } = renderHook(() => useBroadcasts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok;
    await act(async () => {
      ok = await result.current.submitBroadcast();
    });

    expect(ok).toBe(false);
    expect(broadcastService.createBroadcast).not.toHaveBeenCalled();
    expect(result.current.formErrors.title).toBeTruthy();
  });

  it('submitBroadcast() returns false and sets an error when posting fails', async () => {
    broadcastService.createBroadcast.mockRejectedValue(new Error('send failed'));
    const { result } = renderHook(() => useBroadcasts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateFormField('title', 'Holiday'));
    act(() => result.current.updateFormField('message', 'Campus closed'));

    let ok;
    await act(async () => {
      ok = await result.current.submitBroadcast();
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('send failed');
    expect(result.current.isSubmitting).toBe(false);
  });
});

// ===========================================================================
// useDocuments
// ===========================================================================
describe('useDocuments', () => {
  const sampleDocs = [
    { id: 1, name: 'Syllabus', fileName: 'syllabus.pdf', fileType: 'PDF', status: 'Ready', space: 'general' },
    { id: 2, name: 'Exam', fileName: 'exam.pdf', fileType: 'PDF', status: 'Failed', space: 'ignite' },
    { id: 3, name: 'Notes', fileName: 'notes.pdf', fileType: 'PDF', status: 'Ready for RAG', space: 'general' },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    documentsService.getDocuments.mockResolvedValue(sampleDocs);
    documentsService.getKnowledgeBaseStats.mockResolvedValue({ total: 3 });
  });

  it('loads documents and knowledge-base stats', async () => {
    const { result } = renderHook(() => useDocuments());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.documents).toEqual(sampleDocs);
    expect(result.current.kbStats).toEqual({ total: 3 });
  });

  it('tolerates a failing stats endpoint (documents still load, no error)', async () => {
    documentsService.getKnowledgeBaseStats.mockRejectedValue(new Error('stats 500'));
    const { result } = renderHook(() => useDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('');
    expect(result.current.documents).toEqual(sampleDocs);
    expect(result.current.kbStats).toBeNull();
  });

  it('surfaces an error when the document list fails', async () => {
    documentsService.getDocuments.mockRejectedValue(new Error('docs down'));
    const { result } = renderHook(() => useDocuments());
    await waitFor(() => expect(result.current.error).toBe('docs down'));
  });

  it('uploadDoc() prepends the new document', async () => {
    const { result } = renderHook(() => useDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    documentsService.uploadDocument.mockResolvedValue({ id: 99, name: 'New', status: 'Processing' });
    let returned;
    await act(async () => {
      returned = await result.current.uploadDoc({ name: 'New' });
    });

    expect(returned).toEqual({ id: 99, name: 'New', status: 'Processing' });
    expect(result.current.documents[0]).toEqual({ id: 99, name: 'New', status: 'Processing' });
    expect(result.current.isUploading).toBe(false);
  });

  it('deleteDoc() removes the document', async () => {
    const { result } = renderHook(() => useDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    documentsService.deleteDocument.mockResolvedValue({});
    await act(async () => {
      await result.current.deleteDoc(1);
    });

    expect(documentsService.deleteDocument).toHaveBeenCalledWith(1);
    expect(result.current.documents.map((d) => d.id)).toEqual([2, 3]);
  });

  it('filters documents by status, space and search query', async () => {
    const { result } = renderHook(() => useDocuments());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // 'Ready' also matches 'Ready for RAG'
    act(() => result.current.setStatusFilter('Ready'));
    expect(result.current.filteredDocuments.map((d) => d.id)).toEqual([1, 3]);

    act(() => result.current.setStatusFilter('Failed'));
    expect(result.current.filteredDocuments.map((d) => d.id)).toEqual([2]);

    act(() => result.current.setStatusFilter('All'));
    act(() => result.current.setSpaceFilter('ignite'));
    expect(result.current.filteredDocuments.map((d) => d.id)).toEqual([2]);

    act(() => result.current.setSpaceFilter('All'));
    act(() => result.current.setSearchQuery('notes.pdf'));
    expect(result.current.filteredDocuments.map((d) => d.id)).toEqual([3]);
  });

  it('polls for updates while a document is Processing', async () => {
    documentsService.getDocuments
      .mockResolvedValueOnce([{ id: 1, name: 'X', status: 'Processing' }])
      .mockResolvedValue([{ id: 1, name: 'X', status: 'Ready' }]);
    const { result } = renderHook(() => useDocuments());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.documents[0].status).toBe('Processing');

    await waitFor(() => expect(documentsService.getDocuments).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
    await waitFor(() => expect(result.current.documents[0].status).toBe('Ready'));
  });
});

// ===========================================================================
// utils/date
// ===========================================================================
describe('date utils', () => {
  describe('formatDate', () => {
    it('formats a valid ISO string for the en-IN locale', () => {
      const out = formatDate('2026-11-15T12:30:00Z');
      expect(typeof out).toBe('string');
      expect(out).toContain('2026');
      expect(out).toContain('Nov');
    });

    it('formats a Date instance and a numeric timestamp', () => {
      expect(formatDate(new Date('2026-11-15T12:30:00Z'))).toContain('2026');
      expect(typeof formatDate(1770000000000)).toBe('string');
    });

    it('returns an empty string for null / undefined / empty input', () => {
      expect(formatDate(null)).toBe('');
      expect(formatDate(undefined)).toBe('');
      expect(formatDate('')).toBe('');
      expect(formatDate(0)).toBe('');
    });

    it('returns the raw value for an invalid date string', () => {
      expect(formatDate('not-a-date')).toBe('not-a-date');
    });
  });

  describe('getMinDateTimeLocal', () => {
    it('produces a datetime-local string for the current local time', () => {
      const value = getMinDateTimeLocal();
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      expect(value).toHaveLength(16);

      // The value is a local-time string, so re-parsing it as local should be
      // within a minute of "now".
      const parsed = new Date(value);
      expect(Math.abs(parsed.getTime() - Date.now())).toBeLessThan(60_000);
    });

    it('is deterministic for a fixed system time', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-15T12:30:00Z'));

      const now = new Date();
      const offsetMs = now.getTimezoneOffset() * 60000;
      const expected = new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);

      expect(getMinDateTimeLocal()).toBe(expected);
      vi.useRealTimers();
    });
  });

  describe('toIsoUtcString', () => {
    it('converts a datetime-local value to an ISO UTC string (round-trip)', () => {
      const value = '2026-11-15T12:30';
      expect(toIsoUtcString(value)).toBe(new Date(value).toISOString());
    });

    it('returns null for falsy input', () => {
      expect(toIsoUtcString('')).toBeNull();
      expect(toIsoUtcString(null)).toBeNull();
      expect(toIsoUtcString(undefined)).toBeNull();
    });

    it('returns null for an invalid datetime string', () => {
      expect(toIsoUtcString('nonsense')).toBeNull();
    });
  });
});
