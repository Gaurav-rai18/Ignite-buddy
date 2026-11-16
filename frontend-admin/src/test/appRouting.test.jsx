import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { App } from '../app/App';

// ---------------------------------------------------------------------------
// Route-table integration tests.
//
// The real <App /> route table, the real page components and the real data
// hooks (useDashboard / useBroadcasts / useUsers / ...) are all left intact so
// the guards + layout are genuinely exercised. Only two layers are stubbed:
//   1. useAuth  -> lets us drive authenticated / anonymous / loading states.
//   2. the network service modules -> keeps every mount-time fetch offline.
// ---------------------------------------------------------------------------

import { broadcastService } from '../services/broadcastService';
import { dashboardService } from '../services/dashboardService';
import { buddyService } from '../services/buddyService';
import { usersService } from '../services/usersService';
import { scheduleService } from '../services/scheduleService';
import { assignmentService } from '../services/assignmentService';
import { documentsService } from '../services/documentsService';
import { profileService } from '../services/profileService';
import { settingsService } from '../services/settingsService';

const authMock = vi.hoisted(() => ({
  state: {
    user: null,
    isAuthenticated: false,
    loading: false,
    sessionTimeoutNotice: false,
    logout: vi.fn(),
  },
}));

vi.mock('../hooks/useAuth', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => authMock.state,
}));

vi.mock('../services/broadcastService', () => ({
  broadcastService: { getBroadcasts: vi.fn(), createBroadcast: vi.fn() },
}));

vi.mock('../services/dashboardService', () => ({
  dashboardService: { getSummary: vi.fn() },
}));

vi.mock('../services/buddyService', () => ({
  buddyService: {
    getBuddySetting: vi.fn(),
    updateBuddySetting: vi.fn(),
    getExamStatus: vi.fn(),
    getExamRules: vi.fn(),
    createExamRule: vi.fn(),
    deleteExamRule: vi.fn(),
  },
}));

vi.mock('../services/usersService', () => ({
  usersService: {
    getUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    getUserById: vi.fn(),
    resetPassword: vi.fn(),
    bulkImportMasterData: vi.fn(),
    bulkUploadUsers: vi.fn(),
    getCohorts: vi.fn(),
    getBatches: vi.fn(),
    getSubBatches: vi.fn(),
    getStreams: vi.fn(),
    getSubjects: vi.fn(),
    getLabs: vi.fn(),
  },
}));

vi.mock('../services/scheduleService', () => ({
  scheduleService: {
    getSchedules: vi.fn(),
    getScheduleById: vi.fn(),
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
    activateSchedule: vi.fn(),
    parseExcelSchedule: vi.fn(),
    getLiveTimetable: vi.fn(),
    getCurrentSeating: vi.fn(),
  },
}));

vi.mock('../services/assignmentService', () => ({
  assignmentService: {
    getAssignments: vi.fn(),
    createAssignment: vi.fn(),
    updateAssignment: vi.fn(),
    updateAssignmentDeadline: vi.fn(),
    deleteAssignment: vi.fn(),
  },
}));

vi.mock('../services/documentsService', () => ({
  documentsService: {
    getDocuments: vi.fn(),
    uploadDocument: vi.fn(),
    getKnowledgeBaseStats: vi.fn(),
    deleteDocument: vi.fn(),
    getDocumentDetails: vi.fn(),
    getDocumentBlobUrl: vi.fn(),
  },
  formatFileSize: (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  },
}));

vi.mock('../services/profileService', () => ({
  profileService: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  },
}));

vi.mock('../services/settingsService', () => ({
  settingsService: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    getRolesPermissions: vi.fn(),
    updateRolesPermissions: vi.fn(),
    exportUsersCSV: vi.fn(),
    exportAuditSummary: vi.fn(),
  },
}));

const adminUser = {
  id: 1,
  full_name: 'Admin User',
  first_name: 'Admin',
  last_name: 'User',
  username: 'admin',
  email: 'admin@campus.demo',
  role: 'ADMIN',
  is_superuser: false,
  access: 'access-token',
};

const setAnonymous = () => {
  authMock.state.user = null;
  authMock.state.isAuthenticated = false;
  authMock.state.loading = false;
};

const setAuthenticated = () => {
  authMock.state.user = { ...adminUser };
  authMock.state.isAuthenticated = true;
  authMock.state.loading = false;
};

