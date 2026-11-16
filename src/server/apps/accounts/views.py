"""
Accounts Views

This module contains all account-related APIs used
for authentication, authorization, user management,
password management, and bulk user operations.

Modules Covered:

Authentication:
    - Login
    - Logout

Password Management:
    - Change Password
    - Reset Password

User Management:
    - Create User
    - Retrieve User
    - Update User
    - Delete User

Bulk Operations:
    - Bulk User Upload

Security:
    - JWT Authentication
    - Role-Based Access Control (RBAC)

Roles:
    - ADMIN
    - TA
    - HR
    - MANAGER
    - TRAINEE

Author:
    Ignite Buddy Development Team
"""
import json
import csv
import openpyxl
from django.db import models, transaction
from django.db.models import Q
from django.utils import timezone
from django.http import HttpResponse
from django.contrib.auth import authenticate
from django.contrib.auth.hashers import make_password
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework_simplejwt.tokens import RefreshToken

from .models import User, Cohort, Batch, Lab, SubBatch, Stream, Subject, SubBatchStaff, StreamFaculty
from .permissions import IsAdmin, IsUserManagementStaff, ModuleAccessPermission
from .serializers import (
    LoginSerializer,
    UserCreateSerializer,
    UserListSerializer,
    UserUpdateSerializer,
    UserProfileSerializer,
    UserProfileUpdateSerializer,
    ChangePasswordSerializer,
    ResetPasswordSerializer,
    CohortSerializer,
    BatchSerializer,
    LabSerializer,
    SubBatchSerializer,
    StreamSerializer,
    SubjectSerializer,
    SubBatchStaffSerializer,
    StreamFacultySerializer,
)

