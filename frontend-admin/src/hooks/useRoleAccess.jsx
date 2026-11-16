import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './useAuth';
import { settingsService } from '../services/settingsService';

const RoleAccessContext = createContext({
  canAccessModule: () => true,
  loadingPermissions: false,
  refreshPermissions: async () => ({}),
});

export function RoleAccessProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const roleKey = String(user?.role || '').toUpperCase();
  const isAdministrator = Boolean(user?.is_superuser || roleKey === 'ADMIN');
  const [permissions, setPermissions] = useState({});
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  const refreshPermissions = useCallback(async () => {
    if (!isAuthenticated || isAdministrator) {
      setPermissions({});
      setLoadingPermissions(false);
      return {};
    }

    setLoadingPermissions(true);
    try {
      const result = await settingsService.getRolesPermissions();
      const nextPermissions = result?.roles?.[roleKey]?.permissions || {};
      setPermissions(nextPermissions);
      return nextPermissions;
    } catch {
      // Fail closed if access policy cannot be loaded.
      setPermissions({});
      return {};
    } finally {
      setLoadingPermissions(false);
    }
  }, [isAuthenticated, isAdministrator, roleKey]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!isAuthenticated || isAdministrator) {
        if (active) {
          setPermissions({});
          setLoadingPermissions(false);
        }
        return;
      }

      if (active) setLoadingPermissions(true);
      try {
        const result = await settingsService.getRolesPermissions();
        if (active) {
          setPermissions(result?.roles?.[roleKey]?.permissions || {});
        }
      } catch {
        if (active) setPermissions({});
      } finally {
        if (active) setLoadingPermissions(false);
      }
    };

    const handleFocus = () => load();
    load();
    window.addEventListener('focus', handleFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAuthenticated, isAdministrator, roleKey, user?.id]);

  const canAccessModule = useCallback((moduleKey) => {
    if (isAdministrator) return true;
    return !loadingPermissions && permissions[moduleKey] === true;
  }, [isAdministrator, loadingPermissions, permissions]);

  const value = useMemo(() => ({
    canAccessModule,
    loadingPermissions,
    refreshPermissions,
  }), [canAccessModule, loadingPermissions, refreshPermissions]);

  return (
    <RoleAccessContext.Provider value={value}>
      {children}
    </RoleAccessContext.Provider>
  );
}

export function useRoleAccess() {
  return useContext(RoleAccessContext);
}
