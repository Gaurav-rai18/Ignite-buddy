import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BroadcastForm } from '../components/broadcast/BroadcastForm';
import { RECIPIENT_MODES, ROLE_OPTIONS, VALIDATION_LIMITS } from '../constants';
import { usersService } from '../services/usersService';

// The component loads hierarchy data (cohorts/batches/sub-batches/streams) on
// mount and the RecipientSelector loads users. Stub the service so behaviour,
// not networking, is under test.
vi.mock('../services/usersService', () => ({
  usersService: {
    getUsers: vi.fn(),
    getCohorts: vi.fn(),
    getBatches: vi.fn(),
    getSubBatches: vi.fn(),
    getStreams: vi.fn(),
  },
}));

const defaultForm = {
  title: 'Campus update',
  message: 'All classes resume tomorrow.',
  recipientMode: 'All users',
};

function renderForm(overrides = {}, props = {}) {
  const onChangeField = props.onChangeField || vi.fn();
  const onSubmit = props.onSubmit || vi.fn();

  const utils = render(
    <BroadcastForm
      form={{ ...defaultForm, ...overrides }}
      formErrors={props.formErrors || {}}
      isSubmitting={props.isSubmitting || false}
      onChangeField={onChangeField}
      onSubmit={onSubmit}
      onToggleRecipient={props.onToggleRecipient}
      onSetRecipients={props.onSetRecipients}
    />
  );

  return { ...utils, onChangeField, onSubmit };
}

const modeGroup = () =>
  screen.getByRole('group', { name: /recipient targeting type/i });

beforeEach(() => {
  vi.clearAllMocks();
  usersService.getCohorts.mockResolvedValue([]);
  usersService.getBatches.mockResolvedValue([]);
  usersService.getSubBatches.mockResolvedValue([]);
  usersService.getStreams.mockResolvedValue([]);
  usersService.getUsers.mockResolvedValue([]);
});

