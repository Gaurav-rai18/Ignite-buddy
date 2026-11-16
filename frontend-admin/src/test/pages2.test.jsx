import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { ManageUsers } from '../pages/ManageUsers/ManageUsers';
import { Profile } from '../pages/Profile/Profile';
import { Settings } from '../pages/Settings/Settings';
import { RolesPermissions } from '../pages/RolesPermissions/RolesPermissions';
import { AddDocuments } from '../pages/AddDocuments/AddDocuments';

import { usersService } from '../services/usersService';
import { profileService } from '../services/profileService';
import { authService } from '../services/authService';
import { settingsService } from '../services/settingsService';
import { documentsService } from '../services/documentsService';
import { useAuth } from '../hooks/useAuth';

// ---------------------------------------------------------------------------
// Data-layer mocks: the pages + their custom hooks (useUsers / useDocuments)
// run for real, only the network services are stubbed so behaviour (filters,
// pagination, validation, payload shaping) is what is actually under test.
// ---------------------------------------------------------------------------
vi.mock('../services/usersService', () => ({
  usersService: {
    getUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    getSubBatches: vi.fn(),
    getStreams: vi.fn(),
    getCohorts: vi.fn(),
    getBatches: vi.fn(),
    bulkImportMasterData: vi.fn(),
  },
}));

vi.mock('../services/profileService', () => ({
  profileService: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  },
}));

