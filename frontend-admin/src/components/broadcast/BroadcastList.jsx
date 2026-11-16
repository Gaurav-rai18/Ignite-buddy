import React, { useState, useMemo } from 'react';
import { Megaphone, Users, Send, Search, Clock, CheckCircle, User, Calendar, BookOpen } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { formatDate } from '../../utils/date';

export function BroadcastList({
  broadcasts = [],
  loading = false,
  historyFilter = 'all',
  onFilterChange,
  onCreateClick,
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const formatAudience = (item) => {
    if (item.recipient_type === 'COHORT') return `Cohort: ${item.target_cohort_code || 'Targeted'}`;
    if (item.recipient_type === 'BATCH') return `Batch: ${item.target_batch_code || 'Targeted'}`;
    if (item.recipient_type === 'SUB_BATCH') return `Sub-Batch: ${item.target_sub_batch_code || 'Targeted'}`;
    if (item.recipient_type === 'STREAM') return `Stream: ${item.target_stream_name || 'Targeted'}`;
    if (item.recipient_type === 'ROLE') return `Role: ${item.target_role || 'Targeted'}`;
    if (item.recipient_type === 'USERS' || item.recipient_type === 'USER') return `Specific: ${item.target_username || 'Selected users'}`;
    return item.audience || 'All users';
  };

  const getCategoryBadge = (item) => {
    const cat = (item.category || '').toUpperCase();
    if (cat === 'TIMETABLE' || item.title?.includes('Timetable') || item.title?.includes('Schedule')) {
      return {
        label: 'Timetable Update',
        icon: Calendar,
        bg: 'var(--color-primary-light)',
        color: 'var(--color-primary)',
      };
    }
    if (cat === 'ASSIGNMENT' || item.title?.includes('Assignment')) {
      return {
        label: 'Assignment Notice',
        icon: BookOpen,
        bg: 'rgba(234, 88, 12, 0.12)',
        color: '#EA580C',
      };
    }
    return {
      label: 'Announcement',
      icon: Megaphone,
      bg: 'rgba(99, 102, 241, 0.12)',
      color: 'var(--color-primary)',
    };
  };

  // 1. Filter by historyFilter (all | mine | others)
  const tabFilteredBroadcasts = useMemo(() => {
    return broadcasts.filter((item) => {
      if (historyFilter === 'mine') return item.posted_by_me === true;
      if (historyFilter === 'others') return item.posted_by_me === false;
      return true; // 'all'
    });
  }, [broadcasts, historyFilter]);

  // 2. Filter by search query
  const searchFilteredBroadcasts = useMemo(() => {
    if (!searchQuery.trim()) return tabFilteredBroadcasts;
    const q = searchQuery.toLowerCase();
    return tabFilteredBroadcasts.filter((item) => {
      const title = (item.title || '').toLowerCase();
      const message = (item.message || '').toLowerCase();
      const audience = formatAudience(item).toLowerCase();
      const author = (item.created_by_name || '').toLowerCase();
      return title.includes(q) || message.includes(q) || audience.includes(q) || author.includes(q);
    });
  }, [tabFilteredBroadcasts, searchQuery]);

  return (
    <section className="panel list-panel">
      <div className="panel-heading" style={{ marginBottom: '10px' }}>
        <div>
          <h3>Announcement History</h3>
          <p>{tabFilteredBroadcasts.length} announcement{tabFilteredBroadcasts.length !== 1 ? 's' : ''}</p>
        </div>
        <span className="count-badge" aria-label={`${broadcasts.length} total announcements`}>
          {broadcasts.length}
        </span>
      </div>

      {/* Filter Tabs matching Assignment tabs */}
      <div className="assignment-history-tabs" role="tablist" aria-label="Broadcast history filter" style={{ padding: '0 0 10px 0', borderBottom: '1px solid var(--color-border-light)' }}>
        <button
          type="button"
          role="tab"
          aria-selected={historyFilter === 'all'}
          className={`assignment-tab-btn ${historyFilter === 'all' ? 'active' : ''}`}
          onClick={() => onFilterChange && onFilterChange('all')}
        >
          All Announcements
        </button>
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

      {broadcasts.length > 0 && (
        <div style={{ marginTop: '12px', marginBottom: '14px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={14}
              style={{ position: 'absolute', left: '10px', color: 'var(--color-text-secondary)', pointerEvents: 'none' }}
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Search announcements by title, content, or author..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-input"
              style={{
                width: '100%',
                paddingLeft: '32px',
                fontSize: '12px',
                borderRadius: '8px',
                paddingTop: '7px',
                paddingBottom: '7px',
              }}
            />
          </div>
        </div>
      )}

      {loading && broadcasts.length === 0 ? (
        <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
          Loading announcements...
        </div>
      ) : tabFilteredBroadcasts.length > 0 ? (
        <div className="broadcast-history-scroll">
          {searchFilteredBroadcasts.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
              No announcements match "{searchQuery}".
            </div>
          ) : (
            searchFilteredBroadcasts.map((item) => {
              const badge = getCategoryBadge(item);
              const BadgeIcon = badge.icon;
              return (
                <article
                  className="list-entry broadcast-entry-card"
                  key={item.id}
                >
                  <div className="entry-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        className="entry-icon"
                        aria-hidden="true"
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '6px',
                          background: badge.bg,
                          color: badge.color,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <BadgeIcon size={13} />
                      </span>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {item.title}
                      </h4>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: badge.bg,
                          color: badge.color,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {badge.label}
                      </span>
                      <span
                        className="published-tag"
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: 'var(--color-success-bg)',
                          color: 'var(--color-success)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <CheckCircle size={10} /> Sent
                      </span>
                    </div>
                  </div>

                  <p style={{ margin: '6px 0 10px 0', fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {item.message}
                  </p>

                  <div
                    className="entry-meta"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      fontSize: '11px',
                      color: 'var(--color-text-secondary)',
                      paddingTop: '8px',
                      borderTop: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.05))',
                    }}
                  >
                    <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--color-primary, #4338CA)' }}>
                      <Users size={12} aria-hidden="true" />
                      {formatAudience(item)}
                    </span>

                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-secondary)' }}>
                      <User size={12} aria-hidden="true" />
                      Posted by: <strong style={{ color: 'var(--color-text-primary)' }}>{item.posted_by_me ? 'You' : (item.created_by_name || 'System / Admin')}</strong>
                    </span>

                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={11} aria-hidden="true" />
                      {formatDate(item.created_at)}
                    </span>
                  </div>
                </article>
              );
            })
          )}
        </div>
      ) : (
        <EmptyState
          icon={Send}
          title={
            historyFilter === 'mine'
              ? 'No announcements posted by you'
              : historyFilter === 'others'
                ? 'No announcements from other admins'
                : 'No announcements yet'
          }
          text={
            historyFilter === 'mine'
              ? 'Announcements you publish will appear here.'
              : historyFilter === 'others'
                ? 'Announcements posted by other staff will appear here.'
                : 'Your published announcements will appear here.'
          }
          action={historyFilter !== 'others' && onCreateClick ? 'Create announcement' : undefined}
          onClick={onCreateClick}
        />
      )}
    </section>
  );
}
