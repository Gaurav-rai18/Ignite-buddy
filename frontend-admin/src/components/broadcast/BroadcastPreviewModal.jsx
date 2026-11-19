import React, { useEffect } from 'react';
import { X, Users, Megaphone } from 'lucide-react';
import { IconTile, StatusBadge } from '../ui/CardPrimitives';

export function BroadcastPreviewModal({ isOpen, onClose, form }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const mode = form.recipientMode || 'All users';
  const selectedUsers = Array.isArray(form.selectedUsers) ? form.selectedUsers : [];
  const recipientSummary =
    mode === 'By role'
      ? form.role || 'Select a role'
      : mode === 'By cohort'
        ? `Cohort ID: ${form.cohort_id || 'Selected'}`
        : mode === 'By batch'
          ? `${(form.selectedBatchIds || []).length || (form.batch_id ? 1 : 0)} batch(es)`
          : mode === 'By sub-batch'
            ? `${(form.selectedSubBatchIds || []).length || (form.sub_batch_id ? 1 : 0)} sub-batch(es)`
            : mode === 'By stream'
              ? `${(form.selectedStreamIds || []).length || (form.stream_id ? 1 : 0)} elective stream(s)`
              : mode === 'Specific users'
                ? `${selectedUsers.length} selected user${selectedUsers.length === 1 ? '' : 's'}`
                : 'All users';

  return (
    <div
      className="modal-overlay announcement-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-title"
      onClick={onClose}
    >
      <div className="announcement-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="announcement-preview-header">
          <div className="announcement-preview-heading">
            <IconTile icon={Megaphone} tone="blue" size={18} />
            <div>
              <span className="announcement-preview-eyebrow">PREVIEW</span>
              <h2 id="preview-title">Announcement Preview</h2>
            </div>
          </div>
          <button
            type="button"
            className="announcement-preview-close"
            onClick={onClose}
            aria-label="Close preview modal"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="announcement-preview-content">
          <div className="announcement-preview-audience">
            <StatusBadge tone="blue" className="announcement-preview-audience-badge">
              <Users size={12} aria-hidden="true" />
              {recipientSummary}
            </StatusBadge>
            <span className="announcement-preview-hint">Preview as student</span>
          </div>

          {mode === 'Specific users' && selectedUsers.length > 0 && (
            <div className="recipient-chips announcement-preview-selected-users">
              {selectedUsers.map((user) => (
                <span className="recipient-chip static" key={user.id}>
                  {user.username}
                </span>
              ))}
            </div>
          )}

          <section className="announcement-preview-card" aria-label="Announcement content">
            <h3 className="announcement-preview-title">
              {form.title.trim() || 'Untitled Announcement'}
            </h3>
            <p className="announcement-preview-message">
              {form.message.trim() || 'No announcement message entered yet.'}
            </p>
          </section>

          <div className="announcement-preview-footer">
            <button type="button" className="secondary-button" onClick={onClose}>
              Close Preview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
