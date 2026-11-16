import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { TimetableCalendarView } from '../components/schedule/TimetableCalendarView';
import { scheduleService } from '../services/scheduleService';
import { usersService } from '../services/usersService';

// The component loads cohorts + subjects on mount, then schedules. From
// `src/test/`, `../services/...` resolves to the same module id the component
// imports via `../../services/...`, so these mocks take effect.
vi.mock('../services/scheduleService', () => ({
  scheduleService: {
    getSchedules: vi.fn(),
    parseExcelSchedule: vi.fn(),
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
  },
}));

vi.mock('../services/usersService', () => ({
  usersService: {
    getCohorts: vi.fn(),
    getSubjects: vi.fn(),
  },
}));

const cohorts = [
  { id: 10, code: 'B50', name: 'Batch 50' },
  { id: 20, code: 'B51', name: 'Batch 51' },
  { id: 30, code: 'B52', name: 'Batch 52' },
];

const subjects = [{ id: 1, name: 'Incubator' }];

// Fresh grid data per call so in-place slot edits never leak between tests
// (the component mutates nested arrays of the loaded grid_data).
function makeGridData() {
  return {
    sub_batches: {
      A1: {
        mon: [
          { title: 'Incubator Session', start: '08:30', end: '09:30', location: 'Lab 1', is_test: false, evaluator: '' },
          { title: 'Stream Specialization', start: '09:30', end: '10:30', location: 'TR1', is_test: false },
          { title: 'BizSkill Huddle', start: '10:30', end: '11:30', location: 'WA', is_test: false },
          { title: 'Exit Assessment', start: '11:30', end: '12:30', location: 'Lab 2', is_test: true, evaluator: 'Dr. Rao' },
        ],
        tue: [{ title: 'Agile Session', start: '08:30', end: '09:30', location: 'Lab 3', is_test: false }],
      },
      A2: {
        mon: [{ title: 'Python Track', start: '08:30', end: '09:30', location: 'Lab 4', is_test: false }],
      },
    },
    streams: {
      Java: { mon: [{ room: 'TR1', time: '02:30 - 05:30 PM', faculty: 'Dr. Rao' }], tue: [] },
      Python: { mon: [{ room: 'TR2', time: '02:30 - 05:30 PM' }] },
    },
    test_slots: [],
  };
}

function makeSchedules() {
  return [
    {
      id: 1,
      title: 'B50 Master Week',
      is_active: true,
      phase: 'FOUNDATION',
      effective_from: '2025-01-06',
      effective_until: '',
      cohort: { id: 10, code: 'B50' },
      grid_data: makeGridData(),
    },
    {
      id: 2,
      title: 'B50 Archived Week',
      is_active: false,
      phase: 'SPECIALIZATION',
      effective_from: '',
      effective_until: '',
      cohort: { id: 10, code: 'B50' },
    },
    {
      id: 3,
      title: 'B51 Week',
      is_active: false,
      phase: 'FOUNDATION',
      effective_from: '',
      effective_until: '',
      cohort: { id: 20, code: 'B51' },
      grid_data: makeGridData(),
    },
  ];
}

function renderView(props = {}) {
  return render(
    <MemoryRouter>
      <TimetableCalendarView onNotify={props.onNotify} />
    </MemoryRouter>
  );
}

// Renders and waits until the active schedule has been loaded into the editor.
async function renderLoaded(props = {}) {
  const utils = renderView(props);
  await screen.findByDisplayValue('B50 Master Week');
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
  usersService.getCohorts.mockResolvedValue(cohorts);
  usersService.getSubjects.mockResolvedValue(subjects);
  scheduleService.getSchedules.mockResolvedValue(makeSchedules());
  scheduleService.parseExcelSchedule.mockResolvedValue({ success: false, errors: ['default'] });
  scheduleService.createSchedule.mockResolvedValue({ id: 99 });
  scheduleService.updateSchedule.mockResolvedValue({ id: 1 });
  scheduleService.deleteSchedule.mockResolvedValue({});
  window.confirm = vi.fn(() => true);
});

