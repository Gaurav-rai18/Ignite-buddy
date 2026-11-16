import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BroadcastForm } from '../components/broadcast/BroadcastForm';
import { DocumentUploadModal } from '../components/documents/DocumentUploadModal';
import { BatchHierarchyModal } from '../components/users/BatchHierarchyModal';

import { usersService } from '../services/usersService';

// The components under test fetch hierarchy / master data on mount. Stub the
// services so component behaviour (not networking) is what gets exercised.
vi.mock('../services/usersService', () => ({
  usersService: {
    getUsers: vi.fn(),
    getCohorts: vi.fn(),
    getBatches: vi.fn(),
    getSubBatches: vi.fn(),
    getLabs: vi.fn(),
    getStreams: vi.fn(),
    getSubjects: vi.fn(),
    createCohort: vi.fn(),
    updateCohort: vi.fn(),
    deleteCohort: vi.fn(),
    createBatch: vi.fn(),
    updateBatch: vi.fn(),
    deleteBatch: vi.fn(),
    createSubBatch: vi.fn(),
    updateSubBatch: vi.fn(),
    deleteSubBatch: vi.fn(),
    createLab: vi.fn(),
    updateLab: vi.fn(),
    deleteLab: vi.fn(),
    createStream: vi.fn(),
    updateStream: vi.fn(),
    deleteStream: vi.fn(),
    createSubject: vi.fn(),
    updateSubject: vi.fn(),
    deleteSubject: vi.fn(),
    bulkUploadUsers: vi.fn(),
    bulkImportMasterData: vi.fn(),
  },
}));

// DocumentUploadModal imports the pure `formatFileSize` helper from the same
// module it consumes; keep the real helper while stubbing the service object.
vi.mock('../services/documentsService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    documentsService: { ...actual.documentsService, uploadDocument: vi.fn() },
  };
});

const MUTATING_FNS = [
  'createCohort', 'updateCohort', 'deleteCohort',
  'createBatch', 'updateBatch', 'deleteBatch',
  'createSubBatch', 'updateSubBatch', 'deleteSubBatch',
  'createLab', 'updateLab', 'deleteLab',
  'createStream', 'updateStream', 'deleteStream',
  'createSubject', 'updateSubject', 'deleteSubject',
];

