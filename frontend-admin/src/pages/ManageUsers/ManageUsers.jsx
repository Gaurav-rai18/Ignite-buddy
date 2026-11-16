import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  RotateCw,
  ShieldAlert,
  Layers,
  Calendar,
  Upload,
} from 'lucide-react';

import { useUsers } from '../../hooks/useUsers';
import { UserTable } from '../../components/users/UserTable';
import { UserFormModal } from '../../components/users/UserFormModal';
import { DeleteUserDialog } from '../../components/users/DeleteUserDialog';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Pager } from '../../components/ui/Pager';
import { BulkUploadUserModal } from '../../components/users/BulkUploadUserModal';
import { BatchHierarchyModal } from '../../components/users/BatchHierarchyModal';
import { usersService } from '../../services/usersService';
import { useRoleAccess } from '../../hooks/useRoleAccess';

export function ManageUsers({ onNotify }) {
  const { canAccessModule } = useRoleAccess();
  const {
    users,
    filteredUsers,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    addUser,
    editUser,
    deleteUser,
    refetch,
  } = useUsers();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [hierarchyModalOpen, setHierarchyModalOpen] = useState(false);

  // ============================
  // Role Filter & Pagination
  // ============================
  const [selectedRole, setSelectedRole] = useState('ALL');
  const [pageSize, setPageSize] = useState(15);
  const [currentPage, setCurrentPage] = useState(1);

  // Filter users by role
  const displayedUsers = useMemo(() => {
    if (selectedRole === 'ALL') {
      return filteredUsers;
    }
    return filteredUsers.filter((u) => u.role === selectedRole);
  }, [filteredUsers, selectedRole]);

  const totalPages = Math.max(1, Math.ceil(displayedUsers.length / pageSize));

  // Role count stats
  const roleCounts = useMemo(() => {
    const counts = { ALL: users.length, TRAINEE: 0, TA: 0, HR: 0, MANAGER: 0, ADMIN: 0 };
    users.forEach((u) => {
      if (counts[u.role] !== undefined) {
        counts[u.role] += 1;
      }
    });
    return counts;
  }, [users]);

  // Reset to first page when search query, role filter, or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedRole, pageSize]);

  // Guard against out of range page
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedUsers = displayedUsers.slice(startIndex, endIndex);

  const handleRefresh = async () => {
    setIsRefreshing(true);

    await refetch();

    setIsRefreshing(false);

    if (onNotify) {
      onNotify('User roles and details refreshed');
    }
  };

  const handleOpenAdd = () => {
    setEditingUser(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (formData, maybeId) => {
    const targetId = maybeId || editingUser?.id || editingUser?.pk;
    if (targetId) {
      await editUser(targetId, formData);

      if (onNotify) {
        onNotify(
          `User ${formData.username || 'details'} updated successfully`
        );
      }
    } else {
      await addUser(formData);

      if (onNotify) {
        onNotify(
          `User ${formData.username} added successfully`
        );
      }
    }
  };

  const handleDeleteConfirm = async (
    userId
  ) => {
    await deleteUser(userId);

    if (onNotify) {
      onNotify(
        'User deleted successfully'
      );
    }
  };

  const handleBulkUpload = async (targetType, file, csvText) => {
    try {
      const result = await usersService.bulkImportMasterData(targetType || 'users', file, csvText);
      await refetch();
      if (onNotify) {
        onNotify(
          `${result.created_count || 0} items created, ${result.updated_count || 0} updated.`
        );
      }
      return result;
    } catch (error) {
      console.error(error);
      const errMsg = error.response?.data?.error || 'Bulk upload failed';
      if (onNotify) {
        onNotify(errMsg);
      }
      throw error;
    }
  };

  return (
    <>
      <div className="welcome-row">
        <div>
          <div className="eyebrow">
            <span
              className="eyebrow-line"
              aria-hidden="true"
            />
            ACCESS & PERMISSIONS
          </div>

          <h1>Manage Users</h1>

          <p className="subheading">
            Create, edit and organise user
            roles.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={handleRefresh}
          disabled={
            loading || isRefreshing
          }
        >
          <RotateCw
            size={14}
            style={{
              animation:
                loading || isRefreshing
                  ? 'spin 1s linear infinite'
                  : 'none',
            }}
            aria-hidden="true"
          />

          {loading || isRefreshing
            ? 'Refreshing...'
            : 'Refresh data'}
        </button>
      </div>

      {error && (
        <ErrorBanner
          message={error}
          onRetry={refetch}
        />
      )}

      <section
        className="panel"
        style={{ padding: '24px' }}
      >
        <div className="panel-heading responsive-heading">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              className="stat-icon primary"
              style={{
                width: '40px',
                height: '40px',
              }}
              aria-hidden="true"
            >
              <Users size={20} />
            </div>

            <div>
              <h3
                style={{
                  fontSize: '15px',
                  marginBottom: '2px',
                }}
              >
                Manage users
              </h3>

              <p>
                Add users, update
                details, and assign
                demo roles
              </p>
            </div>
          </div>

          <div className="panel-actions-wrap">
            {canAccessModule('hierarchy') && (
              <button
                type="button"
                className="secondary-button"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={() => setHierarchyModalOpen(true)}
              >
                <Layers size={16} aria-hidden="true" />
                Manage Cohorts & Batches
              </button>
            )}

            <button
              type="button"
              className="secondary-button"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              onClick={() => setBulkModalOpen(true)}
            >
              <Upload size={16} aria-hidden="true" />
              Bulk Upload
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={handleOpenAdd}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <UserPlus
                size={16}
                aria-hidden="true"
              />
              Add User
            </button>
          </div>
        </div>

        {/* Role Filters & Search Toolbar */}
        <div className="users-action-toolbar">
          <div className="role-filters-container" role="tablist" aria-label="Filter users by role">
            {[
              { id: 'ALL', label: 'All Users', count: roleCounts.ALL },
              { id: 'TRAINEE', label: 'Trainees', count: roleCounts.TRAINEE },
              { id: 'TA', label: 'TAs / Mentors', count: roleCounts.TA },
              { id: 'HR', label: 'HR Team', count: roleCounts.HR },
              { id: 'MANAGER', label: 'Managers', count: roleCounts.MANAGER },
              { id: 'ADMIN', label: 'Admins', count: roleCounts.ADMIN },
            ].map((rf) => (
              <button
                key={rf.id}
                type="button"
                role="tab"
                aria-selected={selectedRole === rf.id}
                className={`role-filter-pill ${selectedRole === rf.id ? 'active' : ''}`}
                onClick={() => setSelectedRole(rf.id)}
              >
                <span>{rf.label}</span>
                <span className="role-pill-count">{rf.count}</span>
              </button>
            ))}
          </div>

          <div className="table-search-bar" style={{ margin: 0, minWidth: '260px' }}>
            <div className="search-input-wrap">
              <Search size={16} aria-hidden="true" />
              <input
                type="text"
                placeholder="Search users, email, id or role.."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search users by name, email, or role"
              />
            </div>
            <span className="search-count-badge">
              {displayedUsers.length} {displayedUsers.length === 1 ? 'user' : 'users'}
            </span>
          </div>
        </div>

        <UserTable
          users={paginatedUsers}
          onEdit={handleOpenEdit}
          onDelete={(u) => setDeletingUser(u)}
        />

        {/* Robust Pagination / Pager */}
        <Pager
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={displayedUsers.length}
          pageSize={pageSize}
          pageSizeOptions={[10, 15, 25, 50, 100]}
          onPageChange={(page) => setCurrentPage(page)}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          itemLabel="users"
        />

        {/* <div className="card-table-footer">
          <span>
            Showing {displayedUsers.length === 0 ? 0 : startIndex + 1} -{' '}
            {Math.min(endIndex, displayedUsers.length)} of {displayedUsers.length} users
          </span>

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <ShieldAlert
              size={13}
              color="var(--color-primary)"
              aria-hidden="true"
            />
            Role assignment is
            demo-only
          </span>
        </div> */}
      </section>

      <UserFormModal
        isOpen={isFormOpen}
        onClose={() =>
          setIsFormOpen(false)
        }
        onSubmit={handleFormSubmit}
        initialUser={editingUser}
      />

      <DeleteUserDialog
        isOpen={Boolean(deletingUser)}
        user={deletingUser}
        onClose={() =>
          setDeletingUser(null)
        }
        onConfirm={
          handleDeleteConfirm
        }
      />

      <BulkUploadUserModal
        isOpen={bulkModalOpen}
        onClose={() =>
          setBulkModalOpen(false)
        }
        onUpload={
          handleBulkUpload
        }
      />

      <BatchHierarchyModal
        isOpen={hierarchyModalOpen}
        onClose={() => setHierarchyModalOpen(false)}
        onHierarchyUpdated={() => {
          refetch();
          if (onNotify) {
            onNotify('Batch hierarchy updated successfully');
          }
        }}
      />
    </>
  );
}
