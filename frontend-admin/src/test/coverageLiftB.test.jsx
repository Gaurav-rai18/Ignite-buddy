import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { authService } from '../services/authService';
import { apiClient } from '../services/apiClient';
import { buddyService } from '../services/buddyService';
import { usersService } from '../services/usersService';
import { BuddyDetails } from '../components/buddy/BuddyDetails';
import { ProfileDropdown } from '../components/layout/ProfileDropdown';

// BuddyDetails mounts hierarchy data + exam rules. Stub those services so the
// component behaviour (handlers / branches) is what is under test.
vi.mock('../services/buddyService', () => ({
  buddyService: {
    getExamRules: vi.fn().mockResolvedValue([]),
    createExamRule: vi.fn().mockResolvedValue({}),
    deleteExamRule: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../services/usersService', () => ({
  usersService: {
    getCohorts: vi.fn().mockResolvedValue([]),
    getBatches: vi.fn().mockResolvedValue([]),
    getSubBatches: vi.fn().mockResolvedValue([]),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Re-arm service mocks because afterEach restoreAllMocks resets their impls.
  buddyService.getExamRules.mockResolvedValue([]);
  buddyService.createExamRule.mockResolvedValue({});
  buddyService.deleteExamRule.mockResolvedValue({});
  usersService.getCohorts.mockResolvedValue([]);
  usersService.getBatches.mockResolvedValue([]);
  usersService.getSubBatches.mockResolvedValue([]);
  authService.clearSession();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* 1. authService.js                                                   */
/* ------------------------------------------------------------------ */

describe('authService :: remaining branches', () => {
  const base = {
    id: 1,
    email: 'admin@campus.demo',
    username: 'admin',
    first_name: 'Admin',
    last_name: 'User',
    full_name: 'Admin User',
    role: 'ADMIN',
    access: 'access-token',
    refresh: 'refresh-token',
  };

  it('accepts every role in ALLOWED_ADMIN_ROLES', async () => {
    const post = vi.spyOn(apiClient, 'post');
    for (const role of ['ADMIN', 'MANAGER', 'TA', 'HR']) {
      post.mockResolvedValue({ data: { ...base, role } });
      const user = await authService.login({ email: 'x@y.com', password: 'pass1' });
      expect(user.role).toBe(role);
      expect(authService.isAuthenticated()).toBe(true);
      authService.clearSession();
    }
  });

  it('rejects an empty or unknown role and never sets a session', async () => {
    const post = vi.spyOn(apiClient, 'post');
    post.mockResolvedValue({ data: { ...base, role: '' } });
    await expect(authService.login({ email: 'x@y.com', password: 'pass1' })).rejects.toThrow(
      'Access denied'
    );
    expect(authService.isAuthenticated()).toBe(false);

    post.mockResolvedValue({ data: { id: 2, email: 'x@y.com', role: 'CONTRACTOR', access: 'a' } });
    await expect(authService.login({ email: 'x@y.com', password: 'pass1' })).rejects.toThrow(
      'Access denied'
    );
  });

  it('validates email/password before hitting the API', async () => {
    const post = vi.spyOn(apiClient, 'post');
    await expect(authService.login({ email: '', password: 'pass1' })).rejects.toThrow(
      'Please enter a valid email address.'
    );
    await expect(authService.login({ email: 'bad-email', password: 'pass1' })).rejects.toThrow(
      'Please enter a valid email address.'
    );
    await expect(authService.login({ email: 'a@b.com', password: '12' })).rejects.toThrow(
      'Email or password is incorrect.'
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('trims the email and applies field defaults + composite name', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        id: 3,
        email: 'dee@x.com',
        username: 'duser',
        first_name: ' Dee ',
        last_name: ' Vee ',
        role: 'TA',
        access: 't',
        refresh: 'r',
      },
    });

    const user = await authService.login({ email: '  dee@x.com  ', password: 'pass1' });

    expect(post).toHaveBeenCalledWith('/accounts/login/', {
      email: 'dee@x.com',
      password: 'pass1',
    });
    expect(user.first_name).toBe('Dee');
    expect(user.last_name).toBe('Vee');
    expect(user.full_name).toBe('Dee Vee');
    expect(user.department).toBe('TCS Ignite Training');
    expect(user.designation).toBe('Administrator');
    expect(user.full_batch_name).toBe('Unassigned');
    expect(user.is_active).toBe(true);
    expect(user.is_superuser).toBe(false);
    expect(user.profile_picture).toBe('');
    expect(user.accops_id).toBe('');
  });

  it('falls back from full_name to username then email', async () => {
    const post = vi.spyOn(apiClient, 'post');

    post.mockResolvedValue({
      data: { id: 4, email: 'e@x.com', username: 'euser', role: 'HR', full_name: 'Full Name', access: 'a' },
    });
    expect((await authService.login({ email: 'e@x.com', password: 'pass1' })).full_name).toBe('Full Name');
    authService.clearSession();

    post.mockResolvedValue({
      data: { id: 5, email: 'only@x.com', username: 'onlyuser', role: 'HR', access: 'a' },
    });
    expect((await authService.login({ email: 'only@x.com', password: 'pass1' })).full_name).toBe('onlyuser');
    authService.clearSession();

    post.mockResolvedValue({ data: { id: 6, email: 'mailonly@x.com', role: 'HR', access: 'a' } });
    expect((await authService.login({ email: 'mailonly@x.com', password: 'pass1' })).full_name).toBe(
      'mailonly@x.com'
    );
  });

  it('notifies subscribers (isolating throwing listeners) and returns an unsubscribe', async () => {
    const seen = [];
    const good = (u) => seen.push(u);
    const bad = () => {
      throw new Error('listener boom');
    };
    const unsubGood = authService.subscribe(good);
    const unsubBad = authService.subscribe(bad);

    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { ...base, role: 'MANAGER' } });
    await authService.login({ email: 'm@x.com', password: 'pass1' });

    expect(seen).toHaveLength(1);
    expect(seen[0].role).toBe('MANAGER');

    authService.clearSession();
    expect(seen[seen.length - 1]).toBeNull();

    unsubGood();
    unsubBad();
    authService.clearSession();
    expect(seen[seen.length - 1]).toBeNull();
  });

  it('updateCurrentUser is a no-op when logged out and reshapes full_name', async () => {
    expect(authService.updateCurrentUser({ first_name: 'X' })).toBeNull();

    vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        id: 7,
        email: 'noname@x.com',
        username: '',
        first_name: '',
        last_name: '',
        full_name: '',
        role: 'TA',
        access: 'a',
      },
    });
    await authService.login({ email: 'noname@x.com', password: 'pass1' });

    // falls through to email when names/username are empty
    expect(authService.updateCurrentUser({}).full_name).toBe('noname@x.com');
    // patch.username branch
    expect(authService.updateCurrentUser({ username: 'uname' }).full_name).toBe('uname');
    // explicit full_name wins
    expect(authService.updateCurrentUser({ full_name: 'Chosen Name' }).full_name).toBe('Chosen Name');
  });

  it('fetchCurrentUser returns null without a session, syncs on success and swallows errors', async () => {
    expect(await authService.fetchCurrentUser()).toBeNull();

    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { ...base } });
    await authService.login({ email: 'a@b.com', password: 'pass1' });

    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { first_name: 'Synced' } });
    const synced = await authService.fetchCurrentUser();
    expect(get).toHaveBeenCalledWith('/accounts/me/');
    expect(synced.first_name).toBe('Synced');

    get.mockRejectedValue(new Error('network down'));
    const fallback = await authService.fetchCurrentUser();
    expect(fallback.first_name).toBe('Synced');
  });

  it('logout is a no-op without a session', async () => {
    const post = vi.spyOn(apiClient, 'post');
    await authService.logout();
    expect(post).not.toHaveBeenCalled();
  });

  it('logout still clears the session when the server call fails', async () => {
    const post = vi.spyOn(apiClient, 'post');
    post.mockResolvedValueOnce({ data: { ...base } });
    await authService.login({ email: 'a@b.com', password: 'pass1' });
    expect(authService.isAuthenticated()).toBe(true);

    post.mockRejectedValueOnce(new Error('server down'));
    await expect(authService.logout()).resolves.toBeUndefined();
    expect(authService.isAuthenticated()).toBe(false);
  });

  it('wires the in-memory token getter and 401 handler into the apiClient interceptors', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { ...base, access: 'acc-token' } });
    await authService.login({ email: 'a@b.com', password: 'pass1' });

    const originalAdapter = apiClient.defaults.adapter;
    try {
      // token getter branch: request interceptor should attach the bearer token
      let captured;
      apiClient.defaults.adapter = async (config) => {
        captured = config;
        return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
      };
      await apiClient.get('/accounts/me/');
      const authHeader =
        captured.headers?.Authorization || captured.headers?.get?.('Authorization');
      expect(authHeader).toBe('Bearer acc-token');

      // 401 branch: response interceptor should auto-clear the session
      apiClient.defaults.adapter = async (config) => {
        const err = new Error('Unauthorized');
        err.response = { status: 401, data: { detail: 'nope' } };
        err.config = config;
        throw err;
      };
      await expect(apiClient.get('/accounts/me/')).rejects.toThrow();
      expect(authService.isAuthenticated()).toBe(false);
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it('exposes the active access token and auth flag', async () => {
    expect(authService.getAccessToken()).toBeNull();
    expect(authService.isAuthenticated()).toBe(false);

    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { ...base } });
    await authService.login({ email: 'a@b.com', password: 'pass1' });
    expect(authService.getAccessToken()).toBe('access-token');
    expect(authService.getCurrentUser().email).toBe('admin@campus.demo');
  });
});

