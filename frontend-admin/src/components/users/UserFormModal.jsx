import React, { useState, useEffect } from 'react';
import { X, UserPlus, Edit3, Layers } from 'lucide-react';
import { Field } from '../ui/Field';
import { createPortal } from 'react-dom';
import { usersService } from '../../services/usersService';
import { BatchHierarchyModal } from './BatchHierarchyModal';
import { useRoleAccess } from '../../hooks/useRoleAccess';

export function UserFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialUser = null,
}) {
  const isEditing = Boolean(initialUser);
  const { canAccessModule } = useRoleAccess();

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'TRAINEE',
    employee_id: '',
    sub_batch: '',
    stream: '',
    is_active: true,
  });

  const [subBatches, setSubBatches] = useState([]);
  const [streams, setStreams] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showHierarchyModal, setShowHierarchyModal] = useState(false);

  const refreshHierarchyData = () => {
    usersService.getSubBatches()
      .then((data) => setSubBatches(data || []))
      .catch(() => setSubBatches([]));

    usersService.getStreams()
      .then((data) => setStreams(data || []))
      .catch(() => setStreams([]));
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      refreshHierarchyData();
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (initialUser) {
      setForm({
        username: initialUser.username || '',
        email: initialUser.email || '',
        password: '',
        role: initialUser.role || 'TRAINEE',
        employee_id: initialUser.employee_id || '',
        sub_batch: initialUser.sub_batch ? String(initialUser.sub_batch) : '',
        stream: initialUser.stream ? String(initialUser.stream) : '',
        is_active: initialUser.is_active !== false,
      });
    } else {
      setForm({
        username: '',
        email: '',
        password: '',
        role: 'TRAINEE',
        employee_id: '',
        sub_batch: '',
        stream: '',
        is_active: true,
      });
    }

    setErrors({});
  }, [initialUser, isOpen]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();

    const newErrors = {};

    if (!form.username.trim()) {
      newErrors.username = 'Username is required.';
    }

    if (!form.email.trim()) {
      newErrors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      newErrors.email = 'Please provide a valid email address.';
    }

    if (!isEditing && !form.password.trim()) {
      newErrors.password = 'Password is required.';
    } else if (form.password && form.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters.';
    }

    if (form.role === 'TRAINEE' && !form.employee_id.trim()) {
      newErrors.employee_id = 'Employee ID is required for trainees.';
    } else if (form.employee_id.trim() && !/^\d{7}$/.test(form.employee_id.trim())) {
      newErrors.employee_id = 'Employee ID must be a 7-digit integer (e.g. 1234567).';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        username: form.username.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        employee_id: form.employee_id.trim() || '',
        sub_batch: form.sub_batch ? parseInt(form.sub_batch, 10) : null,
        stream: form.stream ? parseInt(form.stream, 10) : null,
      };

      if (form.password.trim()) {
        payload.password = form.password;
      }

      if (isEditing) {
        payload.is_active = Boolean(form.is_active);
      }

      await onSubmit(payload, initialUser?.id);
      onClose();
    } catch (err) {
      const backendDetails = err.details || {};
      const fieldErrors = {};
      for (const [key, val] of Object.entries(backendDetails)) {
        fieldErrors[key] = Array.isArray(val) ? val.join(' ') : String(val);
      }
      setErrors({
        ...fieldErrors,
        general: err.message || 'Operation failed. Please review the form and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-modal-title"
      onClick={onClose}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="entry-icon" aria-hidden="true">
              {isEditing ? <Edit3 size={16} /> : <UserPlus size={16} />}
            </span>
            <h3 id="user-modal-title">
              {isEditing ? 'Edit user' : 'Add new user'}
            </h3>
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close user modal"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="form-layout" noValidate>
          {errors.general && (
            <div
              style={{
                padding: '8px 12px',
                background: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--color-danger)',
                borderRadius: 'var(--radius-sm, 6px)',
                fontSize: '12px',
                marginBottom: '12px',
                border: '1px solid rgba(239, 68, 68, 0.25)',
              }}
              role="alert"
            >
              {errors.general}
            </div>
          )}

          <Field label="Username" htmlFor="user-username" error={errors.username}>
            <input
              id="user-username"
              required
              placeholder="e.g. 2109845 or trainee1"
              value={form.username}
              onChange={(e) => {
                setForm({ ...form, username: e.target.value });
                if (errors.username) setErrors({ ...errors, username: '' });
              }}
              autoFocus
            />
          </Field>

          <Field label="Email address" htmlFor="user-email" error={errors.email}>
            <input
              id="user-email"
              required
              type="email"
              placeholder="e.g. trainee1@tcs.com"
              value={form.email}
              onChange={(e) => {
                setForm({ ...form, email: e.target.value });
                if (errors.email) setErrors({ ...errors, email: '' });
              }}
            />
          </Field>

          <Field label="Password" htmlFor="user-password" error={errors.password}>
            <input
              id="user-password"
              type="password"
              placeholder={isEditing ? 'Leave blank to keep current password' : 'Enter password (min 8 chars)'}
              value={form.password}
              onChange={(e) => {
                setForm({ ...form, password: e.target.value });
                if (errors.password) setErrors({ ...errors, password: '' });
              }}
            />
          </Field>

          <div className="date-time-grid">
            <Field label="Role" htmlFor="user-role">
              <select
                id="user-role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="TRAINEE">Trainee</option>
                <option value="TA">TA</option>
                <option value="HR">HR</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </Field>

            <Field label="Employee ID" htmlFor="user-employee-id" error={errors.employee_id}>
              <input
                id="user-employee-id"
                placeholder="e.g. TCS284910"
                value={form.employee_id}
                onChange={(e) => {
                  setForm({ ...form, employee_id: e.target.value });
                  if (errors.employee_id) setErrors({ ...errors, employee_id: '' });
                }}
              />
            </Field>
          </div>

          <Field
            label={
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span>TCS Ignite Sub-Batch (Cohort & Lab)</span>
                {canAccessModule('hierarchy') && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowHierarchyModal(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setShowHierarchyModal(true);
                      }
                    }}
                    style={{
                      color: 'var(--color-primary)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 600,
                      textDecoration: 'underline',
                    }}
                  >
                    + Add / Manage Batches
                  </span>
                )}
              </span>
            }
            htmlFor="user-sub-batch"
            helpText="Assign the trainee to their designated batch and laboratory."
          >
            <select
              id="user-sub-batch"
              value={form.sub_batch}
              onChange={(e) => setForm({ ...form, sub_batch: e.target.value })}
            >
              <option value="">No Batch Assigned</option>
              {subBatches.map((sb) => (
                <option key={sb.id} value={sb.id}>
                  {sb.full_code ? `${sb.full_code} (${sb.batch_name} - ${sb.name})` : `${sb.cohort_code || ''} ${sb.batch_name || ''} - ${sb.name}`}
                  {sb.lab_name ? ` · ${sb.lab_name}` : ''}
                </option>
              ))}
            </select>
          </Field>

          {form.role === 'TRAINEE' && (
            <Field
              label="Elective Stream (Month 4 Specialization)"
              htmlFor="user-stream"
              helpText="Optional — Month 4 afternoon track (AI Engineering, Java Springboot, Angular, etc.)."
            >
              <select
                id="user-stream"
                value={form.stream}
                onChange={(e) => setForm({ ...form, stream: e.target.value })}
              >
                <option value="">No Stream (Months 1-3 Foundational)</option>
                {streams.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.code} — {st.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {isEditing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <b>User account is active</b>
              </label>
            </div>
          )}

          <div className="form-foot" style={{ marginTop: '8px' }}>
            <span />
            <div className="form-foot-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={submitting}
              >
                {submitting ? 'Saving...' : isEditing ? 'Save changes' : 'Add user'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {canAccessModule('hierarchy') && (
        <BatchHierarchyModal
          isOpen={showHierarchyModal}
          onClose={() => setShowHierarchyModal(false)}
          onHierarchyUpdated={refreshHierarchyData}
        />
      )}
    </div>,
    document.body
  );
}