from .services import (
    create_user,
    change_password,
    reset_password,
    resolve_or_create_sub_batch,
    bulk_create_users,
)
class LoginView(APIView):
    """
    User Login API.

    Endpoint:
        POST /api/accounts/login/

    Purpose:
        Authenticates a user using
        email and password.

    Authentication:
        Public Endpoint

    Request Example:

        {
            "email": "user@example.com",
            "password": "Password@123"
        }

    Success Response:

        {
            "access": "jwt_access_token",
            "refresh": "jwt_refresh_token",
            "email": "user@example.com",
            "role": "TRAINEE"
        }

    Error Response:

        {
            "error": "Invalid credentials"
        }
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        """
        Validates user credentials and
        returns JWT access and refresh tokens.
        """

        serializer = LoginSerializer(data=request.data)

        serializer.is_valid(raise_exception=True)

        login_id = serializer.validated_data["email"].strip()
        password = serializer.validated_data["password"]

        user = authenticate(
            request,
            username=login_id,
            password=password
        )

        if not user:
            user_obj = (
                User.objects.filter(email__iexact=login_id).first()
                or User.objects.filter(employee_id__iexact=login_id).first()
            )
            if user_obj and user_obj.check_password(password):
                user = user_obj

        if not user:
            return Response(
                {"error": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not user.is_active:
            return Response(
                {"error": "This account is inactive."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Ensure superuser/staff always has ADMIN role assigned
        if (user.is_superuser or user.is_staff) and user.role == "TRAINEE":
            user.role = "ADMIN"
            user.save()

        # The admin panel is accessible by all except trainees: ADMIN, MANAGER, TA, HR
        ALLOWED_ADMIN_ROLES = {"ADMIN", "MANAGER", "TA", "HR"}
        if user.role == "TRAINEE" or user.role not in ALLOWED_ADMIN_ROLES:
            return Response(
                {"error": "Access denied. Trainees are not authorized to access the Admin Console."},
                status=status.HTTP_403_FORBIDDEN
            )

        refresh = RefreshToken.for_user(user)
        user_profile = UserProfileSerializer(user).data

        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                **user_profile,
            },
            status=status.HTTP_200_OK
        )
class LogoutView(APIView):

    """
    User Logout API.

    Endpoint:
        POST /api/accounts/logout/

    Purpose:
        Blacklists the refresh token
        and logs out the user.

    Authentication:
        Required

    Headers:

        Authorization: Bearer <token>
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Invalidates refresh token and
        logs out the current user.
        """

        refresh_token = request.data.get("refresh")

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()

            return Response(
                {"message": "Logged out successfully"},
                status=status.HTTP_200_OK
            )

        except Exception:
            return Response(
                {"error": "Invalid refresh token"},
                status=status.HTTP_400_BAD_REQUEST
            )


class ChangePasswordView(APIView):
    """
    Change Password API.

    Endpoint:
        POST /api/accounts/change-password/

    Purpose:
        Allows authenticated users
        to change their own password.

    Authentication:
        Required

    Request Example:

        {
            "old_password": "OldPass123",
            "new_password": "NewPass123"
        }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Verifies old password and
        updates user's password.
        """

        serializer = ChangePasswordSerializer(
            data=request.data
        )

        serializer.is_valid(raise_exception=True)

        old_password = serializer.validated_data["old_password"]
        new_password = serializer.validated_data["new_password"]

        user = request.user

        if not user.check_password(old_password):
            return Response(
                {"error": "Old password is incorrect"},
                status=status.HTTP_400_BAD_REQUEST
            )

        change_password(user, new_password)

        return Response(
            {"message": "Password changed successfully"},
            status=status.HTTP_200_OK
        )


class UserListCreateView(APIView):
    """
    User Management API.

    Endpoint:
        GET  /api/accounts/users/
        POST /api/accounts/users/

    Permissions:
        ADMIN
        TA
        HR
        MANAGER

    Purpose:
        - Retrieve all users
        - Create new users
    """
    permission_classes = [
        IsAuthenticated,
        IsUserManagementStaff,
        ModuleAccessPermission,
    ]
    module_permission = "users"

    def get(self, request):
        """
        Retrieves all users available
        in the system.
        """
        users = User.objects.all()

        serializer = UserListSerializer(
            users,
            many=True,
        )

        return Response(serializer.data)

    def post(self, request):
        """
        Creates a new user account.
        """
        serializer = UserCreateSerializer(
            data=request.data,
        )

        serializer.is_valid(raise_exception=True)

        user = create_user(
            serializer.validated_data
        )

        return Response(
            UserListSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )

class UserDetailView(APIView):
    """
    User Detail API.

    Endpoint:
        GET    /api/accounts/users/<id>/
        PATCH  /api/accounts/users/<id>/
        DELETE /api/accounts/users/<id>/

    Permissions:

        GET:
            ADMIN
            TA
            HR
            MANAGER

        PATCH:
            ADMIN only

        DELETE:
            ADMIN only
    """

    def get_permissions(self):
        """
        Dynamically assigns permissions
        based on HTTP request method.
        """
        if self.request.method in {"PATCH", "PUT", "DELETE"}:
            permission_classes = [
                IsAuthenticated,
                IsAdmin,
                ModuleAccessPermission,
            ]
        else:
            permission_classes = [
                IsAuthenticated,
                IsUserManagementStaff,
                ModuleAccessPermission,
            ]

        return [
            permission()
            for permission in permission_classes
        ]
    module_permission = "users"

    def get(self, request, id):
        """
        Retrieves information for
        a single user.
        """ 
        try:
            user = User.objects.get(id=id)

        except User.DoesNotExist:
            return Response(
                {"error": "User not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = UserListSerializer(user)

        return Response(serializer.data)

    def patch(self, request, id):
        """
        Updates user profile information.
        """
        try:
            user = User.objects.get(id=id)

        except User.DoesNotExist:
            return Response(
                {"error": "User not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = UserUpdateSerializer(
            user,
            data=request.data,
            partial=True,
        )

        serializer.is_valid(raise_exception=True)
        updated_user = serializer.save()

        if request.data.get("password"):
            updated_user.set_password(str(request.data["password"]))
            if updated_user.role == "TRAINEE" or not updated_user.is_staff:
                updated_user.must_change_password = True
            updated_user.save()

        # Keep central.db trainee batch in sync with Django accounts
        try:
            from server.storage.central import get_central
            from server.realtime import notifier
            real_b = updated_user.sub_batch_code or updated_user.full_batch_name or "default"
            c = get_central()
            c.set_batch(updated_user.username, real_b)
            notifier.sync_batch(real_b)
            if updated_user.sub_batch_code:
                notifier.sync_batch(updated_user.sub_batch_code)
        except Exception:
            pass

        return Response(UserListSerializer(updated_user).data)
    def delete(self, request, id):
        """
        Deletes a user account.

        Restriction:
        Users cannot delete
        their own account.
        """ 
        try:
            user = User.objects.get(id=id)

        except User.DoesNotExist:
            return Response(
                {"error": "User not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if user.id == request.user.id:
            return Response(
                {"error": "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.delete()

        return Response(
            {"message": "User deleted successfully"},
            status=status.HTTP_200_OK,
        )


class ResetPasswordView(APIView):
    """
    Admin Password Reset API.

    Endpoint:
        POST /api/accounts/users/<id>/reset-password/

    Permissions:
        ADMIN only

    Purpose:
        Allows administrators
        to reset another user's password.
    """
    permission_classes = [
        IsAuthenticated,
        IsAdmin,
        ModuleAccessPermission,
    ]
    module_permission = "users"

    def post(self, request, id):
        """
        Resets password for
        the selected user.
        """
        try:
            user = User.objects.get(id=id)

        except User.DoesNotExist:
            return Response(
                {"error": "User not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ResetPasswordSerializer(
            data=request.data,
        )

        serializer.is_valid(raise_exception=True)

        new_password = serializer.validated_data[
            "new_password"
        ]

        reset_password(
            user,
            new_password,
        )

        return Response(
            {"message": "Password reset successfully"},
            status=status.HTTP_200_OK,
        )
class BulkUploadUsersView(APIView):
    """
    Bulk User Upload API.

    Endpoint:
        POST /api/accounts/users/bulk-upload/

    Permissions:
        ADMIN
        TA
        HR
        MANAGER

    Purpose:
        Upload users in bulk
        through Excel files.

    Supported File Type:
        .xlsx

    Expected Columns:
        - username
        - email
        - role

    Response Example:

        {
            "created_count": 100,
            "failed_count": 3,
            "errors": []
        }
    """
    permission_classes = [
        IsAuthenticated,
        IsUserManagementStaff,
        ModuleAccessPermission,
    ]
    module_permission = "users"

    def post(self, request):
        """
        Processes uploaded Excel file
        and creates users in bulk.
        """

        file = request.FILES.get(
            "file"
        )

        if not file:

            return Response(
                {
                    "message":
                    "No file uploaded"
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        result = bulk_create_users(
            file
        )

        return Response(
            result,
            status=status.HTTP_200_OK
        )


class CohortListView(APIView):
    module_permission = "hierarchy"
    module_permission_fallbacks = ("users", "broadcast", "schedule", "assignments", "buddy", "documents")

    def get_permissions(self):
        return [IsAuthenticated(), ModuleAccessPermission()]

    def get(self, request):
        cohorts = Cohort.objects.all().order_by("-code")
        return Response(CohortSerializer(cohorts, many=True).data)

    def post(self, request):
        ser = CohortSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        c = ser.save()
        return Response(CohortSerializer(c).data, status=status.HTTP_201_CREATED)


class BatchListView(APIView):
    module_permission = "hierarchy"
    module_permission_fallbacks = ("users", "broadcast", "schedule", "assignments", "buddy", "documents")

    def get_permissions(self):
        return [IsAuthenticated(), ModuleAccessPermission()]

    def get(self, request):
        cohort_id = request.query_params.get("cohort")
        batches = Batch.objects.all()
        if cohort_id:
            batches = batches.filter(cohort_id=cohort_id)
        return Response(BatchSerializer(batches, many=True).data)

    def post(self, request):
        ser = BatchSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        b = ser.save()
        return Response(BatchSerializer(b).data, status=status.HTTP_201_CREATED)


class SubBatchListView(APIView):
    module_permission = "hierarchy"
    module_permission_fallbacks = ("users", "broadcast", "schedule", "assignments", "buddy", "documents")

    def get_permissions(self):
        return [IsAuthenticated(), ModuleAccessPermission()]

    def get(self, request):
        batch_id = request.query_params.get("batch")
        sub_batches = SubBatch.objects.all()
        if batch_id:
            sub_batches = sub_batches.filter(batch_id=batch_id)
        return Response(SubBatchSerializer(sub_batches, many=True).data)

    def post(self, request):
        ser = SubBatchSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        sb = ser.save()
        return Response(SubBatchSerializer(sb).data, status=status.HTTP_201_CREATED)


class LabListView(APIView):
    module_permission = "hierarchy"
    module_permission_fallbacks = ("users", "broadcast", "schedule", "assignments", "buddy", "documents")

    def get_permissions(self):
        return [IsAuthenticated(), ModuleAccessPermission()]

    def get(self, request):
        labs = Lab.objects.all().order_by("name")
        return Response(LabSerializer(labs, many=True).data)

    def post(self, request):
        ser = LabSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        lab = ser.save()
        return Response(LabSerializer(lab).data, status=status.HTTP_201_CREATED)


class CohortDetailView(APIView):
    module_permission = "hierarchy"
    module_permission_fallbacks = ("users", "broadcast", "schedule", "assignments", "buddy", "documents")

    def get_permissions(self):
        return [IsAuthenticated(), ModuleAccessPermission()]

    def get(self, request, pk):
        try:
            cohort = Cohort.objects.get(pk=pk)
        except Cohort.DoesNotExist:
            return Response({"error": "Cohort not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(CohortSerializer(cohort).data)

    def patch(self, request, pk):
        try:
            cohort = Cohort.objects.get(pk=pk)
        except Cohort.DoesNotExist:
            return Response({"error": "Cohort not found"}, status=status.HTTP_404_NOT_FOUND)
        ser = CohortSerializer(cohort, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        cohort = ser.save()
        return Response(CohortSerializer(cohort).data)

    def delete(self, request, pk):
        try:
            cohort = Cohort.objects.get(pk=pk)
        except Cohort.DoesNotExist:
            return Response({"error": "Cohort not found"}, status=status.HTTP_404_NOT_FOUND)
        cohort.delete()
        return Response({"message": "Cohort deleted successfully"}, status=status.HTTP_204_NO_CONTENT)


class BatchDetailView(APIView):
    module_permission = "hierarchy"
    module_permission_fallbacks = ("users", "broadcast", "schedule", "assignments", "buddy", "documents")

    def get_permissions(self):
        return [IsAuthenticated(), ModuleAccessPermission()]

    def get(self, request, pk):
        try:
            batch = Batch.objects.get(pk=pk)
        except Batch.DoesNotExist:
            return Response({"error": "Batch not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(BatchSerializer(batch).data)

    def patch(self, request, pk):
        try:
            batch = Batch.objects.get(pk=pk)
        except Batch.DoesNotExist:
            return Response({"error": "Batch not found"}, status=status.HTTP_404_NOT_FOUND)
        ser = BatchSerializer(batch, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        batch = ser.save()
        return Response(BatchSerializer(batch).data)

    def delete(self, request, pk):
        try:
            batch = Batch.objects.get(pk=pk)
        except Batch.DoesNotExist:
            return Response({"error": "Batch not found"}, status=status.HTTP_404_NOT_FOUND)
        batch.delete()
        return Response({"message": "Batch deleted successfully"}, status=status.HTTP_204_NO_CONTENT)


class SubBatchDetailView(APIView):
    module_permission = "hierarchy"
    module_permission_fallbacks = ("users", "broadcast", "schedule", "assignments", "buddy", "documents")

    def get_permissions(self):
        return [IsAuthenticated(), ModuleAccessPermission()]

    def get(self, request, pk):
        try:
            sub_batch = SubBatch.objects.get(pk=pk)
        except SubBatch.DoesNotExist:
            return Response({"error": "Sub-batch not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(SubBatchSerializer(sub_batch).data)

    def patch(self, request, pk):
        try:
            sub_batch = SubBatch.objects.get(pk=pk)
        except SubBatch.DoesNotExist:
            return Response({"error": "Sub-batch not found"}, status=status.HTTP_404_NOT_FOUND)
        ser = SubBatchSerializer(sub_batch, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        sub_batch = ser.save()
        return Response(SubBatchSerializer(sub_batch).data)

    def delete(self, request, pk):
        try:
            sub_batch = SubBatch.objects.get(pk=pk)
        except SubBatch.DoesNotExist:
            return Response({"error": "Sub-batch not found"}, status=status.HTTP_404_NOT_FOUND)
        sub_batch.delete()
        return Response({"message": "Sub-batch deleted successfully"}, status=status.HTTP_204_NO_CONTENT)


class LabDetailView(APIView):
    module_permission = "hierarchy"
    module_permission_fallbacks = ("users", "broadcast", "schedule", "assignments", "buddy", "documents")

    def get_permissions(self):
        return [IsAuthenticated(), ModuleAccessPermission()]

    def get(self, request, pk):
        try:
            lab = Lab.objects.get(pk=pk)
        except Lab.DoesNotExist:
            return Response({"error": "Lab not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(LabSerializer(lab).data)

    def patch(self, request, pk):
        try:
            lab = Lab.objects.get(pk=pk)
        except Lab.DoesNotExist:
            return Response({"error": "Lab not found"}, status=status.HTTP_404_NOT_FOUND)
        ser = LabSerializer(lab, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        lab = ser.save()
        return Response(LabSerializer(lab).data)

    def delete(self, request, pk):
        try:
            lab = Lab.objects.get(pk=pk)
        except Lab.DoesNotExist:
            return Response({"error": "Lab not found"}, status=status.HTTP_404_NOT_FOUND)
        lab.delete()
        return Response({"message": "Lab deleted successfully"}, status=status.HTTP_204_NO_CONTENT)


class UserProfileView(APIView):
    """
    Profile API for currently authenticated user.
    GET   /api/accounts/me/
    PATCH /api/accounts/me/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        serializer = UserProfileUpdateSerializer(
            request.user,
            data=request.data,
            partial=True
        )
        serializer.is_valid(raise_exception=True)
        updated_user = serializer.save()
        return Response(UserProfileSerializer(updated_user).data)


