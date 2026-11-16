import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Layers,
  Plus,
  Trash2,
  Pencil,
  FolderTree,
  Building,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Sparkles,
  BookOpen,
  Search,
  RotateCcw,
} from 'lucide-react';
import { usersService } from '../../services/usersService';

export function BatchHierarchyModal({
  isOpen,
  onClose,
  onHierarchyUpdated,
  defaultTab = 'cohorts',
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Editing Entity State (null if in Add mode)
  const [editingId, setEditingId] = useState(null);

  // Loaded Entities
  const [cohorts, setCohorts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [subBatches, setSubBatches] = useState([]);
  const [labs, setLabs] = useState([]);
  const [streams, setStreams] = useState([]);
  const [subjects, setSubjects] = useState([]);

  // Forms State
  const [newCohort, setNewCohort] = useState({
    code: '',
    name: '',
    start_date: '',
    end_date: '',
    is_active: true,
  });

  const [newBatch, setNewBatch] = useState({
    cohort: '',
    name: '',
    description: '',
  });

  const [newSubBatch, setNewSubBatch] = useState({
    batch: '',
    name: '',
    home_lab: '',
  });

  const [newLab, setNewLab] = useState({
    name: '',
    code: '',
    capacity: 35,
    location: '',
  });

  const [newStream, setNewStream] = useState({
    code: '',
    name: '',
    description: '',
  });

  const [newSubject, setNewSubject] = useState({
    code: '',
    name: '',
    description: '',
  });

  // Load all master entities
  const loadAllData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [cData, bData, sbData, lData, stData, suData] = await Promise.all([
        usersService.getCohorts(),
        usersService.getBatches(),
        usersService.getSubBatches(),
        usersService.getLabs(),
        usersService.getStreams(),
        usersService.getSubjects(),
      ]);

      const cList = Array.isArray(cData) ? cData : [];
      const bList = Array.isArray(bData) ? bData : [];
      const sbList = Array.isArray(sbData) ? sbData : [];
      const lList = Array.isArray(lData) ? lData : [];
      const stList = Array.isArray(stData) ? stData : [];
      const suList = Array.isArray(suData) ? suData : [];

      setCohorts(cList);
      setBatches(bList);
      setSubBatches(sbList);
      setLabs(lList);
      setStreams(stList);
      setSubjects(suList);

      if (cList.length > 0 && !newBatch.cohort) {
        setNewBatch((prev) => ({ ...prev, cohort: cList[0].id }));
      }
      if (bList.length > 0 && !newSubBatch.batch) {
        setNewSubBatch((prev) => ({ ...prev, batch: bList[0].id }));
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to load master hierarchy data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      loadAllData();
      setErrorMsg('');
      setSuccessMsg('');
      setSearchTerm('');
      setEditingId(null);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Sync activeTab when defaultTab or isOpen changes
  useEffect(() => {
    if (isOpen && defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  // Clear messages & editing state when tab changes
  useEffect(() => {
    setErrorMsg('');
    setSuccessMsg('');
    setSearchTerm('');
    cancelEditing();
  }, [activeTab]);

  const cancelEditing = () => {
    setEditingId(null);
    setNewCohort({ code: '', name: '', start_date: '', end_date: '', is_active: true });
    setNewBatch({ cohort: cohorts[0]?.id || '', name: '', description: '' });
    setNewSubBatch({ batch: batches[0]?.id || '', name: '', home_lab: '' });
    setNewLab({ name: '', code: '', capacity: 35, location: '' });
    setNewStream({ code: '', name: '', description: '' });
    setNewSubject({ code: '', name: '', description: '' });
  };

  // ==========================================
  // COHORT HANDLERS (ADD & EDIT)
  // ==========================================
  const handleStartEditCohort = (c) => {
    setEditingId(c.id);
    setNewCohort({
      code: c.code || '',
      name: c.name || '',
      start_date: c.start_date || '',
      end_date: c.end_date || '',
      is_active: c.is_active !== false,
    });
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSaveCohort = async (e) => {
    e.preventDefault();
    if (!newCohort.code.trim()) {
      setErrorMsg('Cohort code is required (e.g. B50, B51).');
      return;
    }
    setActionLoading(true);
    setErrorMsg('');
    try {
      const payload = {
        code: newCohort.code.trim().toUpperCase(),
        name: newCohort.name.trim() || `TCS Ignite ${newCohort.code.trim().toUpperCase()}`,
        start_date: newCohort.start_date || null,
        end_date: newCohort.end_date || null,
        is_active: newCohort.is_active,
      };

      if (editingId) {
        await usersService.updateCohort(editingId, payload);
        setSuccessMsg(`Cohort ${payload.code} updated successfully.`);
      } else {
        await usersService.createCohort(payload);
        setSuccessMsg(`Cohort ${payload.code} created successfully.`);
      }

      cancelEditing();
      await loadAllData();
      if (onHierarchyUpdated) onHierarchyUpdated();
    } catch (err) {
      setErrorMsg(err.response?.data?.code?.[0] || err.message || 'Failed to save cohort.');
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================
  // BATCH HANDLERS (ADD & EDIT)
  // ==========================================
  const handleStartEditBatch = (b) => {
    setEditingId(b.id);
    setNewBatch({
      cohort: b.cohort || cohorts[0]?.id || '',
      name: b.name || '',
      description: b.description || '',
    });
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSaveBatch = async (e) => {
    e.preventDefault();
    if (!newBatch.cohort) {
      setErrorMsg('Please select a Cohort.');
      return;
    }
    if (!newBatch.name.trim()) {
      setErrorMsg('Batch name is required (e.g. A, B, C, D).');
      return;
    }
    setActionLoading(true);
    setErrorMsg('');
    try {
      const payload = {
        cohort: newBatch.cohort,
        name: newBatch.name.trim().toUpperCase(),
        description: newBatch.description.trim(),
      };

      if (editingId) {
        await usersService.updateBatch(editingId, payload);
        setSuccessMsg(`Batch ${payload.name} updated successfully.`);
      } else {
        await usersService.createBatch(payload);
        setSuccessMsg(`Batch ${payload.name} created successfully.`);
      }

      cancelEditing();
      await loadAllData();
      if (onHierarchyUpdated) onHierarchyUpdated();
    } catch (err) {
      setErrorMsg(err.response?.data?.name?.[0] || err.message || 'Failed to save batch.');
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================
  // SUB-BATCH HANDLERS (ADD & EDIT)
  // ==========================================
  const handleStartEditSubBatch = (sb) => {
    setEditingId(sb.id);
    setNewSubBatch({
      batch: sb.batch || batches[0]?.id || '',
      name: sb.name || '',
      home_lab: sb.home_lab || '',
    });
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSaveSubBatch = async (e) => {
    e.preventDefault();
    if (!newSubBatch.batch) {
      setErrorMsg('Please select a Batch.');
      return;
    }
    if (!newSubBatch.name.trim()) {
      setErrorMsg('Sub-Batch name is required (e.g. A1, A2, B1).');
      return;
    }
    setActionLoading(true);
    setErrorMsg('');
    try {
      const resolvedBatch = !isNaN(Number(newSubBatch.batch)) && newSubBatch.batch !== ''
        ? Number(newSubBatch.batch)
        : newSubBatch.batch;
      const payload = {
        batch: resolvedBatch,
        name: newSubBatch.name.trim().toUpperCase(),
        home_lab: newSubBatch.home_lab || null,
      };

      if (editingId) {
        await usersService.updateSubBatch(editingId, payload);
        setSuccessMsg(`Sub-Batch ${payload.name} updated successfully.`);
      } else {
        await usersService.createSubBatch(payload);
        setSuccessMsg(`Sub-Batch ${payload.name} created successfully.`);
      }

      cancelEditing();
      await loadAllData();
      if (onHierarchyUpdated) onHierarchyUpdated();
    } catch (err) {
      setErrorMsg(err.response?.data?.name?.[0] || err.message || 'Failed to save sub-batch.');
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================
  // LAB HANDLERS (ADD & EDIT)
  // ==========================================
  const handleStartEditLab = (l) => {
    setEditingId(l.id);
    setNewLab({
      name: l.name || '',
      code: l.code || '',
      capacity: l.capacity || 35,
      location: l.location || '',
    });
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSaveLab = async (e) => {
    e.preventDefault();
    if (!newLab.name.trim()) {
      setErrorMsg('Lab/Room name is required (e.g. Lab 1, Auditorium).');
      return;
    }
    setActionLoading(true);
    setErrorMsg('');
    try {
      const payload = {
        name: newLab.name.trim(),
        code: newLab.code.trim() || newLab.name.trim().toUpperCase().replace(/\s+/g, '_'),
        capacity: parseInt(newLab.capacity, 10) || 35,
        location: newLab.location.trim(),
      };

      if (editingId) {
        await usersService.updateLab(editingId, payload);
        setSuccessMsg(`Lab ${payload.name} updated successfully.`);
      } else {
        await usersService.createLab(payload);
        setSuccessMsg(`Lab ${payload.name} created successfully.`);
      }

      cancelEditing();
      await loadAllData();
      if (onHierarchyUpdated) onHierarchyUpdated();
    } catch (err) {
      setErrorMsg(err.response?.data?.name?.[0] || err.message || 'Failed to save lab.');
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================
  // STREAM HANDLERS (ADD & EDIT)
  // ==========================================
  const handleStartEditStream = (st) => {
    setEditingId(st.id);
    setNewStream({
      code: st.code || '',
      name: st.name || '',
      description: st.description || '',
    });
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSaveStream = async (e) => {
    e.preventDefault();
    if (!newStream.code.trim() || !newStream.name.trim()) {
      setErrorMsg('Stream code and name are required (e.g. AI, AI Engineering).');
      return;
    }
    setActionLoading(true);
    setErrorMsg('');
    try {
      const payload = {
        code: newStream.code.trim().toUpperCase(),
        name: newStream.name.trim(),
        description: newStream.description.trim(),
      };

      if (editingId) {
        await usersService.updateStream(editingId, payload);
        setSuccessMsg(`Elective Stream ${payload.name} updated successfully.`);
      } else {
        await usersService.createStream(payload);
        setSuccessMsg(`Elective Stream ${payload.name} created successfully.`);
      }

      cancelEditing();
      await loadAllData();
      if (onHierarchyUpdated) onHierarchyUpdated();
    } catch (err) {
      setErrorMsg(err.response?.data?.code?.[0] || err.message || 'Failed to save stream.');
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================
  // SUBJECT HANDLERS (ADD & EDIT)
  // ==========================================
  const handleStartEditSubject = (su) => {
    setEditingId(su.id);
    setNewSubject({
      code: su.code || '',
      name: su.name || '',
      description: su.description || '',
    });
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSaveSubject = async (e) => {
    e.preventDefault();
    if (!newSubject.code.trim() || !newSubject.name.trim()) {
      setErrorMsg('Subject code and name are required (e.g. INCUBATOR, Incubator).');
      return;
    }
    setActionLoading(true);
    setErrorMsg('');
    try {
      const payload = {
        code: newSubject.code.trim().toUpperCase(),
        name: newSubject.name.trim(),
        description: newSubject.description.trim(),
      };

      if (editingId) {
        await usersService.updateSubject(editingId, payload);
        setSuccessMsg(`Curriculum Subject ${payload.name} updated successfully.`);
      } else {
        await usersService.createSubject(payload);
        setSuccessMsg(`Curriculum Subject ${payload.name} created successfully.`);
      }

      cancelEditing();
      await loadAllData();
      if (onHierarchyUpdated) onHierarchyUpdated();
    } catch (err) {
      setErrorMsg(err.response?.data?.code?.[0] || err.message || 'Failed to save subject.');
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================
  // DELETE HANDLERS
  // ==========================================
  const handleDeleteSubBatch = async (id, name) => {
    if (!window.confirm(`Delete sub-batch ${name}?`)) return;
    try {
      await usersService.deleteSubBatch(id);
      setSuccessMsg(`Sub-batch ${name} deleted.`);
      await loadAllData();
      if (onHierarchyUpdated) onHierarchyUpdated();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete sub-batch.');
    }
  };

  const handleDeleteBatch = async (id, name) => {
    if (!window.confirm(`Delete batch ${name}? All sub-batches under it will also be deleted!`)) return;
    try {
      await usersService.deleteBatch(id);
      setSuccessMsg(`Batch ${name} deleted.`);
      await loadAllData();
      if (onHierarchyUpdated) onHierarchyUpdated();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete batch.');
    }
  };

  const handleDeleteCohort = async (id, code) => {
    if (!window.confirm(`Delete cohort ${code}? All batches and sub-batches under it will also be removed!`)) return;
    try {
      await usersService.deleteCohort(id);
      setSuccessMsg(`Cohort ${code} deleted.`);
      await loadAllData();
      if (onHierarchyUpdated) onHierarchyUpdated();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete cohort.');
    }
  };

  const handleDeleteLab = async (id, name) => {
    if (!window.confirm(`Delete lab ${name}?`)) return;
    try {
      await usersService.deleteLab(id);
      setSuccessMsg(`Lab ${name} deleted.`);
      await loadAllData();
      if (onHierarchyUpdated) onHierarchyUpdated();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete lab.');
    }
  };

  const handleDeleteStream = async (id, name) => {
    if (!window.confirm(`Delete stream ${name}?`)) return;
    try {
      await usersService.deleteStream(id);
      setSuccessMsg(`Stream ${name} deleted.`);
      await loadAllData();
      if (onHierarchyUpdated) onHierarchyUpdated();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete stream.');
    }
  };

  const handleDeleteSubject = async (id, name) => {
    if (!window.confirm(`Delete subject ${name}?`)) return;
    try {
      await usersService.deleteSubject(id);
      setSuccessMsg(`Subject ${name} deleted.`);
      await loadAllData();
      if (onHierarchyUpdated) onHierarchyUpdated();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete subject.');
    }
  };

  // Filtered lists based on search
  const filteredSubBatches = useMemo(() => {
    if (!searchTerm.trim()) return subBatches;
    const q = searchTerm.toLowerCase();
    return subBatches.filter(
      (sb) =>
        sb.name?.toLowerCase().includes(q) ||
        sb.batch_name?.toLowerCase().includes(q) ||
        sb.cohort_code?.toLowerCase().includes(q) ||
        sb.home_lab_name?.toLowerCase().includes(q)
    );
  }, [subBatches, searchTerm]);

  const filteredBatches = useMemo(() => {
    if (!searchTerm.trim()) return batches;
    const q = searchTerm.toLowerCase();
    return batches.filter(
      (b) =>
        b.name?.toLowerCase().includes(q) ||
        b.cohort_code?.toLowerCase().includes(q) ||
        b.description?.toLowerCase().includes(q)
    );
  }, [batches, searchTerm]);

  const filteredCohorts = useMemo(() => {
    if (!searchTerm.trim()) return cohorts;
    const q = searchTerm.toLowerCase();
    return cohorts.filter(
      (c) =>
        c.code?.toLowerCase().includes(q) ||
        c.name?.toLowerCase().includes(q)
    );
  }, [cohorts, searchTerm]);

  const filteredLabs = useMemo(() => {
    if (!searchTerm.trim()) return labs;
    const q = searchTerm.toLowerCase();
    return labs.filter(
      (l) =>
        l.name?.toLowerCase().includes(q) ||
        l.code?.toLowerCase().includes(q) ||
        l.location?.toLowerCase().includes(q)
    );
  }, [labs, searchTerm]);

  const filteredStreams = useMemo(() => {
    if (!searchTerm.trim()) return streams;
    const q = searchTerm.toLowerCase();
    return streams.filter(
      (st) =>
        st.name?.toLowerCase().includes(q) ||
        st.code?.toLowerCase().includes(q) ||
        st.description?.toLowerCase().includes(q)
    );
  }, [streams, searchTerm]);

  const filteredSubjects = useMemo(() => {
    if (!searchTerm.trim()) return subjects;
    const q = searchTerm.toLowerCase();
    return subjects.filter(
      (su) =>
        su.name?.toLowerCase().includes(q) ||
        su.code?.toLowerCase().includes(q) ||
        su.description?.toLowerCase().includes(q)
    );
  }, [subjects, searchTerm]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hierarchy-modal-title"
      onClick={onClose}
    >
      <div
        className="hierarchy-dialog-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="hierarchy-dialog-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              className="stat-icon primary"
              style={{ width: '40px', height: '40px' }}
              aria-hidden="true"
            >
              <Layers size={20} />
            </div>
            <div>
              <h3 id="hierarchy-modal-title" style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                Manage Cohorts, Batches & Curriculum
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                Configure, update and organize cohorts, tracks, labs, Month 4 elective streams, and subjects
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close hierarchy modal"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="hierarchy-scroll-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'cohorts'}
            className={`hierarchy-tab-pill ${activeTab === 'cohorts' ? 'active' : ''}`}
            onClick={() => setActiveTab('cohorts')}
          >
            <Calendar size={14} />
            Cohorts
            <span className="hierarchy-tab-counter">{cohorts.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'batches'}
            className={`hierarchy-tab-pill ${activeTab === 'batches' ? 'active' : ''}`}
            onClick={() => setActiveTab('batches')}
          >
            <Layers size={14} />
            Batches
            <span className="hierarchy-tab-counter">{batches.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'subbatches'}
            className={`hierarchy-tab-pill ${activeTab === 'subbatches' ? 'active' : ''}`}
            onClick={() => setActiveTab('subbatches')}
          >
            <FolderTree size={14} />
            Sub-Batches
            <span className="hierarchy-tab-counter">{subBatches.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'labs'}
            className={`hierarchy-tab-pill ${activeTab === 'labs' ? 'active' : ''}`}
            onClick={() => setActiveTab('labs')}
          >
            <Building size={14} />
            Labs & Venues
            <span className="hierarchy-tab-counter">{labs.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'streams'}
            className={`hierarchy-tab-pill ${activeTab === 'streams' ? 'active' : ''}`}
            onClick={() => setActiveTab('streams')}
          >
            <Sparkles size={14} />
            Elective Streams
            <span className="hierarchy-tab-counter">{streams.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'subjects'}
            className={`hierarchy-tab-pill ${activeTab === 'subjects' ? 'active' : ''}`}
            onClick={() => setActiveTab('subjects')}
          >
            <BookOpen size={14} />
            Curriculum Subjects
            <span className="hierarchy-tab-counter">{subjects.length}</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="hierarchy-content-area">
          {/* Notifications */}
          {errorMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-danger-bg)',
                color: 'var(--color-danger)',
                fontSize: '12.5px',
              }}
            >
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-success-bg)',
                color: 'var(--color-success)',
                fontSize: '12.5px',
              }}
            >
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ==============================================================
              TAB 1: COHORTS
             ============================================================== */}
          {activeTab === 'cohorts' && (
            <div className="hierarchy-split-grid">
              <form onSubmit={handleSaveCohort} className="hierarchy-form-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {editingId ? 'Edit Cohort' : 'Add Cohort'}
                  </h4>
                  {editingId && (
                    <span className="hierarchy-editing-badge">
                      <Pencil size={11} /> Editing Mode
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Cohort Code:
                  </label>
                  <input
                    type="text"
                    className="styled-input"
                    placeholder="e.g. B50, B51"
                    value={newCohort.code}
                    onChange={(e) => setNewCohort({ ...newCohort, code: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Display Name:
                  </label>
                  <input
                    type="text"
                    className="styled-input"
                    placeholder="e.g. TCS Ignite Batch 50"
                    value={newCohort.name}
                    onChange={(e) => setNewCohort({ ...newCohort, name: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                      Start Date:
                    </label>
                    <input
                      type="date"
                      className="styled-input"
                      value={newCohort.start_date}
                      onChange={(e) => setNewCohort({ ...newCohort, start_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                      End Date:
                    </label>
                    <input
                      type="date"
                      className="styled-input"
                      value={newCohort.end_date}
                      onChange={(e) => setNewCohort({ ...newCohort, end_date: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={actionLoading}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    {editingId ? <CheckCircle2 size={15} /> : <Plus size={15} />}
                    {editingId ? 'Save Changes' : 'Add Cohort'}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={cancelEditing}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <RotateCcw size={14} />
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <div className="hierarchy-list-panel">
                <div className="hierarchy-list-header">
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Cohorts ({filteredCohorts.length})
                  </span>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '8px', top: '9px', color: 'var(--color-text-secondary)' }} />
                    <input
                      type="text"
                      className="hierarchy-search-input"
                      placeholder="Filter cohorts..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ overflowX: 'auto', maxHeight: '420px' }}>
                  <table className="hierarchy-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Timeline</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCohorts.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary)' }}>
                            No cohorts found.
                          </td>
                        </tr>
                      ) : (
                        filteredCohorts.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <span className="cohort-tag">{c.code}</span>
                            </td>
                            <td>{c.name}</td>
                            <td style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                              {c.start_date || 'N/A'} &rarr; {c.end_date || 'N/A'}
                            </td>
                            <td>
                              <span className={`pill ${c.is_active ? 'pill-active' : 'pill-archived'}`}>
                                {c.is_active ? 'Active' : 'Archived'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  className="hierarchy-edit-btn"
                                  title={`Edit ${c.code}`}
                                  onClick={() => handleStartEditCohort(c)}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="hierarchy-delete-btn"
                                  title={`Delete Cohort ${c.code}`}
                                  onClick={() => handleDeleteCohort(c.id, c.code)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 2: BATCHES
             ============================================================== */}
          {activeTab === 'batches' && (
            <div className="hierarchy-split-grid">
              <form onSubmit={handleSaveBatch} className="hierarchy-form-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {editingId ? 'Edit Batch' : 'Add Batch'}
                  </h4>
                  {editingId && (
                    <span className="hierarchy-editing-badge">
                      <Pencil size={11} /> Editing Mode
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Parent Cohort:
                  </label>
                  <select
                    className="styled-input"
                    value={newBatch.cohort}
                    onChange={(e) => setNewBatch({ ...newBatch, cohort: e.target.value })}
                    required
                  >
                    <option value="">Select Cohort...</option>
                    {cohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Batch Letter / Name:
                  </label>
                  <input
                    type="text"
                    className="styled-input"
                    placeholder="e.g. A, B, C, D"
                    value={newBatch.name}
                    onChange={(e) => setNewBatch({ ...newBatch, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Description (Optional):
                  </label>
                  <input
                    type="text"
                    className="styled-input"
                    placeholder="e.g. Morning Track"
                    value={newBatch.description}
                    onChange={(e) => setNewBatch({ ...newBatch, description: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={actionLoading}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    {editingId ? <CheckCircle2 size={15} /> : <Plus size={15} />}
                    {editingId ? 'Save Changes' : 'Add Batch'}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={cancelEditing}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <RotateCcw size={14} />
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <div className="hierarchy-list-panel">
                <div className="hierarchy-list-header">
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Batches ({filteredBatches.length})
                  </span>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '8px', top: '9px', color: 'var(--color-text-secondary)' }} />
                    <input
                      type="text"
                      className="hierarchy-search-input"
                      placeholder="Filter batches..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ overflowX: 'auto', maxHeight: '420px' }}>
                  <table className="hierarchy-table">
                    <thead>
                      <tr>
                        <th>Batch</th>
                        <th>Cohort</th>
                        <th>Description</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBatches.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary)' }}>
                            No batches found.
                          </td>
                        </tr>
                      ) : (
                        filteredBatches.map((b) => (
                          <tr key={b.id}>
                            <td>
                              <strong>Batch {b.name}</strong>
                            </td>
                            <td>
                              <span className="cohort-tag" style={{ fontSize: '11px', padding: '2px 8px' }}>
                                {b.cohort_code || 'B50'}
                              </span>
                            </td>
                            <td>{b.description || '-'}</td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  className="hierarchy-edit-btn"
                                  title={`Edit Batch ${b.name}`}
                                  onClick={() => handleStartEditBatch(b)}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="hierarchy-delete-btn"
                                  title={`Delete Batch ${b.name}`}
                                  onClick={() => handleDeleteBatch(b.id, b.name)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 3: SUB-BATCHES
             ============================================================== */}
          {activeTab === 'subbatches' && (
            <div className="hierarchy-split-grid">
              <form onSubmit={handleSaveSubBatch} className="hierarchy-form-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {editingId ? 'Edit Sub-Batch' : 'Add Sub-Batch'}
                  </h4>
                  {editingId && (
                    <span className="hierarchy-editing-badge">
                      <Pencil size={11} /> Editing Mode
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Parent Batch:
                  </label>
                  <select
                    className="styled-input"
                    value={newSubBatch.batch}
                    onChange={(e) => setNewSubBatch({ ...newSubBatch, batch: e.target.value })}
                    required
                  >
                    <option value="">Select Batch...</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.cohort_code ? `${b.cohort_code} - ` : ''}Batch {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Sub-Batch Code:
                  </label>
                  <input
                    type="text"
                    className="styled-input"
                    placeholder="e.g. A1, A2, B1"
                    value={newSubBatch.name}
                    onChange={(e) => setNewSubBatch({ ...newSubBatch, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Home Lab / Room (Optional):
                  </label>
                  <select
                    className="styled-input"
                    value={newSubBatch.home_lab}
                    onChange={(e) => setNewSubBatch({ ...newSubBatch, home_lab: e.target.value })}
                  >
                    <option value="">None / Floating</option>
                    {labs.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} {l.capacity ? `(${l.capacity} seats)` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={actionLoading}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    {editingId ? <CheckCircle2 size={15} /> : <Plus size={15} />}
                    {editingId ? 'Save Changes' : 'Add Sub-Batch'}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={cancelEditing}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <RotateCcw size={14} />
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <div className="hierarchy-list-panel">
                <div className="hierarchy-list-header">
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Sub-Batches ({filteredSubBatches.length})
                  </span>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '8px', top: '9px', color: 'var(--color-text-secondary)' }} />
                    <input
                      type="text"
                      className="hierarchy-search-input"
                      placeholder="Filter sub-batches..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ overflowX: 'auto', maxHeight: '420px' }}>
                  <table className="hierarchy-table">
                    <thead>
                      <tr>
                        <th>Sub-Batch</th>
                        <th>Parent Batch</th>
                        <th>Cohort</th>
                        <th>Home Lab</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubBatches.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary)' }}>
                            No sub-batches found.
                          </td>
                        </tr>
                      ) : (
                        filteredSubBatches.map((sb) => (
                          <tr key={sb.id}>
                            <td>
                              <strong style={{ color: 'var(--color-primary)' }}>{sb.name}</strong>
                            </td>
                            <td>Batch {sb.batch_name || '-'}</td>
                            <td>
                              <span className="cohort-tag" style={{ fontSize: '11px', padding: '2px 8px' }}>
                                {sb.cohort_code || 'B50'}
                              </span>
                            </td>
                            <td>{sb.home_lab_name || sb.lab_name || 'Floating'}</td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  className="hierarchy-edit-btn"
                                  title={`Edit ${sb.name}`}
                                  onClick={() => handleStartEditSubBatch(sb)}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="hierarchy-delete-btn"
                                  title={`Delete ${sb.name}`}
                                  onClick={() => handleDeleteSubBatch(sb.id, sb.name)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 4: LABS & VENUES
             ============================================================== */}
          {activeTab === 'labs' && (
            <div className="hierarchy-split-grid">
              <form onSubmit={handleSaveLab} className="hierarchy-form-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {editingId ? 'Edit Venue' : 'Add Lab / Venue'}
                  </h4>
                  {editingId && (
                    <span className="hierarchy-editing-badge">
                      <Pencil size={11} /> Editing Mode
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Room / Lab Name:
                  </label>
                  <input
                    type="text"
                    className="styled-input"
                    placeholder="e.g. Lab 1, Lab 2, Auditorium"
                    value={newLab.name}
                    onChange={(e) => setNewLab({ ...newLab, name: e.target.value })}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                      Code (Optional):
                    </label>
                    <input
                      type="text"
                      className="styled-input"
                      placeholder="e.g. LAB_1"
                      value={newLab.code}
                      onChange={(e) => setNewLab({ ...newLab, code: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                      Capacity:
                    </label>
                    <input
                      type="number"
                      min={1}
                      className="styled-input"
                      value={newLab.capacity}
                      onChange={(e) => setNewLab({ ...newLab, capacity: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Location / Floor:
                  </label>
                  <input
                    type="text"
                    className="styled-input"
                    placeholder="e.g. Ground Floor, Block A"
                    value={newLab.location}
                    onChange={(e) => setNewLab({ ...newLab, location: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={actionLoading}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    {editingId ? <CheckCircle2 size={15} /> : <Plus size={15} />}
                    {editingId ? 'Save Changes' : 'Add Venue'}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={cancelEditing}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <RotateCcw size={14} />
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <div className="hierarchy-list-panel">
                <div className="hierarchy-list-header">
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Labs & Venues ({filteredLabs.length})
                  </span>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '8px', top: '9px', color: 'var(--color-text-secondary)' }} />
                    <input
                      type="text"
                      className="hierarchy-search-input"
                      placeholder="Filter labs..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ overflowX: 'auto', maxHeight: '420px' }}>
                  <table className="hierarchy-table">
                    <thead>
                      <tr>
                        <th>Venue Name</th>
                        <th>Code</th>
                        <th>Capacity</th>
                        <th>Location</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLabs.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary)' }}>
                            No labs found.
                          </td>
                        </tr>
                      ) : (
                        filteredLabs.map((l) => (
                          <tr key={l.id}>
                            <td>
                              <strong>{l.name}</strong>
                            </td>
                            <td><code>{l.code || l.name}</code></td>
                            <td>{l.capacity ? `${l.capacity} seats` : '-'}</td>
                            <td>{l.location || '-'}</td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  className="hierarchy-edit-btn"
                                  title={`Edit ${l.name}`}
                                  onClick={() => handleStartEditLab(l)}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="hierarchy-delete-btn"
                                  title={`Delete ${l.name}`}
                                  onClick={() => handleDeleteLab(l.id, l.name)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 5: ELECTIVE STREAMS
             ============================================================== */}
          {activeTab === 'streams' && (
            <div className="hierarchy-split-grid">
              <form onSubmit={handleSaveStream} className="hierarchy-form-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {editingId ? 'Edit Elective Stream' : 'Add Elective Stream (Month 4)'}
                  </h4>
                  {editingId && (
                    <span className="hierarchy-editing-badge">
                      <Pencil size={11} /> Editing Mode
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Stream Code:
                  </label>
                  <input
                    type="text"
                    className="styled-input"
                    placeholder="e.g. AI, SPRING, ANGULAR, DOTNET"
                    value={newStream.code}
                    onChange={(e) => setNewStream({ ...newStream, code: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Stream Full Name:
                  </label>
                  <input
                    type="text"
                    className="styled-input"
                    placeholder="e.g. AI Engineering, Java Springboot"
                    value={newStream.name}
                    onChange={(e) => setNewStream({ ...newStream, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Description:
                  </label>
                  <textarea
                    className="styled-input"
                    rows={2}
                    placeholder="e.g. Advanced Python, Machine Learning & LLM prompt engineering"
                    value={newStream.description}
                    onChange={(e) => setNewStream({ ...newStream, description: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={actionLoading}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    {editingId ? <CheckCircle2 size={15} /> : <Plus size={15} />}
                    {editingId ? 'Save Changes' : 'Add Stream'}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={cancelEditing}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <RotateCcw size={14} />
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <div className="hierarchy-list-panel">
                <div className="hierarchy-list-header">
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Month 4 Elective Streams ({filteredStreams.length})
                  </span>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '8px', top: '9px', color: 'var(--color-text-secondary)' }} />
                    <input
                      type="text"
                      className="hierarchy-search-input"
                      placeholder="Filter streams..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ overflowX: 'auto', maxHeight: '420px' }}>
                  <table className="hierarchy-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Stream Track</th>
                        <th>Description</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStreams.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary)' }}>
                            No elective streams configured.
                          </td>
                        </tr>
                      ) : (
                        filteredStreams.map((st) => (
                          <tr key={st.id}>
                            <td>
                              <span className="legend-tag stream" style={{ padding: '2px 8px' }}>
                                {st.code}
                              </span>
                            </td>
                            <td>
                              <strong>{st.name}</strong>
                            </td>
                            <td style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                              {st.description || '-'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  className="hierarchy-edit-btn"
                                  title={`Edit ${st.name}`}
                                  onClick={() => handleStartEditStream(st)}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="hierarchy-delete-btn"
                                  title={`Delete ${st.name}`}
                                  onClick={() => handleDeleteStream(st.id, st.name)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 6: CURRICULUM SUBJECTS
             ============================================================== */}
          {activeTab === 'subjects' && (
            <div className="hierarchy-split-grid">
              <form onSubmit={handleSaveSubject} className="hierarchy-form-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {editingId ? 'Edit Subject' : 'Add Subject'}
                  </h4>
                  {editingId && (
                    <span className="hierarchy-editing-badge">
                      <Pencil size={11} /> Editing Mode
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Subject Code:
                  </label>
                  <input
                    type="text"
                    className="styled-input"
                    placeholder="e.g. INCUBATOR, BIZSKILL, CORETECH"
                    value={newSubject.code}
                    onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Subject Name:
                  </label>
                  <input
                    type="text"
                    className="styled-input"
                    placeholder="e.g. Incubator, Business Skills"
                    value={newSubject.name}
                    onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                    Description:
                  </label>
                  <textarea
                    className="styled-input"
                    rows={2}
                    placeholder="e.g. Practical lab exercises and project mentoring"
                    value={newSubject.description}
                    onChange={(e) => setNewSubject({ ...newSubject, description: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={actionLoading}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    {editingId ? <CheckCircle2 size={15} /> : <Plus size={15} />}
                    {editingId ? 'Save Changes' : 'Add Subject'}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={cancelEditing}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <RotateCcw size={14} />
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <div className="hierarchy-list-panel">
                <div className="hierarchy-list-header">
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Curriculum Subjects ({filteredSubjects.length})
                  </span>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '8px', top: '9px', color: 'var(--color-text-secondary)' }} />
                    <input
                      type="text"
                      className="hierarchy-search-input"
                      placeholder="Filter subjects..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ overflowX: 'auto', maxHeight: '420px' }}>
                  <table className="hierarchy-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Subject Name</th>
                        <th>Description</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubjects.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary)' }}>
                            No subjects configured.
                          </td>
                        </tr>
                      ) : (
                        filteredSubjects.map((su) => (
                          <tr key={su.id}>
                            <td>
                              <span className="legend-tag lecture" style={{ padding: '2px 8px' }}>
                                {su.code}
                              </span>
                            </td>
                            <td>
                              <strong>{su.name}</strong>
                            </td>
                            <td style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                              {su.description || '-'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  className="hierarchy-edit-btn"
                                  title={`Edit ${su.name}`}
                                  onClick={() => handleStartEditSubject(su)}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="hierarchy-delete-btn"
                                  title={`Delete ${su.name}`}
                                  onClick={() => handleDeleteSubject(su.id, su.name)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
