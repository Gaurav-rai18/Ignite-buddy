import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  MapPin,
  User as UserIcon,
  X,
  Check,
  RefreshCw,
  Layers,
  Plus,
  Lock,
  Sparkles,
  FolderOpen,
  CalendarDays,
  Users,
  Trash2,
  Search,
  LayoutGrid,
  Table as TableIcon,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';
import { scheduleService } from '../../services/scheduleService';
import { usersService } from '../../services/usersService';

const WEEKDAYS = [
  { code: 'mon', label: 'Monday', dayIndex: 0 },
  { code: 'tue', label: 'Tuesday', dayIndex: 1 },
  { code: 'wed', label: 'Wednesday', dayIndex: 2 },
  { code: 'thu', label: 'Thursday', dayIndex: 3 },
  { code: 'fri', label: 'Friday', dayIndex: 4 },
];

const TIME_SLOTS = [
  { label: '08:30 - 09:30', start: '08:30', end: '09:30' },
  { label: '09:30 - 10:30', start: '09:30', end: '10:30' },
  { label: '10:30 - 11:30', start: '10:30', end: '11:30' },
  { label: '11:30 - 12:30', start: '11:30', end: '12:30' },
  { label: '01:30 - 02:30', start: '13:30', end: '14:30' },
  { label: '02:30 - 03:30', start: '14:30', end: '15:30' },
  { label: '03:30 - 04:30', start: '15:30', end: '16:30' },
  { label: '04:30 - 05:30', start: '16:30', end: '17:30' },
];

const ALL_SUB_BATCHES = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4'];
const ALL_LABS = ['Lab 1', 'Lab 2', 'Lab 3', 'Lab 4', 'WA', 'TR', 'TR1', 'TR2', 'COE 2'];

// Helper: Add days to YYYY-MM-DD
function addDays(dateStr, days = 5) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('T')[0].split('-');
  if (parts.length !== 3) return '';
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: Calculate Monday of current week (YYYY-MM-DD) to prevent past week selection
function getMondayOfCurrentWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

