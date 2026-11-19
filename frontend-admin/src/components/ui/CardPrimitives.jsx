import React from 'react';

export function IconTile({ icon: Icon, tone = 'blue', size = 16, className = '' }) {
  if (!Icon) return null;

  return (
    <span
      className={`admin-icon-tile admin-icon-tile--${tone} ${className}`.trim()}
      aria-hidden="true"
    >
      <Icon size={size} strokeWidth={1.8} />
    </span>
  );
}

export function StatusBadge({ tone = 'blue', children, className = '' }) {
  return (
    <span className={`admin-status-badge admin-status-badge--${tone} ${className}`.trim()}>
      {children}
    </span>
  );
}

export function InfoTile({ icon, label, value, tone = 'blue', className = '' }) {
  return (
    <div className={`admin-info-tile ${className}`.trim()}>
      <IconTile icon={icon} tone={tone} size={15} />
      <div className="admin-info-tile__copy">
        <span className="admin-info-tile__label">{label}</span>
        <strong className="admin-info-tile__value">{value}</strong>
      </div>
    </div>
  );
}