DEFAULT_ROLE_PERMISSIONS = {
    "ADMIN": {
        "label": "Ignite Administrator",
        "description": "Full administrative access across all Admin Console pages.",
        "is_immutable": True,
        "permissions": {
            "dashboard": True,
            "broadcast": True,
            "schedule": True,
            "assignments": True,
            "buddy": True,
            "users": True,
            "documents": True,
            "hierarchy": True,
            "roles_permissions": True,
            "system_preferences": True,
        },
    },
    "TA": {
        "label": "TA",
        "description": "Instructional team managing announcements, course timetables, and learning material.",
        "is_immutable": False,
        "permissions": {
            "dashboard": True,
            "broadcast": True,
            "schedule": True,
            "assignments": True,
            "buddy": False,
            "users": True,
            "documents": True,
            "hierarchy": False,
            "roles_permissions": False,
            "system_preferences": False,
        },
    },
    "MANAGER": {
        "label": "Manager",
        "description": "Operations and HR leads managing cohort cohorts, batches, and user directories.",
        "is_immutable": False,
        "permissions": {
            "dashboard": True,
            "broadcast": True,
            "schedule": True,
            "assignments": False,
            "buddy": False,
            "users": True,
            "documents": False,
            "hierarchy": True,
            "roles_permissions": False,
            "system_preferences": False,
        },
    },
    "HR": {
        "label": "HR",
        "description": "Campus HR operations overseeing trainee cohorts, rosters, and administrative records.",
        "is_immutable": False,
        "permissions": {
            "dashboard": True,
            "broadcast": True,
            "schedule": False,
            "assignments": False,
            "buddy": False,
            "users": True,
            "documents": False,
            "hierarchy": True,
            "roles_permissions": False,
            "system_preferences": False,
        },
    },
    "TRAINEE": {
        "label": "Student Trainee",
        "description": "Enrolled TCS Ignite learners accessing real-time AI mentoring and learning assets.",
        "is_immutable": True,
        "permissions": {
            "dashboard": False,
            "broadcast": False,
            "schedule": False,
            "assignments": False,
            "buddy": False,
            "users": False,
            "documents": False,
            "hierarchy": False,
            "roles_permissions": False,
            "system_preferences": False,
        },
    },
}


