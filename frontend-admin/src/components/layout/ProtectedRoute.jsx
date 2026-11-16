import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useRoleAccess } from '../../hooks/useRoleAccess';

export function ProtectedRoute({ children, moduleKey }) {
  const { isAuthenticated, loading } = useAuth();
  const { canAccessModule, loadingPermissions } = useRoleAccess();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="btn-spinner" style={{ width: '28px', height: '28px', borderColor: 'var(--color-primary)' }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (moduleKey && loadingPermissions) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh' }}>
        <div className="btn-spinner" style={{ width: '28px', height: '28px', borderColor: 'var(--color-primary)' }} />
      </div>
    );
  }

  if (moduleKey && !canAccessModule(moduleKey)) {
    return (
      <section className="panel" role="alert" aria-labelledby="access-denied-title">
        <h1 id="access-denied-title">Access restricted</h1>
        <p>Your role does not have permission to open this page. Contact an administrator if you need access.</p>
      </section>
    );
  }

  return children;
}