export function TimetableCalendarView({ onNotify }) {
  // Master lists
  const [schedulesList, setSchedulesList] = useState([]);
  const [cohortsList, setCohortsList] = useState([]);
  const [subjectsList, setSubjectsList] = useState([]);
  const [loading, setLoading] = useState(false);

  // Active Schedule State
  const defaultMonday = getMondayOfCurrentWeek();
  const [activeScheduleId, setActiveScheduleId] = useState(null);
  const [title, setTitle] = useState('Cohort B50 - Weekly Master Schedule');
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [phase, setPhase] = useState('FOUNDATION'); // 'FOUNDATION' (Months 1-3) or 'SPECIALIZATION' (Month 4)
  const [effectiveFrom, setEffectiveFrom] = useState(defaultMonday);
  const [effectiveUntil, setEffectiveUntil] = useState(addDays(defaultMonday, 5));
  const [isActive, setIsActive] = useState(true);

  // Schedule Slots Map: { [sub_batch]: { [day_code]: [ { id, title, start, end, location, is_test, evaluator } ] } }
  const [scheduleData, setScheduleData] = useState({
    sub_batches: {},
    streams: {},
    test_slots: [],
  });

  // UI View Modes: 'calendar' (Mentor recommended Calendar view), 'streams' (Month 4 Specialization)
  const [viewMode, setViewMode] = useState('calendar');

  // Stream View Sub-modes: 'matrix' (Weekly Stream Table) or 'cards' (Stream Cards)
  const [streamViewType, setStreamViewType] = useState('matrix');
  const [streamSearchQuery, setStreamSearchQuery] = useState('');

  // Filters
  const [filterSubBatch, setFilterSubBatch] = useState('A1');
  const [filterDay, setFilterDay] = useState('mon');

  // Side Drawer for Schedule History
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerCohortFilter, setDrawerCohortFilter] = useState('ALL');

  // Upload State
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Slot Edit Modal
  const [editingSlot, setEditingSlot] = useState(null);
  const [slotForm, setSlotForm] = useState({
    sub_batch: 'A1',
    day_code: 'mon',
    start: '08:30',
    end: '09:30',
    title: 'Incubator',
    location: 'Lab 1',
    is_test: false,
    platform: '',
    evaluator: '',
  });

  // Dynamic available sub-batches from parsed schedule or defaults
  const availableSubBatches = useMemo(() => {
    const keys = Object.keys(scheduleData.sub_batches || {});
    if (keys.length > 0) {
      return keys.sort();
    }
    return ALL_SUB_BATCHES;
  }, [scheduleData.sub_batches]);

  // Keep filterSubBatch synced with available sub-batches
  useEffect(() => {
    if (availableSubBatches.length > 0 && !availableSubBatches.includes(filterSubBatch)) {
      setFilterSubBatch(availableSubBatches[0]);
    }
  }, [availableSubBatches, filterSubBatch]);

  // Load initial master data & schedules
  useEffect(() => {
    loadMasterData();
  }, []);

  const loadMasterData = async () => {
    try {
      const [cohorts, subjects] = await Promise.all([
        usersService.getCohorts(),
        usersService.getSubjects(),
      ]);
      setCohortsList(cohorts || []);
      setSubjectsList(subjects || []);

      const initialCohortId = cohorts?.[0]?.id || '';
      if (initialCohortId) {
        setSelectedCohortId(initialCohortId);
        await loadSchedules(initialCohortId);
      } else {
        await loadSchedules();
      }
    } catch (e) {
      console.error('Failed to load master data', e);
    }
  };

  const loadSchedules = async (cohortId = null) => {
    setLoading(true);
    try {
      const data = await scheduleService.getSchedules();
      setSchedulesList(data || []);

      let active = null;
      if (cohortId) {
        active =
          data.find((s) => String(s.cohort?.id || s.cohort) === String(cohortId) && s.is_active) ||
          data.find((s) => String(s.cohort?.id || s.cohort) === String(cohortId));
      } else {
        active = data.find((s) => s.is_active) || data[0];
      }

      if (active) {
        loadScheduleIntoView(active);
      }
    } catch (e) {
      console.error('Failed to load schedules', e);
    } finally {
      setLoading(false);
    }
  };

  const loadScheduleIntoView = (schedule) => {
    if (!schedule) return;
    setActiveScheduleId(schedule.id);
    setTitle(schedule.title || 'Master Schedule');
    const cId = schedule.cohort?.id || schedule.cohort || '';
    if (cId) {
      setSelectedCohortId(cId);
    }
    setPhase(schedule.phase || 'FOUNDATION');
    const fromDate = schedule.effective_from || getMondayOfCurrentWeek();
    setEffectiveFrom(fromDate);
    const untilDate = (schedule.effective_until && schedule.effective_until !== schedule.effective_from)
      ? schedule.effective_until
      : addDays(fromDate, 5);
    setEffectiveUntil(untilDate);
    setIsActive(Boolean(schedule.is_active));

    if (schedule.grid_data) {
      setScheduleData(schedule.grid_data);
    }
  };

  // Switch Active Cohort View
  const handleCohortChange = async (newCohortId) => {
    setSelectedCohortId(newCohortId);
    setLoading(true);
    try {
      const cohortObj = cohortsList.find((c) => String(c.id) === String(newCohortId));
      const cohortCode = cohortObj?.code || 'B50';

      const cohortSchedules = schedulesList.filter(
        (s) => String(s.cohort?.id || s.cohort) === String(newCohortId)
      );

      const active = cohortSchedules.find((s) => s.is_active) || cohortSchedules[0];
      if (active) {
        loadScheduleIntoView(active);
        onNotify?.(`Switched to Cohort ${cohortCode} timetable.`);
      } else {
        setActiveScheduleId(null);
        setTitle(`Cohort ${cohortCode} - Weekly Master Schedule`);
        setPhase('FOUNDATION');
        setScheduleData({ sub_batches: {}, streams: {}, test_slots: [] });
        onNotify?.(`Cohort ${cohortCode} has no published timetable yet. Upload an Excel workbook or add slots below.`);
      }
    } catch (err) {
      console.error('Error switching cohort schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  // Upload Excel schedule
  const handleUploadExcel = async (file) => {
    if (!file) return;
    setUploadLoading(true);
    setUploadError('');
    try {
      const parsed = await scheduleService.parseExcelSchedule(file);
      if (!parsed.success) {
        throw new Error(parsed.errors?.[0] || 'Failed to parse Excel schedule');
      }

      setScheduleData(parsed);
      setActiveScheduleId(null); // Mark as new draft until saved
      const cohortCode = parsed.cohort || 'B50';
      setTitle(`TCS Ignite Cohort ${cohortCode} - Master Schedule`);

      // Match parsed cohort code to existing cohort if available
      const matchedCohort = cohortsList.find(
        (c) => c.code.toLowerCase() === cohortCode.toLowerCase()
      );
      if (matchedCohort) {
        setSelectedCohortId(matchedCohort.id);
      }

      // Detect phase from workbook
      if (parsed.streams && Object.keys(parsed.streams).length > 0) {
        setPhase('SPECIALIZATION');
      } else {
        setPhase('FOUNDATION');
      }

      setIsUploadModalOpen(false);
      onNotify?.(`Spreadsheet for Cohort ${cohortCode} parsed successfully! Previewing in calendar.`);
    } catch (err) {
      setUploadError(err.message || 'Error processing spreadsheet.');
    } finally {
      setUploadLoading(false);
    }
  };

  // Save / Publish Schedule
  const handleSaveSchedule = async (makeActive = true) => {
    setLoading(true);
    try {
      const resolvedUntil = (effectiveUntil && effectiveUntil !== effectiveFrom)
        ? effectiveUntil
        : addDays(effectiveFrom, 5);
      const payload = {
        title,
        cohort: selectedCohortId,
        phase,
        effective_from: effectiveFrom,
        effective_until: resolvedUntil,
        is_active: makeActive,
        grid_data: scheduleData,
      };

      let res;
      if (activeScheduleId) {
        res = await scheduleService.updateSchedule(activeScheduleId, payload);
      } else {
        res = await scheduleService.createSchedule(payload);
      }

      onNotify?.(makeActive ? 'Schedule published and active!' : 'Schedule draft saved.');
      await loadSchedules(selectedCohortId);
      if (res?.data) {
        loadScheduleIntoView(res.data);
      }
    } catch (e) {
      onNotify?.('Error saving schedule: ' + (e.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Delete a Schedule from Saved Weeks
  const handleDeleteSchedule = async (sched) => {
    if (!sched?.id) return;
    const confirmMsg = sched.is_active
      ? `Schedule "${sched.title}" is currently active and published.\n\nAre you sure you want to permanently delete it?`
      : `Are you sure you want to permanently delete schedule "${sched.title}"?`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    setLoading(true);
    try {
      await scheduleService.deleteSchedule(sched.id);
      onNotify?.(`Schedule "${sched.title}" deleted.`);

      // If deleted schedule was active in the editor, reset editor state
      if (activeScheduleId === sched.id) {
        setActiveScheduleId(null);
        setTitle('Master Schedule - Draft');
        setScheduleData({ sub_batches: {}, streams: {}, test_slots: [] });
      }

      await loadSchedules(selectedCohortId);
    } catch (err) {
      console.error('Failed to delete schedule:', err);
      onNotify?.('Error deleting schedule: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Slot Click -> Edit Modal
  const handleCellClick = (subBatch, dayCode, timeSlot, existingSlot) => {
    setEditingSlot({ subBatch, dayCode, timeSlot });
    setSlotForm({
      sub_batch: subBatch,
      day_code: dayCode,
      start: existingSlot?.start || timeSlot.start,
      end: existingSlot?.end || timeSlot.end,
      title: existingSlot?.title || 'Incubator',
      location: existingSlot?.location || 'Lab 1',
      is_test: Boolean(existingSlot?.is_test),
      platform: existingSlot?.platform || '',
      evaluator: existingSlot?.evaluator || '',
    });
  };

  // Save Slot Edit
  const handleSaveSlotModal = () => {
    if (!editingSlot) return;
    const { subBatch, dayCode, timeSlot } = editingSlot;

    const updatedGrid = { ...scheduleData };
    if (!updatedGrid.sub_batches) updatedGrid.sub_batches = {};
    if (!updatedGrid.sub_batches[subBatch]) {
      updatedGrid.sub_batches[subBatch] = { mon: [], tue: [], wed: [], thu: [], fri: [] };
    }
    if (!updatedGrid.sub_batches[subBatch][dayCode]) {
      updatedGrid.sub_batches[subBatch][dayCode] = [];
    }

    const daySlots = [...updatedGrid.sub_batches[subBatch][dayCode]];
    const existingIndex = daySlots.findIndex((s) => s.start === timeSlot.start);

    const slotPayload = {
      title: slotForm.title,
      subject: slotForm.title,
      start: slotForm.start,
      end: slotForm.end,
      time_label: `${slotForm.start} - ${slotForm.end}`,
      location: slotForm.location,
      is_test: slotForm.is_test,
      platform: slotForm.is_test ? (slotForm.platform?.trim() || null) : null,
      evaluator: slotForm.evaluator,
    };

    if (existingIndex >= 0) {
      daySlots[existingIndex] = slotPayload;
    } else {
      daySlots.push(slotPayload);
    }

    daySlots.sort((a, b) => (a.start > b.start ? 1 : -1));
    updatedGrid.sub_batches[subBatch][dayCode] = daySlots;
    setScheduleData(updatedGrid);
    setEditingSlot(null);
    onNotify?.(`Updated ${subBatch} ${dayCode.toUpperCase()} (${slotPayload.title} in ${slotPayload.location})`);
  };

  // Filter schedules for the Saved Weeks drawer
  const filteredDrawerSchedules = useMemo(() => {
    if (drawerCohortFilter === 'ALL') return schedulesList;
    return schedulesList.filter(
      (s) => String(s.cohort?.id || s.cohort) === String(drawerCohortFilter)
    );
  }, [schedulesList, drawerCohortFilter]);

  // Normalized Streams List for Month 4 View
  const parsedStreams = useMemo(() => {
    const streamsMap = scheduleData.streams || {};
    const result = [];
    Object.entries(streamsMap).forEach(([streamName, rawData]) => {
      const data = rawData || {};
      const dayAllocations = {};
      WEEKDAYS.forEach((w) => {
        dayAllocations[w.code] = (data.days && data.days[w.code]) || data[w.code] || [];
      });

      let facultyName = data.faculty || '';
      let backupFaculty = data.backup_faculty || '';
      let traineeCount = data.count || 0;

      if (!facultyName) {
        Object.values(dayAllocations).forEach((slotList) => {
          if (!facultyName && Array.isArray(slotList)) {
            const found = slotList.find((s) => s.faculty || s.trainer || s.evaluator);
            if (found) facultyName = found.faculty || found.trainer || found.evaluator;
          }
        });
      }

      result.push({
        name: streamName,
        count: traineeCount,
        faculty: facultyName,
        backupFaculty,
        days: dayAllocations,
      });
    });

    return result;
  }, [scheduleData.streams]);

  // Distinct time slots per weekday dynamically gathered from the stream schedule
  const streamWeekdays = useMemo(() => {
    return WEEKDAYS.map((day) => {
      const slotMap = new Map();
      parsedStreams.forEach((st) => {
        const daySlots = st.days[day.code] || [];
        daySlots.forEach((s) => {
          const key = s.start || s.time || s.time_label;
          if (key && !slotMap.has(key)) {
            let shortLabel = s.short_time;
            if (!shortLabel && s.start) {
              const parts = s.start.split(':').map(Number);
              const h = parts[0];
              const m = parts[1] || 0;
              const h12 = h % 12 || 12;
              const ap = h < 12 ? 'AM' : 'PM';
              shortLabel = `${h12}:${String(m).padStart(2, '0')} ${ap}`;
            }
            slotMap.set(key, {
              start: s.start,
              end: s.end,
              shortLabel: shortLabel || key,
              fullLabel: s.time_label || s.time || `${shortLabel} - ${s.end}`,
            });
          }
        });
      });

      const sorted = Array.from(slotMap.values()).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      return {
        ...day,
        slots: sorted.length > 0 ? sorted : [
          { start: '14:30', end: '17:30', shortLabel: '2:30 PM', fullLabel: '02:30 PM - 05:30 PM' },
        ],
      };
    });
  }, [parsedStreams]);

  const filteredStreams = useMemo(() => {
    if (!streamSearchQuery.trim()) return parsedStreams;
    const q = streamSearchQuery.toLowerCase();
    return parsedStreams.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.faculty && s.faculty.toLowerCase().includes(q))
    );
  }, [parsedStreams, streamSearchQuery]);

  // Card Color Helper
  const getCardStyle = (slot) => {
    if (!slot) return 'slot-empty';
    if (slot.is_test) return 'slot-test';
    const t = slot.title.toLowerCase();
    if (t.includes('stream')) return 'slot-stream';
    if (t.includes('bizskill')) return 'slot-bizskill';
    if (t.includes('incubator')) return 'slot-incubator';
    return 'slot-default';
  };

  return (
    <div className="calendar-scheduler-container">
      {/* 1. TOP HEADER & WORKSPACE TOOLBAR */}
      <div className="scheduler-header-bar">
        <div className="scheduler-title-section">
          <div className="scheduler-badge-row">
            <span className={`status-pill ${isActive ? 'pill-active' : 'pill-scheduled'}`}>
              {isActive ? '● Active Published Week' : 'Draft / Scheduled'}
            </span>
            <span className="phase-pill">
              {phase === 'FOUNDATION' ? 'Phase 1: Months 1–3 (Foundation)' : 'Phase 2: Month 4 (Specialization)'}
            </span>
          </div>
          <input
            type="text"
            className="schedule-main-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Schedule Title..."
          />
        </div>

        {/* Action Buttons */}
        <div className="scheduler-action-buttons">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setIsUploadModalOpen(true)}
          >
            <Upload size={14} />
            <span>Upload Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            className="secondary-btn"
            onClick={() => setIsDrawerOpen(true)}
          >
            <FolderOpen size={14} />
            <span>Saved Weeks ({schedulesList.length})</span>
          </button>

          <button
            type="button"
            className="primary-btn"
            disabled={loading}
            onClick={() => handleSaveSchedule(true)}
          >
            <CheckCircle2 size={15} />
            <span>Publish Schedule</span>
          </button>
        </div>
      </div>

      {/* 2. DATES, COHORT & CONTROLS TOOLBAR */}
      <div className="scheduler-controls-bar">
        {/* Cohort Selector (Multi-Cohort Management) */}
        <div className="control-group">
          <label className="control-label">
            <Users size={13} />
            <span>Cohort:</span>
          </label>
          <select
            className="select-input cohort-select"
            value={selectedCohortId}
            onChange={(e) => handleCohortChange(e.target.value)}
          >
            {cohortsList.length === 0 ? (
              <option value="">No Cohorts Found</option>
            ) : (
              cohortsList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} {c.name ? `(${c.name})` : ''}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Effective Dates with PAST WEEK RESTRICTION */}
        <div className="control-group">
          <label className="control-label">
            <Calendar size={13} />
            <span>Effective From:</span>
          </label>
          <input
            type="date"
            className="date-input"
            value={effectiveFrom}
            min={getMondayOfCurrentWeek()} // PAST WEEK CANNOT BE SELECTED
            onChange={(e) => {
              const val = e.target.value;
              setEffectiveFrom(val);
              setEffectiveUntil(addDays(val, 5));
            }}
          />
          <span className="date-hint">(Past weeks disabled)</span>
        </div>

        <div className="control-group">
          <label className="control-label">
            <Calendar size={13} />
            <span>Effective Until (End Date):</span>
          </label>
          <input
            type="date"
            className="date-input"
            value={effectiveUntil}
            min={effectiveFrom}
            onChange={(e) => setEffectiveUntil(e.target.value)}
          />
          <span className="date-hint">(Auto-set 5 days)</span>
        </div>

        {/* Training Phase Selector */}
        <div className="control-group">
          <label className="control-label">Training Phase:</label>
          <select
            className="select-input"
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
          >
            <option value="FOUNDATION">Months 1–3: Foundation (Sub-Batches only)</option>
            <option value="SPECIALIZATION">Month 4: Specialization (Sub-Batches + Streams)</option>
          </select>
        </div>

        {/* View Mode Switcher */}
        <div className="view-mode-tabs" role="tablist">
          <button
            type="button"
            className={`view-mode-btn ${viewMode === 'calendar' ? 'active' : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            <CalendarDays size={14} />
            <span>Weekly Calendar</span>
          </button>

          {/* Stream Specialization component hidden for now as requested */}
          {false && phase === 'SPECIALIZATION' && (
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'streams' ? 'active' : ''}`}
              onClick={() => setViewMode('streams')}
            >
              <Sparkles size={14} />
              <span>Streams Specialization</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. SUB-FILTER BAR */}
      <div className="scheduler-filter-bar">
        {viewMode === 'calendar' && (
          <div className="filter-pill-group">
            <span className="filter-label">Select Sub-Batch:</span>
            <div className="subbatch-pill-selector">
              {availableSubBatches.map((sb) => (
                <button
                  key={sb}
                  type="button"
                  className={`sb-pill ${filterSubBatch === sb ? 'active' : ''}`}
                  onClick={() => setFilterSubBatch(sb)}
                >
                  {sb}
                </button>
              ))}
            </div>
          </div>
        )}

        {viewMode === 'streams' && (
          <div className="filter-pill-group stream-controls-filter">
            <div className="stream-search-input-wrap">
              <Search size={13} className="search-icon" />
              <input
                type="text"
                placeholder="Filter by stream or faculty..."
                value={streamSearchQuery}
                onChange={(e) => setStreamSearchQuery(e.target.value)}
                className="stream-search-input"
              />
            </div>
            <div className="stream-view-toggle-btns">
              <button
                type="button"
                className={`stream-toggle-btn ${streamViewType === 'matrix' ? 'active' : ''}`}
                onClick={() => setStreamViewType('matrix')}
                title="Weekly Matrix Table"
              >
                <TableIcon size={13} />
                <span>Weekly Matrix</span>
              </button>
              <button
                type="button"
                className={`stream-toggle-btn ${streamViewType === 'cards' ? 'active' : ''}`}
                onClick={() => setStreamViewType('cards')}
                title="Track Cards View"
              >
                <LayoutGrid size={13} />
                <span>Track Cards</span>
              </button>
            </div>
          </div>
        )}

        <div className="filter-right-section">
          <div className="legend-pills">
            <span className="legend-tag incubator">● Incubator</span>
            <span className="legend-tag bizskill">● BizSkill</span>
            <span className="legend-tag stream">● Stream Track</span>
            <span className="legend-tag test">● Assessment (Auto Lock)</span>
          </div>
        </div>
      </div>

      {/* 4. MAIN VIEW CONTENT AREA */}

      {/* VIEW A: WEEKLY CALENDAR VIEW (Default - The Mentor's Recommended Format) */}
      {viewMode === 'calendar' && (
        <div className="calendar-scroll-wrapper">
          <div className="calendar-grid-card">
            <div className="calendar-grid-header">
              <div className="time-column-header">Time Slot</div>
              {WEEKDAYS.map((day) => (
                <div key={day.code} className="day-column-header">
                  <span className="day-title">{day.label}</span>
                  <span className="day-subtitle">Sub-Batch {filterSubBatch}</span>
                </div>
              ))}
            </div>

            <div className="calendar-grid-body">
              {TIME_SLOTS.map((slot) => (
                <div key={slot.label} className="calendar-time-row">
                  <div className="time-slot-label">
                    <Clock size={12} />
                    <span>{slot.label}</span>
                  </div>

                  {WEEKDAYS.map((day) => {
                    const daySlots = scheduleData.sub_batches?.[filterSubBatch]?.[day.code] || [];
                    const matched = daySlots.find((s) => s.start === slot.start) || daySlots.find((s) => s.start <= slot.start && s.end > slot.start);

                    return (
                      <div
                        key={day.code}
                        className={`calendar-cell ${getCardStyle(matched)}`}
                        onClick={() => handleCellClick(filterSubBatch, day.code, slot, matched)}
                        title="Click to edit lecture or venue"
                      >
                        {matched ? (
                          <div className="event-card-content">
                            <div className="event-card-top">
                              <span className="event-title">{matched.title}</span>
                              {matched.is_test && (
                                <span className="test-badge" title="Trainee Buddy is blocked during this assessment">
                                  <Lock size={10} /> Test Lock
                                </span>
                              )}
                            </div>
                            <div className="event-card-bottom">
                              <span className="venue-pill">
                                <MapPin size={10} /> {matched.location || 'WA'}
                              </span>
                              {matched.platform && (
                                <span className="platform-pill" title={`Assessment Platform: ${matched.platform}`}>
                                  ● {matched.platform}
                                </span>
                              )}
                              {matched.evaluator && (
                                <span className="evaluator-pill">
                                  <UserIcon size={10} /> {matched.evaluator}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="empty-cell-placeholder">
                            <Plus size={12} />
                            <span>Add slot</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW B: INTUITIVE STREAMS SPECIALIZATION VIEW (MONTH 4) - Hidden for now as requested */}
      {false && viewMode === 'streams' && (
        <div className="stream-specialization-container">
          {/* A. Intuitive Architecture Explainer Card */}
          <div className="stream-explainer-banner">
            <div className="stream-banner-top">
              <div className="stream-badge-title">
                <Sparkles size={16} />
                <span>Month 4 Specialization Model</span>
              </div>
              <span className="phase-pill-purple">Specialization Phase</span>
            </div>

            <div className="stream-flow-grid">
              <div className="stream-flow-box morning">
                <div className="flow-box-header">
                  <span className="flow-tag morning">Morning (08:30 AM – 01:30 PM)</span>
                  <h4>Sub-Batch Groups (A1–C4)</h4>
                </div>
                <p>Trainees train with their assigned sub-batch in Home Labs & Work Areas for core syllabus topics & BizSkill.</p>
              </div>

              <div className="stream-flow-arrow">
                <ArrowRight size={20} />
              </div>

              <div className="stream-flow-box afternoon">
                <div className="flow-box-header">
                  <span className="flow-tag afternoon">Specialization Practicals (Afternoon Sessions)</span>
                  <h4>Technical Elective Streams</h4>
                </div>
                <p>Sub-batches dissolve: Trainees regroup by their specialized stream tracks (Java, Python, Cloud, etc.) in designated labs with expert faculty.</p>
              </div>
            </div>
          </div>

          {/* B. Stream Schedule Views */}
          {filteredStreams.length > 0 ? (
            streamViewType === 'matrix' ? (
              /* Sub-view 1: Multi-Slot Weekly Stream Matrix Table matching original Excel grid */
              <div className="calendar-grid-card stream-matrix-card">
                <div className="stream-matrix-table-wrapper">
                  <table className="stream-matrix-table">
                    <thead>
                      <tr>
                        <th rowSpan={2} className="stream-th-track">Specialization Stream</th>
                        <th rowSpan={2} className="stream-th-count">Count</th>
                        <th rowSpan={2} className="stream-th-faculty">Faculty In-Charge</th>
                        {streamWeekdays.map((w) => (
                          <th key={w.code} colSpan={w.slots.length} className="stream-th-day-group">
                            {w.label}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {streamWeekdays.map((w) =>
                          w.slots.map((slot) => (
                            <th key={`${w.code}_${slot.start}`} className="stream-th-time-col" title={slot.fullLabel}>
                              <span className="time-col-badge">{slot.shortLabel}</span>
                            </th>
                          ))
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStreams.map((st) => (
                        <tr key={st.name}>
                          <td className="stream-td-track">
                            <div className="stream-name-cell">
                              <div className="stream-track-icon-small">
                                <Layers size={14} />
                              </div>
                              <div>
                                <strong>{st.name}</strong>
                                <span className="stream-badge-mini">Elective Track</span>
                              </div>
                            </div>
                          </td>
                          <td className="stream-td-count">
                            <span className="stream-count-badge">
                              {st.count ? `${st.count}` : '—'}
                            </span>
                          </td>
                          <td className="stream-td-faculty">
                            {st.faculty ? (
                              <span className="stream-faculty-tag" title={st.backupFaculty ? `Backup: ${st.backupFaculty}` : ''}>
                                <UserIcon size={12} /> {st.faculty}
                              </span>
                            ) : (
                              <span className="faculty-unassigned">Stream Faculty</span>
                            )}
                          </td>
                          {streamWeekdays.map((w) => {
                            const daySlots = st.days[w.code] || [];
                            return w.slots.map((colSlot) => {
                              const match = daySlots.find((s) => s.start === colSlot.start || (daySlots.length === 1 && !s.start));
                              if (!match) {
                                return (
                                  <td key={`${w.code}_${colSlot.start}`} className="stream-td-cell">
                                    <span className="stream-empty-dash">—</span>
                                  </td>
                                );
                              }
                              const room = match.room || match.location || 'WA';
                              const rLow = room.toLowerCase();
                              let rType = 'wa';
                              if (rLow.startsWith('tr')) rType = 'tr';
                              else if (rLow.startsWith('lab') || rLow.includes('lab')) rType = 'lab';
                              else if (rLow.startsWith('coe')) rType = 'coe';

                              return (
                                <td key={`${w.code}_${colSlot.start}`} className="stream-td-cell">
                                  <span
                                    className={`stream-venue-tag ${rType}`}
                                    title={`${st.name} on ${w.label} (${match.time_label || colSlot.fullLabel}) in ${room}`}
                                  >
                                    <MapPin size={10} />
                                    <b>{room}</b>
                                  </span>
                                </td>
                              );
                            });
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* Sub-view 2: Stream Track Cards */
              <div className="streams-summary-grid">
                {filteredStreams.map((st) => (
                  <div key={st.name} className="stream-track-card">
                    <div className="stream-card-header">
                      <div className="stream-header-left">
                        <div className="stream-track-icon">
                          <Layers size={16} />
                        </div>
                        <div>
                          <h4>{st.name}</h4>
                          {st.faculty && (
                            <span className="stream-faculty-subtitle">
                              <UserIcon size={11} /> {st.faculty} {st.backupFaculty && `(Backup: ${st.backupFaculty})`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {st.count > 0 && <span className="stream-count-badge">{st.count} pax</span>}
                        <span className="stream-badge">Elective Stream</span>
                      </div>
                    </div>

                    <div className="stream-schedule-list">
                      {streamWeekdays.map((w) => {
                        const slots = st.days[w.code] || [];
                        return (
                          <div key={w.code} className="stream-day-row">
                            <span className="stream-day-code">{w.code.toUpperCase()}</span>
                            <div className="stream-slots-pills">
                              {slots.length > 0 ? (
                                slots.map((s, idx) => {
                                  const room = s.room || s.location || 'WA';
                                  const rLow = room.toLowerCase();
                                  let rType = 'wa';
                                  if (rLow.startsWith('tr')) rType = 'tr';
                                  else if (rLow.startsWith('lab') || rLow.includes('lab')) rType = 'lab';
                                  else if (rLow.startsWith('coe')) rType = 'coe';
                                  return (
                                    <div key={idx} className={`stream-room-pill stream-venue-tag ${rType}`}>
                                      <span className="stream-pill-time">{s.time_label || s.time || `${s.start} - ${s.end}`}</span>
                                      <span className="stream-pill-room">
                                        <MapPin size={10} />
                                        {room}
                                      </span>
                                    </div>
                                  );
                                })
                              ) : (
                                <span className="stream-empty-slot">Work Area / Self-Study</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="empty-state-notice">
              <AlertCircle size={28} />
              <h4>No Technical Stream Allocations Found</h4>
              <p>Upload a multi-sheet TCS Ignite schedule workbook (.xlsx) containing a 'Stream' sheet or configure specialization streams to populate Month 4 tracks.</p>
            </div>
          )}
        </div>
      )}

      {/* 5. INTERACTIVE GLASSMORPHIC SLOT EDIT MODAL */}
      {editingSlot && (
        <div className="modal-backdrop">
          <div className="slot-edit-modal-dialog glassmorphic-modal">
            <div className="modal-header">
              <div className="modal-header-info">
                <div className="modal-icon-badge">
                  <Clock size={18} />
                </div>
                <div>
                  <h3>Edit Lecture Slot</h3>
                  <p className="modal-subtext">
                    Sub-Batch <b>{slotForm.sub_batch}</b> • <b>{slotForm.day_code.toUpperCase()}</b> ({slotForm.start} – {slotForm.end})
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="close-icon-btn"
                onClick={() => setEditingSlot(null)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body-form">
              <div className="form-field-group">
                <label className="field-label">Subject / Topic Title</label>
                <div className="input-with-select">
                  <input
                    type="text"
                    value={slotForm.title}
                    onChange={(e) => setSlotForm({ ...slotForm, title: e.target.value })}
                    className="text-input glass-input"
                    placeholder="e.g. Incubator, BizSkill, IO Exit"
                  />
                  <select
                    className="preset-select glass-select"
                    onChange={(e) => {
                      if (e.target.value) {
                        const val = e.target.value;
                        const isAssessmentTopic = val.toLowerCase().includes('exit') || val.toLowerCase().includes('assessment') || val.includes('TS');
                        let detectedPlatform = slotForm.platform;
                        if (val.includes('TS') || val.toLowerCase().includes('touchstone')) detectedPlatform = 'TouchStone';
                        setSlotForm({
                          ...slotForm,
                          title: val,
                          is_test: isAssessmentTopic,
                          platform: detectedPlatform,
                        });
                      }
                    }}
                  >
                    <option value="">Preset Topics...</option>
                    <option value="Incubator">Incubator</option>
                    <option value="BizSkill">BizSkill</option>
                    <option value="BizSkill TS">BizSkill TS (TouchStone Test)</option>
                    <option value="Stream">Stream Specialization</option>
                    <option value="IO TR">IO TR (Technical Readiness)</option>
                    <option value="IO Exit">IO Exit Evaluation (Assessment)</option>
                    <option value="BizSkill TS Exit">BizSkill TS Exit (Assessment)</option>
                  </select>
                </div>
              </div>

              <div className="form-row-2col">
                <div className="form-field-group">
                  <label className="field-label">Room / Lab Venue</label>
                  <select
                    className="select-input glass-select"
                    value={slotForm.location}
                    onChange={(e) => setSlotForm({ ...slotForm, location: e.target.value })}
                  >
                    {ALL_LABS.map((lab) => (
                      <option key={lab} value={lab}>
                        {lab}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field-group">
                  <label className="field-label">Exit Evaluator / Proctor</label>
                  <input
                    type="text"
                    className="text-input glass-input"
                    placeholder="Optional: Faculty or Evaluator"
                    value={slotForm.evaluator}
                    onChange={(e) => setSlotForm({ ...slotForm, evaluator: e.target.value })}
                  />
                </div>
              </div>

              {slotForm.is_test && (
                <div className="form-field-group">
                  <label className="field-label">Assessment Platform / Evaluation Type (Optional)</label>
                  <div className="input-with-select">
                    <input
                      type="text"
                      value={slotForm.platform || ''}
                      onChange={(e) => setSlotForm({ ...slotForm, platform: e.target.value })}
                      className="text-input glass-input"
                      placeholder="e.g. TouchStone, CodeGround, AIP, Exit, Unit Test, WA"
                    />
                    <select
                      className="preset-select glass-select"
                      value={slotForm.platform || ''}
                      onChange={(e) => {
                        setSlotForm({ ...slotForm, platform: e.target.value || '' });
                      }}
                    >
                      <option value="">(None / Allow Null)</option>
                      <option value="TouchStone">TouchStone (TS)</option>
                      <option value="CodeGround">CodeGround (CG)</option>
                      <option value="AIP">AIP</option>
                      <option value="EngiNext">EngiNext</option>
                      <option value="Mettl">Mettl</option>
                      <option value="HackerRank">HackerRank</option>
                      <option value="Exit">Exit Evaluation</option>
                      <option value="Unit Test">Unit Test</option>
                      <option value="WA">Weekly Assessment (WA)</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="checkbox-field-row glass-checkbox-card">
                <label className="checkbox-container">
                  <input
                    type="checkbox"
                    checked={slotForm.is_test}
                    onChange={(e) => setSlotForm({ ...slotForm, is_test: e.target.checked })}
                  />
                  <span className="checkmark" />
                  <div className="checkbox-text">
                    <span className="checkbox-title">
                      <Lock size={12} />
                      Assessment Mode (Automated Exam Lock)
                    </span>
                    <small className="checkbox-desc">
                      Automatically disables Trainee Buddy assistant during this lecture hour for exam integrity.
                    </small>
                  </div>
                </label>
              </div>
            </div>

            <div className="modal-footer-actions">
              <button
                type="button"
                className="secondary-btn glass-btn-secondary"
                onClick={() => setEditingSlot(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn glass-btn-primary"
                onClick={handleSaveSlotModal}
              >
                <Check size={14} />
                <span>Apply Slot to Calendar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. EXCEL UPLOAD MODAL */}
      {isUploadModalOpen && (
        <div className="modal-backdrop">
          <div className="excel-upload-modal glassmorphic-modal">
            <div className="modal-header">
              <div className="modal-header-info">
                <div className="modal-icon-badge upload-badge">
                  <FileSpreadsheet size={18} />
                </div>
                <div>
                  <h3>Upload Timetable Spreadsheet</h3>
                  <p className="modal-subtext">Supports official multi-sheet TCS Ignite workbooks (.xlsx)</p>
                </div>
              </div>
              <button
                type="button"
                className="close-icon-btn"
                onClick={() => setIsUploadModalOpen(false)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="upload-dropzone-body">
              <input
                id="excel-file-drop"
                type="file"
                accept=".xlsx, .xls"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleUploadExcel(e.target.files[0]);
                  }
                }}
              />
              <label htmlFor="excel-file-drop" className="dropzone-label">
                <FileSpreadsheet size={44} className="dropzone-icon" />
                <h4>Click or drag & drop schedule workbook here</h4>
                <p>Parses Sub-batches (A1–C4), Home Labs, Work Areas, Technical Streams, and Exit Evaluators.</p>
                <span className="supported-sheets-hint">
                  Supported sheets: Schedule, Stream, Stream Faculty, TA mapping, Proctoring List.
                </span>
              </label>

              {uploadLoading && (
                <div className="upload-loading-spinner">
                  <RefreshCw className="spin-icon" size={18} />
                  <span>Parsing multi-sheet timetable matrices...</span>
                </div>
              )}

              {uploadError && (
                <div className="upload-error-alert">
                  <AlertCircle size={16} />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. SAVED WEEKS DRAWER (WITH SCHEDULE REMOVAL OPTION) */}
      {isDrawerOpen && (
        <div className="drawer-backdrop" onClick={() => setIsDrawerOpen(false)}>
          <div className="schedule-drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-group">
                <div className="drawer-header-icon">
                  <FolderOpen size={18} />
                </div>
                <div>
                  <h3>Saved Weekly Schedules</h3>
                  <p className="drawer-subtitle">Browse, activate, or delete schedules</p>
                </div>
              </div>
              <button
                type="button"
                className="close-icon-btn"
                onClick={() => setIsDrawerOpen(false)}
                title="Close drawer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Cohort Filter Tabs in Drawer */}
            <div className="drawer-cohort-filter-bar">
              <span className="drawer-filter-label">Cohort:</span>
              <div className="drawer-cohort-tabs">
                <button
                  type="button"
                  className={`drawer-cohort-pill ${drawerCohortFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setDrawerCohortFilter('ALL')}
                >
                  All
                </button>
                {cohortsList.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`drawer-cohort-pill ${drawerCohortFilter === String(c.id) ? 'active' : ''}`}
                    onClick={() => setDrawerCohortFilter(String(c.id))}
                  >
                    {c.code}
                  </button>
                ))}
              </div>
            </div>

            <div className="drawer-list">
              {filteredDrawerSchedules.length > 0 ? (
                filteredDrawerSchedules.map((sched) => {
                  const isCurrentActive = sched.id === activeScheduleId;
                  const schedCohort = cohortsList.find(
                    (c) => String(c.id) === String(sched.cohort?.id || sched.cohort)
                  );
                  return (
                    <div
                      key={sched.id}
                      className={`saved-week-item ${isCurrentActive ? 'active-week' : ''}`}
                      onClick={() => {
                        loadScheduleIntoView(sched);
                        setIsDrawerOpen(false);
                        onNotify?.(`Loaded "${sched.title}"`);
                      }}
                    >
                      <div className="week-item-top">
                        <div className="week-item-title-wrap">
                          <h4>{sched.title}</h4>
                          {schedCohort && (
                            <span className="cohort-tag">
                              {schedCohort.code}
                            </span>
                          )}
                        </div>
                        <div className="week-item-top-actions">
                          <span className={`pill ${sched.is_active ? 'pill-active' : 'pill-archived'}`}>
                            {sched.is_active ? 'Active' : 'Archived'}
                          </span>
                          <button
                            type="button"
                            className="schedule-delete-btn"
                            title="Delete this schedule"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSchedule(sched);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="week-item-meta">
                        <span className="meta-item">
                          <Calendar size={11} />
                          From {sched.effective_from || 'Scheduled'}
                        </span>
                        <span className="meta-item">
                          <Sparkles size={11} />
                          {sched.phase === 'SPECIALIZATION' ? 'Month 4 (Specialization)' : 'Months 1-3 (Foundation)'}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="drawer-empty-state">
                  <AlertCircle size={24} />
                  <p>No schedules found matching this filter.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
