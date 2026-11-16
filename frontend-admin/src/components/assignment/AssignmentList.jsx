import React, { useState } from 'react';
import { BookOpen, Users, Send, Calendar, Clock, Link, Check, User } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { formatDate } from '../../utils/date';

const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function AssignmentList({
  assignments = [],
  loading = false,
  historyFilter = 'mine',
  onFilterChange,
  onCreateClick,
  deadlineUpdating = {},
  onUpdateDeadline,
}) {
  // Local state for editable deadlines per card: { [id]: dateString }
  const [editDeadlines, setEditDeadlines] = useState({});
  const [dateErrors, setDateErrors] = useState({});

  const todayStr = getTodayDateString();

  const formatAudience = (item) => {
    const mode = item.recipient_mode || item.recipient_type;
    if (mode === 'COHORT') return `Cohort: ${item.target_cohort_code || item.cohort?.code || 'Targeted'}`;
    if (mode === 'BATCH') return `Batch: ${item.target_batch_code || (item.batches && item.batches.length ? item.batches.map(b => b.name || b.code).join(', ') : 'Targeted')}`;
    if (mode === 'SUB_BATCH') return `Sub-Batch: ${item.target_sub_batch_code || (item.sub_batches && item.sub_batches.length ? item.sub_batches.map(sb => sb.name || sb.code).join(', ') : 'Targeted')}`;
    if (mode === 'STREAM') return `Stream: ${item.streams && item.streams.length ? item.streams.map(s => s.name || s.code).join(', ') : 'Targeted'}`;
    if (mode === 'ROLE') return `Role: ${item.target_role || 'Targeted'}`;
    if (mode === 'USERS' || mode === 'USER') return `Specific: ${item.target_username || 'Selected users'}`;
    return item.audience || 'All Trainees';
  };

  // Filter logic: "mine" shows posted_by_me === true, "others" shows the rest
  const filteredAssignments = assignments.filter((a) => {
    if (historyFilter === 'mine') return a.posted_by_me !== false;
    return a.posted_by_me === false;
  });

  const handleDeadlineChange = (id, value) => {
    setEditDeadlines((prev) => ({ ...prev, [id]: value }));
    setDateErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleDeadlineSave = (item) => {
    const newDeadline = editDeadlines[item.id] ?? item.deadline;
    if (!newDeadline) return;

    if (newDeadline < todayStr) {
      setDateErrors((prev) => ({ ...prev, [item.id]: 'Deadline cannot be in the past.' }));
      return;
    }

    if (onUpdateDeadline) onUpdateDeadline(item.id, newDeadline);
  };

  const getDeadlineValue = (item) => {
    if (editDeadlines[item.id] !== undefined) return editDeadlines[item.id];
    if (!item.deadline) return '';
    try {
      return new Date(item.deadline).toISOString().slice(0, 10);
    } catch {
      return item.deadline;
    }
  };

  return (
    <section className="panel list-panel">
      <div className="panel-heading">
        <div>
          <h3>Assignment history</h3>
          <p>{filteredAssignments.length} assignment{filteredAssignments.length !== 1 ? 's' : ''}</p>
        </div>
        <span className="count-badge" aria-label={`${assignments.length} total assignments`}>
          {assignments.length}
        </span>
      </div>

      {/* Filter Tabs */}
      <div className="assignment-history-tabs" role="tablist" aria-label="Assignment history filter">
        <button
          type="button"
          role="tab"
          aria-selected={historyFilter === 'mine'}
          className={`assignment-tab-btn ${historyFilter === 'mine' ? 'active' : ''}`}
          onClick={() => onFilterChange && onFilterChange('mine')}
        >
          Posted by Me
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={historyFilter === 'others'}
          className={`assignment-tab-btn ${historyFilter === 'others' ? 'active' : ''}`}
          onClick={() => onFilterChange && onFilterChange('others')}
        >
          Posted by Others
        </button>
      </div>

      {/* Content */}
      {loading && assignments.length === 0 ? (
        <div
          style={{
            padding: '36px',
            textAlign: 'center',
            color: 'var(--color-text-secondary)',
            fontSize: '11.5px',
          }}
        >
          Loading assignments...
        </div>
      ) : filteredAssignments.length > 0 ? (
        filteredAssignments.map((item) => (
          <article className="list-entry assignment-entry" key={item.id}>
            <div className="entry-top">
              <span className="entry-icon" aria-hidden="true">
                <BookOpen size={15} />
              </span>
              <span className="published-tag">Published</span>
            </div>

            {/* Topic & Subject */}
            <h4>{item.topic || item.title || '—'}</h4>
            {(item.subject_name || item.subject) && (
              <p className="assignment-entry-subject">
                <strong>Subject:</strong> {item.subject_name || item.subject}
              </p>
            )}

            {/* Platform link */}
            {item.platform_link && (
              <p className="assignment-entry-link">
                <Link size={11} aria-hidden="true" />
                <a href={item.platform_link} target="_blank" rel="noreferrer noopener">
                  {item.platform_name ? `${item.platform_name}: ` : ''}{item.platform_link}
                </a>
              </p>
            )}

            {/* Instructions preview */}
            {item.message && (
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '6px 0 10px', lineHeight: '1.4' }}>
                {item.message}
              </p>
            )}

            {/* Meta: audience + author + start date */}
            <div className="entry-meta">
              <span style={{ fontWeight: 600 }}>
                <Users size={13} aria-hidden="true" />
                {formatAudience(item)}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--color-primary)' }}>
                <User size={12} aria-hidden="true" />
                Posted by: <strong>{item.posted_by_me ? 'You' : (item.created_by_name || 'Staff')}</strong>
              </span>
              {item.start_date && (
                <span>
                  <Calendar size={12} aria-hidden="true" />
                  Start: {formatDate(item.start_date)}
                </span>
              )}
            </div>

            {/* Editable Deadline */}
            <div className="deadline-editable-row">
              <label
                className="deadline-label"
                htmlFor={`deadline-input-${item.id}`}
              >
                <Clock size={12} aria-hidden="true" />
                Deadline:
              </label>
              <input
                id={`deadline-input-${item.id}`}
                type="date"
                min={todayStr}
                className="deadline-date-input"
                value={getDeadlineValue(item)}
                onChange={(e) => handleDeadlineChange(item.id, e.target.value)}
                aria-label="Assignment deadline"
              />
              <button
                type="button"
                className="deadline-save-btn"
                disabled={deadlineUpdating[item.id]}
                onClick={() => handleDeadlineSave(item)}
                title="Save updated deadline and notify trainees"
              >
                {deadlineUpdating[item.id] ? (
                  '...'
                ) : (
                  <>
                    <Check size={12} aria-hidden="true" /> Update
                  </>
                )}
              </button>
            </div>
            {dateErrors[item.id] && (
              <span style={{ color: 'var(--color-danger)', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                {dateErrors[item.id]}
              </span>
            )}
          </article>
        ))
      ) : (
        <EmptyState
          icon={Send}
          title={
            historyFilter === 'mine'
              ? 'No assignments posted yet'
              : 'No assignments from others'
          }
          text={
            historyFilter === 'mine'
              ? 'Your published assignments will appear here.'
              : 'Assignments posted by other admins will appear here.'
          }
          action={historyFilter === 'mine' && onCreateClick ? 'Create assignment' : undefined}
          onClick={onCreateClick}
        />
      )}
    </section>
  );
}
