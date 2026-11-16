import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BroadcastForm } from '../components/broadcast/BroadcastForm';
import { ScheduleForm } from '../components/schedule/ScheduleForm';
import { BuddyDetails } from '../components/buddy/BuddyDetails';
import { BuddyHero } from '../components/buddy/BuddyHero';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { ProfileDropdown } from '../components/layout/ProfileDropdown';
import { NotificationsDropdown } from '../components/layout/NotificationsDropdown';

// The forms/components below fetch hierarchy data on mount. Stub those services
// with deterministic resolved values so component behaviour (not networking) is
// under test.
vi.mock('../services/buddyService', () => ({
  buddyService: {
    getExamRules: vi.fn().mockResolvedValue([]),
    createExamRule: vi.fn().mockResolvedValue({}),
    deleteExamRule: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../services/usersService', () => ({
  usersService: {
    getCohorts: vi.fn().mockResolvedValue([]),
    getBatches: vi.fn().mockResolvedValue([]),
    getSubBatches: vi.fn().mockResolvedValue([]),
    getStreams: vi.fn().mockResolvedValue([]),
    getUsers: vi.fn().mockResolvedValue([]),
  },
}));

const buddySettings = {
  enabled: true,
  exam_mode: false,
  exam_reason: '',
  test_auto_lock_enabled: true,
  test_buffer_before_minutes: 15,
  test_buffer_after_minutes: 15,
  llm_system_prompt: '',
  blocked_keywords: '',
};

describe('Frontend Component Tests', () => {
  describe('BroadcastForm', () => {
    it('disables submit button when title or message is empty', () => {
      render(
        <BroadcastForm
          form={{ title: '', message: '' }}
          formErrors={{}}
          isSubmitting={false}
          onChangeField={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /publish broadcast/i });
      expect(submitBtn).toBeDisabled();
    });

    it('enables submit button and calls onSubmit when valid', async () => {
      const user = userEvent.setup();
      const handleSubmit = vi.fn();

      render(
        <BroadcastForm
          form={{ title: 'Exam update', message: 'Exam starts at 9am' }}
          formErrors={{}}
          isSubmitting={false}
          onChangeField={vi.fn()}
          onSubmit={handleSubmit}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /publish broadcast/i });
      expect(submitBtn).not.toBeDisabled();

      await user.click(submitBtn);
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });

    it('opens and closes the preview modal when Preview button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <BroadcastForm
          form={{ title: 'Auditorium Booking', message: 'Bookings open from 10am' }}
          formErrors={{}}
          isSubmitting={false}
          onChangeField={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      const previewBtn = screen.getByRole('button', { name: /preview/i });
      await user.click(previewBtn);

      expect(screen.getByRole('dialog', { name: /announcement preview/i })).toBeInTheDocument();
      expect(screen.getByText('Auditorium Booking')).toBeInTheDocument();

      const closeBtn = screen.getByRole('button', { name: /close preview modal/i });
      await user.click(closeBtn);

      expect(screen.queryByRole('dialog', { name: /announcement preview/i })).not.toBeInTheDocument();
    });

    it('renders validation errors when provided', () => {
      render(
        <BroadcastForm
          form={{ title: '', message: '' }}
          formErrors={{ title: 'Title is required.' }}
          isSubmitting={false}
          onChangeField={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      expect(screen.getByText('Title is required.')).toBeInTheDocument();
    });

    it('surfaces a recipient validation error from formErrors', () => {
      render(
        <BroadcastForm
          form={{ title: 'A', message: 'B', recipientMode: 'By role' }}
          formErrors={{ recipients: 'Please select a role to send to.' }}
          isSubmitting={false}
          onChangeField={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      expect(screen.getByText('Please select a role to send to.')).toBeInTheDocument();
    });
  });

  describe('ScheduleForm', () => {
    it('disables schedule link button when fields are incomplete', () => {
      render(
        <ScheduleForm
          form={{ title: '', onedrive_url: '', publish_date: '', publish_time: '' }}
          formErrors={{}}
          isSubmitting={false}
          onChangeField={vi.fn()}
          onCancel={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /schedule link/i });
      expect(submitBtn).toBeDisabled();
    });

    it('enables submit and calls onSubmit when the form is complete', async () => {
      const user = userEvent.setup();
      const handleSubmit = vi.fn();

      render(
        <ScheduleForm
          form={{
            title: 'Notes',
            onedrive_url: 'https://1drv.ms/test',
            publish_date: '2026-11-01',
            publish_time: '10:00',
          }}
          formErrors={{}}
          isSubmitting={false}
          onChangeField={vi.fn()}
          onCancel={vi.fn()}
          onSubmit={handleSubmit}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /schedule link/i });
      expect(submitBtn).not.toBeDisabled();
      await user.click(submitBtn);
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      const handleCancel = vi.fn();

      render(
        <ScheduleForm
          form={{ title: 'Notes', onedrive_url: 'https://1drv.ms/test', publish_date: '2026-11-01', publish_time: '10:00' }}
          formErrors={{}}
          isSubmitting={false}
          onChangeField={vi.fn()}
          onCancel={handleCancel}
          onSubmit={vi.fn()}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelBtn);
      expect(handleCancel).toHaveBeenCalledTimes(1);
    });

    it('displays validation error for invalid OneDrive link', () => {
      render(
        <ScheduleForm
          form={{ title: 'Notes', onedrive_url: 'http://insecure.com', publish_date: '2026-11-01', publish_time: '10:00' }}
          formErrors={{ onedrive_url: 'Please provide a valid HTTPS URL.' }}
          isSubmitting={false}
          onChangeField={vi.fn()}
          onCancel={vi.fn()}
          onSubmit={vi.fn()}
        />
      );

      expect(screen.getByText('Please provide a valid HTTPS URL.')).toBeInTheDocument();
    });
  });

  describe('Buddy Components', () => {
    it('reflects the enabled state and triggers toggle on the master switch', async () => {
      const user = userEvent.setup();
      const handleToggle = vi.fn();

      const { rerender } = render(
        <BuddyDetails
          settings={buddySettings}
          isUpdating={false}
          onToggleBuddy={handleToggle}
          onUpdateSetting={vi.fn()}
        />
      );

      const switchEl = screen.getByRole('switch', { name: /toggle buddy availability/i });
      expect(switchEl).toHaveAttribute('aria-checked', 'true');

      await user.click(switchEl);
      expect(handleToggle).toHaveBeenCalledTimes(1);

      rerender(
        <BuddyDetails
          settings={{ ...buddySettings, enabled: false }}
          isUpdating={false}
          onToggleBuddy={handleToggle}
          onUpdateSetting={vi.fn()}
        />
      );
      expect(screen.getByRole('switch', { name: /toggle buddy availability/i })).toHaveAttribute(
        'aria-checked',
        'false'
      );
    });

    it('shows the campus-wide exam mode banner when exam_mode is active', () => {
      render(
        <BuddyDetails
          settings={{ ...buddySettings, exam_mode: true }}
          isUpdating={false}
          onToggleBuddy={vi.fn()}
          onUpdateSetting={vi.fn()}
        />
      );

      expect(screen.getByText(/Campus-Wide Exam Mode is Active/i)).toBeInTheDocument();
    });

    it('BuddyHero renders enterprise action button and toggles state', async () => {
      const user = userEvent.setup();
      const handleToggle = vi.fn();

      const { rerender } = render(
        <BuddyHero buddy={true} isUpdating={false} onToggleBuddy={handleToggle} />
      );

      const offBtn = screen.getByRole('button', { name: /turn buddy off/i });
      await user.click(offBtn);
      expect(handleToggle).toHaveBeenCalledTimes(1);

      rerender(<BuddyHero buddy={false} isUpdating={false} onToggleBuddy={handleToggle} />);
      expect(screen.getByRole('button', { name: /turn buddy on/i })).toBeInTheDocument();
    });
  });

  describe('Dropdown Menus', () => {
    it('ProfileDropdown renders profile actions and triggers sign out', async () => {
      const user = userEvent.setup();
      const handleSignOut = vi.fn();
      const handleClose = vi.fn();

      render(
        <MemoryRouter>
          <ProfileDropdown
            isOpen={true}
            onClose={handleClose}
            onSignOut={handleSignOut}
            user={{
              full_name: 'Admin User',
              email: 'admin@campus.demo',
              role: 'ADMIN',
              is_superuser: false,
            }}
          />
        </MemoryRouter>
      );

      expect(screen.getByText('Admin User')).toBeInTheDocument();
      expect(screen.getByText('admin@campus.demo')).toBeInTheDocument();
      expect(screen.getByText('Ignite Administrator')).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /my profile/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /roles & permissions/i })).toBeInTheDocument();

      const signOutBtn = screen.getByRole('menuitem', { name: /sign out/i });
      await user.click(signOutBtn);

      expect(handleSignOut).toHaveBeenCalledTimes(1);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('ProfileDropdown hides role management for non-admin users', () => {
      render(
        <MemoryRouter>
          <ProfileDropdown
            isOpen={true}
            onClose={vi.fn()}
            onSignOut={vi.fn()}
            user={{ full_name: 'Faculty Member', email: 'faculty@campus.demo', role: 'TA', is_superuser: false }}
          />
        </MemoryRouter>
      );

      expect(screen.queryByRole('menuitem', { name: /roles & permissions/i })).not.toBeInTheDocument();
      expect(screen.getByText('Faculty / TA')).toBeInTheDocument();
    });

    it('NotificationsDropdown renders notifications and marks all as read', async () => {
      const user = userEvent.setup();
      const handleClose = vi.fn();

      render(
        <NotificationsDropdown
          isOpen={true}
          onClose={handleClose}
          broadcasts={[{ id: 1, title: 'First Announcement' }]}
        />
      );

      expect(screen.getByText(/Broadcast saved: First Announcement/i)).toBeInTheDocument();

      const markBtn = screen.getByRole('button', { name: /mark all as read/i });
      await user.click(markBtn);

      expect(screen.getByText(/No unread notifications/i)).toBeInTheDocument();
    });
  });

  describe('ErrorBanner', () => {
    it('renders error message and retry button', async () => {
      const user = userEvent.setup();
      const handleRetry = vi.fn();

      render(
        <ErrorBanner
          message="Unable to load announcements. Please try again."
          onRetry={handleRetry}
        />
      );

      expect(screen.getByText(/Unable to load announcements/i)).toBeInTheDocument();
      const retryBtn = screen.getByRole('button', { name: /retry/i });
      await user.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });

    it('renders nothing for cancellation or empty messages', () => {
      const { container } = render(<ErrorBanner message="canceled" onRetry={vi.fn()} />);
      expect(container.firstChild).toBeNull();
    });
  });
});
