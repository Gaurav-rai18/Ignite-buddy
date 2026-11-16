import React, { useState } from 'react';
import { FileText, Plus, Search, RotateCw, Sparkles, Database, Layers, Flame, Globe } from 'lucide-react';
import { useDocuments } from '../../hooks/useDocuments';
import { DocumentList } from '../../components/documents/DocumentList';
import { DocumentUploadModal } from '../../components/documents/DocumentUploadModal';
import { DocumentDetailsModal } from '../../components/documents/DocumentDetailsModal';
import { DocumentViewerModal } from '../../components/documents/DocumentViewerModal';
import { DeleteDocumentDialog } from '../../components/documents/DeleteDocumentDialog';
import { ErrorBanner } from '../../components/ui/ErrorBanner';

export function AddDocuments({ onNotify }) {
  const {
    documents,
    filteredDocuments,
    kbStats,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    spaceFilter,
    setSpaceFilter,
    uploadDoc,
    deleteDoc,
    refetch,
  } = useDocuments();

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedDocDetails, setSelectedDocDetails] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [deletingDoc, setDeletingDoc] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    if (onNotify) {
      onNotify('Document knowledge base & RAG index refreshed');
    }
  };

  const handleUploadSubmit = async (uploadData) => {
    const created = await uploadDoc(uploadData);
    if (onNotify) {
      onNotify(`Document "${created.name}" uploaded to ${created.space === 'ignite' ? 'Ignite' : 'General'} Space & indexed for RAG.`);
    }
  };

  const handleDeleteConfirm = async (docId) => {
    await deleteDoc(docId);
    if (onNotify) {
      onNotify('Document removed from knowledge base & vector store purged');
    }
  };

  const statusFilterTabs = ['All', 'Ready', 'Processing', 'Failed'];
  const spaceFilterTabs = [
    { id: 'All', label: 'All Spaces' },
    { id: 'general', label: 'General Space' },
    { id: 'ignite', label: 'Ignite Space' },
  ];

  return (
    <>
      <div className="welcome-row">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" aria-hidden="true" />
            KNOWLEDGE BASE & RAG
          </div>
          <h1>Add Documents</h1>
          <p className="subheading">
            Upload documents and manage knowledge sources for Buddy across General and Ignite spaces.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={handleRefresh}
          disabled={loading || isRefreshing}
        >
          <RotateCw
            size={14}
            style={{
              animation: loading || isRefreshing ? 'spin 1s linear infinite' : 'none',
            }}
            aria-hidden="true"
          />
          {loading || isRefreshing ? 'Refreshing...' : 'Refresh index'}
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={refetch} />}

      {/* RAG Knowledge Base Live Summary Bar */}
      <div
        className="kb-summary-bar"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div
          className="panel"
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            borderRadius: '10px',
          }}
        >
          <div className="stat-icon primary" style={{ width: '36px', height: '36px', flexShrink: 0 }}>
            <Database size={18} />
          </div>
          <div>
            <small style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
              Vector Store
            </small>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {kbStats?.vector_backend || 'ChromaDB / SQLite'}
            </div>
            <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 600 }}>
              Active Dual-Space Index
            </span>
          </div>
        </div>

        <div
          className="panel"
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            borderRadius: '10px',
          }}
        >
          <div className="stat-icon" style={{ width: '36px', height: '36px', flexShrink: 0, background: 'rgba(99, 102, 241, 0.12)', color: 'var(--color-primary)' }}>
            <Globe size={18} />
          </div>
          <div>
            <small style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
              General Space
            </small>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {kbStats?.spaces?.general?.chunks ?? 0} Chunks
            </div>
            <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
              {kbStats?.general_documents ?? documents.filter((d) => d.space === 'general').length} Technical Sources
            </span>
          </div>
        </div>

        <div
          className="panel"
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            borderRadius: '10px',
          }}
        >
          <div className="stat-icon" style={{ width: '36px', height: '36px', flexShrink: 0, background: 'rgba(234, 88, 12, 0.12)', color: '#EA580C' }}>
            <Flame size={18} />
          </div>
          <div>
            <small style={{ fontSize: '10px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
              Ignite Space
            </small>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {kbStats?.spaces?.ignite?.chunks ?? 0} Chunks
            </div>
            <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
              {kbStats?.ignite_documents ?? documents.filter((d) => d.space === 'ignite').length} Programme Sources
            </span>
          </div>
        </div>
      </div>

      <section className="panel" style={{ padding: '24px' }}>
        <div className="panel-heading" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="stat-icon primary" style={{ width: '40px', height: '40px' }} aria-hidden="true">
              <FileText size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', marginBottom: '2px' }}>Add documents</h3>
              <p>Upload PDF, Word, PowerPoint, or text files to index into Buddy's RAG knowledge base</p>
            </div>
          </div>

          <button
            type="button"
            className="primary-button"
            onClick={() => setIsUploadOpen(true)}
          >
            <Plus size={16} aria-hidden="true" />
            Add document
          </button>
        </div>

        <div className="table-search-bar">
          <div className="search-input-wrap">
            <Search size={16} aria-hidden="true" />
            <input
              type="text"
              placeholder="Search documents by title, description, or space..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search documents by name or description"
            />
          </div>
          <span className="search-count-badge">
            {filteredDocuments.length} documents
          </span>
        </div>

        {/* Space and Status Filter Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
          <div className="doc-filter-pills" role="tablist" aria-label="Filter documents by space">
            {spaceFilterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={spaceFilter === tab.id}
                className={`doc-filter-pill ${spaceFilter === tab.id ? 'active' : ''}`}
                onClick={() => setSpaceFilter(tab.id)}
                style={
                  spaceFilter === tab.id
                    ? tab.id === 'ignite'
                      ? { background: '#EA580C', color: '#fff', borderColor: '#EA580C' }
                      : {}
                    : {}
                }
              >
                {tab.id === 'ignite' && <Flame size={12} style={{ display: 'inline', marginRight: '4px' }} />}
                {tab.id === 'general' && <Globe size={12} style={{ display: 'inline', marginRight: '4px' }} />}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="doc-filter-pills" role="tablist" aria-label="Filter documents by status">
            {statusFilterTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab}
                className={`doc-filter-pill ${statusFilter === tab ? 'active' : ''}`}
                onClick={() => setStatusFilter(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <DocumentList
          documents={filteredDocuments}
          loading={loading}
          onViewDetails={(doc) => setSelectedDocDetails(doc)}
          onViewDocument={(doc) => setViewingDoc(doc)}
          onDelete={(doc) => setDeletingDoc(doc)}
          onOpenUpload={() => setIsUploadOpen(true)}
        />

        <div className="card-table-footer" style={{ marginTop: '20px' }}>
          <span>
            Showing {filteredDocuments.length} of {documents.length} knowledge sources
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <Sparkles size={13} color="var(--color-primary)" aria-hidden="true" />
            Processed documents are embedded with cosine similarity and deduplicated via SHA-256
          </span>
        </div>
      </section>

      <DocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUpload={handleUploadSubmit}
      />

      <DocumentDetailsModal
        isOpen={Boolean(selectedDocDetails)}
        document={selectedDocDetails}
        onClose={() => setSelectedDocDetails(null)}
      />

      <DocumentViewerModal
        isOpen={Boolean(viewingDoc)}
        document={viewingDoc}
        onClose={() => setViewingDoc(null)}
      />

      <DeleteDocumentDialog
        isOpen={Boolean(deletingDoc)}
        document={deletingDoc}
        onClose={() => setDeletingDoc(null)}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}