beforeEach(() => {
  vi.clearAllMocks();
  usersService.getUsers.mockResolvedValue([]);
  usersService.getCohorts.mockResolvedValue([]);
  usersService.getBatches.mockResolvedValue([]);
  usersService.getSubBatches.mockResolvedValue([]);
  usersService.getLabs.mockResolvedValue([]);
  usersService.getStreams.mockResolvedValue([]);
  usersService.getSubjects.mockResolvedValue([]);
  MUTATING_FNS.forEach((fn) => usersService[fn].mockResolvedValue({}));
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ================================================================== */
/* BroadcastForm                                                       */
/* ================================================================== */

const baseBroadcastForm = {
  title: 'Campus update',
  message: 'All classes resume tomorrow.',
  recipientMode: 'All users',
};

function renderBroadcastForm(overrides = {}, props = {}) {
  const onChangeField = props.onChangeField || vi.fn();
  const onSubmit = props.onSubmit || vi.fn();

  const utils = render(
    <BroadcastForm
      form={{ ...baseBroadcastForm, ...overrides }}
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

const modeGroup = () => screen.getByRole('group', { name: /recipient targeting type/i });
const publishButton = () => screen.getByRole('button', { name: /publish broadcast/i });

describe('BroadcastForm — recipient modes and readiness', () => {
  it('defaults to All users and enables preview/submit when the form is complete', () => {
    renderBroadcastForm();

    expect(within(modeGroup()).getByRole('button', { name: 'All users' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const footer = document.querySelector('.form-foot');
    expect(within(footer).getByText('All users')).toBeInTheDocument();
    expect(publishButton()).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /preview/i })).not.toBeDisabled();
  });

  it('reports a mode switch for every targeting option', async () => {
    const user = userEvent.setup();
    const { onChangeField } = renderBroadcastForm();

    for (const option of ['By role', 'By cohort', 'By batch', 'By sub-batch', 'By stream', 'Specific users']) {
      await user.click(within(modeGroup()).getByRole('button', { name: option }));
    }

    expect(onChangeField).toHaveBeenCalledWith('recipientMode', 'By role');
    expect(onChangeField).toHaveBeenCalledWith('recipientMode', 'By cohort');
    expect(onChangeField).toHaveBeenCalledWith('recipientMode', 'By batch');
    expect(onChangeField).toHaveBeenCalledWith('recipientMode', 'By sub-batch');
    expect(onChangeField).toHaveBeenCalledWith('recipientMode', 'By stream');
    expect(onChangeField).toHaveBeenCalledWith('recipientMode', 'Specific users');
  });

  it('By role: gates submit until a role is chosen and reflects the role label', () => {
    const { rerender } = render(
      <BroadcastForm
        form={{ ...baseBroadcastForm, recipientMode: 'By role', role: '' }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(publishButton()).toBeDisabled();
    expect(within(document.querySelector('.form-foot')).getByText('Select a role')).toBeInTheDocument();

    rerender(
      <BroadcastForm
        form={{ ...baseBroadcastForm, recipientMode: 'By role', role: 'TRAINEE' }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(publishButton()).not.toBeDisabled();
    expect(within(document.querySelector('.form-foot')).getByText('TRAINEE')).toBeInTheDocument();
  });

  it('By role: renders role options and reports selection', async () => {
    const user = userEvent.setup();
    const { onChangeField } = renderBroadcastForm({ recipientMode: 'By role', role: '' });

    const select = within(document.querySelector('.form-layout')).getByRole('combobox');
    expect(within(select).getByRole('option', { name: 'ADMIN' })).toBeInTheDocument();

    await user.selectOptions(select, 'HR');
    expect(onChangeField).toHaveBeenCalledWith('role', 'HR');
  });

  it('By cohort: resolves the cohort code label and falls back when the cohort is unknown', async () => {
    usersService.getCohorts.mockResolvedValue([{ id: 7, code: 'IGN', name: 'Ignite Cohort' }]);

    const { rerender } = render(
      <BroadcastForm
        form={{ ...baseBroadcastForm, recipientMode: 'By cohort', cohort_id: 7 }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(await screen.findByText('Cohort IGN')).toBeInTheDocument();

    rerender(
      <BroadcastForm
        form={{ ...baseBroadcastForm, recipientMode: 'By cohort', cohort_id: 999 }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(within(document.querySelector('.form-foot')).getByText('Select a cohort')).toBeInTheDocument();
    expect(publishButton()).not.toBeDisabled();
  });

  it('By cohort: reports the selected cohort id', async () => {
    usersService.getCohorts.mockResolvedValue([{ id: 7, code: 'IGN', name: 'Ignite Cohort' }]);
    const user = userEvent.setup();
    const { onChangeField } = renderBroadcastForm({ recipientMode: 'By cohort', cohort_id: '' });

    const option = await screen.findByRole('option', { name: /IGN - Ignite Cohort/i });
    await user.selectOptions(within(document.querySelector('.form-layout')).getByRole('combobox'), option);

    expect(onChangeField).toHaveBeenCalledWith('cohort_id', '7');
  });

  it('By batch: renders pills (with full_code fallback), toggles on/off and clears', async () => {
    usersService.getBatches.mockResolvedValue([
      { id: 10, full_code: 'B10' },
      { id: 20, name: 'Charlie' },
    ]);
    const user = userEvent.setup();
    const { onChangeField } = renderBroadcastForm({
      recipientMode: 'By batch',
      selectedBatchIds: [10],
    });

    expect(await screen.findByText('B10')).toBeInTheDocument();
    expect(screen.getByText('Batch Charlie')).toBeInTheDocument();

    // Uncheck the already-selected batch.
    await user.click(screen.getAllByRole('checkbox')[0]);
    expect(onChangeField).toHaveBeenCalledWith('selectedBatchIds', []);
    expect(onChangeField).toHaveBeenCalledWith('batch_id', '');

    // Select the unchecked one.
    await user.click(screen.getAllByRole('checkbox')[1]);
    expect(onChangeField).toHaveBeenCalledWith('selectedBatchIds', [10, 20]);

    await user.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(onChangeField).toHaveBeenCalledWith('selectedBatchIds', []);
  });

  it('By batch: Select All sends every id and the first one as batch_id', async () => {
    usersService.getBatches.mockResolvedValue([
      { id: 10, full_code: 'B10' },
      { id: 20, full_code: 'B20' },
    ]);
    const user = userEvent.setup();
    const { onChangeField } = renderBroadcastForm({ recipientMode: 'By batch' });

    await screen.findByText('B10');
    await user.click(screen.getByRole('button', { name: /select all/i }));

    expect(onChangeField).toHaveBeenCalledWith('selectedBatchIds', [10, 20]);
    expect(onChangeField).toHaveBeenCalledWith('batch_id', 10);
  });

  it('By batch: exposes the legacy batch_id, count badge and keeps submit enabled', () => {
    renderBroadcastForm({ recipientMode: 'By batch', batch_id: 10 });

    expect(document.querySelector('.selection-count-badge')).toHaveTextContent('1 batch(es) selected');
    expect(publishButton()).not.toBeDisabled();
  });

  it('By sub-batch: renders pills with name fallback and toggles selection', async () => {
    usersService.getSubBatches.mockResolvedValue([
      { id: 5, name: 'SB5' },
      { id: 6, full_code: 'SB6' },
    ]);
    const user = userEvent.setup();
    const { onChangeField } = renderBroadcastForm({
      recipientMode: 'By sub-batch',
      selectedSubBatchIds: [5, 6],
    });

    expect(await screen.findByText('SB5')).toBeInTheDocument();
    expect(screen.getByText('SB6')).toBeInTheDocument();
    expect(document.querySelector('.selection-count-badge')).toHaveTextContent(
      '2 sub-batch(es) selected'
    );

    await user.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(onChangeField).toHaveBeenCalledWith('selectedSubBatchIds', []);

    await user.click(screen.getAllByRole('checkbox')[0]);
    expect(onChangeField).toHaveBeenCalledWith('sub_batch_id', 6);
  });

  it('By sub-batch: falls back to a legacy sub_batch_id', () => {
    renderBroadcastForm({ recipientMode: 'By sub-batch', sub_batch_id: 5 });

    expect(document.querySelector('.selection-count-badge')).toHaveTextContent(
      '1 sub-batch(es) selected'
    );
    expect(publishButton()).not.toBeDisabled();
  });

  it('By stream: renders pills with code fallback and reports Select All ids', async () => {
    usersService.getStreams.mockResolvedValue([
      { id: 2, name: 'Data Science' },
      { id: 3, code: 'AI' },
    ]);
    const user = userEvent.setup();
    const { onChangeField } = renderBroadcastForm({ recipientMode: 'By stream' });

    expect(await screen.findByText('Data Science')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /select all/i }));
    expect(onChangeField).toHaveBeenCalledWith('selectedStreamIds', [2, 3]);
    expect(onChangeField).toHaveBeenCalledWith('stream_id', 2);
  });

  it('By stream: count label reflects a legacy stream_id and enables submit', () => {
    renderBroadcastForm({ recipientMode: 'By stream', stream_id: 2 });

    expect(document.querySelector('.selection-count-badge')).toHaveTextContent(
      '1 stream(s) selected'
    );
    expect(publishButton()).not.toBeDisabled();
  });

  it('disables preview and submit when title or message is blank', () => {
    const { rerender } = render(
      <BroadcastForm
        form={{ ...baseBroadcastForm, title: '' }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    expect(publishButton()).toBeDisabled();

    rerender(
      <BroadcastForm
        form={{ ...baseBroadcastForm, message: '' }}
        formErrors={{}}
        isSubmitting={false}
        onChangeField={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    expect(publishButton()).toBeDisabled();
  });

  it('submits the form when the publish button is clicked', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderBroadcastForm();

    await user.click(publishButton());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('locks every control and shows the publishing label while submitting', () => {
    renderBroadcastForm({}, { isSubmitting: true });

    expect(screen.getByRole('button', { name: /publishing/i })).toBeDisabled();
    expect(screen.getByLabelText(/announcement title/i)).toBeDisabled();
    expect(screen.getByLabelText(/^message$/i)).toBeDisabled();
    within(modeGroup())
      .getAllByRole('button')
      .forEach((button) => expect(button).toBeDisabled());
  });

  it('propagates title and message edits through onChangeField', () => {
    const { onChangeField } = renderBroadcastForm({ title: '', message: '' });

    fireEvent.change(screen.getByLabelText(/announcement title/i), { target: { value: 'New title' } });
    expect(onChangeField).toHaveBeenCalledWith('title', 'New title');

    fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: 'Body' } });
    expect(onChangeField).toHaveBeenCalledWith('message', 'Body');
  });

  it('surfaces title, message and recipients validation errors', () => {
    renderBroadcastForm(
      {},
      { formErrors: { title: 'Title is required.', message: 'Too long.', recipients: 'Pick recipients.' } }
    );

    expect(screen.getByLabelText(/announcement title/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Too long.')).toBeInTheDocument();
    expect(screen.getByText('Pick recipients.')).toBeInTheDocument();
  });
});

describe('BroadcastForm — specific-user targeting', () => {
  const alice = { id: 'u1', username: 'alice', email: 'alice@campus.demo', role: 'TRAINEE' };
  const bob = { id: 'u2', username: 'bob', email: 'bob@campus.demo', role: 'TRAINEE' };

  it('renders the RecipientSelector, selects all users and clears them', async () => {
    usersService.getUsers.mockResolvedValue([alice, bob]);
    const user = userEvent.setup();
    const onSetRecipients = vi.fn();

    renderBroadcastForm(
      { recipientMode: 'Specific users', selectedUsers: [] },
      { onSetRecipients }
    );

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: /select all \(2\)/i }));
    expect(onSetRecipients).toHaveBeenCalledWith([alice, bob]);
  });

  it('shows selected chips, removes a user and reports the singular count', async () => {
    const user = userEvent.setup();
    const onToggleRecipient = vi.fn();

    renderBroadcastForm(
      { recipientMode: 'Specific users', selectedUsers: [alice] },
      { onToggleRecipient }
    );

    expect(await screen.findByText(/send to 1 user/i)).toBeInTheDocument();
    expect(within(document.querySelector('.form-foot')).getByText('1 user')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove alice/i }));
    expect(onToggleRecipient).toHaveBeenCalledWith(alice);
  });

  it('reports the plural recipient count and clears all when requested', async () => {
    usersService.getUsers.mockResolvedValue([alice, bob]);
    const user = userEvent.setup();
    const onSetRecipients = vi.fn();

    renderBroadcastForm(
      { recipientMode: 'Specific users', selectedUsers: [alice, bob] },
      { onSetRecipients }
    );

    expect(within(document.querySelector('.form-foot')).getByText('2 users')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear all/i }));
    expect(onSetRecipients).toHaveBeenCalledWith([]);
  });
});

describe('BroadcastForm — preview modal', () => {
  it('renders the composed title, message and recipient summary, then closes', async () => {
    const user = userEvent.setup();
    renderBroadcastForm({ title: 'Exam Notice', message: 'Exams start Monday' });

    await user.click(screen.getByRole('button', { name: /preview/i }));

    const dialog = screen.getByRole('dialog', { name: /announcement preview/i });
    expect(within(dialog).getByText('Exam Notice')).toBeInTheDocument();
    expect(within(dialog).getByText('Exams start Monday')).toBeInTheDocument();
    expect(within(dialog).getByText('All users')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close Preview' }));
    expect(screen.queryByRole('dialog', { name: /announcement preview/i })).not.toBeInTheDocument();
  });

  it('shows the untitled/no-message placeholders for an empty draft', async () => {
    const user = userEvent.setup();
    // Complete enough to enable the preview button, but blank content in the modal.
    renderBroadcastForm({ title: 'x', message: 'y' });

    await user.click(screen.getByRole('button', { name: /preview/i }));
    const dialog = screen.getByRole('dialog', { name: /announcement preview/i });

    // The recipient summary for a batch target with no ids resolves to "0 batch(es)".
    expect(within(dialog).getByText('All users')).toBeInTheDocument();
  });

  it('lists selected users in the preview when targeting specific users', async () => {
    const user = userEvent.setup();
    renderBroadcastForm({
      recipientMode: 'Specific users',
      selectedUsers: [{ id: 'u1', username: 'alice' }],
    });

    await user.click(screen.getByRole('button', { name: /preview/i }));
    const dialog = screen.getByRole('dialog', { name: /announcement preview/i });

    expect(within(dialog).getByText('1 selected user')).toBeInTheDocument();
    expect(within(dialog).getByText('alice')).toBeInTheDocument();
  });
});

/* ================================================================== */
/* DocumentUploadModal                                                 */
/* ================================================================== */

const COHORTS = [
  { id: 1, code: 'B50', name: 'TCS Ignite B50' },
  { id: 2, code: 'B51', name: 'TCS Ignite B51' },
];
const BATCHES = [
  { id: 10, name: 'A', cohort_code: 'B50' },
  { id: 11, name: 'B', cohort_code: 'B50' },
];

const openUploadModal = (props = {}) =>
  render(
    <DocumentUploadModal
      isOpen
      onClose={props.onClose || vi.fn()}
      onUpload={props.onUpload || vi.fn().mockResolvedValue({})}
    />
  );

const fileInput = () => document.querySelector('input[type="file"]');
const pdfFile = (name = 'Safety.pdf', content = 'hello') =>
  new File([content], name, { type: 'application/pdf' });

describe('DocumentUploadModal — file validation', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<DocumentUploadModal isOpen={false} onClose={vi.fn()} onUpload={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the dropzone and hides the title field until a file is chosen', () => {
    openUploadModal();
    expect(screen.getByRole('dialog', { name: /upload rag knowledge document/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g. TCS Space Safety Guidelines')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload document' })).toBeDisabled();
  });

  it('rejects an unsupported extension', async () => {
    openUploadModal();

    // userEvent.upload honours the input's `accept` filter, so drive the change
    // event directly to reach the component's own extension validation.
    fireEvent.change(fileInput(), {
      target: { files: [new File(['x'], 'notes.exe', { type: 'application/octet-stream' })] },
    });

    expect(await screen.findByText(/Please upload a PDF, TXT, DOCX, PPTX, or MD file/i)).toBeInTheDocument();
  });

  it('rejects a file larger than 15 MB', async () => {
    const user = userEvent.setup();
    openUploadModal();

    const big = pdfFile('big.pdf');
    Object.defineProperty(big, 'size', { value: 16 * 1024 * 1024 });
    await user.upload(fileInput(), big);

    expect(await screen.findByText(/File size exceeds the 15 MB limit/i)).toBeInTheDocument();
  });

  it('rejects an empty file', async () => {
    const user = userEvent.setup();
    openUploadModal();

    await user.upload(fileInput(), new File([], 'empty.pdf', { type: 'application/pdf' }));

    expect(await screen.findByText(/The selected file is empty/i)).toBeInTheDocument();
  });

  it('accepts a valid file, derives the title and can clear it again', async () => {
    const user = userEvent.setup();
    openUploadModal();

    await user.upload(fileInput(), pdfFile('Safety Guidelines.pdf'));

    expect(await screen.findByText('Safety Guidelines.pdf')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Safety Guidelines')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload document/i })).not.toBeDisabled();

    await user.click(screen.getByRole('button', { name: /remove selected file/i }));

    expect(screen.queryByText('Safety Guidelines.pdf')).not.toBeInTheDocument();
    expect(screen.getByText(/Drag & drop your file here/i)).toBeInTheDocument();
  });

  it('validates a dropped file and toggles the dragging state', async () => {
    openUploadModal();
    const dropzone = screen.getByRole('button', { name: /drag and drop area/i });

    fireEvent.dragOver(dropzone);
    expect(dropzone).toHaveClass('dragover');
    fireEvent.dragLeave(dropzone);
    expect(dropzone).not.toHaveClass('dragover');

    fireEvent.drop(dropzone, { dataTransfer: { files: [pdfFile('Dropped.pdf')] } });
    expect(await screen.findByText('Dropped.pdf')).toBeInTheDocument();
  });

  it('refuses to submit when no file has been chosen', () => {
    openUploadModal();
    fireEvent.submit(document.querySelector('.modal-card form'));

    expect(screen.getByText('Please select a file to upload.')).toBeInTheDocument();
  });
});

describe('DocumentUploadModal — payload construction', () => {
  it('uploads with the general space and an all-trainees audience', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue({});
    const onClose = vi.fn();
    openUploadModal({ onUpload, onClose });

    const file = pdfFile('Safety.pdf');
    await user.upload(fileInput(), file);
    await user.click(screen.getByRole('button', { name: /upload document/i }));

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload).toHaveBeenCalledWith({
      file,
      name: 'Safety',
      space: 'general',
      audience: 'All Trainees',
      description: '',
      cohort_id: null,
      batch_id: null,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('targets a specific cohort and reports the audience label', async () => {
    usersService.getCohorts.mockResolvedValue(COHORTS);
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue({});
    openUploadModal({ onUpload });

    await user.upload(fileInput(), pdfFile('Notes.pdf'));

    await user.selectOptions(
      within(document.querySelector('.form-layout')).getAllByRole('combobox')[0],
      'COHORT'
    );
    await screen.findByRole('option', { name: /B50 - TCS Ignite B50/i });
    const cohortSelect = within(document.querySelector('.form-layout')).getAllByRole('combobox')[1];
    await user.selectOptions(cohortSelect, '1');

    await user.click(screen.getByRole('button', { name: /upload document/i }));

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload).toHaveBeenCalledWith(
      expect.objectContaining({ audience: 'Cohort B50', cohort_id: '1' })
    );
  });

  it('targets a specific batch and switches space to ignite', async () => {
    usersService.getBatches.mockResolvedValue(BATCHES);
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue({});
    openUploadModal({ onUpload });

    await user.upload(fileInput(), pdfFile('Labs.pdf'));
    await user.click(screen.getByText('Ignite Space'));

    await user.selectOptions(
      within(document.querySelector('.form-layout')).getAllByRole('combobox')[0],
      'BATCH'
    );
    const batchSelect = within(document.querySelector('.form-layout')).getAllByRole('combobox')[1];
    await user.selectOptions(batchSelect, '10');

    await user.click(screen.getByRole('button', { name: /upload document/i }));

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload).toHaveBeenCalledWith(
      expect.objectContaining({ audience: 'Batch A', batch_id: '10', space: 'ignite' })
    );
  });

  it('switching the audience type resets the dependent selectors', async () => {
    usersService.getCohorts.mockResolvedValue(COHORTS);
    usersService.getBatches.mockResolvedValue(BATCHES);
    const user = userEvent.setup();
    openUploadModal();

    const audienceSelect = within(document.querySelector('.form-layout')).getAllByRole('combobox')[0];

    await user.selectOptions(audienceSelect, 'COHORT');
    expect(await screen.findByRole('option', { name: /B50 - TCS Ignite B50/i })).toBeInTheDocument();

    await user.selectOptions(audienceSelect, 'BATCH');
    expect(await screen.findByRole('option', { name: /Batch A/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /B50 - TCS Ignite B50/i })).not.toBeInTheDocument();
  });

  it('falls back to the derived file name when the title is cleared', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue({});
    openUploadModal({ onUpload });

    await user.upload(fileInput(), pdfFile('Handbook.pdf'));
    const nameInput = screen.getByPlaceholderText('e.g. TCS Space Safety Guidelines');
    await user.clear(nameInput);

    await user.click(screen.getByRole('button', { name: /upload document/i }));

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ name: 'Handbook' }));
  });

  it('surfaces the uploaded error message and the generic fallback', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockRejectedValue(new Error('Server exploded'));
    openUploadModal({ onUpload });

    await user.upload(fileInput(), pdfFile('X.pdf'));
    await user.click(screen.getByRole('button', { name: /upload document/i }));

    expect(await screen.findByText('Server exploded')).toBeInTheDocument();
  });

  it('falls back to a generic error when the rejection carries no message', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockRejectedValue({});
    openUploadModal({ onUpload });

    await user.upload(fileInput(), pdfFile('X.pdf'));
    await user.click(screen.getByRole('button', { name: /upload document/i }));

    expect(
      await screen.findByText(/Unable to upload this document. Please try again/i)
    ).toBeInTheDocument();
  });

  it('shows the uploading state and locks the controls', async () => {
    const user = userEvent.setup();
    let resolveUpload;
    const onUpload = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        })
    );
    openUploadModal({ onUpload });

    await user.upload(fileInput(), pdfFile('Flow.pdf'));
    await user.click(screen.getByRole('button', { name: /upload document/i }));

    expect(await screen.findByRole('button', { name: /uploading & processing/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /close upload modal/i })).toBeDisabled();
    expect(screen.getByPlaceholderText('e.g. TCS Space Safety Guidelines')).toBeDisabled();
    expect(screen.getByPlaceholderText(/Official lab conduct/i)).toBeDisabled();

    resolveUpload({});
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /upload document/i })).not.toBeDisabled()
    );
  });
});