describe('BroadcastForm recipient targeting', () => {
  it('renders every recipient mode and reports mode switches via onChangeField', async () => {
    const user = userEvent.setup();
    const { onChangeField } = renderForm();

    const group = modeGroup();
    RECIPIENT_MODES.forEach((option) => {
      expect(within(group).getByRole('button', { name: option })).toBeInTheDocument();
    });

    // The active mode is reflected through aria-pressed.
    expect(within(group).getByRole('button', { name: 'All users' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await user.click(within(group).getByRole('button', { name: 'By role' }));

    expect(onChangeField).toHaveBeenCalledWith('recipientMode', 'By role');
  });

  it('renders the role dropdown in By role mode and reports role selection', async () => {
    const user = userEvent.setup();
    const { onChangeField } = renderForm({ recipientMode: 'By role', role: '' });

    const select = screen.getByRole('combobox');
    ROLE_OPTIONS.forEach((role) => {
      expect(within(select).getByRole('option', { name: role })).toBeInTheDocument();
    });

    await user.selectOptions(select, 'TRAINEE');

    expect(onChangeField).toHaveBeenCalledWith('role', 'TRAINEE');
  });

  it('renders loaded cohorts in By cohort mode and reports cohort selection', async () => {
    usersService.getCohorts.mockResolvedValue([
      { id: 7, code: 'IGN', name: 'Ignite Cohort' },
    ]);
    const user = userEvent.setup();
    const { onChangeField } = renderForm({ recipientMode: 'By cohort', cohort_id: '' });

    const option = await screen.findByRole('option', { name: /IGN - Ignite Cohort/i });
    await user.selectOptions(screen.getByRole('combobox'), option);

    expect(onChangeField).toHaveBeenCalledWith('cohort_id', '7');
  });

  it('summarises the resolved cohort in the form footer', async () => {
    usersService.getCohorts.mockResolvedValue([{ id: 7, code: 'IGN', name: 'Ignite' }]);

    renderForm({ recipientMode: 'By cohort', cohort_id: 7 });

    expect(await screen.findByText('Cohort IGN')).toBeInTheDocument();
  });

  it('By batch: Select All sends every batch id plus the first as batch_id', async () => {
    usersService.getBatches.mockResolvedValue([
      { id: 10, full_code: 'B10' },
      { id: 20, full_code: 'B20' },
    ]);
    const user = userEvent.setup();
    const { onChangeField } = renderForm({ recipientMode: 'By batch' });

    await screen.findByText('B10');
    await user.click(screen.getByRole('button', { name: /select all/i }));

    expect(onChangeField).toHaveBeenCalledWith('selectedBatchIds', [10, 20]);
    expect(onChangeField).toHaveBeenCalledWith('batch_id', 10);
  });

  it('By batch: toggling a single pill updates selectedBatchIds and batch_id', async () => {
    usersService.getBatches.mockResolvedValue([
      { id: 10, full_code: 'B10' },
      { id: 20, full_code: 'B20' },
    ]);
    const user = userEvent.setup();
    const { onChangeField } = renderForm({ recipientMode: 'By batch' });

    await screen.findByText('B20');
    await user.click(screen.getAllByRole('checkbox')[1]);

    expect(onChangeField).toHaveBeenCalledWith('selectedBatchIds', [20]);
    expect(onChangeField).toHaveBeenCalledWith('batch_id', 20);
  });

  it('By batch: Clear resets the selection and the count badge reflects the chosen batches', async () => {
    usersService.getBatches.mockResolvedValue([{ id: 10, full_code: 'B10' }]);
    const user = userEvent.setup();
    const { onChangeField, container } = renderForm({
      recipientMode: 'By batch',
      selectedBatchIds: [10],
    });

    expect(container.querySelector('.selection-count-badge')).toHaveTextContent(
      '1 batch(es) selected'
    );

    await user.click(screen.getByRole('button', { name: /^clear$/i }));

    expect(onChangeField).toHaveBeenCalledWith('selectedBatchIds', []);
    expect(onChangeField).toHaveBeenCalledWith('batch_id', '');
  });

  it('By batch: falls back to a legacy batch_id when selectedBatchIds is absent', () => {
    renderForm({ recipientMode: 'By batch', batch_id: 10 });

    expect(screen.getByText('1 batch(es) selected')).toBeInTheDocument();
  });

  it('By sub-batch: renders sub-batch pills and Select All reports sub_batch_id', async () => {
    usersService.getSubBatches.mockResolvedValue([
      { id: 5, name: 'SB5' },
      { id: 6, name: 'SB6' },
    ]);
    const user = userEvent.setup();
    const { onChangeField } = renderForm({ recipientMode: 'By sub-batch' });

    await screen.findByText('SB5');
    await user.click(screen.getByRole('button', { name: /select all/i }));

    expect(onChangeField).toHaveBeenCalledWith('selectedSubBatchIds', [5, 6]);
    expect(onChangeField).toHaveBeenCalledWith('sub_batch_id', 5);
  });

  it('By stream: renders stream pills and Select All reports stream_id', async () => {
    usersService.getStreams.mockResolvedValue([{ id: 2, name: 'Data Science' }]);
    const user = userEvent.setup();
    const { onChangeField } = renderForm({ recipientMode: 'By stream' });

    await screen.findByText('Data Science');
    await user.click(screen.getByRole('button', { name: /select all/i }));

    expect(onChangeField).toHaveBeenCalledWith('selectedStreamIds', [2]);
    expect(onChangeField).toHaveBeenCalledWith('stream_id', 2);
  });

  it('By cohort: submit stays disabled until a cohort is chosen', () => {
    const { rerender } = render(
      <BroadcastForm
        form={{ ...defaultForm, recipientMode: 'By cohort', cohort_id: '' }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /publish broadcast/i })).toBeDisabled();

    rerender(
      <BroadcastForm
        form={{ ...defaultForm, recipientMode: 'By cohort', cohort_id: '7' }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /publish broadcast/i })).not.toBeDisabled();
  });
});

describe('BroadcastForm specific-user targeting', () => {
  it('loads the user list and toggling a row calls onToggleRecipient', async () => {
    const alice = { id: 'u1', username: 'alice', email: 'alice@campus.demo', role: 'TRAINEE' };
    usersService.getUsers.mockResolvedValue([alice]);
    const user = userEvent.setup();
    const onToggleRecipient = vi.fn();

    renderForm({ recipientMode: 'Specific users', selectedUsers: [] }, { onToggleRecipient });

    await screen.findByText('alice');
    await user.click(screen.getByRole('checkbox'));

    expect(onToggleRecipient).toHaveBeenCalledWith(alice);
  });

  it('shows the selected recipient chips and removing one calls onToggleRecipient', async () => {
    const user = userEvent.setup();
    const onToggleRecipient = vi.fn();

    renderForm(
      { recipientMode: 'Specific users', selectedUsers: [{ id: 'u1', username: 'alice' }] },
      { onToggleRecipient }
    );

    expect(await screen.findByText(/send to 1 user/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove alice/i }));

    expect(onToggleRecipient).toHaveBeenCalledWith({ id: 'u1', username: 'alice' });
  });

  it('renders the specific-user recipient summary in the footer', () => {
    const { container } = renderForm({
      recipientMode: 'Specific users',
      selectedUsers: [
        { id: 'u1', username: 'alice' },
        { id: 'u2', username: 'bob' },
      ],
    });

    const footer = container.querySelector('.form-foot');
    expect(within(footer).getByText('2 users')).toBeInTheDocument();
  });
});