vi.mock('../services/authService', () => ({
  authService: {
    updateCurrentUser: vi.fn(),
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

vi.mock('../services/documentsService', () => ({
  documentsService: {
    getDocuments: vi.fn(),
    getKnowledgeBaseStats: vi.fn(),
    uploadDocument: vi.fn(),
    deleteDocument: vi.fn(),
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

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseUsers = () => [
  { id: 1, username: 'admin1', email: 'admin1@tcs.com', role: 'ADMIN', employee_id: '1000001', is_active: true, full_batch_name: 'B50' },
  { id: 2, username: 'ta1', email: 'ta1@tcs.com', role: 'TA', employee_id: '1000002', is_active: true, full_batch_name: 'B50 / A1' },
  { id: 3, username: 'trainee1', email: 'trainee1@tcs.com', role: 'TRAINEE', employee_id: '1000003', is_active: false },
  { id: 4, username: 'hr1', email: 'hr1@tcs.com', role: 'HR', employee_id: '1000004', is_active: true },
  { id: 5, username: 'manager1', email: 'manager1@tcs.com', role: 'MANAGER', employee_id: '1000005', is_active: true },
];

const profileUser = {
  id: 42,
  username: 'gaurav',
  first_name: 'Gaurav',
  last_name: 'Rai',
  full_name: 'Gaurav Rai',
  email: 'gaurav@tcs.com',
  role: 'ADMIN',
  is_superuser: false,
  employee_id: 'TCS123',
  department: 'TCS Ignite Training',
  designation: 'Administrator',
  is_active: true,
  date_joined: '2026-01-15T00:00:00Z',
  full_batch_name: 'B50',
  last_login: '2026-02-01T10:00:00Z',
};

const adminUser = {
  id: 1,
  role: 'ADMIN',
  is_superuser: true,
  email: 'admin@tcs.com',
  full_name: 'Admin User',
};

const rolesFixture = () => ({
  ADMIN: {
    label: 'Administrator',
    description: 'Full workspace access',
    is_immutable: true,
    permissions: {
      dashboard: true, broadcast: true, schedule: true, buddy: true, users: true,
      documents: true, hierarchy: true, roles_permissions: true, system_preferences: true,
    },
  },
  TA: {
    label: 'Faculty / TA',
    description: 'Teaching assistants',
    is_immutable: false,
    permissions: {
      dashboard: true, broadcast: false, schedule: true, buddy: false, users: false,
      documents: false, hierarchy: false, roles_permissions: false, system_preferences: false,
    },
  },
});

const rolesResponse = () => ({
  roles: rolesFixture(),
  user_counts: { ADMIN: 2, TA: 5 },
  can_manage: true,
});

const docsFixture = () => [
  { id: 1, name: 'Java Guide', fileName: 'java.pdf', fileType: 'PDF', sizeFormatted: '1.2 MB', status: 'Ready', space: 'general', chunks: 12, description: 'Core Java handbook', audience: 'All students', uploadedAt: '2026-01-01', content: 'java content' },
  { id: 2, name: 'Ignite Syllabus', fileName: 'syllabus.pdf', fileType: 'PDF', sizeFormatted: '2.0 MB', status: 'Ready', space: 'ignite', chunks: 30, description: 'Ignite syllabus', audience: 'All students', uploadedAt: '2026-01-02', content: 'ignite content' },
  { id: 3, name: 'Draft Notes', fileName: 'notes.txt', fileType: 'TXT', sizeFormatted: '0.1 MB', status: 'Processing', space: 'general', chunks: 0, description: 'draft', audience: 'All students', uploadedAt: '2026-01-03', content: '' },
];

const kbStats = () => ({
  vector_backend: 'ChromaDB',
  spaces: { general: { chunks: 12 }, ignite: { chunks: 30 } },
  general_documents: 2,
  ignite_documents: 1,
});

const renderPage = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');

  usersService.getUsers.mockResolvedValue(baseUsers());
  usersService.createUser.mockResolvedValue({ id: 100, username: 'newtrainee', email: 'new@tcs.com', role: 'TRAINEE' });
  usersService.updateUser.mockResolvedValue({ id: 2, username: 'ta1', role: 'TA' });
  usersService.deleteUser.mockResolvedValue({});
  usersService.getSubBatches.mockResolvedValue([]);
  usersService.getStreams.mockResolvedValue([]);
  usersService.getCohorts.mockResolvedValue([]);
  usersService.getBatches.mockResolvedValue([]);
  usersService.bulkImportMasterData.mockResolvedValue({ created_count: 0, updated_count: 0 });

  profileService.getProfile.mockResolvedValue({});
  profileService.updateProfile.mockResolvedValue({ ...profileUser });
  profileService.changePassword.mockResolvedValue({});

  authService.updateCurrentUser.mockReturnValue(profileUser);

  settingsService.getPreferences.mockResolvedValue({ workspace_name: 'Ignite HQ', theme: 'light' });
  settingsService.updatePreferences.mockResolvedValue({ preferences: { workspace_name: 'Ignite HQ' } });
  settingsService.getRolesPermissions.mockResolvedValue(rolesResponse());
  settingsService.updateRolesPermissions.mockResolvedValue({ roles: rolesFixture() });
  settingsService.exportUsersCSV.mockResolvedValue(true);
  settingsService.exportAuditSummary.mockResolvedValue({ users: 5 });

  documentsService.getDocuments.mockResolvedValue(docsFixture());
  documentsService.getKnowledgeBaseStats.mockResolvedValue(kbStats());
  documentsService.uploadDocument.mockResolvedValue({ id: 99, name: 'syllabus', space: 'general' });
  documentsService.deleteDocument.mockResolvedValue({});
  documentsService.getDocumentBlobUrl.mockReturnValue('blob:mock');

  useAuth.mockReturnValue({ user: adminUser });
});

// ===========================================================================
// ManageUsers
// ===========================================================================
describe('ManageUsers page', () => {
  it('renders the user table rows and role filter counts after loading', async () => {
    renderPage(<ManageUsers onNotify={vi.fn()} />);

    expect(await screen.findByText('admin1')).toBeInTheDocument();
    expect(screen.getByText('ta1')).toBeInTheDocument();
    expect(screen.getByText('trainee1')).toBeInTheDocument();
    expect(screen.getByText('hr1')).toBeInTheDocument();

    const allTab = screen.getByRole('tab', { name: /all users/i });
    expect(allTab).toHaveTextContent('5');

    const traineesTab = screen.getByRole('tab', { name: /trainees/i });
    expect(traineesTab).toHaveTextContent('1');
  });

  it('filters rows by the search box', async () => {
    const user = userEvent.setup();
    renderPage(<ManageUsers onNotify={vi.fn()} />);
    await screen.findByText('admin1');

    const search = screen.getByLabelText(/search users by name, email, or role/i);
    await user.type(search, 'trainee1');

    expect(screen.getByText('trainee1')).toBeInTheDocument();
    expect(screen.queryByText('admin1')).not.toBeInTheDocument();
    expect(screen.getByText(/1 user$/)).toBeInTheDocument();
  });

  it('filters rows by role tab', async () => {
    const user = userEvent.setup();
    renderPage(<ManageUsers onNotify={vi.fn()} />);
    await screen.findByText('admin1');

    const adminsTab = screen.getByRole('tab', { name: /admins/i });
    await user.click(adminsTab);

    expect(adminsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('admin1')).toBeInTheDocument();
    expect(screen.queryByText('ta1')).not.toBeInTheDocument();
    expect(screen.queryByText('trainee1')).not.toBeInTheDocument();
  });

  it('paginates the table and navigates to the next page', async () => {
    const user = userEvent.setup();
    const manyUsers = Array.from({ length: 18 }, (_, i) => ({
      id: i + 1,
      username: `user${i + 1}`,
      email: `user${i + 1}@tcs.com`,
      role: 'TRAINEE',
      employee_id: `200000${i}`,
      is_active: true,
    }));
    usersService.getUsers.mockResolvedValue(manyUsers);

    renderPage(<ManageUsers onNotify={vi.fn()} />);
    await screen.findByText('user1');

    // default page size 15 -> page 1 holds user1..user15
    expect(screen.queryByText('user16')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /next page/i }));

    expect(await screen.findByText('user16')).toBeInTheDocument();
    expect(screen.queryByText('user1')).not.toBeInTheDocument();
  });

  it('validates required fields before creating a user', async () => {
    const user = userEvent.setup();
    renderPage(<ManageUsers onNotify={vi.fn()} />);
    await screen.findByText('admin1');

    await user.click(screen.getByRole('button', { name: 'Add User' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Add new user')).toBeInTheDocument();

    // Submit empty -> validation errors, service is never called
    await user.click(within(dialog).getByRole('button', { name: /add user/i }));
    expect(await within(dialog).findByText('Username is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('Email address is required.')).toBeInTheDocument();
    expect(usersService.createUser).not.toHaveBeenCalled();
  });

  it('creates a user with the submitted payload', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    renderPage(<ManageUsers onNotify={onNotify} />);
    await screen.findByText('admin1');

    await user.click(screen.getByRole('button', { name: 'Add User' }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Username'), 'newtrainee');
    await user.type(within(dialog).getByLabelText('Email address'), 'new@tcs.com');
    await user.type(within(dialog).getByLabelText('Password'), 'Password1');
    await user.type(within(dialog).getByLabelText('Employee ID'), '1234567');

    await user.click(within(dialog).getByRole('button', { name: /add user/i }));

    expect(usersService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'newtrainee',
        email: 'new@tcs.com',
        role: 'TRAINEE',
        employee_id: '1234567',
        sub_batch: null,
        stream: null,
        password: 'Password1',
      })
    );
    expect(onNotify).toHaveBeenCalledWith('User newtrainee added successfully');
  });

  it('edits an existing user and submits the updated payload', async () => {
    const user = userEvent.setup();
    renderPage(<ManageUsers onNotify={vi.fn()} />);
    await screen.findByText('ta1');

    await user.click(screen.getByRole('button', { name: 'Edit ta1' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Edit user')).toBeInTheDocument();

    const usernameField = within(dialog).getByLabelText('Username');
    await user.clear(usernameField);
    await user.type(usernameField, 'ta1b');

    await user.click(within(dialog).getByRole('button', { name: /save changes/i }));

    expect(usersService.updateUser).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ username: 'ta1b', role: 'TA' })
    );
  });

  it('confirms deletion and removes the user from the table', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    renderPage(<ManageUsers onNotify={onNotify} />);
    await screen.findByText('ta1');

    await user.click(screen.getByRole('button', { name: 'Delete ta1' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete this user?')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Delete user' }));

    expect(usersService.deleteUser).toHaveBeenCalledWith(2);
    expect(onNotify).toHaveBeenCalledWith('User deleted successfully');
    expect(screen.queryByText('ta1')).not.toBeInTheDocument();
  });

  it('shows an error banner and retries fetching users', async () => {
    const user = userEvent.setup();
    usersService.getUsers
      .mockRejectedValueOnce(new Error('Users service down'))
      .mockResolvedValue(baseUsers());

    renderPage(<ManageUsers onNotify={vi.fn()} />);

    expect(await screen.findByText('Users service down')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByText('admin1')).toBeInTheDocument();
    expect(usersService.getUsers).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// Profile
// ===========================================================================
describe('Profile page', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: profileUser });
  });

  it('renders profile details from the authenticated user', async () => {
    renderPage(<Profile onNotify={vi.fn()} />);

    expect(await screen.findByText('Gaurav Rai')).toBeInTheDocument();
    expect(screen.getByText('Ignite Administrator')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Gaurav')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Rai')).toBeInTheDocument();
    expect(screen.getByDisplayValue('gaurav@tcs.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('TCS Ignite Training')).toBeInTheDocument();
    expect(screen.getByDisplayValue('TCS123')).toBeInTheDocument();
  });

  it('saves profile edits with the correct payload', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    profileService.updateProfile.mockResolvedValue({ ...profileUser, department: 'Ignite Ops' });

    renderPage(<Profile onNotify={onNotify} />);
    await screen.findByText('Gaurav Rai');

    await user.click(screen.getByRole('button', { name: /edit profile/i }));

    const dept = screen.getByLabelText('Department');
    await user.clear(dept);
    await user.type(dept, 'Ignite Ops');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(profileService.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        first_name: 'Gaurav',
        last_name: 'Rai',
        username: 'gaurav',
        email: 'gaurav@tcs.com',
        department: 'Ignite Ops',
        designation: 'Administrator',
      })
    );
    expect(await screen.findByText(/Profile details updated and saved successfully/i)).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith('Profile details saved successfully.');
  });

  it('shows the backend validation error when saving fails', async () => {
    const user = userEvent.setup();
    profileService.updateProfile.mockRejectedValue({ response: { data: { email: ['Email already in use.'] } } });

    renderPage(<Profile onNotify={vi.fn()} />);
    await screen.findByText('Gaurav Rai');

    await user.click(screen.getByRole('button', { name: /edit profile/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Email already in use.')).toBeInTheDocument();
  });

  it('requires the current password before changing password', async () => {
    renderPage(<Profile onNotify={vi.fn()} />);
    await screen.findByText('Gaurav Rai');

    const form = screen.getByLabelText('Current Password').closest('form');
    fireEvent.submit(form);

    expect(await screen.findByText('Please provide your current password.')).toBeInTheDocument();
    expect(profileService.changePassword).not.toHaveBeenCalled();
  });

  it('enforces minimum new-password length', async () => {
    const user = userEvent.setup();
    renderPage(<Profile onNotify={vi.fn()} />);
    await screen.findByText('Gaurav Rai');

    await user.type(screen.getByLabelText('Current Password'), 'oldpass1');
    await user.type(screen.getByLabelText('New Password'), '123');
    await user.type(screen.getByLabelText('Confirm New Password'), '123');

    fireEvent.submit(screen.getByLabelText('Current Password').closest('form'));

    expect(await screen.findByText('New password must contain at least 8 characters.')).toBeInTheDocument();
    expect(profileService.changePassword).not.toHaveBeenCalled();
  });

  it('enforces password confirmation match', async () => {
    const user = userEvent.setup();
    renderPage(<Profile onNotify={vi.fn()} />);
    await screen.findByText('Gaurav Rai');

    await user.type(screen.getByLabelText('Current Password'), 'oldpass1');
    await user.type(screen.getByLabelText('New Password'), 'newpass1');
    await user.type(screen.getByLabelText('Confirm New Password'), 'newpass2');

    fireEvent.submit(screen.getByLabelText('Current Password').closest('form'));

    expect(await screen.findByText('New password and confirmation do not match.')).toBeInTheDocument();
    expect(profileService.changePassword).not.toHaveBeenCalled();
  });

  it('changes the password successfully and notifies', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    renderPage(<Profile onNotify={onNotify} />);
    await screen.findByText('Gaurav Rai');

    await user.type(screen.getByLabelText('Current Password'), 'oldpass1');
    await user.type(screen.getByLabelText('New Password'), 'newpass123');
    await user.type(screen.getByLabelText('Confirm New Password'), 'newpass123');

    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(profileService.changePassword).toHaveBeenCalledWith({
      oldPassword: 'oldpass1',
      newPassword: 'newpass123',
    });
    expect(await screen.findByText('Password changed successfully.')).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith('Account password successfully updated.');
  });

  it('surfaces an error when the password change fails', async () => {
    const user = userEvent.setup();
    profileService.changePassword.mockRejectedValue(new Error('Current password is incorrect.'));

    renderPage(<Profile onNotify={vi.fn()} />);
    await screen.findByText('Gaurav Rai');

    await user.type(screen.getByLabelText('Current Password'), 'wrongpass');
    await user.type(screen.getByLabelText('New Password'), 'newpass123');
    await user.type(screen.getByLabelText('Confirm New Password'), 'newpass123');

    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument();
  });

  it('cancels editing and resets the form', async () => {
    const user = userEvent.setup();
    renderPage(<Profile onNotify={vi.fn()} />);
    await screen.findByText('Gaurav Rai');

    await user.click(screen.getByRole('button', { name: /edit profile/i }));
    const dept = screen.getByLabelText('Department');
    await user.clear(dept);
    await user.type(dept, 'Temporary Dept');

    await user.click(screen.getAllByRole('button', { name: /cancel/i })[0]);

    const first = screen.getByLabelText('First Name');
    expect(first).toBeDisabled();
    expect(screen.getByDisplayValue('TCS Ignite Training')).toBeInTheDocument();
  });
});

// ===========================================================================
// Settings
// ===========================================================================
describe('Settings page', () => {
  it('loads preferences served by the backend', async () => {
    renderPage(<Settings onNotify={vi.fn()} />);

    expect(await screen.findByDisplayValue('Ignite HQ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /general/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /appearance/i })).toBeInTheDocument();
  });

  it('shows an error banner when preferences fail to load', async () => {
    settingsService.getPreferences.mockRejectedValue(new Error('No preferences available'));

    renderPage(<Settings onNotify={vi.fn()} />);

    expect(await screen.findByText('No preferences available')).toBeInTheDocument();
  });

  it('saves preferences with the updated values', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    renderPage(<Settings onNotify={onNotify} />);

    const input = await screen.findByDisplayValue('Ignite HQ');
    await user.clear(input);
    await user.type(input, 'TCS Ignite Central');

    await user.click(screen.getByRole('button', { name: /save preferences/i }));

    expect(settingsService.updatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_name: 'TCS Ignite Central' })
    );
    expect(await screen.findByText(/System preferences saved and persisted successfully/i)).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith('System preferences successfully saved.');
  });

  it('applies the dark theme to the document and persists it', async () => {
    const user = userEvent.setup();
    renderPage(<Settings onNotify={vi.fn()} />);
    await screen.findByDisplayValue('Ignite HQ');

    await user.click(screen.getByRole('button', { name: /appearance/i }));
    await user.click(screen.getByText('Dark Theme'));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('ignite_admin_theme')).toBe('dark');

    await user.click(screen.getByText('Light Theme'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('ignite_admin_theme')).toBe('light');
  });

  it('exports the user CSV roster', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    renderPage(<Settings onNotify={onNotify} />);
    await screen.findByDisplayValue('Ignite HQ');

    await user.click(screen.getByRole('button', { name: /data management/i }));
    await user.click(screen.getByRole('button', { name: /export users csv/i }));

    expect(settingsService.exportUsersCSV).toHaveBeenCalledTimes(1);
    expect(onNotify).toHaveBeenCalledWith('User directory CSV downloaded.');
  });

  it('exports the audit summary JSON', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    window.URL.createObjectURL = vi.fn(() => 'blob:mock');
    window.URL.revokeObjectURL = vi.fn();

    renderPage(<Settings onNotify={onNotify} />);
    await screen.findByDisplayValue('Ignite HQ');

    await user.click(screen.getByRole('button', { name: /data management/i }));
    await user.click(screen.getByRole('button', { name: /export audit json/i }));

    expect(settingsService.exportAuditSummary).toHaveBeenCalledTimes(1);
    expect(onNotify).toHaveBeenCalledWith('System audit JSON downloaded.');
  });

  it('saves notification preference changes', async () => {
    const user = userEvent.setup();
    renderPage(<Settings onNotify={vi.fn()} />);
    await screen.findByDisplayValue('Ignite HQ');

    await user.click(screen.getByRole('button', { name: /notifications/i }));
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();

    await user.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: /save preferences/i }));

    expect(settingsService.updatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ notify_announcements: false })
    );
  });
});