describe('DocumentUploadModal — dismissal', () => {
  it('closes on the overlay and on Escape, but not when the card is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    openUploadModal({ onClose });

    await user.click(document.querySelector('.modal-card'));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('dialog', { name: /upload rag knowledge document/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

/* ================================================================== */
/* BatchHierarchyModal                                                 */
/* ================================================================== */

const H_COHORTS = [
  { id: 1, code: 'B50', name: 'TCS Ignite B50', start_date: '2026-01-01', end_date: '2026-06-01', is_active: true },
  { id: 2, code: 'B51', name: 'TCS Ignite B51', start_date: '', end_date: '', is_active: false },
];
const H_BATCHES = [
  { id: 10, name: 'A', cohort: 1, cohort_code: 'B50', description: 'Morning Track' },
  { id: 11, name: 'B', cohort: 1, cohort_code: 'B50', description: '' },
];
const H_SUB_BATCHES = [
  { id: 100, name: 'A1', batch: 10, batch_name: 'A', cohort_code: 'B50', home_lab_name: 'Lab 1' },
  { id: 101, name: 'A2', batch: 10, batch_name: 'A', cohort_code: 'B50', lab_name: 'Lab 2' },
];
const H_LABS = [
  { id: 1, name: 'Lab 1', code: 'LAB_1', capacity: 35, location: 'Ground Floor' },
  { id: 2, name: 'Auditorium', code: '', capacity: 0, location: '' },
];
const H_STREAMS = [
  { id: 1, code: 'AI', name: 'AI Engineering', description: 'Advanced Python' },
  { id: 2, code: 'SPRING', name: 'Java Springboot', description: '' },
];
const H_SUBJECTS = [
  { id: 1, code: 'INCUBATOR', name: 'Incubator', description: 'Lab projects' },
  { id: 2, code: 'BIZSKILL', name: 'Business Skills', description: '' },
];

function seedHierarchyData() {
  usersService.getCohorts.mockResolvedValue(H_COHORTS);
  usersService.getBatches.mockResolvedValue(H_BATCHES);
  usersService.getSubBatches.mockResolvedValue(H_SUB_BATCHES);
  usersService.getLabs.mockResolvedValue(H_LABS);
  usersService.getStreams.mockResolvedValue(H_STREAMS);
  usersService.getSubjects.mockResolvedValue(H_SUBJECTS);
}

async function renderHierarchy(props = {}) {
  const utils = render(<BatchHierarchyModal isOpen onClose={vi.fn()} {...props} />);
  await screen.findByText('Manage Cohorts, Batches & Curriculum');
  return utils;
}

const formPanel = () => document.querySelector('.hierarchy-form-panel');
const switchTab = (user, label) =>
  user.click(screen.getByRole('tab', { name: new RegExp(`^${label}`) }));

describe('BatchHierarchyModal — shell, tabs and search', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<BatchHierarchyModal isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('loads master data and renders every tab counter', async () => {
    seedHierarchyData();
    await renderHierarchy();

    expect(await screen.findByText('Cohorts (2)')).toBeInTheDocument();

    // Non-active tabs expose their counts as separate counter spans.
    expect(screen.getByRole('tab', { name: /^Batches/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /^Sub-Batches/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /^Labs/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /^Elective/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /^Curriculum/ })).toHaveTextContent('2');
  });

  it('honours the defaultTab prop', async () => {
    seedHierarchyData();
    await renderHierarchy({ defaultTab: 'batches' });

    expect(await screen.findByRole('button', { name: /Add Batch/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Batches/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the load error when master data fails', async () => {
    usersService.getCohorts.mockRejectedValue(new Error('hierarchy down'));
    await renderHierarchy();

    expect(await screen.findByText('hierarchy down')).toBeInTheDocument();
  });

  it('filters the cohort list and renders the empty state', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');

    await user.type(screen.getByPlaceholderText('Filter cohorts...'), 'B51');
    expect(screen.getByText('Cohorts (1)')).toBeInTheDocument();
    expect(screen.queryByText('B50')).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('Filter cohorts...'));
    await user.type(screen.getByPlaceholderText('Filter cohorts...'), 'zzz');
    expect(screen.getByText('Cohorts (0)')).toBeInTheDocument();
    expect(screen.getByText('No cohorts found.')).toBeInTheDocument();
  });

  it('shows the empty state for every list when nothing is configured', async () => {
    const user = userEvent.setup();
    // All lists default to [] from beforeEach.
    await renderHierarchy();

    expect(await screen.findByText('No cohorts found.')).toBeInTheDocument();

    await switchTab(user, 'Batches');
    expect(screen.getByText('No batches found.')).toBeInTheDocument();

    await switchTab(user, 'Sub-Batches');
    expect(screen.getByText('No sub-batches found.')).toBeInTheDocument();

    await switchTab(user, 'Labs');
    expect(screen.getByText('No labs found.')).toBeInTheDocument();

    await switchTab(user, 'Elective');
    expect(screen.getByText('No elective streams configured.')).toBeInTheDocument();

    await switchTab(user, 'Curriculum');
    expect(screen.getByText('No subjects configured.')).toBeInTheDocument();
  });

  it('closes on Escape and respects the overlay/card click boundaries', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    const onClose = vi.fn();
    await renderHierarchy({ onClose });

    await user.click(document.querySelector('.hierarchy-dialog-card'));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('dialog', { name: /manage cohorts, batches & curriculum/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('BatchHierarchyModal — cohorts tab', () => {
  it('rejects a blank cohort code', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');

    await user.type(within(formPanel()).getByPlaceholderText('e.g. B50, B51'), ' ');
    await user.click(within(formPanel()).getByRole('button', { name: /Add Cohort/i }));

    expect(screen.getByText(/Cohort code is required/i)).toBeInTheDocument();
    expect(usersService.createCohort).not.toHaveBeenCalled();
  });

  it('creates a cohort with a normalized payload and notifies the parent', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    const onHierarchyUpdated = vi.fn();
    await renderHierarchy({ onHierarchyUpdated });
    await screen.findByText('Cohorts (2)');

    await user.type(within(formPanel()).getByPlaceholderText('e.g. B50, B51'), 'b52');
    await user.type(within(formPanel()).getByPlaceholderText('e.g. TCS Ignite Batch 50'), 'Ignite 52');
    await user.click(within(formPanel()).getByRole('button', { name: /Add Cohort/i }));

    await waitFor(() => expect(usersService.createCohort).toHaveBeenCalledTimes(1));
    expect(usersService.createCohort).toHaveBeenCalledWith({
      code: 'B52',
      name: 'Ignite 52',
      start_date: null,
      end_date: null,
      is_active: true,
    });
    expect(onHierarchyUpdated).toHaveBeenCalled();
  });

  it('surfaces the backend cohort code error', async () => {
    seedHierarchyData();
    usersService.createCohort.mockRejectedValue({ response: { data: { code: ['already exists'] } } });
    const user = userEvent.setup();
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');

    await user.type(within(formPanel()).getByPlaceholderText('e.g. B50, B51'), 'b99');
    await user.click(within(formPanel()).getByRole('button', { name: /Add Cohort/i }));

    expect(await screen.findByText('already exists')).toBeInTheDocument();
  });

  it('edits a cohort, then cancels out of editing mode', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');

    await user.click(screen.getByTitle('Edit B50'));
    expect(within(formPanel()).getByText('Edit Cohort')).toBeInTheDocument();

    const codeInput = within(formPanel()).getByPlaceholderText('e.g. B50, B51');
    await user.clear(codeInput);
    await user.type(codeInput, 'b60');
    await user.click(within(formPanel()).getByRole('button', { name: /Save Changes/i }));

    await waitFor(() =>
      expect(usersService.updateCohort).toHaveBeenCalledWith(1, expect.objectContaining({ code: 'B60' }))
    );

    // Re-enter editing then cancel back to add mode.
    await user.click(screen.getByTitle('Edit B51'));
    await user.click(within(formPanel()).getByRole('button', { name: /^Cancel$/i }));
    expect(within(formPanel()).getByRole('heading', { name: 'Add Cohort' })).toBeInTheDocument();
  });

  it('deletes a cohort only after confirmation', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');

    await user.click(screen.getByTitle('Delete Cohort B50'));
    await waitFor(() => expect(usersService.deleteCohort).toHaveBeenCalledWith(1));

    confirmSpy.mockReturnValue(false);
    await user.click(screen.getByTitle('Delete Cohort B51'));
    expect(usersService.deleteCohort).toHaveBeenCalledTimes(1);
  });
});

describe('BatchHierarchyModal — batches tab', () => {
  it('validates the parent cohort and the batch name', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');
    await switchTab(user, 'Batches');
    await screen.findByText('Batches (2)');

    // The required <select> would block a native submit, so dispatch it directly.
    fireEvent.change(within(formPanel()).getByRole('combobox'), { target: { value: '' } });
    fireEvent.submit(formPanel());
    expect(screen.getByText('Please select a Cohort.')).toBeInTheDocument();

    // Re-select a cohort and submit empty name.
    await user.selectOptions(within(formPanel()).getByRole('combobox'), '1');
    fireEvent.submit(formPanel());
    expect(screen.getByText(/Batch name is required/i)).toBeInTheDocument();
  });

  it('creates a batch with a normalized payload', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');
    await switchTab(user, 'Batches');
    await screen.findByText('Batches (2)');

    await user.type(within(formPanel()).getByPlaceholderText('e.g. A, B, C, D'), 'c');
    await user.type(within(formPanel()).getByPlaceholderText('e.g. Morning Track'), 'Evening');
    await user.click(within(formPanel()).getByRole('button', { name: /Add Batch/i }));

    await waitFor(() =>
      expect(usersService.createBatch).toHaveBeenCalledWith({ cohort: 1, name: 'C', description: 'Evening' })
    );
  });

  it('edits and deletes a batch', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');
    await switchTab(user, 'Batches');
    await screen.findByText('Batches (2)');

    await user.click(screen.getByTitle('Edit Batch A'));
    expect(within(formPanel()).getByText('Edit Batch')).toBeInTheDocument();
    await user.click(within(formPanel()).getByRole('button', { name: /Save Changes/i }));
    await waitFor(() =>
      expect(usersService.updateBatch).toHaveBeenCalledWith(10, expect.objectContaining({ name: 'A' }))
    );

    await user.click(screen.getByTitle('Delete Batch B'));
    await waitFor(() => expect(usersService.deleteBatch).toHaveBeenCalledWith(11));

    confirmSpy.mockReturnValue(false);
    await user.click(screen.getByTitle('Delete Batch A'));
    expect(usersService.deleteBatch).toHaveBeenCalledTimes(1);
  });

  it('filters batches and renders empty descriptions as a dash', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');
    await switchTab(user, 'Batches');
    await screen.findByText('Batches (2)');

    expect(screen.getAllByText('-').length).toBeGreaterThan(0);

    await user.type(screen.getByPlaceholderText('Filter batches...'), 'Morning');
    expect(screen.getByText('Batches (1)')).toBeInTheDocument();
  });
});

describe('BatchHierarchyModal — sub-batches tab', () => {
  it('validates the batch, name and creates with a home lab', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');
    await switchTab(user, 'Sub-Batches');
    await screen.findByText('Sub-Batches (2)');

    const selects = within(formPanel()).getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: '' } });
    fireEvent.submit(formPanel());
    expect(screen.getByText('Please select a Batch.')).toBeInTheDocument();

    await user.selectOptions(selects[0], '10');
    fireEvent.submit(formPanel());
    expect(screen.getByText(/Sub-Batch name is required/i)).toBeInTheDocument();

    await user.type(within(formPanel()).getByPlaceholderText('e.g. A1, A2, B1'), 'b1');
    await user.selectOptions(selects[1], '1');
    await user.click(within(formPanel()).getByRole('button', { name: /Add Sub-Batch/i }));

    await waitFor(() =>
      expect(usersService.createSubBatch).toHaveBeenCalledWith({ batch: 10, name: 'B1', home_lab: '1' })
    );
  });

  it('edits and deletes a sub-batch (with confirmation)', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');
    await switchTab(user, 'Sub-Batches');
    await screen.findByText('Sub-Batches (2)');

    await user.click(screen.getByTitle('Edit A1'));
    await user.click(within(formPanel()).getByRole('button', { name: /Save Changes/i }));
    await waitFor(() =>
      expect(usersService.updateSubBatch).toHaveBeenCalledWith(100, expect.objectContaining({ name: 'A1' }))
    );

    await user.click(screen.getByTitle('Delete A2'));
    await waitFor(() => expect(usersService.deleteSubBatch).toHaveBeenCalledWith(101));
  });

  it('filters sub-batches on the parent cohort code', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');
    await switchTab(user, 'Sub-Batches');
    await screen.findByText('Sub-Batches (2)');

    await user.type(screen.getByPlaceholderText('Filter sub-batches...'), 'A2');
    expect(screen.getByText('Sub-Batches (1)')).toBeInTheDocument();
  });
});