class RolesPermissionsView(APIView):
    """
    Role-Based Access Control configuration.
    GET  /api/accounts/roles-permissions/
    POST /api/accounts/roles-permissions/
    """
    permission_classes = [IsAuthenticated]

    def _get_stored_matrix(self):
        from server.apps.buddy_controller.models import SystemSetting
        raw = SystemSetting.get_str("rbac_role_permissions", "")
        if raw:
            try:
                stored = json.loads(raw)
                matrix = json.loads(json.dumps(DEFAULT_ROLE_PERMISSIONS))
                for role_key, data in stored.items():
                    if role_key in matrix:
                        matrix[role_key]["permissions"].update(data.get("permissions", {}))
                return matrix
            except Exception:
                pass
        return DEFAULT_ROLE_PERMISSIONS

    def get(self, request):
        matrix = self._get_stored_matrix()
        user_counts = {}
        for role_key in DEFAULT_ROLE_PERMISSIONS:
            user_counts[role_key] = User.objects.filter(role=role_key, is_active=True).count()

        is_admin = bool(request.user.is_superuser or request.user.role == "ADMIN")
        return Response({
            "roles": matrix,
            "user_counts": user_counts,
            "current_user_role": request.user.role,
            "can_manage": is_admin,
        })

    def post(self, request):
        if not (request.user.is_superuser or request.user.role == "ADMIN"):
            return Response(
                {"error": "Only administrators can modify role permissions."},
                status=status.HTTP_403_FORBIDDEN
            )

        from server.apps.buddy_controller.models import SystemSetting
        incoming_roles = request.data.get("roles", {})
        matrix = self._get_stored_matrix()

        for role_key, role_data in incoming_roles.items():
            if role_key in matrix:
                # Keep the ADMIN role immutable to prevent administrative lockout.
                if role_key == "ADMIN":
                    continue
                incoming_perms = role_data.get("permissions", {})
                for perm_key, val in incoming_perms.items():
                    if perm_key in matrix[role_key]["permissions"]:
                        matrix[role_key]["permissions"][perm_key] = bool(val)

        SystemSetting.set_str(
            "rbac_role_permissions",
            json.dumps(matrix),
            description="RBAC Module Access Matrix",
            user=request.user
        )

        return Response({
            "success": True,
            "roles": matrix,
            "message": "Role permissions updated and saved to persistent database.",
        })


