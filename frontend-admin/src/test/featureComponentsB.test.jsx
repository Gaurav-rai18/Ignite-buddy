import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UserTable } from '../components/users/UserTable';
import { DeleteUserDialog } from '../components/users/DeleteUserDialog';
import { UserFormModal } from '../components/users/UserFormModal';
import { BulkUploadUserModal } from '../components/users/BulkUploadUserModal';
import { BatchHierarchyModal } from '../components/users/BatchHierarchyModal';
import { AssignmentForm } from '../components/assignment/AssignmentForm';
import { ScheduleList } from '../components/schedule/ScheduleList';
import { ScheduleForm } from '../components/schedule/ScheduleForm';

import { usersService } from '../services/usersService';

// Components under test fetch hierarchy / master data on mount. Stub the
// usersService so component behaviour (not networking) is exercised.
vi.mock('../services/usersService', () => {
  const fn = () => vi.fn();
  return {
    usersService: {
      getUsers: fn(),
      getCohorts: fn(),
      getBatches: fn(),
      getSubBatches: fn(),
      getLabs: fn(),
      getStreams: fn(),
      getSubjects: fn(),
      createUser: fn(),
      updateUser: fn(),
      deleteUser: fn(),
      createCohort: fn(),
      updateCohort: fn(),
      deleteCohort: fn(),
      createBatch: fn(),
      updateBatch: fn(),
      deleteBatch: fn(),
      createSubBatch: fn(),
      updateSubBatch: fn(),
      deleteSubBatch: fn(),
      createLab: fn(),
      updateLab: fn(),
      deleteLab: fn(),
      createStream: fn(),
      updateStream: fn(),
      deleteStream: fn(),
      createSubject: fn(),
      updateSubject: fn(),
      deleteSubject: fn(),
      bulkUploadUsers: fn(),
      bulkImportMasterData: fn(),
    },
  };
});

const COHORTS = [
  { id: 1, code: 'B50', name: 'TCS Ignite B50', start_date: '2026-01-01', end_date: '2026-06-01', is_active: true },
  { id: 2, code: 'B51', name: 'TCS Ignite B51', start_date: '', end_date: '', is_active: false },
];

const BATCHES = [
  { id: 10, name: 'A', cohort: 1, cohort_code: 'B50', description: 'Morning Track', full_code: 'B50-A' },
  { id: 11, name: 'B', cohort: 1, cohort_code: 'B50', description: '', full_code: 'B50-B' },
];

const SUB_BATCHES = [
  { id: 100, name: 'A1', batch: 10, batch_name: 'A', cohort_code: 'B50', full_code: 'B50-A-A1', home_lab_name: 'Lab 1', lab_name: 'Lab 1' },
];

const LABS = [{ id: 1, name: 'Lab 1', code: 'LAB_1', capacity: 35, location: 'Ground Floor' }];

const STREAMS = [{ id: 1, code: 'AI', name: 'AI Engineering', description: 'Advanced Python' }];

const SUBJECTS = [{ id: 1, code: 'INCUBATOR', name: 'Incubator', subject_type: 'CORE', description: 'Lab projects' }];