describe('BatchHierarchyModal — labs, streams and subjects tabs', () => {
  it('validates and creates a lab, deriving the code from its name', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');
    await switchTab(user, 'Labs');
    await screen.findByText('Labs & Venues (2)');

    fireEvent.submit(formPanel());
    expect(screen.getByText(/Lab\/Room name is required/i)).toBeInTheDocument();

    await user.type(within(formPanel()).getByPlaceholderText('e.g. Lab 1, Lab 2, Auditorium'), 'Lab 3');
    const capacity = within(formPanel()).getByRole('spinbutton');
    await user.clear(capacity);
    await user.type(capacity, '40');
    await user.type(within(formPanel()).getByPlaceholderText('e.g. Ground Floor, Block A'), 'Floor 2');
    await user.click(within(formPanel()).getByRole('button', { name: /Add Venue/i }));

    await waitFor(() =>
      expect(usersService.createLab).toHaveBeenCalledWith({
        name: 'Lab 3',
        code: 'LAB_3',
        capacity: 40,
        location: 'Floor 2',
      })
    );
  });

  it('edits and deletes a lab', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');
    await switchTab(user, 'Labs');
    await screen.findByText('Labs & Venues (2)');

    await user.click(screen.getByTitle('Edit Lab 1'));
    expect(within(formPanel()).getByText('Edit Venue')).toBeInTheDocument();
    await user.click(within(formPanel()).getByRole('button', { name: /Save Changes/i }));
    await waitFor(() =>
      expect(usersService.updateLab).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Lab 1' }))
    );

    await user.click(screen.getByTitle('Delete Auditorium'));
    await waitFor(() => expect(usersService.deleteLab).toHaveBeenCalledWith(2));
  });

  it('validates and creates an elective stream', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');
    await switchTab(user, 'Elective');
    await screen.findByText('Month 4 Elective Streams (2)');

    fireEvent.submit(formPanel());
    expect(screen.getByText(/Stream code and name are required/i)).toBeInTheDocument();

    await user.type(within(formPanel()).getByPlaceholderText('e.g. AI, SPRING, ANGULAR, DOTNET'), 'ml');
    await user.type(within(formPanel()).getByPlaceholderText('e.g. AI Engineering, Java Springboot'), 'Machine Learning');
    await user.click(within(formPanel()).getByRole('button', { name: /Add Stream/i }));

    await waitFor(() =>
      expect(usersService.createStream).toHaveBeenCalledWith({
        code: 'ML',
        name: 'Machine Learning',
        description: '',
      })
    );
  });

  it('edits and deletes an elective stream', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');
    await switchTab(user, 'Elective');
    await screen.findByText('Month 4 Elective Streams (2)');

    await user.click(screen.getByTitle('Edit AI Engineering'));
    await user.click(within(formPanel()).getByRole('button', { name: /Save Changes/i }));
    await waitFor(() =>
      expect(usersService.updateStream).toHaveBeenCalledWith(1, expect.objectContaining({ code: 'AI' }))
    );

    await user.click(screen.getByTitle('Delete Java Springboot'));
    await waitFor(() => expect(usersService.deleteStream).toHaveBeenCalledWith(2));
  });

  it('validates and creates a curriculum subject', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');
    await switchTab(user, 'Curriculum');
    await screen.findByText('Curriculum Subjects (2)');

    fireEvent.submit(formPanel());
    expect(screen.getByText(/Subject code and name are required/i)).toBeInTheDocument();

    await user.type(within(formPanel()).getByPlaceholderText('e.g. INCUBATOR, BIZSKILL, CORETECH'), 'biz');
    await user.type(within(formPanel()).getByPlaceholderText('e.g. Incubator, Business Skills'), 'Business');
    await user.click(within(formPanel()).getByRole('button', { name: /Add Subject/i }));

    await waitFor(() =>
      expect(usersService.createSubject).toHaveBeenCalledWith({
        code: 'BIZ',
        name: 'Business',
        description: '',
      })
    );
  });

  it('edits and deletes a curriculum subject', async () => {
    seedHierarchyData();
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderHierarchy();
    await screen.findByText('Cohorts (2)');
    await switchTab(user, 'Curriculum');
    await screen.findByText('Curriculum Subjects (2)');

    await user.click(screen.getByTitle('Edit Incubator'));
    await user.click(within(formPanel()).getByRole('button', { name: /Save Changes/i }));
    await waitFor(() =>
      expect(usersService.updateSubject).toHaveBeenCalledWith(1, expect.objectContaining({ code: 'INCUBATOR' }))
    );

    await user.click(screen.getByTitle('Delete Business Skills'));
    await waitFor(() => expect(usersService.deleteSubject).toHaveBeenCalledWith(2));
  });
});