// ===========================================================================
// RolesPermissions
// ===========================================================================
describe('RolesPermissions page', () => {
  it('renders role tabs and module permission rows', async () => {
    renderPage(<RolesPermissions onNotify={vi.fn()} />);

    expect(await screen.findByRole('button', { name: /administrator/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /faculty \/ ta/i })).toBeInTheDocument();
    expect(screen.getByText('Dashboard Overview')).toBeInTheDocument();
    expect(screen.getByText('Broadcast & Announcements')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(9);
  });

  it('disables toggles and hides save for the immutable ADMIN role', async () => {
    renderPage(<RolesPermissions onNotify={vi.fn()} />);
    await screen.findByText('Dashboard Overview');

    expect(screen.getByText(/Irrevocable Workspace Owner/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save permissions/i })).not.toBeInTheDocument();

    for (const cb of screen.getAllByRole('checkbox')) {
      expect(cb).toBeDisabled();
    }
  });

  it('toggles a permission and saves the updated matrix for a mutable role', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    renderPage(<RolesPermissions onNotify={onNotify} />);
    await screen.findByText('Dashboard Overview');

    await user.click(screen.getByRole('button', { name: /faculty \/ ta/i }));

    const saveButtons = await screen.findAllByRole('button', { name: /save permissions/i });
    expect(saveButtons.length).toBeGreaterThan(0);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked(); // dashboard is permitted for TA
    await user.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();

    await user.click(saveButtons[0]);

    expect(settingsService.updateRolesPermissions).toHaveBeenCalledTimes(1);
    const payload = settingsService.updateRolesPermissions.mock.calls[0][0];
    expect(payload.TA.permissions.dashboard).toBe(false);
    expect(await screen.findByText(/Role permissions saved and enforced/i)).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith('Roles & Permissions matrix successfully updated.');
  });

  it('shows a view-only warning for non-admin users', async () => {
    useAuth.mockReturnValue({ user: { role: 'TA', is_superuser: false } });
    settingsService.getRolesPermissions.mockResolvedValue({
      ...rolesResponse(),
      can_manage: false,
    });

    renderPage(<RolesPermissions onNotify={vi.fn()} />);

    expect(
      await screen.findByText(/view-only access to this configuration/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save permissions/i })).not.toBeInTheDocument();
  });

  it('shows an error banner when the matrix fails to load', async () => {
    settingsService.getRolesPermissions.mockRejectedValue(new Error('Matrix load failed'));

    renderPage(<RolesPermissions onNotify={vi.fn()} />);

    expect(await screen.findByText('Matrix load failed')).toBeInTheDocument();
  });

  it('shows an error banner when saving permissions fails', async () => {
    const user = userEvent.setup();
    settingsService.updateRolesPermissions.mockRejectedValue({
      response: { data: { error: 'Permission update rejected' } },
    });

    renderPage(<RolesPermissions onNotify={vi.fn()} />);
    await screen.findByText('Dashboard Overview');

    await user.click(screen.getByRole('button', { name: /faculty \/ ta/i }));
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    await user.click(screen.getAllByRole('button', { name: /save permissions/i })[0]);

    expect(await screen.findByText('Permission update rejected')).toBeInTheDocument();
  });
});

