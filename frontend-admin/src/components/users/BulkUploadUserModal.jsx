import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  FileText,
  HelpCircle,
  Trash2,
  RefreshCw,
  Layers,
  Sparkles,
  BookOpen,
  Users,
} from 'lucide-react';

export function BulkUploadUserModal({
  isOpen,
  onClose,
  onUpload,
}) {
  const [bulkTarget, setBulkTarget] = useState('users'); // 'users' | 'hierarchy' | 'streams' | 'subjects'
  const [activeTab, setActiveTab] = useState('file'); // 'file' | 'paste'
  const [file, setFile] = useState(null);
  const [csvText, setCsvText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showGuidelines, setShowGuidelines] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setCsvText('');
      setResult(null);
      setErrorMsg('');
      setActiveTab('file');
      setShowGuidelines(false);
      document.body.style.overflow = 'hidden';
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

  // Reset file/text when switching category
  const handleTargetChange = (newTarget) => {
    setBulkTarget(newTarget);
    setFile(null);
    setCsvText('');
    setResult(null);
    setErrorMsg('');
  };

  // File Drag & Drop Handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile) => {
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setErrorMsg('Please upload a valid CSV (.csv) or Excel (.xlsx, .xls) spreadsheet.');
      return;
    }
    setErrorMsg('');
    setResult(null);
    setFile(selectedFile);
  };

  // Sample CSV Template Downloader for all targets
  const handleDownloadTemplate = (target = bulkTarget) => {
    let templateContent = '';
    let filename = `Ignite_${target}_template.csv`;

    if (target === 'users') {
      templateContent = [
        'username,email,role,employee_id,sub_batch,stream',
        'Aarav Sharma,aarav.sharma@tcs.com,TRAINEE,2819001,A1,AI Engineering',
        'Diya Patel,diya.patel@tcs.com,TRAINEE,2819002,A2,Java Springboot',
        'Rohan Iyer,rohan.iyer@tcs.com,TRAINEE,2819003,B1,Angular Framework',
        'Kavita Nair,kavita.nair@tcs.com,TRAINEE,2819004,B2,.NET Fullstack',
        'Vikram Mentor,vikram.mentor@tcs.com,TA,,,',
        'Pooja HR,pooja.hr@tcs.com,HR,,,',
      ].join('\n');
    } else if (target === 'hierarchy') {
      templateContent = [
        'cohort_code,cohort_name,batch_name,sub_batch_name,lab_name',
        'B50,TCS Ignite B50,A,A1,Lab 1',
        'B50,TCS Ignite B50,A,A2,Lab 2',
        'B50,TCS Ignite B50,B,B1,Lab 3',
        'B50,TCS Ignite B50,C,C1,Lab 4',
      ].join('\n');
    } else if (target === 'streams') {
      templateContent = [
        'code,name,description',
        'AI,AI Engineering,Advanced Python & Machine Learning',
        'SPRING,Java Springboot,Enterprise Java & Microservices',
        'ANGULAR,Angular Framework,SPA web application development',
        'DOTNET,.NET Fullstack,C# Web APIs & Cloud Services',
      ].join('\n');
    } else if (target === 'subjects') {
      templateContent = [
        'code,name,description',
        'INCUBATOR,Incubator,Mentored lab projects and practical coding',
        'BIZSKILL,Business Skills,Professional verbal communication and etiquette',
        'CORETECH,Core Technology,Algorithms, data structures and foundations',
      ].join('\n');
    }

    const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLoadSamplePaste = () => {
    let sample = '';
    if (bulkTarget === 'users') {
      sample = [
        'username,email,role,employee_id,sub_batch,stream',
        'Ananya Sen,ananya.sen@tcs.com,TRAINEE,2819010,A1,AI Engineering',
        'Kunal Verma,kunal.verma@tcs.com,TRAINEE,2819011,A2,Java Springboot',
        'Sneha Roy,sneha.roy@tcs.com,TRAINEE,2819012,B1,Angular Framework',
      ].join('\n');
    } else if (bulkTarget === 'hierarchy') {
      sample = [
        'cohort_code,cohort_name,batch_name,sub_batch_name,lab_name',
        'B50,TCS Ignite B50,A,A1,Lab 1',
        'B50,TCS Ignite B50,A,A2,Lab 2',
        'B50,TCS Ignite B50,B,B1,Lab 3',
      ].join('\n');
    } else if (bulkTarget === 'streams') {
      sample = [
        'code,name,description',
        'AI,AI Engineering,Advanced Python & Machine Learning',
        'SPRING,Java Springboot,Enterprise Java & Microservices',
      ].join('\n');
    } else if (bulkTarget === 'subjects') {
      sample = [
        'code,name,description',
        'INCUBATOR,Incubator,Mentored lab projects and practical coding',
        'BIZSKILL,Business Skills,Professional communication and etiquette',
      ].join('\n');
    }
    setCsvText(sample);
    setErrorMsg('');
  };

  // Upload Executor
  const handleUpload = async () => {
    setErrorMsg('');
    setResult(null);

    if (activeTab === 'file' && !file) {
      setErrorMsg('Please select or drop a CSV or Excel file to upload.');
      return;
    }
    if (activeTab === 'paste' && !csvText.trim()) {
      setErrorMsg('Please paste comma-separated CSV text.');
      return;
    }

    try {
      setUploading(true);
      const res = await onUpload(
        bulkTarget,
        activeTab === 'file' ? file : null,
        activeTab === 'paste' ? csvText.trim() : ''
      );
      setResult(res || { created_count: 0, updated_count: 0 });
    } catch (err) {
      setErrorMsg(
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Bulk upload failed. Please verify the file formatting.'
      );
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const TARGET_INFO = {
    users: {
      title: 'Users & Trainees',
      icon: Users,
      desc: 'Onboard trainees, TAs, HR, Managers, and Admins with hierarchy and streams',
    },
    hierarchy: {
      title: 'Cohorts, Batches & Labs',
      icon: Layers,
      desc: 'Define cohort codes, batches (A, B, C), sub-batches (A1, A2), and venues in bulk',
    },
    streams: {
      title: 'Elective Streams',
      icon: Sparkles,
      desc: 'Import Month 4 specialization tracks (AI Engineering, Java Springboot, etc.)',
    },
    subjects: {
      title: 'Curriculum Subjects',
      icon: BookOpen,
      desc: 'Import core subject modules (Incubator, BizSkill, CoreTech, Technical Readiness)',
    },
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-upload-title"
      onClick={onClose}
    >
      <div
        className="bulk-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bulk-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              className="stat-icon primary"
              style={{ width: '40px', height: '40px' }}
              aria-hidden="true"
            >
              <UploadCloud size={20} />
            </div>
            <div>
              <h3 id="bulk-upload-title" style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                Master Data & Bulk Importer
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                Import users, cohorts, batches, streams, and subjects via CSV or Excel spreadsheets
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close bulk upload modal"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Target Selector Bar */}
        <div style={{ padding: '12px 24px 0 24px', background: 'var(--color-bg-cream)', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Select Import Category:
          </div>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px' }}>
            {[
              { id: 'users', label: 'Users & Trainees', icon: Users },
              { id: 'hierarchy', label: 'Hierarchy (Cohorts/Batches)', icon: Layers },
              { id: 'streams', label: 'Elective Streams', icon: Sparkles },
              { id: 'subjects', label: 'Curriculum Subjects', icon: BookOpen },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`role-filter-pill ${bulkTarget === t.id ? 'active' : ''}`}
                  onClick={() => handleTargetChange(t.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Icon size={14} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mode Tab Bar */}
        <div className="bulk-modal-tab-bar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'file'}
            className={`bulk-tab-btn ${activeTab === 'file' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('file');
              setErrorMsg('');
            }}
          >
            <FileSpreadsheet size={15} />
            Upload File (.csv / .xlsx)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'paste'}
            className={`bulk-tab-btn ${activeTab === 'paste' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('paste');
              setErrorMsg('');
            }}
          >
            <FileText size={15} />
            Paste CSV Data
          </button>
        </div>

        {/* Modal Body */}
        <div className="bulk-modal-body">
          {/* Template Download Callout */}
          <div className="bulk-template-callout">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileSpreadsheet size={20} color="var(--color-primary)" />
              <div>
                <strong style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
                  Download Official {TARGET_INFO[bulkTarget]?.title} Template (.csv)
                </strong>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {TARGET_INFO[bulkTarget]?.desc}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="secondary-button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
              onClick={() => handleDownloadTemplate(bulkTarget)}
            >
              <Download size={14} />
              Sample CSV
            </button>
          </div>

          {/* Mode 1: File Upload */}
          {activeTab === 'file' && (
            <>
              {!file ? (
                <div
                  className={`bulk-dropzone-container ${isDragging ? 'is-drag-over' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv, .xlsx, .xls, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                  />
                  <div className="bulk-dropzone-icon">
                    <UploadCloud size={24} />
                  </div>
                  <div>
                    <strong style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                      Click to choose a file or drag & drop here
                    </strong>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      Supports CSV (.csv) and Excel (.xlsx, .xls) for {TARGET_INFO[bulkTarget]?.title}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="selected-file-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      className="stat-icon primary"
                      style={{ width: '36px', height: '36px' }}
                    >
                      <FileSpreadsheet size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--color-text-primary)' }}>
                        {file.name}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)' }}>
                        {formatFileSize(file.size)} &bull; {file.name.endsWith('.csv') ? 'CSV Spreadsheet' : 'Excel Workbook'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="hierarchy-delete-btn"
                    title="Remove file"
                    onClick={() => setFile(null)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </>
          )}

          {/* Mode 2: Paste CSV */}
          {activeTab === 'paste' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  CSV Raw Data ({TARGET_INFO[bulkTarget]?.title}):
                </label>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-primary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                  onClick={handleLoadSamplePaste}
                >
                  Load Sample Data
                </button>
              </div>
              <textarea
                className="bulk-csv-textarea"
                placeholder={`Paste comma-separated rows for ${TARGET_INFO[bulkTarget]?.title}...`}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
            </div>
          )}

          {/* Error Message */}
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

          {/* Result Banner */}
          {result && (
            <div className="bulk-result-banner success">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                <CheckCircle2 size={18} />
                <span>Import Completed for {TARGET_INFO[bulkTarget]?.title}!</span>
              </div>
              <div style={{ marginTop: '6px', fontSize: '12px' }}>
                &bull; <strong>{result.created_count || 0}</strong> created
                {result.updated_count !== undefined && (
                  <span> &bull; <strong>{result.updated_count}</strong> updated</span>
                )}
              </div>
              {result.errors && result.errors.length > 0 && (
                <div style={{ marginTop: '10px', padding: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--color-warning)' }}>
                    Notes / Warnings ({result.errors.length}):
                  </div>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {result.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Guidelines Toggle */}
          <div className="bulk-guidelines-accordion">
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                padding: 0,
                color: 'var(--color-text-primary)',
                fontWeight: 600,
                fontSize: '12.5px',
              }}
              onClick={() => setShowGuidelines(!showGuidelines)}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <HelpCircle size={15} color="var(--color-primary)" />
                Column Guidelines for {TARGET_INFO[bulkTarget]?.title}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-primary)' }}>
                {showGuidelines ? 'Hide' : 'View'}
              </span>
            </button>

            {showGuidelines && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                {bulkTarget === 'users' && (
                  <>
                    <div><strong>username:</strong> Full name (e.g. <code>Aarav Sharma</code>).</div>
                    <div><strong>email:</strong> Valid corporate email address (unique).</div>
                    <div><strong>role:</strong> <code>TRAINEE</code> (default), <code>TA</code>, <code>HR</code>, <code>MANAGER</code>, <code>ADMIN</code>.</div>
                    <div><strong>employee_id:</strong> Exactly 7 digits (e.g. <code>2819001</code>). Required for TRAINEE.</div>
                    <div><strong>sub_batch:</strong> Sub-batch identifier (e.g. <code>A1</code>, <code>B1</code>).</div>
                    <div><strong>stream:</strong> Month 4 Elective track (e.g. <code>AI Engineering</code>, <code>Java Springboot</code>).</div>
                  </>
                )}
                {bulkTarget === 'hierarchy' && (
                  <>
                    <div><strong>cohort_code:</strong> Cohort code (e.g. <code>B50</code>).</div>
                    <div><strong>cohort_name:</strong> Cohort display name (e.g. <code>TCS Ignite B50</code>).</div>
                    <div><strong>batch_name:</strong> Batch letter (e.g. <code>A</code>, <code>B</code>, <code>C</code>).</div>
                    <div><strong>sub_batch_name:</strong> Sub-batch code (e.g. <code>A1</code>, <code>A2</code>, <code>B1</code>).</div>
                    <div><strong>lab_name:</strong> Default home lab venue (e.g. <code>Lab 1</code>).</div>
                  </>
                )}
                {bulkTarget === 'streams' && (
                  <>
                    <div><strong>code:</strong> Stream short code (e.g. <code>AI</code>, <code>SPRING</code>, <code>ANGULAR</code>).</div>
                    <div><strong>name:</strong> Stream specialization title (e.g. <code>AI Engineering</code>).</div>
                    <div><strong>description:</strong> Curriculum details and technology stack.</div>
                  </>
                )}
                {bulkTarget === 'subjects' && (
                  <>
                    <div><strong>code:</strong> Subject code (e.g. <code>INCUBATOR</code>, <code>BIZSKILL</code>, <code>CORETECH</code>).</div>
                    <div><strong>name:</strong> Subject title (e.g. <code>Incubator</code>, <code>Business Skills</code>).</div>
                    <div><strong>description:</strong> Learning objectives and module outline.</div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bulk-modal-footer">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={uploading}
          >
            {result ? 'Done' : 'Cancel'}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={uploading || (activeTab === 'file' && !file) || (activeTab === 'paste' && !csvText.trim())}
            onClick={handleUpload}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            {uploading ? (
              <>
                <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <UploadCloud size={16} />
                <span>Import {TARGET_INFO[bulkTarget]?.title}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
