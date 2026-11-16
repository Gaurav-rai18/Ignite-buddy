import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Users,
  Send,
  Eye,
  Link,
  Calendar,
  Clock,
} from 'lucide-react';
import { Field } from '../ui/Field';
import {
  VALIDATION_LIMITS,
  ASSIGNMENT_RECIPIENT_MODES,
  DEFAULT_ASSIGNMENT_RECIPIENT_MODE,
} from '../../constants';
import { usersService } from '../../services/usersService';
import { AssignmentPreviewModal } from './AssignmentPreviewModal';

const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function AssignmentForm({
  form,
  formErrors = {},
  isSubmitting = false,
  onChangeField,
  onSubmit,
}) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [cohorts, setCohorts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [subBatches, setSubBatches] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [streams, setStreams] = useState([]);
  const [isCustomSubject, setIsCustomSubject] = useState(false);

  const todayStr = getTodayDateString();

  useEffect(() => {
    usersService.getCohorts().then(setCohorts).catch(() => setCohorts([]));
    usersService.getBatches().then(setBatches).catch(() => setBatches([]));
    usersService.getSubBatches().then(setSubBatches).catch(() => setSubBatches([]));
    usersService.getSubjects().then(setSubjects).catch(() => setSubjects([]));
    usersService.getStreams().then(setStreams).catch(() => setStreams([]));
  }, []);

  const selectedBatchIds = Array.isArray(form.selectedBatchIds)
    ? form.selectedBatchIds
    : form.batch_id ? [form.batch_id] : [];
  const selectedSubBatchIds = Array.isArray(form.selectedSubBatchIds)
    ? form.selectedSubBatchIds
    : form.sub_batch_id ? [form.sub_batch_id] : [];
  const selectedStreamIds = Array.isArray(form.selectedStreamIds)
    ? form.selectedStreamIds
    : form.stream_id ? [form.stream_id] : [];
  const mode = form.recipientMode || DEFAULT_ASSIGNMENT_RECIPIENT_MODE;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  const recipientReady =
    mode === 'By cohort'
      ? Boolean(form.cohort_id)
      : mode === 'By batch'
        ? selectedBatchIds.length > 0
        : mode === 'By sub-batch'
          ? selectedSubBatchIds.length > 0
          : mode === 'By stream'
            ? selectedStreamIds.length > 0
            : true;

  const isFormIncomplete =
    !form.topic?.trim() ||
    !form.subject?.trim() ||
    !form.start_date ||
    !form.deadline ||
    !form.message?.trim() ||
    !recipientReady;

  const recipientLabel =
    mode === 'By cohort'
      ? cohorts.find((c) => String(c.id) === String(form.cohort_id))?.code
        ? `Cohort ${cohorts.find((c) => String(c.id) === String(form.cohort_id))?.code}`
        : 'Select a cohort'
      : mode === 'By batch'
        ? selectedBatchIds.length > 0
          ? `${selectedBatchIds.length} batch(es) selected`
          : 'Select batch(es)'
        : mode === 'By sub-batch'
          ? selectedSubBatchIds.length > 0
            ? `${selectedSubBatchIds.length} sub-batch(es) selected`
            : 'Select sub-batch(es)'
          : mode === 'By stream'
            ? selectedStreamIds.length > 0
              ? `${selectedStreamIds.length} stream(s) selected`
              : 'Select stream(s)'
            : 'All Trainees';

  return (
    <section className="panel form-panel">
      <div className="panel-heading">
        <div>
          <h3>Compose assignment</h3>
          <p>Provide clear details and instructions for your trainees.</p>
        </div>
        <div className="stat-icon primary" aria-hidden="true">
          <BookOpen size={18} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="form-layout" noValidate>
        {/* Topic */}
        <Field label="Topic *" htmlFor="assignment-topic" error={formErrors.topic}>
          <input
            id="assignment-topic"
            required
            maxLength={160}
            placeholder="e.g. Data Structures — Linked Lists"
            value={form.topic}
            onChange={(e) => onChangeField('topic', e.target.value)}
            disabled={isSubmitting}
            aria-invalid={Boolean(formErrors.topic)}
          />
        </Field>

        {/* Subject */}
        <Field
          label={
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span>Subject *</span>
              <span
                role="button"
                tabIndex={0}
                onClick={() => setIsCustomSubject(!isCustomSubject)}
                onKeyDown={(e) => { if (e.key === 'Enter') setIsCustomSubject(!isCustomSubject); }}
                style={{
                  fontSize: '11px',
                  color: 'var(--color-primary)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  textDecoration: 'underline',
                }}
              >
                {isCustomSubject ? '← Choose from Master List' : '+ Enter Custom Subject'}
              </span>
            </span>
          }
          htmlFor="assignment-subject"
          error={formErrors.subject}
          helpText={isCustomSubject ? "Enter specific or unlisted topic title." : "Select curriculum module or elective stream."}
        >
          {isCustomSubject ? (
            <input
              id="assignment-subject"
              required
              maxLength={120}
              placeholder="e.g. Incubator Project / BizSkill"
              value={form.subject}
              onChange={(e) => onChangeField('subject', e.target.value)}
              disabled={isSubmitting}
              aria-invalid={Boolean(formErrors.subject)}
            />
          ) : (
            <select
              id="assignment-subject"
              required
              value={form.subject}
              onChange={(e) => {
                if (e.target.value === '__OTHER__') {
                  setIsCustomSubject(true);
                  onChangeField('subject', '');
                } else {
                  onChangeField('subject', e.target.value);
                }
              }}
              disabled={isSubmitting}
              aria-invalid={Boolean(formErrors.subject)}
            >
              <option value="">Select Curriculum Subject...</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.name}>
                  [{s.subject_type || 'CORE'}] {s.name} ({s.code})
                </option>
              ))}
              <option value="__OTHER__">Other / Type Custom Subject...</option>
            </select>
          )}
        </Field>

        {/* Platform Link */}
        <Field
          label="Platform Link"
          htmlFor="assignment-platform-link"
          error={formErrors.platform_link}
          helpText="Optional — paste a HackerEarth, LeetCode, Google Classroom, or any assignment URL."
        >
          <div className="input-with-icon">
            <Link size={14} className="input-icon" aria-hidden="true" />
            <input
              id="assignment-platform-link"
              type="url"
              placeholder="https://..."
              value={form.platform_link}
              onChange={(e) => onChangeField('platform_link', e.target.value)}
              disabled={isSubmitting}
              aria-invalid={Boolean(formErrors.platform_link)}
              className="input-padded-left"
            />
          </div>
        </Field>

        {/* Start Date & Deadline — past dates disallowed, min constrained */}
        <div className="date-row">
          <Field
            label="Start Date *"
            htmlFor="assignment-start-date"
            error={formErrors.start_date}
            helpText="Today or future date"
          >
            <div className="input-with-icon">
              <Calendar size={13} className="input-icon" aria-hidden="true" />
              <input
                id="assignment-start-date"
                type="date"
                required
                min={todayStr}
                value={form.start_date}
                onChange={(e) => onChangeField('start_date', e.target.value)}
                disabled={isSubmitting}
                aria-invalid={Boolean(formErrors.start_date)}
                className="input-padded-left"
              />
            </div>
          </Field>

          <Field
            label="Deadline / End Date *"
            htmlFor="assignment-deadline"
            error={formErrors.deadline}
            helpText="On or after start date"
          >
            <div className="input-with-icon">
              <Clock size={13} className="input-icon" aria-hidden="true" />
              <input
                id="assignment-deadline"
                type="date"
                required
                min={form.start_date || todayStr}
                value={form.deadline}
                onChange={(e) => onChangeField('deadline', e.target.value)}
                disabled={isSubmitting}
                aria-invalid={Boolean(formErrors.deadline)}
                className="input-padded-left"
              />
            </div>
          </Field>
        </div>

        {/* Recipients (Trainee Focused Targeting) */}
        <div className="field">
          <span>Recipients</span>
          <div
            className="recipient-mode-toggle"
            role="group"
            aria-label="Recipient targeting type"
            style={{ flexWrap: 'wrap' }}
          >
            {ASSIGNMENT_RECIPIENT_MODES.map((option) => (
              <button
                key={option}
                type="button"
                className={`recipient-mode-btn ${mode === option ? 'active' : ''}`}
                aria-pressed={mode === option}
                onClick={() => onChangeField('recipientMode', option)}
                disabled={isSubmitting}
              >
                {option}
              </button>
            ))}
          </div>
          {formErrors.recipients && (
            <span className="field-error-text" role="alert">
              {formErrors.recipients}
            </span>
          )}
        </div>

        {mode === 'By cohort' && (
          <Field label="Select TCS Ignite Cohort *" htmlFor="assignment-cohort">
            <select
              id="assignment-cohort"
              value={form.cohort_id || ''}
              onChange={(e) => onChangeField('cohort_id', e.target.value)}
              disabled={isSubmitting}
            >
              <option value="">Choose a cohort...</option>
              {cohorts.map((cohort) => (
                <option key={cohort.id} value={cohort.id}>
                  {cohort.code} - {cohort.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {mode === 'By batch' && (
          <div className="multi-recipient-picker">
            <div className="picker-header">
              <label className="picker-title">Select Target Major Batch(es) *</label>
              <div className="picker-quick-actions">
                <button
                  type="button"
                  className="btn-quick-link"
                  onClick={() => {
                    const allIds = batches.map((b) => b.id);
                    onChangeField('selectedBatchIds', allIds);
                    onChangeField('batch_id', allIds[0] || '');
                  }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="btn-quick-link"
                  onClick={() => {
                    onChangeField('selectedBatchIds', []);
                    onChangeField('batch_id', '');
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="checkable-pills-grid">
              {batches.map((batch) => {
                const isChecked = selectedBatchIds.some((id) => String(id) === String(batch.id));
                return (
                  <label key={batch.id} className={`checkable-pill ${isChecked ? 'active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        const next = isChecked
                          ? selectedBatchIds.filter((id) => String(id) !== String(batch.id))
                          : [...selectedBatchIds, batch.id];
                        onChangeField('selectedBatchIds', next);
                        onChangeField('batch_id', next[0] || '');
                      }}
                    />
                    <span>{batch.full_code || `Batch ${batch.name}`}</span>
                  </label>
                );
              })}
            </div>
            {selectedBatchIds.length > 0 && (
              <span className="selection-count-badge">
                {selectedBatchIds.length} batch(es) selected
              </span>
            )}
          </div>
        )}

        {mode === 'By sub-batch' && (
          <div className="multi-recipient-picker">
            <div className="picker-header">
              <label className="picker-title">Select Target Lab Sub-Batch(es) *</label>
              <div className="picker-quick-actions">
                <button
                  type="button"
                  className="btn-quick-link"
                  onClick={() => {
                    const allIds = subBatches.map((sb) => sb.id);
                    onChangeField('selectedSubBatchIds', allIds);
                    onChangeField('sub_batch_id', allIds[0] || '');
                  }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="btn-quick-link"
                  onClick={() => {
                    onChangeField('selectedSubBatchIds', []);
                    onChangeField('sub_batch_id', '');
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="checkable-pills-grid">
              {subBatches.map((sb) => {
                const isChecked = selectedSubBatchIds.some((id) => String(id) === String(sb.id));
                return (
                  <label key={sb.id} className={`checkable-pill ${isChecked ? 'active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        const next = isChecked
                          ? selectedSubBatchIds.filter((id) => String(id) !== String(sb.id))
                          : [...selectedSubBatchIds, sb.id];
                        onChangeField('selectedSubBatchIds', next);
                        onChangeField('sub_batch_id', next[0] || '');
                      }}
                    />
                    <span>{sb.full_code || sb.name}</span>
                  </label>
                );
              })}
            </div>
            {selectedSubBatchIds.length > 0 && (
              <span className="selection-count-badge">
                {selectedSubBatchIds.length} sub-batch(es) selected
              </span>
            )}
          </div>
        )}

        {mode === 'By stream' && (
          <div className="multi-recipient-picker">
            <div className="picker-header">
              <label className="picker-title">Select Target Elective Stream(s) (Month 4 Specialization) *</label>
              <div className="picker-quick-actions">
                <button
                  type="button"
                  className="btn-quick-link"
                  onClick={() => {
                    const allIds = streams.map((s) => s.id);
                    onChangeField('selectedStreamIds', allIds);
                    onChangeField('stream_id', allIds[0] || '');
                  }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="btn-quick-link"
                  onClick={() => {
                    onChangeField('selectedStreamIds', []);
                    onChangeField('stream_id', '');
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="checkable-pills-grid">
              {streams.length === 0 ? (
                <div style={{ padding: '12px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  No elective streams configured. Add them in the Batch Hierarchy modal.
                </div>
              ) : (
                streams.map((stream) => {
                  const isChecked = selectedStreamIds.some((id) => String(id) === String(stream.id));
                  return (
                    <label key={stream.id} className={`checkable-pill ${isChecked ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const next = isChecked
                            ? selectedStreamIds.filter((id) => String(id) !== String(stream.id))
                            : [...selectedStreamIds, stream.id];
                          onChangeField('selectedStreamIds', next);
                          onChangeField('stream_id', next[0] || '');
                        }}
                      />
                      <span>{stream.code} — {stream.name}</span>
                    </label>
                  );
                })
              )}
            </div>
            {selectedStreamIds.length > 0 && (
              <span className="selection-count-badge">
                {selectedStreamIds.length} stream(s) selected
              </span>
            )}
          </div>
        )}

        {/* Assignment Message / Instructions */}
        <Field
          label="Assignment Message / Instructions *"
          htmlFor="assignment-message"
          error={formErrors.message}
        >
          <textarea
            id="assignment-message"
            required
            rows={7}
            maxLength={VALIDATION_LIMITS.BROADCAST_MESSAGE_MAX}
            placeholder="Describe the assignment, include any submission guidelines, expected outputs, or resources..."
            value={form.message}
            onChange={(e) => onChangeField('message', e.target.value)}
            disabled={isSubmitting}
            aria-invalid={Boolean(formErrors.message)}
          />
        </Field>

        {/* Form Footer */}
        <div className="form-foot">
          <span>
            <Users size={14} aria-hidden="true" /> Assign to: <b>{recipientLabel}</b>
          </span>
          <div className="form-foot-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setIsPreviewOpen(true)}
              disabled={isFormIncomplete}
              title="Preview assignment details"
            >
              <Eye size={15} aria-hidden="true" /> Preview
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={isSubmitting || isFormIncomplete}
            >
              <Send size={15} aria-hidden="true" />
              {isSubmitting ? 'Publishing...' : 'Publish assignment'}
            </button>
          </div>
        </div>
      </form>

      <AssignmentPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        form={form}
      />
    </section>
  );
}
