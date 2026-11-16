import json

from rest_framework.permissions import BasePermission

class IsUserManagementStaff(BasePermission):
    """
    Allows ADMIN, TA, HR, and MANAGER to access
    user-management endpoints.
    Superusers and staff always have access.
    """

    message = "You do not have permission to manage users."

    ALLOWED_ROLES = {"ADMIN", "TA", "HR", "MANAGER"}

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (
                request.user.is_superuser
                or request.user.is_staff
                or request.user.role in self.ALLOWED_ROLES
            )
        )
        
class IsAdmin(BasePermission):
    """
    Custom permission to allow access to users
    with the ADMIN role, staff, or superusers.
    """

    message = "Only admin users are allowed to perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (
                request.user.is_superuser
                or request.user.is_staff
                or request.user.role == "ADMIN"
            )
        )

class CanManageBroadcasts(BasePermission):
    """
    Allows admin/support roles to create broadcasts.
    Superusers and staff always have access.
    """

    message = "You do not have permission to manage broadcasts."

    ALLOWED_ROLES = {
        "ADMIN",
        "TA",
        "HR",
        "MANAGER",
    }

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (
                request.user.is_superuser
                or request.user.is_staff
                or request.user.role in self.ALLOWED_ROLES
            )
        )


class ModuleAccessPermission(BasePermission):
    """Enforce the configured Admin Console module policy on an API view."""

    message = "Your role does not have permission to access this module."
    module_key = None

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        # Keep the administrator role capable of recovering every module.
        if user.is_superuser or user.role == "ADMIN":
            return True

        module_key = self.module_key or getattr(view, "module_permission", None)
        if not module_key:
            return False

        try:
            from .views import DEFAULT_ROLE_PERMISSIONS
            from server.apps.buddy_controller.models import SystemSetting

            role = DEFAULT_ROLE_PERMISSIONS.get(user.role)
            if not role:
                return False

            permissions = dict(role.get("permissions", {}))
            raw = SystemSetting.get_str("rbac_role_permissions", "")
            if raw:
                stored = json.loads(raw)
                permissions.update(stored.get(user.role, {}).get("permissions", {}))
            required = [module_key]
            if request.method == "GET":
                required.extend(getattr(view, "module_permission_fallbacks", ()))
            return any(permissions.get(key) is True for key in required)
        except (TypeError, ValueError, json.JSONDecodeError):
            return False
        except Exception:
            return False
