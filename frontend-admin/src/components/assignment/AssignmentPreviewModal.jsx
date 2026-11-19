import React, { useEffect, useRef } from 'react';
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  Clock3,
  Link,
  Users,
  X,
} from 'lucide-react';
import { IconTile, InfoTile, StatusBadge } from '../ui/CardPrimitives';

function formatAssignmentDate(value) {
  if (!value) return '—';

  const text = String(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(text);

  if (Number.isNaN(date.getTime())) return text;
  if (
    dateOnly &&
    (date.getFullYear() !== Number(dateOnly[1]) ||
      date.getMonth() !== Number(dateOnly[2]) - 1 ||
      date.getDate() !== Number(dateOnly[3]))
  ) {
    return text;
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function AssignmentPreviewModal({ isOpen, onClose, form }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll(focusableSelector))
        .filter((element) => element.getAttribute('aria-hidden') !== 'true');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    closeButtonRef.current?.focus();
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay modal-backdrop assignment-preview-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="assignment-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assignment-preview-title"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="assignment-preview-header">
          <div className="assignment-preview-heading">
            <span className="assignment-preview-eyebrow">
              PREVIEW
            </span>
            <h2 id="assignment-preview-title">Assignment Details</h2>
          </div>
          <button
            type="button"
            className="assignment-preview-close"
            onClick={onClose}
            aria-label="Close assignment preview"
            ref={closeButtonRef}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="assignment-preview-body">
          <div className="preview-assignment-card">
            <div className="preview-label-row">
              <IconTile icon={BookOpen} tone="blue" size={17} />
              <StatusBadge tone="blue">Assignment</StatusBadge>
            </div>

            <h3 className="preview-topic">{form?.topic || '—'}</h3>

            <div className="assignment-preview-subject">
              <span>Subject</span>
              <strong>{form?.subject || '—'}</strong>
            </div>

            {form?.platform_link && (
              <a
                className="preview-link-chip"
                href={form.platform_link}
                target="_blank"
                rel="noreferrer noopener"
                title={form.platform_link}
              >
                <Link size={14} aria-hidden="true" />
                <span>{form.platform_link}</span>
              </a>
            )}

            <div className="preview-dates">
              <InfoTile
                icon={CalendarDays}
                label="Start"
                value={formatAssignmentDate(form?.start_date)}
                tone="blue"
              />
              <InfoTile
                icon={Clock3}
                label="Deadline"
                value={formatAssignmentDate(form?.deadline)}
                tone="amber"
              />
            </div>

            <div className="preview-message-block">
              <div className="preview-message-heading">
                <IconTile icon={ClipboardList} tone="blue" size={16} />
                <span>Instructions</span>
              </div>
              <p>{form?.message || '—'}</p>
            </div>

            <div className="preview-audience">
              <Users size={15} aria-hidden="true" />
              <span>Assigned to</span>
              <StatusBadge tone="roster">{form?.audience || 'All students'}</StatusBadge>
            </div>
          </div>
        </div>

        <div className="assignment-preview-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
