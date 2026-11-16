import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { ProtectedRoute } from '../components/layout/ProtectedRoute';
import { AppLayout } from '../components/layout/AppLayout';
import { Login } from '../pages/Login/Login';
import { Dashboard } from '../pages/Dashboard/Dashboard';
import { Broadcast } from '../pages/Broadcast/Broadcast';
import { Schedule } from '../pages/Schedule/Schedule';
import { BuddyControl } from '../pages/BuddyControl/BuddyControl';
import { Assignments } from '../pages/Assignments/Assignments';
import { ManageUsers } from '../pages/ManageUsers/ManageUsers';
import { AddDocuments } from '../pages/AddDocuments/AddDocuments';
import { Profile } from '../pages/Profile/Profile';
import { RolesPermissions } from '../pages/RolesPermissions/RolesPermissions';
import { Settings } from '../pages/Settings/Settings';
import { NotFound } from '../pages/NotFound/NotFound';
import { broadcastService } from '../services/broadcastService';
import { RoleAccessProvider } from '../hooks/useRoleAccess';

function PublicOnlyRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  const [toastMessage, setToastMessage] = useState('');
  const [broadcastCount, setBroadcastCount] = useState(0);

  const notify = useCallback((message) => {
    setToastMessage(message);
    const timer = window.setTimeout(() => {
      setToastMessage('');
    }, 2800);
    return () => window.clearTimeout(timer);
  }, []);

  // Initialize theme from saved preferences
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('ignite_admin_theme');
      if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    } catch {}
  }, []);

  // Fetch initial broadcast count for the sidebar badge only if authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setBroadcastCount(0);
      return;
    }

    let isMounted = true;
    broadcastService
      .getBroadcasts()
      .then((data) => {
        if (isMounted && Array.isArray(data)) {
          setBroadcastCount(data.length);
        }
      })
      .catch(() => {
        // Silently catch badge count fetch error so UI continues normally
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  const handleUpdateBroadcastCount = useCallback((count) => {
    setBroadcastCount(count);
  }, []);

  return (
    <RoleAccessProvider>
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <Login onNotify={notify} />
          </PublicOnlyRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout
              broadcastCount={broadcastCount}
              toastMessage={toastMessage}
              onNotify={notify}
            />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<ProtectedRoute moduleKey="dashboard"><Dashboard onNotify={notify} /></ProtectedRoute>} />
        <Route
          path="broadcast"
          element={
            <ProtectedRoute moduleKey="broadcast">
              <Broadcast
                onNotify={notify}
                onUpdateBroadcastCount={handleUpdateBroadcastCount}
              />
            </ProtectedRoute>
          }
        />
        <Route path="schedule" element={<ProtectedRoute moduleKey="schedule"><Schedule onNotify={notify} /></ProtectedRoute>} />
        <Route path="buddy" element={<ProtectedRoute moduleKey="buddy"><BuddyControl onNotify={notify} /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute moduleKey="users"><ManageUsers onNotify={notify} /></ProtectedRoute>} />
        <Route path="documents" element={<ProtectedRoute moduleKey="documents"><AddDocuments onNotify={notify} /></ProtectedRoute>} />
        <Route path="assignments" element={<ProtectedRoute moduleKey="assignments"><Assignments onNotify={notify} /></ProtectedRoute>} />
        <Route path="profile" element={<Profile onNotify={notify} />} />
        <Route path="roles-permissions" element={<ProtectedRoute moduleKey="roles_permissions"><RolesPermissions onNotify={notify} /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute moduleKey="system_preferences"><Settings onNotify={notify} /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </RoleAccessProvider>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