const renderApp = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setAnonymous();

  // Deterministic offline defaults for every mount-time fetch.
  broadcastService.getBroadcasts.mockResolvedValue([]);
  broadcastService.createBroadcast.mockResolvedValue({});

  dashboardService.getSummary.mockResolvedValue({
    broadcast_count: 0,
    scheduled_count: 0,
    upcoming_count: 0,
    buddy_enabled: true,
    total_users: 0,
    total_trainees: 0,
    total_cohorts: 0,
    total_batches: 0,
    total_sub_batches: 0,
  });

  buddyService.getBuddySetting.mockResolvedValue({ enabled: true, exam_mode: false });
  buddyService.updateBuddySetting.mockResolvedValue({ enabled: true });
  buddyService.getExamRules.mockResolvedValue([]);

  usersService.getUsers.mockResolvedValue([]);
  usersService.getCohorts.mockResolvedValue([]);
  usersService.getBatches.mockResolvedValue([]);
  usersService.getSubBatches.mockResolvedValue([]);
  usersService.getStreams.mockResolvedValue([]);
  usersService.getSubjects.mockResolvedValue([]);
  usersService.getLabs.mockResolvedValue([]);

  scheduleService.getSchedules.mockResolvedValue([]);

  assignmentService.getAssignments.mockResolvedValue([]);

  documentsService.getDocuments.mockResolvedValue([]);
  documentsService.getKnowledgeBaseStats.mockResolvedValue({});

  profileService.getProfile.mockResolvedValue(null);
  settingsService.getPreferences.mockResolvedValue(null);
  settingsService.getRolesPermissions.mockResolvedValue(null);
});

describe('App route table & access guards', () => {
  it('renders the login page for anonymous visitors at /login', () => {
    renderApp('/login');

    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('redirects anonymous visitors from a protected route to /login', () => {
    renderApp('/dashboard');

    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.queryByText('At a glance')).not.toBeInTheDocument();
  });

  it('redirects anonymous visitors from an unknown path to /login', () => {
    renderApp('/totally/unknown/path');

    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.queryByText('404 ERROR')).not.toBeInTheDocument();
  });

  it('renders the dashboard for an authenticated user at /dashboard', async () => {
    setAuthenticated();
    renderApp('/dashboard');

    expect(await screen.findByText('At a glance')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Admin User');
    expect(screen.getByRole('button', { name: /new broadcast/i })).toBeInTheDocument();
  });

  it('blocks a role from a directly opened page when its module permission is disabled', async () => {
    authMock.state.user = { ...adminUser, role: 'TA', is_superuser: false };
    authMock.state.isAuthenticated = true;
    authMock.state.loading = false;
    settingsService.getRolesPermissions.mockResolvedValue({
      roles: {
        TA: {
          permissions: { dashboard: true, schedule: false },
        },
      },
    });

    renderApp('/schedule');

    expect(await screen.findByRole('heading', { name: 'Access restricted' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Schedule & Timetable Management' })).not.toBeInTheDocument();
  });

  it('redirects an authenticated user away from /login to the dashboard', async () => {
    setAuthenticated();
    renderApp('/login');

    expect(await screen.findByText('At a glance')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to continue')).not.toBeInTheDocument();
  });

  it('redirects the root path / to /dashboard when authenticated', async () => {
    setAuthenticated();
    renderApp('/');

    expect(await screen.findByText('At a glance')).toBeInTheDocument();
  });

  it('renders the NotFound page for an unknown path when authenticated', async () => {
    setAuthenticated();
    renderApp('/no-such-page');

    expect(await screen.findByText('404 ERROR')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
  });

  it('shows the session-loading spinner instead of any page while loading', () => {
    authMock.state.loading = true;
    authMock.state.isAuthenticated = false;

    const { container } = renderApp('/dashboard');

    expect(container.querySelector('.btn-spinner')).not.toBeNull();
    expect(screen.queryByText('Sign in to continue')).not.toBeInTheDocument();
    expect(screen.queryByText('At a glance')).not.toBeInTheDocument();
  });

  it.each([
    ['/broadcast', 'Broadcast centre'],
    ['/schedule', 'Schedule & Timetable Management'],
    ['/assignments', 'Assignments'],
    ['/buddy', 'Buddy Control Center'],
    ['/users', 'Manage Users'],
    ['/documents', 'Add Documents'],
    ['/profile', 'My Profile'],
    ['/roles-permissions', 'Roles & Permissions'],
    ['/settings', 'System Preferences'],
  ])('renders the %s page for an authenticated admin', async (path, heading) => {
    setAuthenticated();
    renderApp(path);

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });
});
