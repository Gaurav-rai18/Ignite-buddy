import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { Login } from '../pages/Login/Login';
import { Dashboard } from '../pages/Dashboard/Dashboard';
import { NotFound } from '../pages/NotFound/NotFound';
import { Schedule } from '../pages/Schedule/Schedule';
import { Broadcast } from '../pages/Broadcast/Broadcast';
import { Assignments } from '../pages/Assignments/Assignments';
import { BuddyControl } from '../pages/BuddyControl/BuddyControl';

import { useAuth } from '../hooks/useAuth';
import { useDashboard } from '../hooks/useDashboard';
import { useBroadcasts } from '../hooks/useBroadcasts';
import { useAssignments } from '../hooks/useAssignments';
import { useBuddy } from '../hooks/useBuddy';

import { usersService } from '../services/usersService';
import { buddyService } from '../services/buddyService';
import { scheduleService } from '../services/scheduleService';

// --- Mock the data / hook layer so each page's own logic runs against fixtures ---
vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }) => children,
}));

vi.mock('../hooks/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('../hooks/useBroadcasts', () => ({ useBroadcasts: vi.fn() }));
vi.mock('../hooks/useAssignments', () => ({ useAssignments: vi.fn() }));
vi.mock('../hooks/useBuddy', () => ({ useBuddy: vi.fn() }));

vi.mock('../services/usersService', () => ({
  usersService: {
    getCohorts: vi.fn(),
    getBatches: vi.fn(),
    getSubBatches: vi.fn(),
    getStreams: vi.fn(),
    getSubjects: vi.fn(),
    getUsers: vi.fn(),
  },
}));

vi.mock('../services/buddyService', () => ({
  buddyService: {
    getBuddySetting: vi.fn(),
    updateBuddySetting: vi.fn(),
    getExamRules: vi.fn(),
    createExamRule: vi.fn(),
    deleteExamRule: vi.fn(),
  },
}));

vi.mock('../services/scheduleService', () => ({
  scheduleService: {
    getSchedules: vi.fn(),
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
    parseExcelSchedule: vi.fn(),
  },
}));

// --- date helpers ---
const isoDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const todayStr = isoDate(new Date());
const futureDate = isoDate(new Date(Date.now() + 30 * 86400000));
const futureDate2 = isoDate(new Date(Date.now() + 60 * 86400000));

beforeEach(() => {
  vi.clearAllMocks();
  // Deterministic service defaults (hierarchy lookups used by the forms/details).
  usersService.getCohorts.mockResolvedValue([]);
  usersService.getBatches.mockResolvedValue([]);
  usersService.getSubBatches.mockResolvedValue([]);
  usersService.getStreams.mockResolvedValue([]);
  usersService.getSubjects.mockResolvedValue([]);
  usersService.getUsers.mockResolvedValue([]);

  buddyService.getExamRules.mockResolvedValue([]);
  buddyService.updateBuddySetting.mockResolvedValue({ enabled: true });
  buddyService.createExamRule.mockResolvedValue({});
  buddyService.deleteExamRule.mockResolvedValue({});

  scheduleService.getSchedules.mockResolvedValue([]);
  scheduleService.createSchedule.mockResolvedValue({ data: { id: 99 } });
  scheduleService.updateSchedule.mockResolvedValue({ data: { id: 1 } });
  scheduleService.deleteSchedule.mockResolvedValue({});
});

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */
describe('Login page', () => {
  let loginMock;
  let clearNoticeMock;

  const renderLogin = (props = {}) =>
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login {...props} />} />
          <Route path="/dashboard" element={<div>DASHBOARD_ROUTE</div>} />
        </Routes>
      </MemoryRouter>
    );

  beforeEach(() => {
    loginMock = vi.fn();
    clearNoticeMock = vi.fn();
    useAuth.mockReturnValue({
      user: null,
      login: loginMock,
      sessionTimeoutNotice: false,
      clearNotice: clearNoticeMock,
    });
  });

  it('shows field validation errors and never calls login when fields are empty', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Please enter your email.')).toBeInTheDocument();
    expect(screen.getByText('Please enter your password.')).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid email format', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('rejects a too-short password', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'admin@campus.demo');
    await user.type(screen.getByLabelText('Password'), '12');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Password must be at least 4 characters.')).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('signs in an administrator, notifies and redirects to the dashboard', async () => {
    const onNotify = vi.fn();
    loginMock.mockResolvedValue({ full_name: 'Admin User', role: 'ADMIN' });
    const user = userEvent.setup();
    renderLogin({ onNotify });

    await user.type(screen.getByLabelText('Email'), 'admin@campus.demo');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith({
        email: 'admin@campus.demo',
        password: 'password123',
      })
    );
    expect(onNotify).toHaveBeenCalledWith('Signed in successfully as Administrator.');
    expect(await screen.findByText('DASHBOARD_ROUTE')).toBeInTheDocument();
  });

  it('shows an error banner for invalid credentials and does not redirect', async () => {
    loginMock.mockRejectedValue(new Error('Email or password is incorrect.'));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'admin@campus.demo');
    await user.type(screen.getByLabelText('Password'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Email or password is incorrect.');
    expect(screen.queryByText('DASHBOARD_ROUTE')).not.toBeInTheDocument();
  });

  it('rejects trainee accounts with an access-denied message', async () => {
    loginMock.mockRejectedValue(
      new Error('Access denied. Trainees are not authorized to access the Admin Console.')
    );
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'trainee@campus.demo');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/Access denied/i)).toBeInTheDocument();
    expect(loginMock).toHaveBeenCalledTimes(1);
  });

  it('clears any session-timeout notice when a submit is attempted', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(clearNoticeMock).toHaveBeenCalled());
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    renderLogin();

    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('shows a loading state and disables the form while signing in', async () => {
    loginMock.mockImplementation(() => new Promise(() => { }));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'admin@campus.demo');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const loadingBtn = await screen.findByRole('button', { name: /signing in/i });
    expect(loadingBtn).toBeDisabled();
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
  });

  it('renders the session-timeout banner when the session has expired', () => {
    useAuth.mockReturnValue({
      user: null,
      login: loginMock,
      sessionTimeoutNotice: true,
      clearNotice: clearNoticeMock,
    });
    renderLogin();

    expect(
      screen.getByText('Session expired due to inactivity. Please sign in again.')
    ).toBeInTheDocument();
  });

  it('toggles the reset-password help notice', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: /reset password/i }));
    expect(screen.getByText('Admin Password Reset')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* NotFound                                                            */
/* ------------------------------------------------------------------ */
describe('NotFound page', () => {
  const renderNotFound = () =>
    render(
      <MemoryRouter initialEntries={['/missing']}>
        <Routes>
          <Route path="/missing" element={<NotFound />} />
          <Route path="/dashboard" element={<div>DASHBOARD_ROUTE</div>} />
        </Routes>
      </MemoryRouter>
    );

  it('renders the 404 message and a dashboard call-to-action', () => {
    renderNotFound();

    expect(screen.getByText('404 ERROR')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByText('Looking for the dashboard?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to dashboard/i })).toBeInTheDocument();
  });

  it('navigates home when the back-to-dashboard link is clicked', async () => {
    const user = userEvent.setup();
    renderNotFound();

    await user.click(screen.getByRole('button', { name: /back to dashboard/i }));

    expect(await screen.findByText('DASHBOARD_ROUTE')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */
describe('Dashboard page', () => {
  const baseDashboard = (overrides = {}) => ({
    summary: null,
    recentBroadcasts: [],
    buddy: true,
    loading: false,
    error: '',
    isTogglingBuddy: false,
    refetch: vi.fn(),
    toggleBuddy: vi.fn(),
    ...overrides,
  });

  const renderDashboard = (props = {}) =>
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard {...props} />} />
          <Route path="/broadcast" element={<div>BROADCAST_ROUTE</div>} />
        </Routes>
      </MemoryRouter>
    );

  beforeEach(() => {
    useAuth.mockReturnValue({ user: { full_name: 'Admin User', role: 'ADMIN' } });
    useDashboard.mockReturnValue(baseDashboard());
  });

  it("greets the signed-in user with their display name", () => {
    renderDashboard();

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Admin User');
  });

  it('shows the refreshing state while data is loading', () => {
    useDashboard.mockReturnValue(baseDashboard({ loading: true }));
    renderDashboard();

    const refreshBtn = screen.getByRole('button', { name: /refreshing/i });
    expect(refreshBtn).toBeDisabled();
  });

  it('renders summary stats and recent broadcasts after load', () => {
    useDashboard.mockReturnValue(
      baseDashboard({
        summary: {
          broadcast_count: 5,
          scheduled_count: 3,
          total_trainees: 42,
          total_cohorts: 2,
          total_batches: 4,
          total_sub_batches: 8,
          upcoming_count: 2,
        },
        recentBroadcasts: [
          { id: 1, title: 'Exam update', audience: 'All users', created_at: '2026-11-01T10:00:00Z' },
        ],
      })
    );
    renderDashboard();

    const broadcastCard = screen.getByText('Total broadcasts').closest('.stat-card');
    expect(within(broadcastCard).getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Exam update')).toBeInTheDocument();
    expect(screen.getByText(/2 Cohorts/)).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('shows the empty state when there are no recent broadcasts', () => {
    useDashboard.mockReturnValue(baseDashboard({ recentBroadcasts: [] }));
    renderDashboard();

    expect(screen.getByText('No broadcasts yet')).toBeInTheDocument();
  });

  it('shows an error banner and retries via refetch', async () => {
    const refetch = vi.fn();
    useDashboard.mockReturnValue(baseDashboard({ error: 'Unable to reach the server.', refetch }));
    const user = userEvent.setup();
    renderDashboard();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Unable to reach the server.');

    await user.click(within(alert).getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('toggles Buddy availability and notifies with the new state', async () => {
    const onNotify = vi.fn();
    const toggleBuddy = vi.fn((cb) => cb && cb(false));
    useDashboard.mockReturnValue(baseDashboard({ toggleBuddy }));
    const user = userEvent.setup();
    renderDashboard({ onNotify });

    await user.click(screen.getByRole('button', { name: 'Turn off Buddy' }));

    expect(toggleBuddy).toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith('Buddy turned OFF');
  });

  it('reflects a paused Buddy state', () => {
    useDashboard.mockReturnValue(baseDashboard({ buddy: false }));
    renderDashboard();

    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on Buddy' })).toBeInTheDocument();
  });

  it('navigates to the broadcast composer from the New broadcast action', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole('button', { name: /new broadcast/i }));
    expect(await screen.findByText('BROADCAST_ROUTE')).toBeInTheDocument();
  });

  it('refetches and notifies on manual refresh', async () => {
    const onNotify = vi.fn();
    const refetch = vi.fn().mockResolvedValue(undefined);
    useDashboard.mockReturnValue(baseDashboard({ refetch }));
    const user = userEvent.setup();
    renderDashboard({ onNotify });

    await user.click(screen.getByRole('button', { name: /refresh data/i }));

    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(onNotify).toHaveBeenCalledWith('Dashboard data refreshed');
  });
});

/* ------------------------------------------------------------------ */
/* Broadcast                                                           */
/* ------------------------------------------------------------------ */
describe('Broadcast page', () => {
  const baseBroadcastHook = (overrides = {}) => ({
    broadcasts: [],
    loading: false,
    isSubmitting: false,
    error: '',
    formErrors: {},
    form: {
      title: '',
      message: '',
      recipientMode: 'All users',
      role: '',
      cohort_id: '',
      batch_id: '',
      sub_batch_id: '',
      stream_id: '',
      selectedBatchIds: [],
      selectedSubBatchIds: [],
      selectedStreamIds: [],
      selectedUsers: [],
      audience: 'All students',
    },
    historyFilter: 'all',
    setHistoryFilter: vi.fn(),
    updateFormField: vi.fn(),
    toggleRecipient: vi.fn(),
    setRecipients: vi.fn(),
    submitBroadcast: vi.fn(),
    refetch: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  });

  const completeForm = {
    title: 'Exam update',
    message: 'Exam starts at 9am',
    recipientMode: 'All users',
    role: '',
    cohort_id: '',
    batch_id: '',
    sub_batch_id: '',
    stream_id: '',
    selectedBatchIds: [],
    selectedSubBatchIds: [],
    selectedStreamIds: [],
    selectedUsers: [],
    audience: 'All students',
  };

  const renderBroadcast = (props = {}) =>
    render(
      <MemoryRouter>
        <Broadcast {...props} />
      </MemoryRouter>
    );

  it('shows a loading state while announcements are fetched', () => {
    useBroadcasts.mockReturnValue(baseBroadcastHook({ loading: true }));
    renderBroadcast();

    expect(screen.getByText('Loading announcements...')).toBeInTheDocument();
  });

  it('renders announcements after they resolve', () => {
    useBroadcasts.mockReturnValue(
      baseBroadcastHook({
        broadcasts: [
          {
            id: 1,
            title: 'Exam update',
            message: 'Exam starts at 9am',
            recipient_type: 'ALL',
            audience: 'All users',
            posted_by_me: true,
            created_at: '2026-11-01T10:00:00Z',
          },
        ],
      })
    );
    renderBroadcast();

    expect(screen.getByText('Exam update')).toBeInTheDocument();
    expect(screen.getByText('Exam starts at 9am')).toBeInTheDocument();
    expect(screen.getByText('Announcement History')).toBeInTheDocument();
  });

  it('shows the empty state when there are no announcements', () => {
    useBroadcasts.mockReturnValue(baseBroadcastHook());
    renderBroadcast();

    expect(screen.getByText('No announcements yet')).toBeInTheDocument();
  });

  it('changes the history filter when a tab is clicked', async () => {
    const setHistoryFilter = vi.fn();
    useBroadcasts.mockReturnValue(baseBroadcastHook({ setHistoryFilter }));
    const user = userEvent.setup();
    renderBroadcast();

    await user.click(screen.getByRole('tab', { name: /posted by me/i }));
    expect(setHistoryFilter).toHaveBeenCalledWith('mine');
  });

  it('shows an error banner and retries via refetch', async () => {
    const refetch = vi.fn();
    useBroadcasts.mockReturnValue(
      baseBroadcastHook({ error: 'Unable to reach the server.', refetch })
    );
    const user = userEvent.setup();
    renderBroadcast();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Unable to reach the server.');

    await user.click(within(alert).getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('updates the form field when typing a title', async () => {
    const updateFormField = vi.fn();
    useBroadcasts.mockReturnValue(baseBroadcastHook({ updateFormField }));
    const user = userEvent.setup();
    renderBroadcast();

    await user.type(screen.getByLabelText('Announcement title'), 'H');
    expect(updateFormField).toHaveBeenCalledWith('title', 'H');
  });

  it('submits the broadcast, notifies and bumps the announcement count', async () => {
    const onNotify = vi.fn();
    const onUpdateBroadcastCount = vi.fn();
    const submitBroadcast = vi.fn((cb) => cb('Broadcast announcement posted successfully'));
    useBroadcasts.mockReturnValue(
      baseBroadcastHook({
        form: completeForm,
        broadcasts: [{ id: 1 }, { id: 2 }],
        submitBroadcast,
      })
    );
    const user = userEvent.setup();
    renderBroadcast({ onNotify, onUpdateBroadcastCount });

    await user.click(screen.getByRole('button', { name: /publish broadcast/i }));

    expect(submitBroadcast).toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith('Broadcast announcement posted successfully');
    expect(onUpdateBroadcastCount).toHaveBeenCalledWith(3);
  });

  it('keeps publish disabled until the required fields are filled', async () => {
    useBroadcasts.mockReturnValue(baseBroadcastHook());
    const user = userEvent.setup();
    const { unmount } = renderBroadcast();

    expect(screen.getByRole('button', { name: /publish broadcast/i })).toBeDisabled();
    unmount();

    useBroadcasts.mockReturnValue(baseBroadcastHook({ form: completeForm }));
    renderBroadcast();
    expect(screen.getByRole('button', { name: /publish broadcast/i })).toBeEnabled();
  });

  it('opens the announcement preview modal', async () => {
    useBroadcasts.mockReturnValue(baseBroadcastHook({ form: completeForm }));
    const user = userEvent.setup();
    renderBroadcast();

    await user.click(screen.getByRole('button', { name: /preview/i }));

    const dialog = screen.getByRole('dialog', { name: /announcement preview/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Exam starts at 9am')).toBeInTheDocument();
    expect(within(dialog).getByText('Exam update')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* Assignments                                                         */
/* ------------------------------------------------------------------ */
describe('Assignments page', () => {
  const baseAssignmentsHook = (overrides = {}) => ({
    assignments: [],
    loading: false,
    isSubmitting: false,
    error: '',
    formErrors: {},
    form: {
      topic: '',
      subject: '',
      platform_link: '',
      start_date: todayStr,
      deadline: '',
      message: '',
      recipientMode: 'All Trainees',
      cohort_id: '',
      batch_id: '',
      sub_batch_id: '',
      stream_id: '',
      selectedBatchIds: [],
      selectedSubBatchIds: [],
      selectedStreamIds: [],
      audience: 'All Trainees',
    },
    historyFilter: 'mine',
    deadlineUpdating: {},
    setHistoryFilter: vi.fn(),
    updateFormField: vi.fn(),
    submitAssignment: vi.fn(),
    updateDeadline: vi.fn(),
    refetch: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  });

  const completeForm = {
    topic: 'Linked Lists',
    subject: 'Data Structures',
    platform_link: '',
    start_date: todayStr,
    deadline: futureDate,
    message: 'Solve the exercises.',
    recipientMode: 'All Trainees',
    cohort_id: '',
    batch_id: '',
    sub_batch_id: '',
    stream_id: '',
    selectedBatchIds: [],
    selectedSubBatchIds: [],
    selectedStreamIds: [],
    audience: 'All Trainees',
  };

  const renderAssignments = (props = {}) =>
    render(
      <MemoryRouter>
        <Assignments {...props} />
      </MemoryRouter>
    );

  it('shows a loading state while assignments are fetched', () => {
    useAssignments.mockReturnValue(baseAssignmentsHook({ loading: true }));
    renderAssignments();

    expect(screen.getByText('Loading assignments...')).toBeInTheDocument();
  });

  it('renders assignments published by the current user', () => {
    useAssignments.mockReturnValue(
      baseAssignmentsHook({
        assignments: [
          { id: 1, topic: 'Linked Lists', subject: 'Data Structures', posted_by_me: true },
        ],
      })
    );
    renderAssignments();

    expect(screen.getByText('Linked Lists')).toBeInTheDocument();
    expect(screen.getByText('Assignment history')).toBeInTheDocument();
  });

  it('shows the empty state when the user has no assignments', () => {
    useAssignments.mockReturnValue(baseAssignmentsHook());
    renderAssignments();

    expect(screen.getByText('No assignments posted yet')).toBeInTheDocument();
  });

  it('switches to the "others" filter and shows its empty state', async () => {
    const setHistoryFilter = vi.fn();
    useAssignments.mockReturnValue(
      baseAssignmentsHook({ historyFilter: 'others', setHistoryFilter })
    );
    const user = userEvent.setup();
    renderAssignments();

    expect(screen.getByText('No assignments from others')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /posted by others/i }));
    expect(setHistoryFilter).toHaveBeenCalledWith('others');
  });

  it('shows an error banner and retries via refetch', async () => {
    const refetch = vi.fn();
    useAssignments.mockReturnValue(
      baseAssignmentsHook({ error: 'Unable to reach the server.', refetch })
    );
    const user = userEvent.setup();
    renderAssignments();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Unable to reach the server.');

    await user.click(within(alert).getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('updates an assignment deadline and notifies', async () => {
    const onNotify = vi.fn();
    const updateDeadline = vi.fn((id, deadline, cb) => cb && cb('Deadline updated successfully'));
    useAssignments.mockReturnValue(
      baseAssignmentsHook({
        assignments: [
          {
            id: 7,
            topic: 'Linked Lists',
            subject: 'Data Structures',
            posted_by_me: true,
            deadline: futureDate,
            start_date: todayStr,
          },
        ],
        updateDeadline,
      })
    );
    const user = userEvent.setup();
    renderAssignments({ onNotify });

    fireEvent.change(screen.getByLabelText('Assignment deadline'), {
      target: { value: futureDate2 },
    });
    await user.click(screen.getByRole('button', { name: /update/i }));

    expect(updateDeadline).toHaveBeenCalledWith(7, futureDate2, expect.any(Function));
    expect(onNotify).toHaveBeenCalledWith('Deadline updated successfully');
  });

  it('blocks a deadline update that points to a past date', async () => {
    const updateDeadline = vi.fn();
    useAssignments.mockReturnValue(
      baseAssignmentsHook({
        assignments: [
          { id: 7, topic: 'Linked Lists', posted_by_me: true, deadline: futureDate },
        ],
        updateDeadline,
      })
    );
    const user = userEvent.setup();
    renderAssignments();

    fireEvent.change(screen.getByLabelText('Assignment deadline'), {
      target: { value: '2000-01-01' },
    });
    await user.click(screen.getByRole('button', { name: /update/i }));

    expect(screen.getByText('Deadline cannot be in the past.')).toBeInTheDocument();
    expect(updateDeadline).not.toHaveBeenCalled();
  });

  it('submits a valid assignment', async () => {
    const submitAssignment = vi.fn();
    useAssignments.mockReturnValue(
      baseAssignmentsHook({ form: completeForm, submitAssignment })
    );
    const user = userEvent.setup();
    renderAssignments();

    await user.click(screen.getByRole('button', { name: /publish assignment/i }));
    expect(submitAssignment).toHaveBeenCalled();
  });

  it('keeps publish disabled until the assignment form is complete', () => {
    useAssignments.mockReturnValue(baseAssignmentsHook());
    const { unmount } = renderAssignments();

    expect(screen.getByRole('button', { name: /publish assignment/i })).toBeDisabled();
    unmount();

    useAssignments.mockReturnValue(baseAssignmentsHook({ form: completeForm }));
    renderAssignments();
    expect(screen.getByRole('button', { name: /publish assignment/i })).toBeEnabled();
  });
});

/* ------------------------------------------------------------------ */
/* BuddyControl                                                        */
/* ------------------------------------------------------------------ */
describe('BuddyControl page', () => {
  const baseBuddyHook = (overrides = {}) => ({
    buddy: true,
    settings: {
      enabled: true,
      exam_mode: false,
      exam_reason: '',
      test_auto_lock_enabled: true,
      test_buffer_before_minutes: 15,
      test_buffer_after_minutes: 15,
      llm_system_prompt: '',
    },
    loading: false,
    isUpdating: false,
    error: '',
    toggleBuddy: vi.fn(),
    updateSetting: vi.fn(),
    saveBatchSettings: vi.fn(),
    refetch: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  });

  const renderBuddy = (props = {}) =>
    render(
      <MemoryRouter>
        <BuddyControl {...props} />
      </MemoryRouter>
    );

  it('renders the hero and detail panels', () => {
    useBuddy.mockReturnValue(baseBuddyHook());
    renderBuddy();

    expect(screen.getByRole('heading', { name: 'Buddy Control Center' })).toBeInTheDocument();
    expect(screen.getByText('Buddy is ready to go')).toBeInTheDocument();
    expect(screen.getByText('Master Availability & Global Lockdown')).toBeInTheDocument();
  });

  it('toggles Buddy from the hero and notifies with the new state', async () => {
    const onNotify = vi.fn();
    const toggleBuddy = vi.fn((cb) => cb && cb(false));
    useBuddy.mockReturnValue(baseBuddyHook({ toggleBuddy }));
    const user = userEvent.setup();
    renderBuddy({ onNotify });

    await user.click(screen.getByRole('button', { name: /turn buddy off/i }));

    expect(toggleBuddy).toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith('Buddy turned OFF');
  });

  it('toggles Buddy from the master switch in the details panel', async () => {
    const toggleBuddy = vi.fn();
    useBuddy.mockReturnValue(baseBuddyHook({ toggleBuddy }));
    const user = userEvent.setup();
    renderBuddy();

    await user.click(
      screen.getByRole('switch', { name: /toggle buddy availability/i })
    );
    expect(toggleBuddy).toHaveBeenCalled();
  });

  it('updates a setting when the exam-mode switch is toggled', async () => {
    const updateSetting = vi.fn();
    useBuddy.mockReturnValue(baseBuddyHook({ updateSetting }));
    const user = userEvent.setup();
    renderBuddy();

    await user.click(screen.getByRole('switch', { name: /toggle exam mode/i }));
    expect(updateSetting).toHaveBeenCalledWith('exam_mode', true, expect.any(Function));
  });

  it('shows the campus-wide exam banner when exam mode is active', () => {
    useBuddy.mockReturnValue(
      baseBuddyHook({ settings: { ...baseBuddyHook().settings, exam_mode: true } })
    );
    renderBuddy();

    expect(screen.getByText('Campus-Wide Exam Mode is Active')).toBeInTheDocument();
  });

  it('renders active exam lockdown rules returned by the service', async () => {
    buddyService.getExamRules.mockResolvedValue([
      {
        id: 1,
        action: 'BLOCK',
        scope: 'SUB_BATCH',
        target_label: 'Sub-Batch A1',
        reason: 'Assessment in progress',
        valid_until: '2026-12-01T10:00:00Z',
        created_by: 'Admin User',
      },
    ]);
    useBuddy.mockReturnValue(baseBuddyHook());
    renderBuddy();

    expect(await screen.findByText('Sub-Batch A1')).toBeInTheDocument();
    expect(screen.getByText('Lockdown')).toBeInTheDocument();
  });

  it('shows an error banner and retries via refetch', async () => {
    const refetch = vi.fn();
    useBuddy.mockReturnValue(baseBuddyHook({ error: 'Unable to reach the server.', refetch }));
    const user = userEvent.setup();
    renderBuddy();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Unable to reach the server.');

    await user.click(within(alert).getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('opens the create-rule modal', async () => {
    useBuddy.mockReturnValue(baseBuddyHook());
    const user = userEvent.setup();
    renderBuddy();

    await user.click(screen.getByRole('button', { name: /create rule \/ override/i }));
    expect(screen.getByRole('heading', { name: 'Create Exam Policy Rule' })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* Schedule                                                            */
/* ------------------------------------------------------------------ */
describe('Schedule page', () => {
  const renderSchedule = (props = {}) => render(<Schedule {...props} />);

  beforeEach(() => {
    usersService.getCohorts.mockResolvedValue([{ id: 1, code: 'B50', name: 'Cohort B50' }]);
    usersService.getSubjects.mockResolvedValue([]);
    scheduleService.getSchedules.mockResolvedValue([]);
  });

  it('renders the page intro', () => {
    renderSchedule();
    expect(
      screen.getByRole('heading', { name: 'Schedule & Timetable Management' })
    ).toBeInTheDocument();
  });

  it('renders the calendar workspace with a publish action', async () => {
    renderSchedule();

    expect(await screen.findByRole('button', { name: /publish schedule/i })).toBeInTheDocument();
    expect(screen.getAllByTitle('Click to edit lecture or venue').length).toBeGreaterThan(0);
  });

  it('opens the Excel upload modal', async () => {
    const user = userEvent.setup();
    renderSchedule();

    await user.click(await screen.findByRole('button', { name: /upload excel/i }));
    expect(screen.getByText('Upload Timetable Spreadsheet')).toBeInTheDocument();
  });

  it('lists saved schedules in the saved-weeks drawer', async () => {
    scheduleService.getSchedules.mockResolvedValue([
      {
        id: 1,
        title: 'Week 1',
        cohort: { id: 1, code: 'B50' },
        is_active: true,
        effective_from: '2026-11-10',
        phase: 'FOUNDATION',
        grid_data: { sub_batches: {}, streams: {}, test_slots: [] },
      },
    ]);
    const user = userEvent.setup();
    renderSchedule();

    await user.click(await screen.findByRole('button', { name: /saved weeks \(1\)/i }));

    expect(screen.getByRole('heading', { name: 'Saved Weekly Schedules' })).toBeInTheDocument();
    expect(screen.getByText('Week 1')).toBeInTheDocument();
  });

  it('publishes a new schedule and notifies', async () => {
    const onNotify = vi.fn();
    const user = userEvent.setup();
    renderSchedule({ onNotify });

    const publishBtn = await screen.findByRole('button', { name: /publish schedule/i });
    await waitFor(() => expect(publishBtn).not.toBeDisabled());

    await user.click(publishBtn);

    await waitFor(() => expect(scheduleService.createSchedule).toHaveBeenCalled());
    expect(onNotify).toHaveBeenCalledWith('Schedule published and active!');
  });

  it('opens the slot edit modal when a calendar cell is clicked', async () => {
    const user = userEvent.setup();
    renderSchedule();

    const cells = await screen.findAllByTitle('Click to edit lecture or venue');
    await user.click(cells[0]);

    expect(screen.getByText('Edit Lecture Slot')).toBeInTheDocument();
  });

  // it('shows the empty stream state in the specialization view', async () => {
  //   const user = userEvent.setup();
  //   renderSchedule();

  //   const phaseSelect = screen
  //     .getByText(/Foundation \(Sub-Batches only\)/)
  //     .closest('select');
  //   fireEvent.change(phaseSelect, { target: { value: 'SPECIALIZATION' } });

  //   await user.click(await screen.findByRole('button', { name: /streams specialization/i }));

  //   expect(screen.getByText('No Technical Stream Allocations Found')).toBeInTheDocument();
  // });
});