// ===========================================================================
// AddDocuments
// ===========================================================================
describe('AddDocuments page', () => {
  it('renders the document list and knowledge base stats', async () => {
    renderPage(<AddDocuments onNotify={vi.fn()} />);

    expect(await screen.findByText('Java Guide')).toBeInTheDocument();
    expect(screen.getByText('Ignite Syllabus')).toBeInTheDocument();
    expect(screen.getByText('Draft Notes')).toBeInTheDocument();
    expect(screen.getByText('ChromaDB')).toBeInTheDocument();
  });

  it('filters documents by the search box', async () => {
    const user = userEvent.setup();
    renderPage(<AddDocuments onNotify={vi.fn()} />);
    await screen.findByText('Java Guide');

    await user.type(screen.getByLabelText(/search documents by name or description/i), 'java');

    expect(screen.getByText('Java Guide')).toBeInTheDocument();
    expect(screen.queryByText('Ignite Syllabus')).not.toBeInTheDocument();
    expect(screen.getByText(/1 documents/)).toBeInTheDocument();
  });

  it('filters documents by knowledge space', async () => {
    const user = userEvent.setup();
    renderPage(<AddDocuments onNotify={vi.fn()} />);
    await screen.findByText('Java Guide');

    await user.click(screen.getByRole('tab', { name: /ignite space/i }));

    expect(screen.getByText('Ignite Syllabus')).toBeInTheDocument();
    expect(screen.queryByText('Java Guide')).not.toBeInTheDocument();
  });

  it('filters documents by status', async () => {
    const user = userEvent.setup();
    renderPage(<AddDocuments onNotify={vi.fn()} />);
    await screen.findByText('Java Guide');

    await user.click(screen.getByRole('tab', { name: 'Processing' }));

    expect(screen.getByText('Draft Notes')).toBeInTheDocument();
    expect(screen.queryByText('Java Guide')).not.toBeInTheDocument();
  });

  it('opens the upload modal and uploads a valid file', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    renderPage(<AddDocuments onNotify={onNotify} />);
    await screen.findByText('Java Guide');

    await user.click(screen.getByRole('button', { name: 'Add document' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Upload RAG Knowledge Document')).toBeInTheDocument();

    const file = new File(['%PDF-1.4 content'], 'syllabus.pdf', { type: 'application/pdf' });
    const fileInput = dialog.querySelector('input[type="file"]');
    await user.upload(fileInput, file);

    expect(await within(dialog).findByText('syllabus.pdf')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /upload document/i }));

    expect(documentsService.uploadDocument).toHaveBeenCalledTimes(1);
    const payload = documentsService.uploadDocument.mock.calls[0][0];
    expect(payload.file).toBe(file);
    expect(payload.name).toBe('syllabus');
    expect(payload.space).toBe('general');
    expect(onNotify).toHaveBeenCalledWith(
      expect.stringContaining('syllabus')
    );
  });

  it('rejects an unsupported file type', async () => {
    const user = userEvent.setup();
    renderPage(<AddDocuments onNotify={vi.fn()} />);
    await screen.findByText('Java Guide');

    await user.click(screen.getByRole('button', { name: 'Add document' }));
    const dialog = await screen.findByRole('dialog');

    const file = new File(['bin'], 'malware.exe', { type: 'application/octet-stream' });
    fireEvent.change(dialog.querySelector('input[type="file"]'), { target: { files: [file] } });

    expect(
      await within(dialog).findByText('Please upload a PDF, TXT, DOCX, PPTX, or MD file.')
    ).toBeInTheDocument();
    expect(documentsService.uploadDocument).not.toHaveBeenCalled();
  });

  it('rejects an empty file', async () => {
    const user = userEvent.setup();
    renderPage(<AddDocuments onNotify={vi.fn()} />);
    await screen.findByText('Java Guide');

    await user.click(screen.getByRole('button', { name: 'Add document' }));
    const dialog = await screen.findByRole('dialog');

    const file = new File([], 'empty.pdf', { type: 'application/pdf' });
    await user.upload(dialog.querySelector('input[type="file"]'), file);

    expect(await within(dialog).findByText('The selected file is empty.')).toBeInTheDocument();
  });

  it('opens the document details modal', async () => {
    const user = userEvent.setup();
    renderPage(<AddDocuments onNotify={vi.fn()} />);
    await screen.findByText('Java Guide');

    await user.click(screen.getAllByRole('button', { name: /view details/i })[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Document & RAG Details')).toBeInTheDocument();
    expect(within(dialog).getByText('Core Java handbook')).toBeInTheDocument();
  });

  it('deletes a document after confirmation', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    renderPage(<AddDocuments onNotify={onNotify} />);
    await screen.findByText('Java Guide');

    await user.click(screen.getByRole('button', { name: 'Delete Java Guide' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete document?')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Delete document' }));

    expect(documentsService.deleteDocument).toHaveBeenCalledWith(1);
    expect(onNotify).toHaveBeenCalledWith('Document removed from knowledge base & vector store purged');
    expect(screen.queryByText('Java Guide')).not.toBeInTheDocument();
  });

  it('shows an error banner and retries when loading fails', async () => {
    const user = userEvent.setup();
    documentsService.getDocuments
      .mockRejectedValueOnce(new Error('Documents unavailable'))
      .mockResolvedValue(docsFixture());

    renderPage(<AddDocuments onNotify={vi.fn()} />);

    expect(await screen.findByText('Documents unavailable')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByText('Java Guide')).toBeInTheDocument();
    expect(documentsService.getDocuments).toHaveBeenCalledTimes(2);
  });
});