DEFAULT_SYSTEM_PREFERENCES = {
    # General Settings
    "workspace_name": "TCS Ignite Workspace",
    "timezone": "Asia/Kolkata",
    "date_format": "DD/MM/YYYY",
    "time_format": "12-hour",
    # Appearance
    "theme": "light",
    "sidebar_default_expanded": True,
    # Notification Preferences
    "notify_announcements": True,
    "notify_schedules": True,
    "notify_system_alerts": True,
    # Security Settings
    "session_timeout_minutes": 15,
    "password_min_length": 8,
    "require_special_char": True,
    # Data Management
    "data_retention_days": 365,
    "auto_archive_broadcasts": True,
}


class SystemPreferencesView(APIView):
    """
    Persistent System Preferences API.
    GET  /api/settings/preferences/
    POST /api/settings/preferences/
    """
    permission_classes = [IsAuthenticated, ModuleAccessPermission]
    module_permission = "system_preferences"

    def _get_stored_preferences(self):
        from server.apps.buddy_controller.models import SystemSetting
        raw = SystemSetting.get_str("system_preferences", "")
        prefs = dict(DEFAULT_SYSTEM_PREFERENCES)
        if raw:
            try:
                stored = json.loads(raw)
                prefs.update(stored)
            except Exception:
                pass
        return prefs

    def get(self, request):
        prefs = self._get_stored_preferences()
        return Response(prefs)

    def post(self, request):
        from server.apps.buddy_controller.models import SystemSetting
        prefs = self._get_stored_preferences()
        incoming = request.data or {}

        # Whitelist allowed preference keys
        for key, val in incoming.items():
            if key in prefs:
                prefs[key] = val

        SystemSetting.set_str(
            "system_preferences",
            json.dumps(prefs),
            description="Global System Preferences",
            user=request.user
        )

        return Response({
            "success": True,
            "preferences": prefs,
            "message": "System preferences successfully updated.",
        })