describe('BroadcastForm submit + validation surfaces', () => {
  it('disables the controls and shows a Publishing label while submitting', () => {
    renderForm({}, { isSubmitting: true });

    expect(screen.getByRole('button', { name: /publishing/i })).toBeDisabled();
    expect(screen.getByLabelText(/announcement title/i)).toBeDisabled();
    expect(screen.getByLabelText(/^message$/i)).toBeDisabled();
    within(modeGroup())
      .getAllByRole('button')
      .forEach((button) => expect(button).toBeDisabled());
  });

  it('keeps the Preview button disabled until the form is complete', () => {
    renderForm({ title: '', message: '' });

    expect(screen.getByRole('button', { name: /preview/i })).toBeDisabled();
  });

  it('enforces the VALIDATION_LIMITS max length on title and message', () => {
    renderForm();

    expect(screen.getByLabelText(/announcement title/i)).toHaveAttribute(
      'maxLength',
      String(VALIDATION_LIMITS.BROADCAST_TITLE_MAX)
    );
    expect(screen.getByLabelText(/^message$/i)).toHaveAttribute(
      'maxLength',
      String(VALIDATION_LIMITS.BROADCAST_MESSAGE_MAX)
    );
  });

  it('reports title and message edits through onChangeField, including the boundary value', () => {
    const { onChangeField } = renderForm({ title: '', message: '' });

    const atLimit = 'T'.repeat(VALIDATION_LIMITS.BROADCAST_TITLE_MAX);
    fireEvent.change(screen.getByLabelText(/announcement title/i), {
      target: { value: atLimit },
    });
    expect(onChangeField).toHaveBeenCalledWith('title', atLimit);

    const overLimit = 'M'.repeat(VALIDATION_LIMITS.BROADCAST_MESSAGE_MAX + 50);
    fireEvent.change(screen.getByLabelText(/^message$/i), {
      target: { value: overLimit },
    });
    expect(onChangeField).toHaveBeenCalledWith('message', overLimit);
  });

  it('marks the title input invalid and surfaces its error', () => {
    renderForm({}, { formErrors: { title: 'Title is required.' } });

    expect(screen.getByLabelText(/announcement title/i)).toHaveAttribute(
      'aria-invalid',
      'true'
    );
  });

  it('marks the message textarea invalid and surfaces its error', () => {
    renderForm({}, { formErrors: { message: 'Message exceeds the allowed length.' } });

    const textarea = screen.getByLabelText(/^message$/i);
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Message exceeds the allowed length.')).toBeInTheDocument();
  });
});

describe('BroadcastForm preview modal', () => {
  it('reflects the current title, message and recipient summary in the preview', async () => {
    const user = userEvent.setup();
    renderForm({
      title: 'Exam Notice',
      message: 'Exams start Monday',
      recipientMode: 'By role',
      role: 'TRAINEE',
    });

    await user.click(screen.getByRole('button', { name: /preview/i }));

    const dialog = screen.getByRole('dialog', { name: /announcement preview/i });
    expect(within(dialog).getByText('Exam Notice')).toBeInTheDocument();
    expect(within(dialog).getByText('Exams start Monday')).toBeInTheDocument();
    expect(within(dialog).getByText('TRAINEE')).toBeInTheDocument();
  });

  it('lists the selected users in the preview when targeting specific users', async () => {
    const user = userEvent.setup();
    renderForm({
      recipientMode: 'Specific users',
      selectedUsers: [{ id: 'u1', username: 'alice' }],
    });

    await user.click(screen.getByRole('button', { name: /preview/i }));

    const dialog = screen.getByRole('dialog', { name: /announcement preview/i });
    expect(within(dialog).getByText('1 selected user')).toBeInTheDocument();
    expect(within(dialog).getByText('alice')).toBeInTheDocument();
  });

  it('closes the preview via the Escape key and via the overlay', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: /preview/i }));
    expect(screen.getByRole('dialog', { name: /announcement preview/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /announcement preview/i })
      ).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /preview/i }));
    fireEvent.click(screen.getByRole('dialog', { name: /announcement preview/i }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /announcement preview/i })
      ).not.toBeInTheDocument()
    );
  });
});