beforeEach(() => {
  vi.clearAllMocks();
  usersService.getUsers.mockResolvedValue([]);
  usersService.getCohorts.mockResolvedValue(COHORTS);
  usersService.getBatches.mockResolvedValue(BATCHES);
  usersService.getSubBatches.mockResolvedValue(SUB_BATCHES);
  usersService.getLabs.mockResolvedValue(LABS);
  usersService.getStreams.mockResolvedValue(STREAMS);
  usersService.getSubjects.mockResolvedValue(SUBJECTS);
  usersService.createCohort.mockResolvedValue({ id: 99 });
  usersService.updateCohort.mockResolvedValue({});
  usersService.deleteCohort.mockResolvedValue({});
  usersService.createBatch.mockResolvedValue({});
  usersService.createSubBatch.mockResolvedValue({});
  usersService.createLab.mockResolvedValue({});
  usersService.createStream.mockResolvedValue({});
  usersService.createSubject.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* UserTable                                                          */
/* ------------------------------------------------------------------ */
describe('UserTable', () => {
  it('renders the empty message when there are no users', () => {
    render(<UserTable users={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('No matching users found.')).toBeInTheDocument();
  });

  it('renders user rows with role, employee id, batch and status', () => {
    const users = [
      {
        id: 1,
        username: 'alice',
        email: 'alice@tcs.com',
        role: 'ADMIN',
        employee_id: '1234567',
        full_batch_name: 'B50-A',
        is_active: true,
      },
      {
        id: 2,
        username: 'bob',
        email: 'bob@tcs.com',
        role: 'TRAINEE',
        employee_id: '',
        cohort_code: 'B51',
        is_active: false,
      },
    ];

    render(<UserTable users={users} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    expect(screen.getByText('1234567')).toBeInTheDocument();
    expect(screen.getByText('B50-A')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();

    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('B51')).toBeInTheDocument();
    expect(screen.getByText('INACTIVE')).toBeInTheDocument();
    // Missing employee id falls back to a dash.
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('invokes onEdit / onDelete with the correct user', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const target = { id: 7, username: 'carol', email: 'carol@tcs.com', role: 'TA', is_active: true };

    render(<UserTable users={[target]} onEdit={onEdit} onDelete={onDelete} />);

    await user.click(screen.getByRole('button', { name: 'Edit carol' }));
    expect(onEdit).toHaveBeenCalledWith(target);

    await user.click(screen.getByRole('button', { name: 'Delete carol' }));
    expect(onDelete).toHaveBeenCalledWith(target);
  });
});

/* ------------------------------------------------------------------ */
/* DeleteUserDialog                                                   */
/* ------------------------------------------------------------------ */
describe('DeleteUserDialog', () => {
  it('renders nothing when closed or without a user', () => {
    const { container: closed } = render(
      <DeleteUserDialog isOpen={false} onClose={vi.fn()} onConfirm={vi.fn()} user={{ id: 1, username: 'a' }} />
    );
    expect(closed.firstChild).toBeNull();

    const { container: noUser } = render(
      <DeleteUserDialog isOpen onClose={vi.fn()} onConfirm={vi.fn()} user={null} />
    );
    expect(noUser.firstChild).toBeNull();
  });

  it('shows the user details and confirms deletion with the id', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <DeleteUserDialog
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
        user={{ id: 42, username: 'dave', email: 'dave@tcs.com' }}
      />
    );

    expect(screen.getByRole('dialog', { name: /delete this user/i })).toBeInTheDocument();
    expect(screen.getByText('dave')).toBeInTheDocument();
    expect(screen.getByText('dave@tcs.com')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /delete user/i }));

    expect(onConfirm).toHaveBeenCalledWith(42);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Cancel and on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <DeleteUserDialog isOpen onClose={onClose} onConfirm={vi.fn()} user={{ id: 1, username: 'e', email: 'e@tcs.com' }} />
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

/* ------------------------------------------------------------------ */
/* UserFormModal                                                      */
/* ------------------------------------------------------------------ */
describe('UserFormModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <UserFormModal isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('validates required fields on create submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<UserFormModal isOpen onClose={vi.fn()} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Add user' }));

    expect(screen.getByText('Username is required.')).toBeInTheDocument();
    expect(screen.getByText('Email address is required.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();
    // Trainee role leaves the employee id blank -> its error is also rendered.
    expect(screen.getByText('Employee ID is required for trainees.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks submission and shows an error when a trainee employee id is not 7 digits', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<UserFormModal isOpen onClose={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Username'), 'newbie');
    await user.type(screen.getByLabelText('Email address'), 'newbie@tcs.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Employee ID'), 'ABC');
    await user.click(screen.getByRole('button', { name: 'Add user' }));

    expect(
      screen.getByText('Employee ID must be a 7-digit integer (e.g. 1234567).')
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a normalized create payload and closes', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({});
    const onClose = vi.fn();

    render(<UserFormModal isOpen onClose={onClose} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Username'), 'newbie');
    await user.type(screen.getByLabelText('Email address'), 'Newbie@TCS.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Employee ID'), '1234567');
    await user.click(screen.getByRole('button', { name: 'Add user' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      {
        username: 'newbie',
        email: 'newbie@tcs.com',
        role: 'TRAINEE',
        employee_id: '1234567',
        sub_batch: null,
        stream: null,
        password: 'password123',
      },
      undefined
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('hides the elective stream for non-trainee roles and drops employee id requirement', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({});

    render(<UserFormModal isOpen onClose={vi.fn()} onSubmit={onSubmit} />);

    expect(screen.getByText(/Elective Stream \(Month 4 Specialization\)/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Role'), 'ADMIN');

    expect(screen.queryByText(/Elective Stream \(Month 4 Specialization\)/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Username'), 'admin1');
    await user.type(screen.getByLabelText('Email address'), 'admin1@tcs.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Add user' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ADMIN', employee_id: '' }),
      undefined
    );
  });

  it('prefills edit mode, exposes the active toggle and emits the id', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({});
    const onClose = vi.fn();

    const initialUser = {
      id: 5,
      username: 'trainee5',
      email: 't5@tcs.com',
      role: 'ADMIN',
      employee_id: '',
      sub_batch: null,
      stream: null,
      is_active: true,
    };

    render(<UserFormModal isOpen onClose={onClose} onSubmit={onSubmit} initialUser={initialUser} />);

    expect(screen.getByText('Edit user')).toBeInTheDocument();
    expect(screen.getByDisplayValue('trainee5')).toBeInTheDocument();
    expect(screen.getByText('User account is active')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'trainee5', role: 'ADMIN', is_active: true }),
      5
    );
  });

  it('surfaces backend field errors returned by onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue({
      message: 'Invalid payload',
      details: { username: ['Already taken'] },
    });

    render(<UserFormModal isOpen onClose={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Username'), 'dupe');
    await user.type(screen.getByLabelText('Email address'), 'dupe@tcs.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Employee ID'), '1234567');
    await user.click(screen.getByRole('button', { name: 'Add user' }));

    expect(await screen.findByText('Already taken')).toBeInTheDocument();
    expect(screen.getByText('Invalid payload')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* BulkUploadUserModal                                                */
/* ------------------------------------------------------------------ */
describe('BulkUploadUserModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<BulkUploadUserModal isOpen={false} onClose={vi.fn()} onUpload={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the importer with the default users category', () => {
    render(<BulkUploadUserModal isOpen onClose={vi.fn()} onUpload={vi.fn()} />);

    expect(screen.getByText('Master Data & Bulk Importer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import Users & Trainees/i })).toBeDisabled();
    expect(screen.getByRole('tab', { name: /Upload File/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('rejects unsupported file extensions dropped onto the dropzone', async () => {
    render(<BulkUploadUserModal isOpen onClose={vi.fn()} onUpload={vi.fn()} />);

    // Drag & drop bypasses the native `accept` filter, so the component's own
    // extension validation is reachable this way.
    const dropzone = document.querySelector('.bulk-dropzone-container');
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] },
    });

    expect(
      await screen.findByText(/Please upload a valid CSV \(\.csv\) or Excel/i)
    ).toBeInTheDocument();
  });

  it('accepts a CSV file and uploads it', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue({ created_count: 2, updated_count: 1 });
    render(<BulkUploadUserModal isOpen onClose={vi.fn()} onUpload={onUpload} />);

    const file = new File(['username,email\nAarav,a@tcs.com'], 'users.csv', { type: 'text/csv' });
    await user.upload(document.querySelector('input[type="file"]'), file);

    expect(await screen.findByText('users.csv')).toBeInTheDocument();

    const importBtn = screen.getByRole('button', { name: /Import Users & Trainees/i });
    expect(importBtn).not.toBeDisabled();
    await user.click(importBtn);

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith('users', file, ''));
    expect(await screen.findByText(/Import Completed for Users & Trainees/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('uploads pasted CSV text via the paste tab', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue({ created_count: 3 });
    render(<BulkUploadUserModal isOpen onClose={vi.fn()} onUpload={onUpload} />);

    await user.click(screen.getByRole('tab', { name: /Paste CSV Data/i }));
    await user.click(screen.getByRole('button', { name: /Load Sample Data/i }));

    const importBtn = screen.getByRole('button', { name: /Import Users & Trainees/i });
    expect(importBtn).not.toBeDisabled();
    await user.click(importBtn);

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith('users', null, expect.stringContaining('Ananya Sen')));
  });

  it('switching import category updates the import button label', async () => {
    const user = userEvent.setup();
    render(<BulkUploadUserModal isOpen onClose={vi.fn()} onUpload={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Elective Streams/i }));
    expect(screen.getByRole('button', { name: /Import Elective Streams/i })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* BatchHierarchyModal                                                */
/* ------------------------------------------------------------------ */
describe('BatchHierarchyModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<BatchHierarchyModal isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('loads master data and renders tab counters', async () => {
    render(<BatchHierarchyModal isOpen onClose={vi.fn()} />);

    expect(await screen.findByText('Cohorts (2)')).toBeInTheDocument();
    expect(screen.getByText('Manage Cohorts, Batches & Curriculum')).toBeInTheDocument();
    expect(screen.getAllByText(/B50/).length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: /^Batches/ })).toBeInTheDocument();
  });

  it('filters cohorts via the search box', async () => {
    const user = userEvent.setup();
    render(<BatchHierarchyModal isOpen onClose={vi.fn()} />);

    await screen.findByText('Cohorts (2)');
    await user.type(screen.getByPlaceholderText('Filter cohorts...'), 'B51');

    expect(screen.getByText('Cohorts (1)')).toBeInTheDocument();
    expect(screen.queryByText('B50')).not.toBeInTheDocument();
    expect(screen.getByText('B51')).toBeInTheDocument();
  });

  it('requires a cohort code before creating', async () => {
    const user = userEvent.setup();
    render(<BatchHierarchyModal isOpen onClose={vi.fn()} />);

    await screen.findByText('Cohorts (2)');
    // Type a whitespace-only code: the native `required` check passes but the
    // component's own trimmed validation should reject it.
    await user.type(screen.getByPlaceholderText('e.g. B50, B51'), ' ');
    await user.click(screen.getByRole('button', { name: /Add Cohort/i }));

    expect(screen.getByText(/Cohort code is required/)).toBeInTheDocument();
    expect(usersService.createCohort).not.toHaveBeenCalled();
  });

  it('creates a cohort with a normalized payload', async () => {
    const user = userEvent.setup();
    const onHierarchyUpdated = vi.fn();
    render(<BatchHierarchyModal isOpen onClose={vi.fn()} onHierarchyUpdated={onHierarchyUpdated} />);

    await screen.findByText('Cohorts (2)');
    await user.type(screen.getByPlaceholderText('e.g. B50, B51'), 'b52');
    await user.click(screen.getByRole('button', { name: /Add Cohort/i }));

    await waitFor(() => expect(usersService.createCohort).toHaveBeenCalledTimes(1));
    expect(usersService.createCohort).toHaveBeenCalledWith({
      code: 'B52',
      name: 'TCS Ignite B52',
      start_date: null,
      end_date: null,
      is_active: true,
    });
  });

  it('switches to the batches tab and lists rows', async () => {
    const user = userEvent.setup();
    render(<BatchHierarchyModal isOpen onClose={vi.fn()} />);

    await screen.findByText('Cohorts (2)');
    await user.click(screen.getByRole('tab', { name: /^Batches/ }));

    expect(await screen.findByText('Batches (2)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Batch/i })).toBeInTheDocument();
  });

  it('deletes a cohort after confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<BatchHierarchyModal isOpen onClose={vi.fn()} />);

    await screen.findByText('Cohorts (2)');
    await user.click(screen.getByTitle('Delete Cohort B50'));

    await waitFor(() => expect(usersService.deleteCohort).toHaveBeenCalledWith(1));
  });

  it('does not delete when the confirmation is dismissed', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<BatchHierarchyModal isOpen onClose={vi.fn()} />);

    await screen.findByText('Cohorts (2)');
    await user.click(screen.getByTitle('Delete Cohort B50'));

    expect(usersService.deleteCohort).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* AssignmentForm                                                     */
/* ------------------------------------------------------------------ */
const completeAssignmentForm = {
  topic: 'Data Structures',
  subject: 'Linked Lists',
  start_date: '2026-12-01',
  deadline: '2026-12-05',
  message: 'Complete the exercises.',
  platform_link: '',
  recipientMode: 'All Trainees',
};

describe('AssignmentForm', () => {
  it('disables publish and preview while the form is incomplete', async () => {
    render(
      <AssignmentForm
        form={{ ...completeAssignmentForm, message: '' }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Publish assignment/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Preview/i })).toBeDisabled();
  });

  it('propagates field changes and submits a complete form', async () => {
    const user = userEvent.setup();
    const onChangeField = vi.fn();
    const onSubmit = vi.fn();

    render(
      <AssignmentForm
        form={completeAssignmentForm}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={onChangeField}
        onSubmit={onSubmit}
      />
    );

    await user.type(screen.getByPlaceholderText('e.g. Data Structures — Linked Lists'), 'X');
    expect(onChangeField).toHaveBeenCalledWith('topic', expect.stringContaining('Data Structures'));

    const publishBtn = screen.getByRole('button', { name: /Publish assignment/i });
    expect(publishBtn).not.toBeDisabled();
    await user.click(publishBtn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('switches recipient mode and renders the cohort selector', async () => {
    const user = userEvent.setup();
    const onChangeField = vi.fn();

    render(
      <AssignmentForm
        form={completeAssignmentForm}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={onChangeField}
        onSubmit={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'By cohort' }));
    expect(onChangeField).toHaveBeenCalledWith('recipientMode', 'By cohort');
  });

  it('renders cohort options and the recipient summary in cohort mode', async () => {
    render(
      <AssignmentForm
        form={{ ...completeAssignmentForm, recipientMode: 'By cohort', cohort_id: '1' }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(await screen.findByRole('option', { name: 'B50 - TCS Ignite B50' })).toBeInTheDocument();
    expect(screen.getByText('Cohort B50')).toBeInTheDocument();
  });

  it('supports Select All for batch recipients', async () => {
    const user = userEvent.setup();
    const onChangeField = vi.fn();

    render(
      <AssignmentForm
        form={{ ...completeAssignmentForm, recipientMode: 'By batch', selectedBatchIds: [] }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={onChangeField}
        onSubmit={vi.fn()}
      />
    );

    await screen.findByRole('button', { name: 'Select All' });
    await user.click(screen.getByRole('button', { name: 'Select All' }));

    expect(onChangeField).toHaveBeenCalledWith('selectedBatchIds', [10, 11]);
  });

  it('shows the empty note for elective streams when none are configured', async () => {
    usersService.getStreams.mockResolvedValue([]);

    render(
      <AssignmentForm
        form={{ ...completeAssignmentForm, recipientMode: 'By stream', selectedStreamIds: [] }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(
      await screen.findByText(/No elective streams configured/i)
    ).toBeInTheDocument();
  });

  it('toggles to a custom subject input', async () => {
    const user = userEvent.setup();
    render(
      <AssignmentForm
        form={completeAssignmentForm}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Enter Custom Subject/i }));

    expect(screen.getByPlaceholderText('e.g. Incubator Project / BizSkill')).toBeInTheDocument();
  });

  it('opens and closes the assignment preview', async () => {
    const user = userEvent.setup();
    render(
      <AssignmentForm
        form={completeAssignmentForm}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Preview/i }));
    expect(screen.getByRole('dialog', { name: /Assignment preview/i })).toBeInTheDocument();
    expect(screen.getByText('Data Structures')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Close preview/i }));
    expect(screen.queryByRole('dialog', { name: /Assignment preview/i })).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* ScheduleList                                                       */
/* ------------------------------------------------------------------ */
describe('ScheduleList', () => {
  it('shows the empty state and triggers the create action', async () => {
    const user = userEvent.setup();
    const onCreateClick = vi.fn();

    render(<ScheduleList schedules={[]} loading={false} onCreateClick={onCreateClick} />);

    expect(screen.getByText('No scheduled items yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Schedule a link/i }));
    expect(onCreateClick).toHaveBeenCalledTimes(1);
  });

  it('shows the loading state', () => {
    render(<ScheduleList schedules={[]} loading onCreateClick={vi.fn()} />);
    expect(screen.getByText('Loading schedules...')).toBeInTheDocument();
  });

  it('renders entries with target badges and safe/unsafe links', () => {
    const schedules = [
      {
        id: 1,
        title: 'Semester 5 Notes',
        onedrive_url: 'https://1drv.ms/x',
        status: 'Scheduled',
        target_type: 'COHORT',
        publish_at: '2026-11-20T10:00:00Z',
      },
      {
        id: 2,
        title: 'Lab Schedule',
        onedrive_url: 'http://insecure.example.com',
        target_type: 'BATCH',
        publish_at: '2026-11-21T09:00:00Z',
      },
    ];

    render(<ScheduleList schedules={schedules} loading={false} onCreateClick={vi.fn()} />);

    expect(screen.getByLabelText('2 schedules')).toBeInTheDocument();
    expect(screen.getByText('Semester 5 Notes')).toBeInTheDocument();
    expect(screen.getByText('Cohort Targeted')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open OneDrive link/i })).toBeInTheDocument();

    expect(screen.getByText('Lab Schedule')).toBeInTheDocument();
    expect(screen.getByText('Batch Targeted')).toBeInTheDocument();
    expect(screen.getByText('(Invalid link URL)')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* ScheduleForm (additional coverage)                                 */
/* ------------------------------------------------------------------ */
describe('ScheduleForm (additional)', () => {
  const baseForm = {
    title: 'Semester Notes',
    onedrive_url: 'https://1drv.ms/x',
    publish_date: '2026-12-01',
    publish_time: '10:00',
  };

  it('changing the target audience resets the dependent selectors', async () => {
    const user = userEvent.setup();
    const onChangeField = vi.fn();

    render(
      <ScheduleForm
        form={baseForm}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={onChangeField}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByRole('combobox'), 'COHORT');

    expect(onChangeField).toHaveBeenCalledWith('target_type', 'COHORT');
    expect(onChangeField).toHaveBeenCalledWith('target_cohort', '');
    expect(onChangeField).toHaveBeenCalledWith('target_batch', '');
    expect(onChangeField).toHaveBeenCalledWith('target_sub_batch', '');
  });

  it('renders the fetched cohort options in cohort mode', async () => {
    render(
      <ScheduleForm
        form={{ ...baseForm, target_type: 'COHORT', target_cohort: '' }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(await screen.findByRole('option', { name: 'B50 - TCS Ignite B50' })).toBeInTheDocument();
  });

  it('renders the fetched sub-batch options in sub-batch mode', async () => {
    render(
      <ScheduleForm
        form={{ ...baseForm, target_type: 'SUB_BATCH', target_sub_batch: '' }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(await screen.findByRole('option', { name: /B50-A-A1/ })).toBeInTheDocument();
  });

  it('disables Cancel when all fields are empty and enables it once populated', () => {
    const { rerender } = render(
      <ScheduleForm
        form={{ title: '', onedrive_url: '', publish_date: '', publish_time: '' }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled();

    rerender(
      <ScheduleForm
        form={baseForm}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Cancel/i })).not.toBeDisabled();
  });

  it('keeps the submit button disabled until publish date and time are provided', () => {
    render(
      <ScheduleForm
        form={{ title: 'Notes', onedrive_url: 'https://1drv.ms/x', publish_date: '', publish_time: '' }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Schedule link/i })).toBeDisabled();
  });
});