class DataExportView(APIView):
    """
    Export System Data API.
    GET /api/settings/export/?type=users|audit
    """
    permission_classes = [IsAuthenticated, IsAdmin, ModuleAccessPermission]
    module_permission = "system_preferences"

    def get(self, request):
        export_type = request.query_params.get("type", "users").lower()

        if export_type == "users":
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="ignite_users_export.csv"'
            writer = csv.writer(response)
            writer.writerow([
                "ID",
                "Employee ID",
                "Full Name",
                "Username",
                "Email",
                "Role",
                "Department",
                "Designation",
                "Batch / Hierarchy",
                "Active Status",
                "Date Joined",
            ])

            for u in User.objects.all().order_by("id"):
                name = f"{u.first_name} {u.last_name}".strip() or u.username
                writer.writerow([
                    u.id,
                    u.employee_id or "",
                    name,
                    u.username,
                    u.email,
                    u.role,
                    u.department or "",
                    u.designation or "",
                    u.full_batch_name or "Unassigned",
                    "ACTIVE" if u.is_active else "INACTIVE",
                    u.date_joined.strftime("%Y-%m-%d %H:%M") if u.date_joined else "",
                ])
            return response

        # Default audit summary export
        from server.apps.buddy_controller.models import SystemSetting
        summary = {
            "total_users": User.objects.count(),
            "active_users": User.objects.filter(is_active=True).count(),
            "admin_count": User.objects.filter(role="ADMIN").count(),
            "trainee_count": User.objects.filter(role="TRAINEE").count(),
            "cohort_count": Cohort.objects.count(),
            "batch_count": Batch.objects.count(),
            "sub_batch_count": SubBatch.objects.count(),
            "preferences": json.loads(SystemSetting.get_str("system_preferences", "{}") or "{}"),
            "exported_at": timezone.now().isoformat(),
        }
        return Response(summary)


# --------------------------------------------------------------------------
# Stream & Subject Management Views
# --------------------------------------------------------------------------

class StreamListView(APIView):
    module_permission = "hierarchy"
    module_permission_fallbacks = ("users", "broadcast", "schedule", "assignments", "buddy", "documents")

    def get_permissions(self):
        return [IsAuthenticated(), ModuleAccessPermission()]

    def get(self, request):
        streams = Stream.objects.all().order_by("name")
        return Response(StreamSerializer(streams, many=True).data)

    def post(self, request):
        ser = StreamSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        s = ser.save()
        return Response(StreamSerializer(s).data, status=status.HTTP_201_CREATED)