/* ------------------------------------------------------------------ */
/* 2. BuddyDetails.jsx                                                 */
/* ------------------------------------------------------------------ */

const baseSettings = {
  enabled: true,
  exam_mode: false,
  exam_reason: '',
  test_auto_lock_enabled: true,
  test_buffer_before_minutes: 15,
  test_buffer_after_minutes: 15,
  llm_system_prompt: 'Old prompt',
};

function renderBuddy(overrides = {}, props = {}) {
  const onUpdateSetting = vi.fn((key, value, cb) => {
    if (typeof cb === 'function') cb();
  });
  const onNotify = vi.fn();
  const onToggleBuddy = vi.fn();
  const onSaveBatch = vi.fn();
  const utils = render(
    <BuddyDetails
      settings={{ ...baseSettings, ...overrides }}
      isUpdating={false}
      onToggleBuddy={onToggleBuddy}
      onUpdateSetting={onUpdateSetting}
      onSaveBatch={onSaveBatch}
      onNotify={onNotify}
      {...props}
    />
  );
  return { ...utils, onUpdateSetting, onNotify, onToggleBuddy, onSaveBatch };
}

describe('BuddyDetails :: handlers & branches', () => {
  it('toggles exam mode, shows the banner and saves the blackout reason', async () => {
    const user = userEvent.setup();
    const { onUpdateSetting, onNotify } = renderBuddy();

    await user.click(screen.getByRole('switch', { name: /toggle exam mode/i }));
    expect(onUpdateSetting).toHaveBeenCalledWith('exam_mode', true, expect.any(Function));
    expect(onNotify).toHaveBeenCalledWith('exam mode updated');

    const reason = await screen.findByLabelText(/blackout reason shown to trainees/i);
    await user.clear(reason);
    await user.type(reason, 'Maintenance window');
    await user.click(screen.getByRole('button', { name: 'Update' }));

    expect(onUpdateSetting).toHaveBeenCalledWith('exam_reason', 'Maintenance window', expect.any(Function));
    expect(onNotify).toHaveBeenCalledWith('Exam blackout notice updated');
  });

  it('saves an unchanged exam reason even when it is empty', async () => {
    const user = userEvent.setup();
    const { onUpdateSetting, onNotify } = renderBuddy({ exam_mode: true, exam_reason: '' });

    await user.click(screen.getByRole('button', { name: 'Update' }));
    expect(onUpdateSetting).toHaveBeenCalledWith('exam_reason', '', expect.any(Function));
    expect(onNotify).toHaveBeenCalledWith('Exam blackout notice updated');
  });

  it('toggles the auto test lock switch off', async () => {
    const user = userEvent.setup();
    const { onUpdateSetting, onNotify } = renderBuddy();

    await user.click(screen.getByRole('switch', { name: /toggle auto test lock/i }));
    expect(onUpdateSetting).toHaveBeenCalledWith('test_auto_lock_enabled', false, expect.any(Function));
    expect(onNotify).toHaveBeenCalledWith('test auto lock enabled updated');
  });

  it('saves the test buffer timings with nested updates', async () => {
    const user = userEvent.setup();
    const { onUpdateSetting, onNotify } = renderBuddy();

    const [before] = screen.getAllByRole('spinbutton');
    await user.clear(before);
    await user.type(before, '20');

    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toBeEnabled();
    await user.click(saveBtn);

    expect(onUpdateSetting).toHaveBeenCalledWith('test_buffer_before_minutes', 20, expect.any(Function));
    expect(onUpdateSetting).toHaveBeenCalledWith('test_buffer_after_minutes', 15, expect.any(Function));
    expect(onNotify).toHaveBeenCalledWith('Test lockout buffer timings saved');
  });

  it('falls back to 15 minutes when a buffer input is emptied', async () => {
    const user = userEvent.setup();
    const { onUpdateSetting } = renderBuddy();

    const [before] = screen.getAllByRole('spinbutton');
    await user.clear(before);
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onUpdateSetting).toHaveBeenCalledWith('test_buffer_before_minutes', 15, expect.any(Function));
  });

  it('saves the LLM system prompt directive', async () => {
    const user = userEvent.setup();
    const { onUpdateSetting, onNotify } = renderBuddy();

    const ta = screen.getByPlaceholderText(/system prompt instructions/i);
    await user.clear(ta);
    await user.type(ta, 'New directive');

    const saveBtn = screen.getByRole('button', { name: /save directive/i });
    expect(saveBtn).toBeEnabled();
    await user.click(saveBtn);

    expect(onUpdateSetting).toHaveBeenCalledWith('llm_system_prompt', 'New directive', expect.any(Function));
    expect(onNotify).toHaveBeenCalledWith('Campus system directive saved successfully');
  });

  it('disables every control while an update is in flight', () => {
    renderBuddy({ exam_mode: true }, { isUpdating: true });

    expect(screen.getByRole('switch', { name: /toggle buddy availability/i })).toBeDisabled();
    expect(screen.getByRole('switch', { name: /toggle exam mode/i })).toBeDisabled();
    expect(screen.getByRole('switch', { name: /toggle auto test lock/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save directive/i })).toBeDisabled();
  });

  it('creates a trainee-scoped rule using an email target', async () => {
    const user = userEvent.setup();
    const { onNotify } = renderBuddy();

    await user.click(screen.getByRole('button', { name: /create rule \/ override/i }));
    const combos = screen.getAllByRole('combobox');
    await user.selectOptions(combos[1], 'TRAINEE');
    await user.type(screen.getByPlaceholderText(/trainee@tcs.com/i), 'trainee@tcs.com');
    await user.click(screen.getByRole('button', { name: /activate policy/i }));

    await waitFor(() => expect(buddyService.createExamRule).toHaveBeenCalledTimes(1));
    expect(buddyService.createExamRule).toHaveBeenCalledWith({
      action: 'BLOCK',
      scope: 'TRAINEE',
      reason: 'Assessment in progress',
      duration_minutes: 60,
      email: 'trainee@tcs.com',
    });
    expect(onNotify).toHaveBeenCalledWith('Created BLOCK policy for TRAINEE');
  });

  it('creates a trainee-scoped rule using an employee-id target', async () => {
    const user = userEvent.setup();
    renderBuddy();

    await user.click(screen.getByRole('button', { name: /create rule \/ override/i }));
    const combos = screen.getAllByRole('combobox');
    await user.selectOptions(combos[1], 'TRAINEE');
    await user.type(screen.getByPlaceholderText(/trainee@tcs.com/i), '1234567');
    await user.click(screen.getByRole('button', { name: /activate policy/i }));

    await waitFor(() => expect(buddyService.createExamRule).toHaveBeenCalledTimes(1));
    expect(buddyService.createExamRule).toHaveBeenCalledWith({
      action: 'BLOCK',
      scope: 'TRAINEE',
      reason: 'Assessment in progress',
      duration_minutes: 60,
      employee_id: '1234567',
    });
  });

  it('creates a non-trainee rule using the selected hierarchy target id', async () => {
    usersService.getCohorts.mockResolvedValue([{ id: 5, code: 'B50' }]);
    const user = userEvent.setup();
    renderBuddy();

    await user.click(screen.getByRole('button', { name: /create rule \/ override/i }));
    const scopeSelect = screen.getAllByRole('combobox')[1];
    await user.selectOptions(scopeSelect, 'COHORT');

    const cohortSelect = screen.getAllByRole('combobox')[2];
    await user.selectOptions(cohortSelect, '5');
    await user.click(screen.getByRole('button', { name: /activate policy/i }));

    await waitFor(() => expect(buddyService.createExamRule).toHaveBeenCalledTimes(1));
    expect(buddyService.createExamRule).toHaveBeenCalledWith({
      action: 'BLOCK',
      scope: 'COHORT',
      reason: 'Assessment in progress',
      duration_minutes: 60,
      target_id: '5',
    });
  });

  it('reports a failure when rule creation throws', async () => {
    buddyService.createExamRule.mockRejectedValue(new Error('server boom'));
    const user = userEvent.setup();
    const { onNotify } = renderBuddy();

    await user.click(screen.getByRole('button', { name: /create rule \/ override/i }));
    const combos = screen.getAllByRole('combobox');
    await user.selectOptions(combos[1], 'TRAINEE');
    await user.type(screen.getByPlaceholderText(/trainee@tcs.com/i), 'trainee@tcs.com');
    await user.click(screen.getByRole('button', { name: /activate policy/i }));

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith('Failed to create rule: server boom')
    );
  });

  it('renders the appropriate target selector for each scope', async () => {
    usersService.getSubBatches.mockResolvedValue([{ id: 1, full_code: 'A1' }]);
    usersService.getBatches.mockResolvedValue([{ id: 2, name: 'Batch B' }]);
    usersService.getCohorts.mockResolvedValue([{ id: 3, code: 'B50' }]);
    const user = userEvent.setup();
    renderBuddy();

    await user.click(screen.getByRole('button', { name: /create rule \/ override/i }));
    const scope = () => screen.getAllByRole('combobox')[1];

    await user.selectOptions(scope(), 'SUB_BATCH');
    expect(await screen.findByText('A1')).toBeInTheDocument();

    await user.selectOptions(scope(), 'BATCH');
    expect(await screen.findByText('Batch B')).toBeInTheDocument();

    await user.selectOptions(scope(), 'COHORT');
    expect(await screen.findByText('Cohort B50')).toBeInTheDocument();

    await user.selectOptions(scope(), 'TRAINEE');
    expect(await screen.findByPlaceholderText(/trainee@tcs.com/i)).toBeInTheDocument();
  });

  it('closes the create-rule modal via Cancel', async () => {
    const user = userEvent.setup();
    renderBuddy();

    await user.click(screen.getByRole('button', { name: /create rule \/ override/i }));
    expect(screen.getByRole('button', { name: /activate policy/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('button', { name: /activate policy/i })).not.toBeInTheDocument();
  });

  it('lists existing rules and revokes one', async () => {
    buddyService.getExamRules.mockResolvedValue([
      {
        id: 9,
        action: 'BLOCK',
        scope: 'BATCH',
        target_label: 'Batch A',
        reason: 'IO Exit Exam',
        valid_until: new Date().toISOString(),
        created_by: 'Admin User',
      },
      {
        id: 10,
        action: 'OVERRIDE_ALLOW',
        scope: 'TRAINEE',
        target_label: '1234567',
        reason: 'Retest',
        valid_until: new Date().toISOString(),
        created_by: 'Admin User',
      },
    ]);
    const user = userEvent.setup();
    const { onNotify } = renderBuddy();

    expect(await screen.findByText('Batch A')).toBeInTheDocument();
    expect(screen.getByText('Override Allow')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /revoke/i })[0]);
    await waitFor(() => expect(buddyService.deleteExamRule).toHaveBeenCalledWith(9));
    expect(onNotify).toHaveBeenCalledWith('Rule revoked successfully.');
  });
});

