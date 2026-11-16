import json
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from server.apps.accounts.models import User, Cohort, Batch, Lab, SubBatch, Stream
from server.apps.accounts.services import bulk_create_users


class AccountsAuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="Gaurav Rai",
            email="gaurav.rai@tcs.com",
            password="SecurePassword@123",
            first_name="Gaurav",
            last_name="Rai",
            role="ADMIN",
            employee_id="3273115",
            is_staff=True,
        )
        self.trainee = User.objects.create_user(
            username="Trainee One",
            email="trainee1@tcs.com",
            password="SecurePassword@123",
            role="TRAINEE",
            is_staff=False,
        )

    def test_admin_login_success(self):
        response = self.client.post(
            "/api/accounts/login/",
            {"email": "gaurav.rai@tcs.com", "password": "SecurePassword@123"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["email"], "gaurav.rai@tcs.com")
        self.assertEqual(response.data["full_name"], "Gaurav Rai")
        self.assertEqual(response.data["role"], "ADMIN")

    def test_trainee_login_blocked_from_admin_console(self):
        response = self.client.post(
            "/api/accounts/login/",
            {"email": "trainee1@tcs.com", "password": "SecurePassword@123"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("error", response.data)

    def test_invalid_credentials_returns_401(self):
        response = self.client.post(
            "/api/accounts/login/",
            {"email": "gaurav.rai@tcs.com", "password": "WrongPassword"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)


class UserProfileAndSecurityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="Gaurav Rai",
            email="gaurav.rai@tcs.com",
            password="Password@123",
            first_name="Gaurav",
            last_name="Rai",
            role="ADMIN",
            employee_id="3273115",
            department="TCS Ignite",
            designation="Ignite Administrator",
            is_staff=True,
        )
        self.token = str(RefreshToken.for_user(self.user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token}")

    def test_get_own_profile(self):
        response = self.client.get("/api/accounts/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["full_name"], "Gaurav Rai")
        self.assertEqual(response.data["email"], "gaurav.rai@tcs.com")
        self.assertEqual(response.data["employee_id"], "3273115")

    def test_patch_own_profile(self):
        response = self.client.patch(
            "/api/accounts/me/",
            { "department": "TCS Ignite Innovations",},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["department"], "TCS Ignite Innovations")

        self.user.refresh_from_db()

    def test_protected_fields_cannot_be_escalated(self):
        response = self.client.patch(
            "/api/accounts/me/",
            {"role": "SUPER_ADMIN", "employee_id": "HACKED"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, "ADMIN")
        self.assertEqual(self.user.employee_id, "3273115")

    def test_change_password_success(self):
        response = self.client.post(
            "/api/accounts/change-password/",
            {"old_password": "Password@123", "new_password": "NewSecurePassword@456"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        # Verify old password no longer works
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewSecurePassword@456"))
        self.assertFalse(self.user.check_password("Password@123"))

    def test_change_password_wrong_old_password(self):
        response = self.client.post(
            "/api/accounts/change-password/",
            {"old_password": "WrongOldPassword", "new_password": "NewSecurePassword@456"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class RolesPermissionsAndSettingsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="Admin",
            email="admin@tcs.com",
            password="AdminPassword@123",
            role="ADMIN",
            is_staff=True,
            is_superuser=True,
        )
        self.token = str(RefreshToken.for_user(self.admin).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token}")

    def test_get_roles_permissions_matrix(self):
        response = self.client.get("/api/accounts/roles-permissions/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("roles", response.data)
        self.assertIn("ADMIN", response.data["roles"])
        self.assertIn("TRAINEE", response.data["roles"])
        self.assertTrue(response.data["can_manage"])

    def test_update_roles_permissions(self):
        roles = {
            "TA": {
                "label": "Faculty / Teaching Assistant",
                "permissions": {"dashboard": True, "schedule": True, "buddy": False},
            }
        }
        response = self.client.post(
            "/api/accounts/roles-permissions/",
            {"roles": roles},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])

    def test_get_and_post_system_preferences(self):
        get_res = self.client.get("/api/settings/preferences/")
        self.assertEqual(get_res.status_code, 200)
        self.assertIn("workspace_name", get_res.data)

        # Update preferences
        post_res = self.client.post(
            "/api/settings/preferences/",
            {"workspace_name": "Ignite Buddy Workspace", "theme": "dark"},
            format="json",
        )
        self.assertEqual(post_res.status_code, 200)
        self.assertEqual(post_res.data["preferences"]["workspace_name"], "Ignite Buddy Workspace")
        self.assertEqual(post_res.data["preferences"]["theme"], "dark")

    def test_export_users_csv(self):
        response = self.client.get("/api/settings/export/?type=users")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        content = response.content.decode("utf-8")
        self.assertIn("Employee ID", content)
        self.assertIn("admin@tcs.com", content)

    def test_export_audit_json(self):
        response = self.client.get("/api/settings/export/?type=audit")
        self.assertEqual(response.status_code, 200)
        self.assertIn("total_users", response.data)
        self.assertIn("exported_at", response.data)


class HierarchyAndUserManagementTests(TestCase):
    def setUp(self):
        self.cohort = Cohort.objects.create(name="Ignite Cohort 2026", code="C26")
        self.batch = Batch.objects.create(name="Batch 1", cohort=self.cohort)
        self.lab = Lab.objects.create(name="Lab Delta")
        self.sub_batch = SubBatch.objects.create(name="Delta 1", batch=self.batch)

    def test_hierarchy_relationship(self):
        self.assertEqual(self.batch.cohort.name, "Ignite Cohort 2026")
        self.assertEqual(self.sub_batch.batch.name, "Batch 1")
        self.assertEqual(self.sub_batch.full_code, "C26-Batch 1-Delta 1")

    def test_user_batch_naming(self):
        user = User.objects.create_user(
            username="Student",
            email="student@tcs.com",
            password="Password@123",
            role="TRAINEE",
            sub_batch=self.sub_batch,
        )
        self.assertIn("C26", user.full_batch_name)
        self.assertIn("Delta 1", user.full_batch_name)

    def test_bulk_create_users_from_csv(self):
        stream = Stream.objects.create(code="AI", name="AI Engineering")
        csv_content = (
            "username,email,role,employee_id,sub_batch,stream\n"
            "Alice Smith,alice.smith@tcs.com,TRAINEE,2819001,A1,AI Engineering\n"
            "Bob Jones,bob.jones@tcs.com,TRAINEE,2819002,A2,AI\n"
            "Mentor TA,mentor.ta@tcs.com,TA,,,\n"
        )
        res = bulk_create_users(csv_content)
        self.assertEqual(res["created_count"], 3)
        self.assertEqual(res["failed_count"], 0)

        alice = User.objects.get(email="alice.smith@tcs.com")
        self.assertEqual(alice.employee_id, "2819001")
        self.assertEqual(alice.role, "TRAINEE")
        self.assertIsNotNone(alice.sub_batch)
        self.assertEqual(alice.sub_batch.name, "A1")
        self.assertEqual(alice.stream, stream)

        mentor = User.objects.get(email="mentor.ta@tcs.com")
        self.assertEqual(mentor.role, "TA")
        self.assertIsNone(mentor.employee_id)

    def test_bulk_import_master_data_view_csv(self):
        client = APIClient()
        admin = User.objects.create_user(
            username="BulkAdmin",
            email="bulkadmin@tcs.com",
            password="Password@123",
            role="ADMIN",
            is_staff=True,
        )
        client.force_authenticate(user=admin)

        # Import hierarchy
        csv_hierarchy = "cohort_code,cohort_name,batch_name,sub_batch_name,lab_name\nB55,Cohort 55,B,B1,Lab 9"
        res = client.post(
            "/api/accounts/bulk-import/",
            {"type": "hierarchy", "csv_text": csv_hierarchy},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["created_count"], 1)
        self.assertTrue(SubBatch.objects.filter(name="B1", batch__cohort__code="B55").exists())


class ApiDocumentationPermissionsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="Admin Docs",
            email="admin.docs@tcs.com",
            password="SecurePassword@123",
            role="ADMIN",
            is_staff=True,
            is_superuser=True,
        )
        self.trainee = User.objects.create_user(
            username="Trainee Docs",
            email="trainee.docs@tcs.com",
            password="SecurePassword@123",
            role="TRAINEE",
            is_staff=False,
            is_superuser=False,
        )

    def test_unauthenticated_access_to_docs_blocked(self):
        res_swagger = self.client.get("/api/docs/")
        self.assertIn(res_swagger.status_code, (401, 403))

        res_schema = self.client.get("/api/schema/")
        self.assertIn(res_schema.status_code, (401, 403))

    def test_trainee_access_to_docs_forbidden(self):
        self.client.force_authenticate(user=self.trainee)

        res_swagger = self.client.get("/api/docs/")
        self.assertEqual(res_swagger.status_code, 403)

        res_schema = self.client.get("/api/schema/")
        self.assertEqual(res_schema.status_code, 403)

    def test_admin_access_to_docs_allowed(self):
        self.client.force_authenticate(user=self.admin)

        res_schema = self.client.get("/api/schema/")
        self.assertEqual(res_schema.status_code, 200)

        res_swagger = self.client.get("/api/docs/")
        self.assertEqual(res_swagger.status_code, 200)

        res_redoc = self.client.get("/api/docs/redoc/")
        self.assertEqual(res_redoc.status_code, 200)