class StreamDetailView(APIView):
    module_permission = "hierarchy"
    module_permission_fallbacks = ("users", "broadcast", "schedule", "assignments", "buddy", "documents")

    def get_permissions(self):
        return [IsAuthenticated(), ModuleAccessPermission()]

    def get(self, request, pk):
        try:
            s = Stream.objects.get(pk=pk)
            return Response(StreamSerializer(s).data)
        except Stream.DoesNotExist:
            return Response({"error": "Stream not found"}, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, pk):
        try:
            s = Stream.objects.get(pk=pk)
        except Stream.DoesNotExist:
            return Response({"error": "Stream not found"}, status=status.HTTP_404_NOT_FOUND)
        ser = StreamSerializer(s, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    patch = put

    def delete(self, request, pk):
        try:
            s = Stream.objects.get(pk=pk)
            s.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Stream.DoesNotExist:
            return Response({"error": "Stream not found"}, status=status.HTTP_404_NOT_FOUND)


class SubjectListView(APIView):
    module_permission = "hierarchy"
    module_permission_fallbacks = ("users", "broadcast", "schedule", "assignments", "buddy", "documents")

    def get_permissions(self):
        return [IsAuthenticated(), ModuleAccessPermission()]

    def get(self, request):
        subjects = Subject.objects.all().order_by("name")
        return Response(SubjectSerializer(subjects, many=True).data)

    def post(self, request):
        ser = SubjectSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        sub = ser.save()
        return Response(SubjectSerializer(sub).data, status=status.HTTP_201_CREATED)


class SubjectDetailView(APIView):
    module_permission = "hierarchy"
    module_permission_fallbacks = ("users", "broadcast", "schedule", "assignments", "buddy", "documents")

    def get_permissions(self):
        return [IsAuthenticated(), ModuleAccessPermission()]

    def get(self, request, pk):
        try:
            sub = Subject.objects.get(pk=pk)
            return Response(SubjectSerializer(sub).data)
        except Subject.DoesNotExist:
            return Response({"error": "Subject not found"}, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, pk):
        try:
            sub = Subject.objects.get(pk=pk)
        except Subject.DoesNotExist:
            return Response({"error": "Subject not found"}, status=status.HTTP_404_NOT_FOUND)
        ser = SubjectSerializer(sub, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    patch = put

    def delete(self, request, pk):
        try:
            sub = Subject.objects.get(pk=pk)
            sub.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Subject.DoesNotExist:
            return Response({"error": "Subject not found"}, status=status.HTTP_404_NOT_FOUND)


class BulkImportMasterDataView(APIView):
    """
    Unified CSV / Data Bulk Import endpoint for:
      - 'users': email, username, employee_id, role, sub_batch, stream
      - 'hierarchy': cohort_code, cohort_name, batch_name, sub_batch_name, lab_name
      - 'streams': code, name, description
      - 'subjects': code, name, description
    """
    def get_permissions(self):
        import_type = str(self.request.data.get("type", "")).lower().strip()
        self.module_permission = "users" if import_type == "users" else "hierarchy"
        return [IsAuthenticated(), ModuleAccessPermission()]

    def post(self, request):
        import_type = request.data.get("type", "").lower().strip()
        uploaded_file = request.FILES.get("file")
        csv_text = request.data.get("csv_text", "")

        rows = []
        if uploaded_file:
            fname = getattr(uploaded_file, "name", "").lower()
            if fname.endswith((".xlsx", ".xls")):
                try:
                    wb = openpyxl.load_workbook(uploaded_file, data_only=True)
                    ws = wb.active
                    raw_rows = list(ws.iter_rows(values_only=True))
                    if raw_rows:
                        headers = [str(c).strip() if c is not None else f"col_{i}" for i, c in enumerate(raw_rows[0])]
                        for r_vals in raw_rows[1:]:
                            if any(v is not None and str(v).strip() != "" for v in r_vals):
                                row_dict = {
                                    headers[i]: (str(r_vals[i]).strip() if i < len(r_vals) and r_vals[i] is not None else "")
                                    for i in range(len(headers))
                                }
                                rows.append(row_dict)
                except Exception as exc:
                    return Response({"error": f"Failed to parse Excel file: {str(exc)}"}, status=status.HTTP_400_BAD_REQUEST)
            else:
                try:
                    content = uploaded_file.read()
                    if isinstance(content, bytes):
                        try:
                            content = content.decode("utf-8-sig")
                        except UnicodeDecodeError:
                            content = content.decode("latin-1")
                    reader = csv.DictReader(content.splitlines())
                    rows = [r for r in reader]
                except Exception as exc:
                    return Response({"error": f"Failed to parse CSV file: {str(exc)}"}, status=status.HTTP_400_BAD_REQUEST)
        elif csv_text:
            reader = csv.DictReader(csv_text.splitlines())
            rows = [r for r in reader]
        else:
            return Response({"error": "Please provide a file (.csv or .xlsx) or csv_text string."}, status=status.HTTP_400_BAD_REQUEST)

        if not rows:
            return Response({"error": "The provided file/data contains no data rows."}, status=status.HTTP_400_BAD_REQUEST)

        created_count = 0
        updated_count = 0
        errors = []

        if import_type == "subjects":
            with transaction.atomic():
                for idx, r in enumerate(rows, start=1):
                    code = (r.get("code") or r.get("Subject Code") or "").strip().upper()
                    name = (r.get("name") or r.get("Subject Name") or code).strip()
                    desc = (r.get("description") or r.get("Description") or "").strip()
                    if not code:
                        errors.append(f"Row {idx}: Subject code is required.")
                        continue
                    sub, created = Subject.objects.update_or_create(
                        code=code,
                        defaults={"name": name, "description": desc, "is_active": True}
                    )
                    if created:
                        created_count += 1
                    else:
                        updated_count += 1

        elif import_type == "streams":
            with transaction.atomic():
                for idx, r in enumerate(rows, start=1):
                    code = (r.get("code") or r.get("Stream Code") or "").strip().upper()
                    name = (r.get("name") or r.get("Stream Name") or code).strip()
                    desc = (r.get("description") or r.get("Description") or "").strip()
                    if not code:
                        errors.append(f"Row {idx}: Stream code is required.")
                        continue
                    st, created = Stream.objects.update_or_create(
                        code=code,
                        defaults={"name": name, "description": desc}
                    )
                    if created:
                        created_count += 1
                    else:
                        updated_count += 1

        elif import_type == "hierarchy":
            with transaction.atomic():
                for idx, r in enumerate(rows, start=1):
                    c_code = (r.get("cohort_code") or r.get("Cohort") or "B50").strip().upper()
                    b_name = (r.get("batch_name") or r.get("Batch") or "A").strip().upper()
                    sb_name = (r.get("sub_batch_name") or r.get("Sub Batch") or f"{b_name}1").strip().upper()
                    lab_name = (r.get("lab_name") or r.get("Home Lab") or "Lab 1").strip()

                    if not c_code or not b_name or not sb_name:
                        errors.append(f"Row {idx}: Cohort, Batch, and Sub-Batch are required.")
                        continue

                    cohort, _ = Cohort.objects.get_or_create(code=c_code, defaults={"name": f"Ignite {c_code}", "is_active": True})
                    batch, _ = Batch.objects.get_or_create(cohort=cohort, name=b_name)
                    lab = Lab.get_or_create_by_name(lab_name)
                    sb, created = SubBatch.objects.update_or_create(
                        batch=batch,
                        name=sb_name,
                        defaults={"home_lab": lab}
                    )
                    if created:
                        created_count += 1
                    else:
                        updated_count += 1

        elif import_type == "users":
            DEFAULT_PASSWORD_HASH = make_password("Tcs#1234")

            # Pre-cache streams and sub-batches to eliminate repetitive DB queries
            stream_map = {}
            for st in Stream.objects.all():
                stream_map[st.code.upper()] = st
                stream_map[st.name.upper()] = st

            sb_map = {}
            for sb in SubBatch.objects.select_related("batch", "batch__cohort").all():
                sb_map[sb.name.upper()] = sb
                if sb.full_code:
                    sb_map[sb.full_code.upper()] = sb

            with transaction.atomic():
                for idx, r in enumerate(rows, start=1):
                    email = (r.get("email") or r.get("Email") or "").strip().lower()
                    username = (r.get("username") or r.get("Username") or (email.split("@")[0] if email else "")).strip()
                    emp_id_raw = (r.get("employee_id") or r.get("Employee ID") or r.get("emp_id") or "").strip()
                    emp_id = ""
                    if emp_id_raw:
                        try:
                            if "." in emp_id_raw:
                                emp_id = str(int(float(emp_id_raw)))
                            else:
                                emp_id = str(int(emp_id_raw))
                        except ValueError:
                            emp_id = emp_id_raw

                    role = (r.get("role") or r.get("Role") or "TRAINEE").strip().upper()
                    sb_raw = (r.get("sub_batch") or r.get("Sub Batch") or r.get("batch") or "").strip().upper()
                    stream_raw = (r.get("stream") or r.get("Stream") or r.get("track") or "").strip().upper()

                    if not email:
                        errors.append(f"Row {idx}: Email is required.")
                        continue

                    sub_batch_obj = sb_map.get(sb_raw)
                    if not sub_batch_obj and sb_raw:
                        if "-" in sb_raw:
                            sub_batch_obj = sb_map.get(sb_raw.split("-")[-1])
                        if not sub_batch_obj:
                            sub_batch_obj = resolve_or_create_sub_batch(sb_raw)
                            if sub_batch_obj:
                                sb_map[sb_raw] = sub_batch_obj

                    stream_obj = stream_map.get(stream_raw)

                    user_defaults = {
                        "username": username or email.split("@")[0],
                        "role": role if role in dict(User.ROLE_CHOICES) else "TRAINEE",
                        "sub_batch": sub_batch_obj,
                        "stream": stream_obj,
                        "employee_id": emp_id if (emp_id and len(emp_id) == 7 and emp_id.isdigit()) else None,
                        "is_active": True,
                    }
                    user, created = User.objects.get_or_create(email=email, defaults=user_defaults)
                    if created:
                        user.password = DEFAULT_PASSWORD_HASH
                        user.must_change_password = True
                        user.save()
                        created_count += 1
                    else:
                        for k, v in user_defaults.items():
                            setattr(user, k, v)
                        user.save()
                        updated_count += 1
        else:
            return Response(
                {"error": f"Invalid type '{import_type}'. Supported: 'users', 'hierarchy', 'streams', 'subjects'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response({
            "success": True,
            "type": import_type,
            "created_count": created_count,
            "updated_count": updated_count,
            "total_rows": len(rows),
            "errors": errors[:20],
        })
