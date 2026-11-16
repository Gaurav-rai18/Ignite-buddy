import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { DocumentList } from '../components/documents/DocumentList';
import { DeleteDocumentDialog } from '../components/documents/DeleteDocumentDialog';
import { DocumentDetailsModal } from '../components/documents/DocumentDetailsModal';
import { DocumentViewerModal } from '../components/documents/DocumentViewerModal';
import { AssignmentList } from '../components/assignment/AssignmentList';
import { AssignmentPreviewModal } from '../components/assignment/AssignmentPreviewModal';
import { BroadcastList } from '../components/broadcast/BroadcastList';
import { RecipientSelector } from '../components/broadcast/RecipientSelector';
import { HeroBanner } from '../components/dashboard/HeroBanner';
import { QuickActions } from '../components/dashboard/QuickActions';
import { RecentActivity } from '../components/dashboard/RecentActivity';
import { StatsGrid } from '../components/dashboard/StatsGrid';

import { documentsService, formatFileSize } from '../services/documentsService';
import { usersService } from '../services/usersService';

// DocumentViewerModal pulls a blob URL from documentsService. Keep the real
// module (so formatFileSize stays honest) but stub the network-ish helper.
vi.mock('../services/documentsService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    documentsService: {
      ...actual.documentsService,
      getDocumentBlobUrl: vi.fn(() => 'blob:mock-url'),
    },
  };
});