// ---------------------------------------------------------------------------
// Render, master data & calendar cells
// ---------------------------------------------------------------------------
describe('TimetableCalendarView - render & calendar grid', () => {
  it('loads master data, the active schedule and renders the weekly calendar', async () => {
    await renderLoaded();

    expect(screen.getByText('● Active Published Week')).toBeInTheDocument();
    expect(screen.getByText('Phase 1: Months 1–3 (Foundation)')).toBeInTheDocument();

    expect(screen.getByText('Time Slot')).toBeInTheDocument();
    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('Friday')).toBeInTheDocument();
    expect(screen.getAllByText('Sub-Batch A1')).toHaveLength(5);

    expect(screen.getByText('Incubator Session')).toBeInTheDocument();
    expect(screen.getByText('Lab 1')).toBeInTheDocument();
    expect(screen.getByText('Exit Assessment')).toBeInTheDocument();
    expect(screen.getByText('Test Lock')).toBeInTheDocument();
    expect(screen.getByText('Dr. Rao')).toBeInTheDocument();

    expect(screen.getAllByText('Add slot').length).toBeGreaterThan(0);
  });

  it('applies the correct colour variant class to each slot cell', async () => {
    await renderLoaded();

    expect(screen.getByText('Incubator Session').closest('.calendar-cell').className).toContain('slot-incubator');
    expect(screen.getByText('Stream Specialization').closest('.calendar-cell').className).toContain('slot-stream');
    expect(screen.getByText('BizSkill Huddle').closest('.calendar-cell').className).toContain('slot-bizskill');
    expect(screen.getByText('Exit Assessment').closest('.calendar-cell').className).toContain('slot-test');
    expect(screen.getByText('Agile Session').closest('.calendar-cell').className).toContain('slot-default');
  });

  it('switches the displayed sub-batch when a sub-batch pill is clicked', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    expect(screen.getByText('Incubator Session')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'A2' }));

    expect(screen.getByText('Python Track')).toBeInTheDocument();
    expect(screen.queryByText('Incubator Session')).not.toBeInTheDocument();
  });

  it('renders the empty calendar state when there are no slots', async () => {
    scheduleService.getSchedules.mockResolvedValue([]);
    renderView();

    await waitFor(() => {
      expect(screen.getAllByText('Add slot')).toHaveLength(40);
    });
    expect(screen.getByDisplayValue('Cohort B50 - Weekly Master Schedule')).toBeInTheDocument();
  });

  it('falls back to the first active schedule when no cohorts exist', async () => {
    usersService.getCohorts.mockResolvedValue([]);
    renderView();

    expect(await screen.findByText('No Cohorts Found')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('B50 Master Week')).toBeInTheDocument();
  });

  it('survives a schedule-load failure without crashing', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    scheduleService.getSchedules.mockRejectedValue(new Error('network down'));
    renderView();

    expect(await screen.findByText('Time Slot')).toBeInTheDocument();
    await waitFor(() => expect(errSpy).toHaveBeenCalled());
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// View mode switching
// ---------------------------------------------------------------------------
// describe('TimetableCalendarView - view modes', () => {
//   it('renders the Lab & Room occupancy matrix and filters by day', async () => {
//     const user = userEvent.setup();
//     await renderLoaded();

//     await user.click(screen.getByRole('button', { name: /Lab & Room View/ }));

//     expect(screen.getByText('Horizontal Venue Matrix:', { exact: false })).toBeInTheDocument();
//     expect(screen.getByText(/Incubator Session/)).toBeInTheDocument();
//     expect(screen.getByText(/Python Track/)).toBeInTheDocument();
//     expect(screen.getAllByText('Vacant').length).toBeGreaterThan(0);
//     expect(screen.getByText('Lab 1')).toBeInTheDocument();

//     await user.click(screen.getByRole('button', { name: 'Tuesday' }));

//     const banner = screen.getByText(/Horizontal Venue Matrix/).closest('.room-banner-info');
//     expect(within(banner).getByText('Tuesday')).toBeInTheDocument();
//     expect(screen.getByText(/Agile Session/)).toBeInTheDocument();
//     expect(screen.queryByText(/Incubator Session/)).not.toBeInTheDocument();
//   });

//   // it('renders the streams matrix and switches to track cards with search filtering', async () => {
//   //   const user = userEvent.setup();
//   //   await renderLoaded();

//   //   await user.selectOptions(
//   //     screen.getByDisplayValue('Months 1–3: Foundation (Sub-Batches only)'),
//   //     'SPECIALIZATION'
//   //   );
//   //   await user.click(screen.getByRole('button', { name: /Streams Specialization/ }));

//   //   expect(screen.getByText('Month 4 Specialization Model')).toBeInTheDocument();
//   //   expect(screen.getByText('Java')).toBeInTheDocument();
//   //   expect(screen.getByText('Python')).toBeInTheDocument();
//   //   expect(screen.getByText('Dr. Rao')).toBeInTheDocument();
//   //   expect(screen.getAllByText('Work Area / Self-Study').length).toBeGreaterThan(0);

//   //   await user.click(screen.getByRole('button', { name: /Track Cards/ }));
//   //   expect(screen.getAllByText('Elective Stream')).toHaveLength(2);

//   //   await user.type(screen.getByPlaceholderText('Filter by stream or faculty...'), 'python');
//   //   expect(screen.getByText('Python')).toBeInTheDocument();
//   //   expect(screen.queryByText('Java')).not.toBeInTheDocument();
//   // });

//   it('shows the empty state when there are no stream allocations', async () => {
//     const user = userEvent.setup();
//     const onNotify = vi.fn();
//     await renderLoaded({ onNotify });

//     const cohortSelect = document.querySelector('.cohort-select');
//     await user.selectOptions(cohortSelect, '30');
//     await waitFor(() => {
//       expect(onNotify).toHaveBeenCalledWith(expect.stringMatching(/has no published timetable yet/));
//     });

//     // await user.selectOptions(
//     //   screen.getByDisplayValue('Months 1–3: Foundation (Sub-Batches only)'),
//     //   'SPECIALIZATION'
//     // );
//     // await user.click(screen.getByRole('button', { name: /Streams Specialization/ }));

//     // expect(screen.getByText('No Technical Stream Allocations Found')).toBeInTheDocument();
//   });
// });

// ---------------------------------------------------------------------------
// Slot edit modal
// ---------------------------------------------------------------------------
describe('TimetableCalendarView - slot edit modal', () => {
  it('opens the modal prefilled from an existing slot and saves changes', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    await renderLoaded({ onNotify });

    await user.click(screen.getByText('Incubator Session'));

    expect(screen.getByText('Edit Lecture Slot')).toBeInTheDocument();
    expect(screen.getByText('MON')).toBeInTheDocument();
    const titleInput = screen.getByDisplayValue('Incubator Session');

    await user.clear(titleInput);
    await user.type(titleInput, 'Java Advanced');
    await user.click(screen.getByRole('button', { name: /Apply Slot to Calendar/ }));

    expect(onNotify).toHaveBeenCalledWith('Updated A1 MON (Java Advanced in Lab 1)');
    expect(screen.queryByText('Edit Lecture Slot')).not.toBeInTheDocument();
    expect(await screen.findByText('Java Advanced')).toBeInTheDocument();
  });

  it('pushes a new slot into an empty cell using modal defaults', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    await renderLoaded({ onNotify });

    const row = screen.getByText('01:30 - 02:30').closest('.calendar-time-row');
    await user.click(within(row).getAllByText('Add slot')[0]);

    expect(screen.getByText('Edit Lecture Slot')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Apply Slot to Calendar/ }));

    expect(onNotify).toHaveBeenCalledWith('Updated A1 MON (Incubator in Lab 1)');
    expect(await within(row).findByText('Incubator')).toBeInTheDocument();
  });

  it('selecting an assessment preset marks the slot as a test and locks it', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    await renderLoaded({ onNotify });

    const row = screen.getByText('01:30 - 02:30').closest('.calendar-time-row');
    await user.click(within(row).getAllByText('Add slot')[0]);

    await user.selectOptions(screen.getByDisplayValue('Preset Topics...'), 'IO Exit');
    expect(screen.getByDisplayValue('IO Exit')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Apply Slot to Calendar/ }));

    expect(onNotify).toHaveBeenCalledWith('Updated A1 MON (IO Exit in Lab 1)');
    const lockedCell = await within(row).findByText('IO Exit');
    expect(within(lockedCell.closest('.calendar-cell')).getByText('Test Lock')).toBeInTheDocument();
  });

  it('closes the modal without changes when Cancel or the close icon is used', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    await renderLoaded({ onNotify });

    await user.click(screen.getByText('Incubator Session'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Edit Lecture Slot')).not.toBeInTheDocument();
    expect(onNotify).not.toHaveBeenCalled();

    await user.click(screen.getByText('Incubator Session'));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Edit Lecture Slot')).not.toBeInTheDocument();
    expect(screen.getByText('Incubator Session')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Excel upload modal
// ---------------------------------------------------------------------------
describe('TimetableCalendarView - excel upload', () => {
  it('parses an uploaded workbook, previews it and notifies', async () => {
    const onNotify = vi.fn();
    scheduleService.parseExcelSchedule.mockResolvedValue({
      success: true,
      cohort: 'B50',
      sub_batches: { C1: { mon: [{ title: 'Parsed Session', start: '08:30', end: '09:30', location: 'WA' }] } },
      streams: { Java: { mon: [] } },
      test_slots: [],
    });
    await renderLoaded({ onNotify });

    await userEvent.click(screen.getByRole('button', { name: /Upload Excel/ }));
    const file = new File(['x'], 'schedule.xlsx');
    fireEvent.change(document.getElementById('excel-file-drop'), { target: { files: [file] } });

    await waitFor(() => {
      expect(scheduleService.parseExcelSchedule).toHaveBeenCalledWith(file);
    });
    await waitFor(() => {
      expect(onNotify).toHaveBeenCalledWith(
        'Spreadsheet for Cohort B50 parsed successfully! Previewing in calendar.'
      );
    });
    expect(await screen.findByText('Parsed Session')).toBeInTheDocument();
  });

  it('shows the parse error returned by the parser', async () => {
    const onNotify = vi.fn();
    scheduleService.parseExcelSchedule.mockResolvedValue({ success: false, errors: ['Bad workbook'] });
    await renderLoaded({ onNotify });

    await userEvent.click(screen.getByRole('button', { name: /Upload Excel/ }));
    fireEvent.change(document.getElementById('excel-file-drop'), {
      target: { files: [new File(['x'], 'bad.xlsx')] },
    });

    expect(await screen.findByText('Bad workbook')).toBeInTheDocument();
    expect(onNotify).not.toHaveBeenCalled();
  });

  it('shows a fallback error message when the parser returns no details', async () => {
    scheduleService.parseExcelSchedule.mockResolvedValue({ success: false });
    await renderLoaded();

    await userEvent.click(screen.getByRole('button', { name: /Upload Excel/ }));
    fireEvent.change(document.getElementById('excel-file-drop'), {
      target: { files: [new File(['x'], 'bad.xlsx')] },
    });

    expect(await screen.findByText('Failed to parse Excel schedule')).toBeInTheDocument();
  });

  it('can close the upload modal without uploading', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole('button', { name: /Upload Excel/ }));
    expect(screen.getByText('Upload Timetable Spreadsheet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByText('Upload Timetable Spreadsheet')).not.toBeInTheDocument();
    expect(scheduleService.parseExcelSchedule).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Saved weeks drawer
// ---------------------------------------------------------------------------
describe('TimetableCalendarView - saved weeks drawer', () => {
  it('lists saved schedules, loads one on click and notifies', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    await renderLoaded({ onNotify });

    await user.click(screen.getByRole('button', { name: /Saved Weeks/ }));
    const drawer = screen.getByText('Saved Weekly Schedules').closest('.schedule-drawer-content');
    expect(within(drawer).getByText('B50 Archived Week')).toBeInTheDocument();
    expect(within(drawer).getByText('B51 Week')).toBeInTheDocument();

    await user.click(within(drawer).getByText('B50 Archived Week'));

    expect(onNotify).toHaveBeenCalledWith('Loaded "B50 Archived Week"');
    expect(screen.queryByText('Saved Weekly Schedules')).not.toBeInTheDocument();
    expect(await screen.findByText('Draft / Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Phase 2: Month 4 (Specialization)')).toBeInTheDocument();
  });

  it('filters the drawer by cohort and shows its empty state', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole('button', { name: /Saved Weeks/ }));
    const drawer = screen.getByText('Saved Weekly Schedules').closest('.schedule-drawer-content');

    await user.click(within(drawer).getByRole('button', { name: 'B51' }));
    expect(within(drawer).getByText('B51 Week')).toBeInTheDocument();
    expect(within(drawer).queryByText('B50 Master Week')).not.toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', { name: 'B52' }));
    expect(within(drawer).getByText('No schedules found matching this filter.')).toBeInTheDocument();
  });

  it('deletes an archived schedule after confirmation', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    await renderLoaded({ onNotify });

    await user.click(screen.getByRole('button', { name: /Saved Weeks/ }));
    const drawer = screen.getByText('Saved Weekly Schedules').closest('.schedule-drawer-content');
    const card = within(drawer).getByText('B50 Archived Week').closest('.saved-week-item');

    await user.click(within(card).getByTitle('Delete this schedule'));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(scheduleService.deleteSchedule).toHaveBeenCalledWith(2);
    });
    await waitFor(() => {
      expect(onNotify).toHaveBeenCalledWith('Schedule "B50 Archived Week" deleted.');
    });
  });

  it('resets the editor when the active schedule is deleted', async () => {
    const user = userEvent.setup();
    let calls = 0;
    scheduleService.getSchedules.mockImplementation(() =>
      Promise.resolve(calls++ === 0 ? makeSchedules() : [])
    );
    renderView();
    await screen.findByDisplayValue('B50 Master Week');

    await user.click(screen.getByRole('button', { name: /Saved Weeks/ }));
    const drawer = screen.getByText('Saved Weekly Schedules').closest('.schedule-drawer-content');
    const card = within(drawer).getByText('B50 Master Week').closest('.saved-week-item');

    await user.click(within(card).getByTitle('Delete this schedule'));

    await waitFor(() => {
      expect(scheduleService.deleteSchedule).toHaveBeenCalledWith(1);
    });
    expect(await screen.findByDisplayValue('Master Schedule - Draft')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Cohort switch, publish & controls
// ---------------------------------------------------------------------------
describe('TimetableCalendarView - cohort & save controls', () => {
  it('switches to another cohort that has a published timetable', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    await renderLoaded({ onNotify });

    await user.selectOptions(document.querySelector('.cohort-select'), '20');

    await waitFor(() => {
      expect(onNotify).toHaveBeenCalledWith('Switched to Cohort B51 timetable.');
    });
    expect(await screen.findByDisplayValue('B51 Week')).toBeInTheDocument();
  });

  it('handles switching to a cohort with no timetable', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    await renderLoaded({ onNotify });

    await user.selectOptions(document.querySelector('.cohort-select'), '30');

    await waitFor(() => {
      expect(onNotify).toHaveBeenCalledWith(
        'Cohort B52 has no published timetable yet. Upload an Excel workbook or add slots below.'
      );
    });
    expect(await screen.findByDisplayValue('Cohort B52 - Weekly Master Schedule')).toBeInTheDocument();
    expect(screen.getAllByText('Add slot')).toHaveLength(40);
  });

  it('publishes the loaded schedule via updateSchedule', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    await renderLoaded({ onNotify });

    await user.click(screen.getByRole('button', { name: /Publish Schedule/ }));

    await waitFor(() => {
      expect(scheduleService.updateSchedule).toHaveBeenCalledTimes(1);
    });
    const [id, payload] = scheduleService.updateSchedule.mock.calls[0];
    expect(id).toBe(1);
    expect(payload).toMatchObject({
      title: 'B50 Master Week',
      cohort: 10,
      phase: 'FOUNDATION',
      is_active: true,
    });
    expect(payload.grid_data.sub_batches.A1).toBeTruthy();
    expect(onNotify).toHaveBeenCalledWith('Schedule published and active!');
  });

  it('creates a new schedule when publishing a cohort without an active schedule', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    await renderLoaded({ onNotify });

    await user.selectOptions(document.querySelector('.cohort-select'), '30');
    await screen.findByDisplayValue('Cohort B52 - Weekly Master Schedule');

    await user.click(screen.getByRole('button', { name: /Publish Schedule/ }));

    await waitFor(() => {
      expect(scheduleService.createSchedule).toHaveBeenCalledTimes(1);
    });
    expect(scheduleService.updateSchedule).not.toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith('Schedule published and active!');
  });

  it('notifies when saving a schedule fails', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    scheduleService.updateSchedule.mockRejectedValue(new Error('boom'));
    await renderLoaded({ onNotify });

    await user.click(screen.getByRole('button', { name: /Publish Schedule/ }));

    await waitFor(() => {
      expect(onNotify).toHaveBeenCalledWith('Error saving schedule: boom');
    });
  });

  it('updates the title, phase and effective date from the toolbar controls', async () => {
    const user = userEvent.setup();
    const { container } = await renderLoaded();

    const titleInput = screen.getByDisplayValue('B50 Master Week');
    await user.clear(titleInput);
    await user.type(titleInput, 'Renamed Week');
    expect(screen.getByDisplayValue('Renamed Week')).toBeInTheDocument();

    await user.selectOptions(
      screen.getByDisplayValue('Months 1–3: Foundation (Sub-Batches only)'),
      'SPECIALIZATION'
    );
    expect(screen.getByText('Phase 2: Month 4 (Specialization)')).toBeInTheDocument();

    const dateInput = container.querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2099-01-05' } });
    expect(dateInput.value).toBe('2099-01-05');
  });
});
