import React from 'react';

export function Field({ label, children, htmlFor, error, helpText }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {helpText && <small className="field-help">{helpText}</small>}
      {error && (
        <span
          className="field-error"
          role="alert"
          style={{ color: 'var(--color-danger)', fontSize: '10px', marginTop: '2px', fontWeight: '600' }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
