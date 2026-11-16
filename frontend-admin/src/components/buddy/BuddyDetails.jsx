import React, { useState, useEffect } from 'react';
import {
  Bot,
  Info,
  ShieldAlert,
  Cpu,
  Mic,
  Eye,
  Sliders,
  BookOpen,
  AlertOctagon,
  Save,
  Check,
  Clock,
  CheckCircle2,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Users,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { buddyService } from '../../services/buddyService';
import { usersService } from '../../services/usersService';

export function BuddyDetails({
  settings,
  isUpdating,
  onToggleBuddy,
  onUpdateSetting,
  onSaveBatch,
  onNotify,
}) {
  const [form, setForm] = useState(settings);
  const [hasPromptChanged, setHasPromptChanged] = useState(false);
  const [hasKeywordsChanged, setHasKeywordsChanged] = useState(false);
  const [hasTestBuffersChanged, setHasTestBuffersChanged] = useState(false);

  // Hierarchical Rules & Overrides State
  const [rulesList, setRulesList] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [isNewRuleModalOpen, setIsNewRuleModalOpen] = useState(false);
  const [newRuleForm, setNewRuleForm] = useState({
    action: 'BLOCK', // 'BLOCK' or 'OVERRIDE_ALLOW'
    scope: 'SUB_BATCH', // 'TRAINEE', 'SUB_BATCH', 'BATCH', 'COHORT'
    target_id: '',
    target_identifier: '', // Employee ID or email if trainee
    reason: 'Assessment in progress',
    duration_minutes: 60,
  });

  const [cohorts, setCohorts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [subBatches, setSubBatches] = useState([]);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    loadRules();
    usersService.getCohorts().then(setCohorts).catch(() => { });
    usersService.getBatches().then(setBatches).catch(() => { });
    usersService.getSubBatches().then(setSubBatches).catch(() => { });
  }, []);

  const loadRules = async () => {
    setRulesLoading(true);
    try {
      const data = await buddyService.getExamRules();
      setRulesList(data || []);
    } catch (e) {
      console.error('Failed to load rules', e);
    } finally {
      setRulesLoading(false);
    }
  };

  const handleToggle = (key) => {
    const nextVal = !form[key];
    setForm((prev) => ({ ...prev, [key]: nextVal }));
    onUpdateSetting(key, nextVal, () => {
      onNotify?.(`${key.replace(/_/g, ' ')} updated`);
    });
  };

  const handleSavePrompt = () => {
    onUpdateSetting('llm_system_prompt', form.llm_system_prompt, () => {
      setHasPromptChanged(false);
      onNotify?.('Campus system directive saved successfully');
    });
  };

  const handleSaveKeywords = () => {
    onUpdateSetting('blocked_keywords', form.blocked_keywords, () => {
      setHasKeywordsChanged(false);
      onNotify?.('Safety blocked keywords updated');
    });
  };

  const handleSaveExamReason = () => {
    onUpdateSetting('exam_reason', form.exam_reason, () => {
      onNotify?.('Exam blackout notice updated');
    });
  };

  const handleSaveTestBuffers = () => {
    onUpdateSetting('test_buffer_before_minutes', parseInt(form.test_buffer_before_minutes, 10) || 15, () => {
      onUpdateSetting('test_buffer_after_minutes', parseInt(form.test_buffer_after_minutes, 10) || 15, () => {
        setHasTestBuffersChanged(false);
        onNotify?.('Test lockout buffer timings saved');
      });
    });
  };

  const handleCreateRule = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        action: newRuleForm.action,
        scope: newRuleForm.scope,
        reason: newRuleForm.reason,
        duration_minutes: parseInt(newRuleForm.duration_minutes, 10) || 60,
      };

      if (newRuleForm.scope === 'TRAINEE') {
        if (newRuleForm.target_identifier.includes('@')) {
          payload.email = newRuleForm.target_identifier;
        } else {
          payload.employee_id = newRuleForm.target_identifier;
        }
      } else {
        payload.target_id = newRuleForm.target_id;
      }

      await buddyService.createExamRule(payload);
      onNotify?.(`Created ${newRuleForm.action} policy for ${newRuleForm.scope}`);
      setIsNewRuleModalOpen(false);
      await loadRules();
    } catch (err) {
      onNotify?.('Failed to create rule: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      await buddyService.deleteExamRule(ruleId);
      onNotify?.('Rule revoked successfully.');
      await loadRules();
    } catch (e) {
      onNotify?.('Failed to revoke rule.');
    }
  };

  return (
    <div className="buddy-controls-grid">
      {/* 1. MASTER AVAILABILITY & GLOBAL EXAM LOCKDOWN */}
      <section className="panel control-info">
        <div className="panel-heading">
          <div>
            <h3>Master Availability & Global Lockdown</h3>
            <p>Control campus-wide assistant switches</p>
          </div>
          <div className="stat-icon primary" aria-hidden="true">
            <Bot size={18} />
          </div>
        </div>

        <div className="setting-row">
          <div>
            <b>Buddy Assistant Service</b>
            <small>Master ON/OFF switch across the campus</small>
          </div>
          <button
            type="button"
            className={`switch ${form.enabled ? 'switch-on' : ''}`}
            role="switch"
            aria-checked={form.enabled}
            aria-label="Toggle Buddy availability"
            disabled={isUpdating}
            onClick={onToggleBuddy}
          >
            <span />
          </button>
        </div>

        <div className="setting-row">
          <div>
            <b>Emergency Campus Exam Mode</b>
            <small>Strict blackout for the entire campus</small>
          </div>
          <button
            type="button"
            className={`switch ${form.exam_mode ? 'switch-on' : ''}`}
            role="switch"
            aria-checked={form.exam_mode}
            aria-label="Toggle Exam mode"
            disabled={isUpdating}
            onClick={() => handleToggle('exam_mode')}
          >
            <span />
          </button>
        </div>

        {form.exam_mode && (
          <div className="exam-mode-banner" role="alert">
            <div className="exam-banner-header">
              <ShieldAlert size={16} />
              <strong>Campus-Wide Exam Mode is Active</strong>
            </div>
            <p>All trainee desktop assistants are restricted across all batches.</p>
            <div className="exam-reason-field">
              <label htmlFor="exam-reason-input">Blackout reason shown to trainees:</label>
              <div className="input-with-button">
                <input
                  id="exam-reason-input"
                  type="text"
                  value={form.exam_reason || ''}
                  onChange={(e) => setForm({ ...form, exam_reason: e.target.value })}
                  placeholder="e.g. Assessment in progress. Buddy assistant is temporarily paused."
                  className="text-input"
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleSaveExamReason}
                  disabled={isUpdating}
                >
                  <Save size={14} />
                  <span>Update</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2. TARGETED LOCKDOWN & ADMIN OVERRIDES (HIERARCHICAL EXAM CONTROL) */}
      <section className="panel control-info" style={{ gridColumn: 'span 2' }}>
        <div className="panel-heading">
          <div>
            <h3>Hierarchical Exam Lockdown & Admin Overrides</h3>
            <p>Lock the assistant for a specific Cohort, Batch, or Sub-Batch, or grant Trainee-level bypass exceptions</p>
          </div>
          <button
            type="button"
            className="primary-button"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => setIsNewRuleModalOpen(true)}
          >
            <Plus size={14} />
            <span>Create Rule / Override</span>
          </button>
        </div>

        {/* Rules Table */}
        <div style={{ marginTop: '14px', overflowX: 'auto' }}>
          {rulesLoading ? (
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Loading policy rules...</p>
          ) : rulesList.length > 0 ? (
            <table className="user-table" style={{ width: '100%', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Scope</th>
                  <th>Target</th>
                  <th>Reason</th>
                  <th>Expires At</th>
                  <th>Created By</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rulesList.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: r.action === 'BLOCK' ? 'var(--color-danger-bg)' : 'var(--color-success-bg)',
                          color: r.action === 'BLOCK' ? 'var(--color-danger)' : 'var(--color-success)',
                        }}
                      >
                        {r.action === 'BLOCK' ? <Lock size={11} /> : <ShieldCheck size={11} />}
                        {r.action === 'BLOCK' ? 'Lockdown' : 'Override Allow'}
                      </span>
                    </td>
                    <td><b>{r.scope}</b></td>
                    <td>{r.target_label}</td>
                    <td>{r.reason}</td>
                    <td>{new Date(r.valid_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{r.created_by}</td>
                    <td>
                      <button
                        type="button"
                        className="danger-button"
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                        onClick={() => handleDeleteRule(r.id)}
                        title="Revoke Rule"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-secondary)', background: 'var(--color-surface-muted)', borderRadius: '8px' }}>
              <ShieldCheck size={28} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
              <p>No active targeted lockdowns or overrides. Normal schedule & master availability applies.</p>
            </div>
          )}
        </div>
      </section>

      {/* 3. AUTOMATED TEST LOCKDOWN (SCHEDULE-DRIVEN) */}
      <section className="panel control-info">
        <div className="panel-heading">
          <div>
            <h3>Automated Schedule-Driven Test Lock</h3>
            <p>Auto-disables the Buddy during scheduled batch exit tests & evaluations</p>
          </div>
          <div className="stat-icon warning" aria-hidden="true" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
            <Clock size={18} />
          </div>
        </div>

        <div className="setting-row">
          <div>
            <b>Auto-Lock During Timetable Tests</b>
            <small>Detects assessment lectures (IO Exit, BizSkill TS Exit) and locks Buddy</small>
          </div>
          <button
            type="button"
            className={`switch ${form.test_auto_lock_enabled !== false ? 'switch-on' : ''}`}
            role="switch"
            aria-checked={form.test_auto_lock_enabled !== false}
            aria-label="Toggle auto test lock"
            disabled={isUpdating}
            onClick={() => handleToggle('test_auto_lock_enabled')}
          >
            <span />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'flex-end', marginTop: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              Buffer Before Test (min)
            </label>
            <input
              type="number"
              min="0"
              max="60"
              value={form.test_buffer_before_minutes ?? 15}
              onChange={(e) => {
                setForm({ ...form, test_buffer_before_minutes: e.target.value });
                setHasTestBuffersChanged(true);
              }}
              className="text-input"
              style={{ width: '100%', height: '36px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              Buffer After Test (min)
            </label>
            <input
              type="number"
              min="0"
              max="60"
              value={form.test_buffer_after_minutes ?? 15}
              onChange={(e) => {
                setForm({ ...form, test_buffer_after_minutes: e.target.value });
                setHasTestBuffersChanged(true);
              }}
              className="text-input"
              style={{ width: '100%', height: '36px' }}
            />
          </div>

          <button
            type="button"
            className="secondary-button"
            style={{ height: '36px', marginBottom: '2px' }}
            onClick={handleSaveTestBuffers}
            disabled={!hasTestBuffersChanged || isUpdating}
          >
            <Save size={14} />
            <span>Save</span>
          </button>
        </div>
      </section>

      {/* 4. AI & MODEL CONFIGURATION */}
      <section className="panel control-info">
        <div className="panel-heading">
          <div>
            <h3>Campus Prompt & Directive</h3>
            <p>Guidelines provided to the AI assistant</p>
          </div>
          <div className="stat-icon info" aria-hidden="true">
            <Cpu size={18} />
          </div>
        </div>

        <div style={{ marginTop: '12px' }}>
          <textarea
            className="text-input"
            rows={4}
            value={form.llm_system_prompt || ''}
            onChange={(e) => {
              setForm({ ...form, llm_system_prompt: e.target.value });
              setHasPromptChanged(true);
            }}
            placeholder="System prompt instructions..."
            style={{ width: '100%', fontSize: '12px' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              type="button"
              className="secondary-button"
              onClick={handleSavePrompt}
              disabled={!hasPromptChanged || isUpdating}
            >
              <Save size={14} />
              <span>Save Directive</span>
            </button>
          </div>
        </div>
      </section>

      {/* CREATE RULE / OVERRIDE MODAL */}
      {isNewRuleModalOpen && (
        <div className="modal-backdrop">
          <div className="slot-edit-modal-dialog" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div>
                <h3>Create Exam Policy Rule</h3>
                <p>Configure a targeted lockdown or an admin override whitelist</p>
              </div>
              <button type="button" className="close-icon-btn" onClick={() => setIsNewRuleModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="modal-body-form">
              <div className="form-field-group">
                <label>Policy Action</label>
                <select
                  className="select-input"
                  value={newRuleForm.action}
                  onChange={(e) => setNewRuleForm({ ...newRuleForm, action: e.target.value })}
                >
                  <option value="BLOCK">Lockdown / Block Assistant</option>
                  <option value="OVERRIDE_ALLOW">Admin Override: Allow Assistant (Whitelist)</option>
                </select>
              </div>

              <div className="form-field-group">
                <label>Target Scope</label>
                <select
                  className="select-input"
                  value={newRuleForm.scope}
                  onChange={(e) => setNewRuleForm({ ...newRuleForm, scope: e.target.value })}
                >
                  <option value="SUB_BATCH">Sub-Batch (e.g. A1, B2)</option>
                  <option value="BATCH">Major Batch (e.g. A, B, C)</option>
                  <option value="COHORT">Entire Cohort (e.g. B50)</option>
                  <option value="TRAINEE">Specific Trainee (Employee ID or Email)</option>
                </select>
              </div>

              {newRuleForm.scope === 'SUB_BATCH' && (
                <div className="form-field-group">
                  <label>Select Sub-Batch</label>
                  <select
                    className="select-input"
                    value={newRuleForm.target_id}
                    onChange={(e) => setNewRuleForm({ ...newRuleForm, target_id: e.target.value })}
                    required
                  >
                    <option value="">Select sub-batch...</option>
                    {subBatches.map((sb) => (
                      <option key={sb.id} value={sb.id}>
                        {sb.full_code || sb.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {newRuleForm.scope === 'BATCH' && (
                <div className="form-field-group">
                  <label>Select Batch</label>
                  <select
                    className="select-input"
                    value={newRuleForm.target_id}
                    onChange={(e) => setNewRuleForm({ ...newRuleForm, target_id: e.target.value })}
                    required
                  >
                    <option value="">Select batch...</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.full_code || b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {newRuleForm.scope === 'COHORT' && (
                <div className="form-field-group">
                  <label>Select Cohort</label>
                  <select
                    className="select-input"
                    value={newRuleForm.target_id}
                    onChange={(e) => setNewRuleForm({ ...newRuleForm, target_id: e.target.value })}
                    required
                  >
                    <option value="">Select cohort...</option>
                    {cohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        Cohort {c.code}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {newRuleForm.scope === 'TRAINEE' && (
                <div className="form-field-group">
                  <label>Trainee 7-digit Employee ID or Email</label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="e.g. 1234567 or trainee@tcs.com"
                    value={newRuleForm.target_identifier}
                    onChange={(e) => setNewRuleForm({ ...newRuleForm, target_identifier: e.target.value })}
                    required
                  />
                </div>
              )}

              <div className="form-row-2col">
                <div className="form-field-group">
                  <label>Duration</label>
                  <select
                    className="select-input"
                    value={newRuleForm.duration_minutes}
                    onChange={(e) => setNewRuleForm({ ...newRuleForm, duration_minutes: e.target.value })}
                  >
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={120}>2 hours</option>
                    <option value={240}>4 hours</option>
                  </select>
                </div>

                <div className="form-field-group">
                  <label>Reason / Note</label>
                  <input
                    type="text"
                    className="text-input"
                    value={newRuleForm.reason}
                    onChange={(e) => setNewRuleForm({ ...newRuleForm, reason: e.target.value })}
                    placeholder="e.g. IO Exit Exam, Retest"
                    required
                  />
                </div>
              </div>

              <div className="modal-footer-actions">
                <button type="button" className="secondary-button" onClick={() => setIsNewRuleModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Activate Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