/* ------------------------------------------------------------------ */
/* 3. ProfileDropdown.jsx                                              */
/* ------------------------------------------------------------------ */

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderDropdown(user, props = {}) {
  const onClose = vi.fn();
  const onSignOut = vi.fn();
  const utils = render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <ProfileDropdown isOpen onClose={onClose} onSignOut={onSignOut} user={user} {...props} />
      <LocationDisplay />
    </MemoryRouter>
  );
  return { ...utils, onClose, onSignOut };
}

describe('ProfileDropdown :: menu actions & role labels', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <MemoryRouter>
        <ProfileDropdown
          isOpen={false}
          onClose={vi.fn()}
          onSignOut={vi.fn()}
          user={{ full_name: 'Admin User', email: 'a@b.c', role: 'ADMIN' }}
        />
      </MemoryRouter>
    );
    expect(container.querySelector('.profile-dropdown')).toBeNull();
  });

  it('navigates to each menu destination and closes the menu', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDropdown({ full_name: 'Admin User', email: 'a@b.c', role: 'ADMIN' });

    await user.click(screen.getByRole('menuitem', { name: /my profile/i }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/profile');

    await user.click(screen.getByRole('menuitem', { name: /roles & permissions/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/roles-permissions');

    await user.click(screen.getByRole('menuitem', { name: /system preferences/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/settings');
  });

  it.each([
    ['ADMIN', 'Ignite Administrator'],
    ['TA', 'Faculty / TA'],
    ['MANAGER', 'Ignite Manager'],
    ['HR', 'Human Resources'],
    ['TRAINEE', 'Student Trainee'],
    ['CONTRACTOR', 'CONTRACTOR'],
  ])('maps role %s to the "%s" label', (role, label) => {
    renderDropdown({ full_name: 'Some User', email: 'u@x.com', role });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('uses the default "Member" label when no role is supplied', () => {
    renderDropdown({ full_name: 'No Role', email: 'n@x.com' });
    expect(screen.getByText('Member')).toBeInTheDocument();
  });

  it('labels a superuser as Workspace Owner and grants role management', () => {
    renderDropdown({ full_name: 'Owner', email: 'o@x.com', role: 'TA', is_superuser: true });
    expect(screen.getByText('Workspace Owner')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /roles & permissions/i })).toBeInTheDocument();
  });

  it('hides Roles & Permissions for non-admin users', () => {
    renderDropdown({ full_name: 'Faculty', email: 'f@x.com', role: 'TA' });
    expect(screen.queryByRole('menuitem', { name: /roles & permissions/i })).not.toBeInTheDocument();
  });

  it('renders the avatar initials when no profile picture is set', () => {
    renderDropdown({ email: 'zoe@x.com', role: 'ADMIN' });
    expect(screen.getByText('Zoe')).toBeInTheDocument();
    expect(screen.getByText('ZO')).toBeInTheDocument();
  });

  it('renders the profile picture when provided', () => {
    renderDropdown({
      full_name: 'Pic User',
      email: 'p@x.com',
      role: 'ADMIN',
      profile_picture: 'https://img.example/x.png',
    });
    expect(screen.getByAltText('Pic User')).toHaveAttribute('src', 'https://img.example/x.png');
  });

  it('signs out and closes the menu', async () => {
    const user = userEvent.setup();
    const { onClose, onSignOut } = renderDropdown({ full_name: 'Admin User', email: 'a@b.c', role: 'ADMIN' });

    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('still closes when no sign-out handler is supplied', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDropdown(
      { full_name: 'Admin User', email: 'a@b.c', role: 'ADMIN' },
      { onSignOut: undefined }
    );

    await user.click(screen.getByRole('menuitem', { name: /sign out/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on an outside click and on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDropdown({ full_name: 'Admin User', email: 'a@b.c', role: 'ADMIN' });

    await user.click(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