// RecipientSelector fetches users on mount. Resolve a deterministic list.
vi.mock('../services/usersService', () => ({
  usersService: {
    getUsers: vi.fn().mockResolvedValue([
      { username: 'alice', email: 'alice@campus.demo', role: 'Trainee' },
      { username: 'bob', email: 'bob@campus.demo', role: 'TA' },
    ]),
  },
}));

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderWithRouter(ui, { initialEntries = ['/'] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationDisplay />
      {ui}
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// DocumentList
// ---------------------------------------------------------------------------
describe('DocumentList', () => {
  const documents = [
    {
      id: 1,
      name: 'Student Handbook',
      description: 'Campus rules',
      space: 'ignite',
      status: 'Ready',
      chunks: 12,
      audience: 'Cohort 2026',
      uploadedAt: 'Nov 1, 2026',
      fileType: 'PDF',
      sizeFormatted: '1.2 MB',
    },
    {
      id: 2,
      name: 'Exam Guidelines',
      description: 'Exam rules',
      space: 'general',
      status: 'Processing',
      audience: '',
      uploadedAt: 'Nov 2, 2026',
      fileType: 'TXT',
      sizeFormatted: '8 KB',
    },
    {
      id: 3,
      name: 'Broken Import',
      status: 'Failed',
      uploadedAt: 'Nov 3, 2026',
      fileType: 'PDF',
      sizeFormatted: '0 B',
    },
  ];

  it('shows a loading message while fetching with no documents yet', () => {
    render(<DocumentList documents={[]} loading onOpenUpload={vi.fn()} />);
    expect(screen.getByText('Loading documents...')).toBeInTheDocument();
  });

  it('renders the empty state and triggers upload action', async () => {
    const user = userEvent.setup();
    const handleOpenUpload = vi.fn();
    render(<DocumentList documents={[]} onOpenUpload={handleOpenUpload} />);

    expect(screen.getByText('No documents yet')).toBeInTheDocument();
    const uploadBtn = screen.getByRole('button', { name: /upload document/i });
    await user.click(uploadBtn);
    expect(handleOpenUpload).toHaveBeenCalledTimes(1);
  });

  it('renders one card per document with space, status and file metadata', () => {
    render(<DocumentList documents={documents} onViewDetails={vi.fn()} onViewDocument={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('Student Handbook')).toBeInTheDocument();
    expect(screen.getByText('Exam Guidelines')).toBeInTheDocument();
    expect(screen.getByText('Broken Import')).toBeInTheDocument();

    // Space badges
    expect(screen.getByText('Ignite Space')).toBeInTheDocument();
    expect(screen.getAllByText('General Space').length).toBeGreaterThanOrEqual(1);

    // Status-driven tags
    expect(screen.getByText('12 RAG Chunks')).toBeInTheDocument();
    expect(screen.getByText('Processing text...')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();

    // File format + size pill
    expect(screen.getByText('PDF • 1.2 MB')).toBeInTheDocument();
  });

  it('falls back to a default audience when none is provided', () => {
    render(<DocumentList documents={documents} onViewDetails={vi.fn()} onViewDocument={vi.fn()} onDelete={vi.fn()} />);
    // Chapter 2 & 3 have no audience -> "All students"
    expect(screen.getAllByText('All students').length).toBeGreaterThanOrEqual(1);
  });

  it('invokes onViewDetails and onViewDocument with the clicked document', async () => {
    const user = userEvent.setup();
    const handleViewDetails = vi.fn();
    const handleViewDocument = vi.fn();
    render(
      <DocumentList
        documents={documents}
        onViewDetails={handleViewDetails}
        onViewDocument={handleViewDocument}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getAllByRole('button', { name: /view details/i })[0]);
    expect(handleViewDetails).toHaveBeenCalledWith(documents[0]);

    await user.click(screen.getAllByRole('button', { name: /view document/i })[1]);
    expect(handleViewDocument).toHaveBeenCalledWith(documents[1]);
  });

  it('invokes onDelete when the delete icon button is clicked', async () => {
    const user = userEvent.setup();
    const handleDelete = vi.fn();
    render(<DocumentList documents={documents} onViewDetails={vi.fn()} onViewDocument={vi.fn()} onDelete={handleDelete} />);

    await user.click(screen.getByRole('button', { name: 'Delete Student Handbook' }));
    expect(handleDelete).toHaveBeenCalledWith(documents[0]);
  });
});

// ---------------------------------------------------------------------------
// DeleteDocumentDialog
// ---------------------------------------------------------------------------
describe('DeleteDocumentDialog', () => {
  const doc = { id: 42, name: 'Annual Report', fileName: 'annual-report.pdf' };

  it('renders nothing when closed or without a document', () => {
    const { container: closed } = render(
      <DeleteDocumentDialog isOpen={false} onClose={vi.fn()} onConfirm={vi.fn()} document={doc} />
    );
    expect(closed.firstChild).toBeNull();

    const { container: noDoc } = render(
      <DeleteDocumentDialog isOpen onClose={vi.fn()} onConfirm={vi.fn()} document={null} />
    );
    expect(noDoc.firstChild).toBeNull();
  });

  it('shows the file name and confirms with the document id', async () => {
    const user = userEvent.setup();
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();
    render(<DeleteDocumentDialog isOpen onClose={handleClose} onConfirm={handleConfirm} document={doc} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('annual-report.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^delete document$/i }));
    expect(handleConfirm).toHaveBeenCalledWith(42);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('falls back to the document name when no fileName is present', () => {
    render(<DeleteDocumentDialog isOpen onClose={vi.fn()} onConfirm={vi.fn()} document={{ id: 1, name: 'NoFile.pdf' }} />);
    expect(screen.getByText('NoFile.pdf')).toBeInTheDocument();
  });

  it('closes on Cancel, on the close button and on Escape', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<DeleteDocumentDialog isOpen onClose={handleClose} onConfirm={vi.fn()} document={doc} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /close delete dialog/i }));
    expect(handleClose).toHaveBeenCalledTimes(2);

    await user.keyboard('{Escape}');
    expect(handleClose).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// DocumentDetailsModal
// ---------------------------------------------------------------------------
describe('DocumentDetailsModal', () => {
  const doc = {
    id: 'kb-7',
    name: 'Physics Notes',
    description: 'Chapter 1',
    fileName: 'physics.pdf',
    fileType: 'PDF',
    sizeFormatted: '900 KB',
    uploadedAt: 'Nov 4, 2026',
    space: 'ignite',
    status: 'Ready for RAG',
    chunks: 7,
    vectorStore: 'Pinecone',
  };

  it('renders nothing when closed', () => {
    const { container } = render(<DocumentDetailsModal isOpen={false} onClose={vi.fn()} document={doc} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the RAG lifecycle details for a ready document', () => {
    render(<DocumentDetailsModal isOpen onClose={vi.fn()} document={doc} />);

    expect(screen.getByText('Document & RAG Details')).toBeInTheDocument();
    expect(screen.getByText('Physics Notes')).toBeInTheDocument();
    expect(screen.getByText('Chapter 1')).toBeInTheDocument();
    expect(screen.getByText('PDF • 900 KB')).toBeInTheDocument();
    expect(screen.getByText('Ignite Space')).toBeInTheDocument();
    expect(screen.getByText('Ready for RAG')).toBeInTheDocument();
    expect(screen.getByText('7 chunks')).toBeInTheDocument();
    expect(screen.getByText('Pinecone')).toBeInTheDocument();
    expect(screen.getByText('kb-7')).toBeInTheDocument();
  });

  it('applies fallbacks for description, audience and vector store, and closes on demand', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(
      <DocumentDetailsModal
        isOpen
        onClose={handleClose}
        document={{ id: 9, name: 'Draft', fileType: 'TXT', sizeFormatted: '1 KB', uploadedAt: 'Nov 5', status: 'Processing' }}
      />
    );

    expect(screen.getByText('No description provided')).toBeInTheDocument();
    expect(screen.getByText('All students')).toBeInTheDocument();
    expect(screen.getByText('General Space')).toBeInTheDocument();
    expect(screen.getByText('SQLite local knowledge base')).toBeInTheDocument();
    expect(screen.getByText('Processing text...')).toBeInTheDocument();
    expect(screen.getByText('0 chunks')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^close$/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// DocumentViewerModal
// ---------------------------------------------------------------------------
describe('DocumentViewerModal', () => {
  const doc = {
    id: 5,
    name: 'Chemistry Deck',
    fileName: 'chem.pdf',
    fileType: 'PDF',
    sizeFormatted: '2 MB',
    chunks: 4,
    status: 'Ready',
    content: 'Extracted chemistry text.',
  };

  it('renders nothing when closed', () => {
    const { container } = render(<DocumentViewerModal isOpen={false} document={doc} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the extracted content, header metadata and RAG status', () => {
    render(<DocumentViewerModal isOpen document={doc} onClose={vi.fn()} />);

    expect(screen.getByText('Chemistry Deck')).toBeInTheDocument();
    expect(screen.getByText('chem.pdf • PDF • 2 MB')).toBeInTheDocument();
    expect(screen.getByText('EXTRACTED KNOWLEDGE TEXT (4 RAG CHUNKS)')).toBeInTheDocument();
    expect(screen.getByText('Extracted chemistry text.')).toBeInTheDocument();
    expect(screen.getByText('Ready for RAG')).toBeInTheDocument();
  });

  it('shows a placeholder and hides the copy button when there is no content', () => {
    render(<DocumentViewerModal isOpen document={{ ...doc, content: '' }} onClose={vi.fn()} />);

    expect(screen.getByText('No text extracted for this document.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy text/i })).not.toBeInTheDocument();
  });

  it('opens the resolved blob url in a new window', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    documentsService.getDocumentBlobUrl.mockReturnValue('blob:resolved');

    render(<DocumentViewerModal isOpen document={doc} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /open file/i }));

    expect(documentsService.getDocumentBlobUrl).toHaveBeenCalledWith(doc);
    expect(openSpy).toHaveBeenCalledWith('blob:resolved', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  it('copies the content to the clipboard and flips the label', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<DocumentViewerModal isOpen document={doc} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /copy text/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Extracted chemistry text.'));
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('closes when the close button is clicked', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<DocumentViewerModal isOpen document={doc} onClose={handleClose} />);

    await user.click(screen.getByRole('button', { name: /close document viewer/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// formatFileSize (documentsService helper surfaced to the UI)
// ---------------------------------------------------------------------------
describe('formatFileSize', () => {
  it('formats bytes across magnitudes and guards zero/empty input', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(undefined)).toBe('0 B');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1048576)).toBe('1 MB');
  });
});

// ---------------------------------------------------------------------------
// AssignmentList
// ---------------------------------------------------------------------------
describe('AssignmentList', () => {
  const mine = {
    id: 10,
    topic: 'Data Structures Worksheet',
    subject_name: 'Computer Science',
    message: 'Complete all problems',
    platform_link: 'https://lms.example.com/ds',
    platform_name: 'LMS',
    recipient_mode: 'COHORT',
    target_cohort_code: 'COHORT-2026',
    posted_by_me: true,
    start_date: '2026-11-01',
    deadline: '2030-01-01',
  };
  const others = {
    id: 20,
    topic: 'Physics Lab Report',
    recipient_mode: 'ROLE',
    target_role: 'Trainee',
    posted_by_me: false,
    created_by_name: 'Other Admin',
  };

  it('shows a loading message when loading with no data', () => {
    render(<AssignmentList assignments={[]} loading />);
    expect(screen.getByText('Loading assignments...')).toBeInTheDocument();
  });

  it('filters to "mine" and renders topic, subject, link, author and audience', () => {
    render(<AssignmentList assignments={[mine, others]} historyFilter="mine" />);

    expect(screen.getByText('Data Structures Worksheet')).toBeInTheDocument();
    expect(screen.queryByText('Physics Lab Report')).not.toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.getByText('Cohort: COHORT-2026')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /LMS: https:\/\/lms.example.com\/ds/ })).toHaveAttribute(
      'href',
      'https://lms.example.com/ds'
    );
    // header + total badge
    expect(screen.getByText('1 assignment')).toBeInTheDocument();
    expect(screen.getByLabelText('2 total assignments')).toBeInTheDocument();
  });

  it('filters to "others" and shows the original author and role audience', () => {
    render(<AssignmentList assignments={[mine, others]} historyFilter="others" />);

    expect(screen.getByText('Physics Lab Report')).toBeInTheDocument();
    expect(screen.queryByText('Data Structures Worksheet')).not.toBeInTheDocument();
    expect(screen.getByText('Role: Trainee')).toBeInTheDocument();
    expect(screen.getByText('Other Admin')).toBeInTheDocument();
  });

  it('reports filter tab changes to the parent', async () => {
    const user = userEvent.setup();
    const handleFilterChange = vi.fn();
    render(<AssignmentList assignments={[mine, others]} historyFilter="mine" onFilterChange={handleFilterChange} />);

    await user.click(screen.getByRole('tab', { name: /posted by others/i }));
    expect(handleFilterChange).toHaveBeenCalledWith('others');

    await user.click(screen.getByRole('tab', { name: /posted by me/i }));
    expect(handleFilterChange).toHaveBeenCalledWith('mine');
  });

  it('renders the empty state with a create action when there is nothing to show', async () => {
    const user = userEvent.setup();
    const handleCreate = vi.fn();
    render(<AssignmentList assignments={[]} historyFilter="mine" onCreateClick={handleCreate} />);

    expect(screen.getByText('No assignments posted yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create assignment/i }));
    expect(handleCreate).toHaveBeenCalledTimes(1);
  });

  it('saves an updated future deadline via onUpdateDeadline', async () => {
    const user = userEvent.setup();
    const handleUpdate = vi.fn();
    render(<AssignmentList assignments={[mine]} historyFilter="mine" onUpdateDeadline={handleUpdate} />);

    await user.click(screen.getByRole('button', { name: /update/i }));
    expect(handleUpdate).toHaveBeenCalledWith(10, '2030-01-01');
  });

  it('rejects a deadline in the past without calling onUpdateDeadline', async () => {
    const user = userEvent.setup();
    const handleUpdate = vi.fn();
    render(
      <AssignmentList
        assignments={[{ ...mine, deadline: '2020-01-01' }]}
        historyFilter="mine"
        onUpdateDeadline={handleUpdate}
      />
    );

    await user.click(screen.getByRole('button', { name: /update/i }));
    expect(screen.getByText('Deadline cannot be in the past.')).toBeInTheDocument();
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it('disables the save button while a deadline update is in flight', () => {
    render(<AssignmentList assignments={[mine]} historyFilter="mine" deadlineUpdating={{ 10: true }} />);
    expect(screen.getByText('...')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// AssignmentPreviewModal
// ---------------------------------------------------------------------------
describe('AssignmentPreviewModal', () => {
  const form = {
    topic: 'Networking Basics',
    subject: 'Networks',
    platform_link: 'https://lms.example.com/net',
    start_date: '2026-11-02',
    deadline: '2026-11-20',
    message: 'Read chapters 1-3',
    audience: 'Cohort 2026',
  };

  it('renders nothing when closed', () => {
    const { container } = render(<AssignmentPreviewModal isOpen={false} onClose={vi.fn()} form={form} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the preview fields including link and audience', () => {
    render(<AssignmentPreviewModal isOpen onClose={vi.fn()} form={form} />);

    expect(screen.getByRole('dialog', { name: /assignment preview/i })).toBeInTheDocument();
    expect(screen.getByText('Networking Basics')).toBeInTheDocument();
    expect(screen.getByText('Networks')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://lms.example.com/net' })).toBeInTheDocument();
    expect(screen.getByText('2026-11-02')).toBeInTheDocument();
    expect(screen.getByText('2026-11-20')).toBeInTheDocument();
    expect(screen.getByText('Read chapters 1-3')).toBeInTheDocument();
    expect(screen.getByText('Cohort 2026')).toBeInTheDocument();
  });

  it('uses placeholder dashes for missing fields and closes on the Close button', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    render(<AssignmentPreviewModal isOpen onClose={handleClose} form={{}} />);

    expect(screen.getByText('All students')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);

    await user.click(screen.getByRole('button', { name: /^close$/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// BroadcastList
// ---------------------------------------------------------------------------
describe('BroadcastList', () => {
  const broadcasts = [
    {
      id: 1,
      title: 'Timetable for Week 12',
      message: 'New schedule released',
      recipient_type: 'COHORT',
      target_cohort_code: 'C1',
      posted_by_me: true,
      created_at: '2026-11-01T10:00:00Z',
    },
    {
      id: 2,
      title: 'Assignment 3 Due',
      message: 'Submit by Friday',
      recipient_type: 'ROLE',
      target_role: 'Trainee',
      posted_by_me: false,
      created_by_name: 'Other Admin',
      created_at: '2026-11-02T10:00:00Z',
    },
    {
      id: 3,
      title: 'General Update',
      message: 'Hello all',
      posted_by_me: true,
      created_at: '2026-11-03T10:00:00Z',
    },
  ];

  it('shows a loading message when loading with no data', () => {
    render(<BroadcastList broadcasts={[]} loading />);
    expect(screen.getByText('Loading announcements...')).toBeInTheDocument();
  });

  it('renders all announcements with category badges and audience fallback', () => {
    render(<BroadcastList broadcasts={broadcasts} historyFilter="all" />);

    expect(screen.getByText('3 announcements')).toBeInTheDocument();
    expect(screen.getByLabelText('3 total announcements')).toBeInTheDocument();
    expect(screen.getByText('Timetable for Week 12')).toBeInTheDocument();
    expect(screen.getByText('Assignment 3 Due')).toBeInTheDocument();
    expect(screen.getByText('General Update')).toBeInTheDocument();

    // Category badge mapping (title-driven)
    expect(screen.getByText('Timetable Update')).toBeInTheDocument();
    expect(screen.getByText('Assignment Notice')).toBeInTheDocument();
    expect(screen.getByText('Announcement')).toBeInTheDocument();

    // Audience fallbacks
    expect(screen.getByText('Cohort: C1')).toBeInTheDocument();
    expect(screen.getByText('Role: Trainee')).toBeInTheDocument();
    expect(screen.getByText('All users')).toBeInTheDocument();
  });

  it('applies the mine/others tab filter', () => {
    const { rerender } = render(<BroadcastList broadcasts={broadcasts} historyFilter="mine" />);
    expect(screen.getByText('Timetable for Week 12')).toBeInTheDocument();
    expect(screen.getByText('General Update')).toBeInTheDocument();
    expect(screen.queryByText('Assignment 3 Due')).not.toBeInTheDocument();

    rerender(<BroadcastList broadcasts={broadcasts} historyFilter="others" />);
    expect(screen.getByText('Assignment 3 Due')).toBeInTheDocument();
    expect(screen.queryByText('Timetable for Week 12')).not.toBeInTheDocument();
  });

  it('notifies the parent when a history tab is clicked', async () => {
    const user = userEvent.setup();
    const handleFilterChange = vi.fn();
    render(<BroadcastList broadcasts={broadcasts} historyFilter="all" onFilterChange={handleFilterChange} />);

    await user.click(screen.getByRole('tab', { name: /posted by me/i }));
    expect(handleFilterChange).toHaveBeenCalledWith('mine');

    await user.click(screen.getByRole('tab', { name: /posted by others/i }));
    expect(handleFilterChange).toHaveBeenCalledWith('others');
  });

  it('filters the list by search query across title/message/author', async () => {
    const user = userEvent.setup();
    render(<BroadcastList broadcasts={broadcasts} historyFilter="all" />);

    const search = screen.getByPlaceholderText(/search announcements/i);
    await user.type(search, 'Friday');
    expect(screen.getByText('Assignment 3 Due')).toBeInTheDocument();
    expect(screen.queryByText('Timetable for Week 12')).not.toBeInTheDocument();
    expect(screen.queryByText('General Update')).not.toBeInTheDocument();
  });

  it('shows a no-match message when the search matches nothing', async () => {
    const user = userEvent.setup();
    render(<BroadcastList broadcasts={broadcasts} historyFilter="all" />);

    await user.type(screen.getByPlaceholderText(/search announcements/i), 'zzz');
    expect(screen.getByText(/No announcements match "zzz"./)).toBeInTheDocument();
  });

  it('does not render the search box when there are no broadcasts', () => {
    render(<BroadcastList broadcasts={[]} historyFilter="all" />);
    expect(screen.queryByPlaceholderText(/search announcements/i)).not.toBeInTheDocument();
  });

  it('renders the empty state with a create action for the "all" tab', async () => {
    const user = userEvent.setup();
    const handleCreate = vi.fn();
    render(<BroadcastList broadcasts={[]} historyFilter="all" onCreateClick={handleCreate} />);

    expect(screen.getByText('No announcements yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create announcement/i }));
    expect(handleCreate).toHaveBeenCalledTimes(1);
  });

  it('renders the "others" empty state without a create action', () => {
    render(<BroadcastList broadcasts={[]} historyFilter="others" onCreateClick={vi.fn()} />);
    expect(screen.getByText('No announcements from other admins')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create announcement/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// RecipientSelector
// ---------------------------------------------------------------------------
describe('RecipientSelector', () => {
  it('loads and lists users with their email and role', async () => {
    render(<RecipientSelector />);

    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getByText('alice@campus.demo')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('TA')).toBeInTheDocument();
    expect(screen.getByText(/0 selected/)).toBeInTheDocument();
  });

  it('toggles a user via its checkbox', async () => {
    const user = userEvent.setup();
    const handleToggle = vi.fn();
    render(<RecipientSelector onToggle={handleToggle} />);

    await screen.findByText('alice');
    await user.click(screen.getByRole('checkbox', { name: /bob@campus.demo/i }));
    expect(handleToggle).toHaveBeenCalledWith({ username: 'bob', email: 'bob@campus.demo', role: 'TA' });
  });

  it('selects all filtered users through onSetRecipients', async () => {
    const user = userEvent.setup();
    const handleSet = vi.fn();
    render(<RecipientSelector onSetRecipients={handleSet} />);

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: /select all/i }));
    expect(handleSet).toHaveBeenCalledTimes(1);
    expect(handleSet.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: 'alice' }),
        expect.objectContaining({ username: 'bob' }),
      ])
    );
  });

  it('reflects selected users and unselects all when everything is selected', async () => {
    const user = userEvent.setup();
    const handleSet = vi.fn();
    const selected = [
      { username: 'alice', email: 'alice@campus.demo', role: 'Trainee' },
      { username: 'bob', email: 'bob@campus.demo', role: 'TA' },
    ];
    render(<RecipientSelector selectedUsers={selected} onSetRecipients={handleSet} />);

    await screen.findByText('alice');
    expect(screen.getByText(/2 selected/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /alice@campus.demo/i })).toBeChecked();

    await user.click(screen.getByRole('button', { name: /unselect all/i }));
    expect(handleSet).toHaveBeenCalledWith([]);
  });

  it('clears all recipients with the Clear all action', async () => {
    const user = userEvent.setup();
    const handleSet = vi.fn();
    render(<RecipientSelector selectedUsers={[{ username: 'alice', email: 'a@x.demo', role: 'Trainee' }]} onSetRecipients={handleSet} />);

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: /clear all/i }));
    expect(handleSet).toHaveBeenCalledWith([]);
  });

  it('filters users by the search query', async () => {
    const user = userEvent.setup();
    render(<RecipientSelector />);

    await screen.findByText('alice');
    await user.type(screen.getByPlaceholderText(/search by username or email/i), 'bob');
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.queryByText('alice')).not.toBeInTheDocument();
  });

  it('shows a no-match status when the search yields nothing', async () => {
    const user = userEvent.setup();
    render(<RecipientSelector />);

    await screen.findByText('alice');
    await user.type(screen.getByPlaceholderText(/search by username or email/i), 'nobody');
    expect(screen.getByText('No users match your search.')).toBeInTheDocument();
  });

  it('surfaces a load error from the service', async () => {
    usersService.getUsers.mockRejectedValueOnce(new Error('Network down'));
    render(<RecipientSelector />);

    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });

  it('disables interaction when the disabled prop is set', async () => {
    render(<RecipientSelector disabled />);

    await screen.findByText('alice');
    expect(screen.getByPlaceholderText(/search by username or email/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /select all/i })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /alice@campus.demo/i })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// HeroBanner
// ---------------------------------------------------------------------------
describe('HeroBanner', () => {
  it('renders the upcoming publish count', () => {
    renderWithRouter(<HeroBanner upcomingCount={3} />);
    expect(screen.getByText('3 items')).toBeInTheDocument();
    expect(screen.getByText('Keep everyone on the same page')).toBeInTheDocument();
  });

  it('navigates to the schedule route when Manage schedules is clicked', async () => {
    const user = userEvent.setup();
    renderWithRouter(<HeroBanner upcomingCount={0} />);

    await user.click(screen.getByRole('button', { name: /manage schedules/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/schedule');
  });
});

// ---------------------------------------------------------------------------
// QuickActions
// ---------------------------------------------------------------------------
describe('QuickActions', () => {
  it('navigates to the broadcast, schedule and buddy routes', async () => {
    const user = userEvent.setup();
    renderWithRouter(<QuickActions />);

    await user.click(screen.getByRole('button', { name: /send a broadcast/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/broadcast');

    await user.click(screen.getByRole('button', { name: /schedule a onedrive link/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/schedule');

    await user.click(screen.getByRole('button', { name: /manage buddy/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/buddy');
  });
});

// ---------------------------------------------------------------------------
// RecentActivity
// ---------------------------------------------------------------------------
describe('RecentActivity', () => {
  const broadcasts = [
    { id: 1, title: 'First', audience: 'All students', created_at: '2026-11-01T10:00:00Z' },
    { id: 2, title: 'Second', audience: 'Cohort A', created_at: '2026-11-02T10:00:00Z' },
    { id: 3, title: 'Third', audience: 'Cohort B', created_at: '2026-11-03T10:00:00Z' },
    { id: 4, title: 'Fourth', audience: 'Cohort C', created_at: '2026-11-04T10:00:00Z' },
    { id: 5, title: 'Fifth', audience: 'Cohort D', created_at: '2026-11-05T10:00:00Z' },
  ];

  it('renders at most four recent broadcasts', () => {
    renderWithRouter(<RecentActivity broadcasts={broadcasts} />);

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Fourth')).toBeInTheDocument();
    expect(screen.queryByText('Fifth')).not.toBeInTheDocument();
  });

  it('shows the empty state and routes to broadcasts from its action', async () => {
    const user = userEvent.setup();
    renderWithRouter(<RecentActivity broadcasts={[]} />);

    expect(screen.getByText('No broadcasts yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create broadcast/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/broadcast');
  });

  it('navigates to broadcasts from the header arrow', async () => {
    const user = userEvent.setup();
    renderWithRouter(<RecentActivity broadcasts={broadcasts} />);

    await user.click(screen.getByRole('button', { name: /view all broadcasts/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/broadcast');
  });
});

// ---------------------------------------------------------------------------
// StatsGrid
// ---------------------------------------------------------------------------
describe('StatsGrid', () => {
  const summary = {
    broadcast_count: 5,
    scheduled_count: 2,
    total_trainees: 40,
    total_cohorts: 2,
    total_batches: 4,
    total_sub_batches: 6,
  };

  it('renders summary values and the hierarchy note', () => {
    renderWithRouter(<StatsGrid summary={summary} buddy={false} isTogglingBuddy={false} onToggleBuddy={vi.fn()} />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('2 Cohorts · 4 Batches · 6 Labs')).toBeInTheDocument();
  });

  it('falls back to default values when no summary is provided', () => {
    renderWithRouter(<StatsGrid buddy={false} isTogglingBuddy={false} onToggleBuddy={vi.fn()} />);

    expect(screen.getByText('Click to manage trainees')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(3);
  });

  it('toggles Buddy state and disables the button while updating', async () => {
    const user = userEvent.setup();
    const handleToggle = vi.fn();
    const { rerender } = renderWithRouter(
      <StatsGrid summary={summary} buddy={true} isTogglingBuddy={false} onToggleBuddy={handleToggle} />
    );

    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /turn off buddy/i }));
    expect(handleToggle).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter>
        <LocationDisplay />
        <StatsGrid summary={summary} buddy={false} isTogglingBuddy onToggleBuddy={handleToggle} />
      </MemoryRouter>
    );
    expect(screen.getByText('PAUSED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /turn on buddy/i })).toBeDisabled();
  });

  it('routes to the relevant section from the summary cards', async () => {
    const user = userEvent.setup();
    renderWithRouter(<StatsGrid summary={summary} buddy={false} isTogglingBuddy={false} onToggleBuddy={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /total broadcasts/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/broadcast');

    await user.click(screen.getByRole('button', { name: /weekly schedule/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/schedule');

    await user.click(screen.getByRole('button', { name: /trainee roster/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/users');
  });
});
