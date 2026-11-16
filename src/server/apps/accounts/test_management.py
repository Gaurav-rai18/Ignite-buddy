"""User-management, RBAC, hierarchy, preferences and data-export API tests.

These complement the authentication/profile tests in ``tests.py`` by exercising
the CRUD + permission surface of the Admin Console accounts app.
"""
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from server.apps.accounts.models import (
    User, Cohort, Batch, Lab, SubBatch, Stream, Subject,
)
from server.apps.buddy_controller.models import SystemSetting


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


class AccountsTestBase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="Admin User", email="admin.mgmt@tcs.com", password="Pass@1234",
            role="ADMIN", is_staff=True, is_superuser=True,
        )
        self.ta = User.objects.create_user(
            username="TA User", email="ta.mgmt@tcs.com", password="Pass@1234", role="TA",
        )
        self.trainee = User.objects.create_user(
            username="Trainee User", email="trainee.mgmt@tcs.com", password="Pass@1234", role="TRAINEE",
        )
        self.admin_client = auth_client(self.admin)
        self.ta_client = auth_client(self.ta)
        self.trainee_client = auth_client(self.trainee)


class UserManagementApiTests(AccountsTestBase):
    def test_list_requires_staff_role(self):
        self.assertEqual(self.admin_client.get("/api/accounts/users/").status_code, 200)
        self.assertEqual(self.ta_client.get("/api/accounts/users/").status_code, 200)
        self.assertEqual(self.trainee_client.get("/api/accounts/users/").status_code, 403)

    def test_create_user_success(self):
        res = self.admin_client.post(
            "/api/accounts/users/",
            {
                "username": "New Trainee", "email": "new.trainee@tcs.com", "password": "Pass@1234",
                "role": "TRAINEE", "employee_id": "1234567",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertTrue(User.objects.filter(email="new.trainee@tcs.com").exists())

    def test_create_trainee_requires_employee_id(self):
        res = self.admin_client.post(
            "/api/accounts/users/",
            {"username": "No Emp", "email": "no.emp@tcs.com", "password": "Pass@1234", "role": "TRAINEE"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_create_user_duplicate_email_rejected(self):
        res = self.admin_client.post(
            "/api/accounts/users/",
            {"username": "Dup", "email": "ta.mgmt@tcs.com", "password": "Pass@1234", "role": "TA"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_short_password_rejected(self):
        res = self.admin_client.post(
            "/api/accounts/users/",
            {"username": "Short", "email": "short@tcs.com", "password": "123", "role": "TA"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_trainee_cannot_create_user(self):
        res = self.trainee_client.post(
            "/api/accounts/users/",
            {"username": "X", "email": "x@tcs.com", "password": "Pass@1234", "role": "TA"},
            format="json",
        )
        self.assertEqual(res.status_code, 403)

    def test_detail_get_and_patch_permissions(self):
        url = f"/api/accounts/users/{self.trainee.id}/"
        self.assertEqual(self.ta_client.get(url).status_code, 200)
        # PATCH is ADMIN-only
        self.assertEqual(self.ta_client.patch(url, {"department": "X"}, format="json").status_code, 403)
        res = self.admin_client.patch(url, {"department": "Ignite Ops"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.trainee.refresh_from_db()
        self.assertEqual(self.trainee.department, "Ignite Ops")

    def test_detail_404(self):
        self.assertEqual(self.admin_client.get("/api/accounts/users/999999/").status_code, 404)

    def test_cannot_delete_own_account(self):
        res = self.admin_client.delete(f"/api/accounts/users/{self.admin.id}/")
        self.assertEqual(res.status_code, 400)

    def test_admin_can_delete_other_user(self):
        res = self.admin_client.delete(f"/api/accounts/users/{self.trainee.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(User.objects.filter(id=self.trainee.id).exists())

    def test_reset_password_admin_only(self):
        url = f"/api/accounts/users/{self.trainee.id}/reset-password/"
        self.assertEqual(self.ta_client.post(url, {"new_password": "Reset@1234"}, format="json").status_code, 403)
        res = self.admin_client.post(url, {"new_password": "Reset@1234"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.trainee.refresh_from_db()
        self.assertTrue(self.trainee.check_password("Reset@1234"))

    def test_reset_password_unknown_user_404(self):
        res = self.admin_client.post(
            "/api/accounts/users/999999/reset-password/", {"new_password": "Reset@1234"}, format="json"
        )
        self.assertEqual(res.status_code, 404)

    def test_logout_blacklists_refresh_token(self):
        refresh = str(RefreshToken.for_user(self.admin))
        res = self.admin_client.post("/api/accounts/logout/", {"refresh": refresh}, format="json")
        self.assertEqual(res.status_code, 200)

    def test_logout_invalid_token_400(self):
        res = self.admin_client.post("/api/accounts/logout/", {"refresh": "not-a-token"}, format="json")
        self.assertEqual(res.status_code, 400)


class HierarchyCrudApiTests(AccountsTestBase):
    def setUp(self):
        super().setUp()
        self.cohort = Cohort.objects.create(code="C1", name="Cohort One")
        self.batch = Batch.objects.create(cohort=self.cohort, name="A")
        self.sub_batch = SubBatch.objects.create(batch=self.batch, name="A1")
        self.lab = Lab.objects.create(name="Lab One")

    def test_cohort_crud(self):
        self.assertEqual(self.admin_client.get("/api/accounts/cohorts/").status_code, 200)
        create = self.admin_client.post("/api/accounts/cohorts/", {"code": "C2", "name": "Two"}, format="json")
        self.assertEqual(create.status_code, 201)
        cid = create.data["id"]
        self.assertEqual(self.admin_client.patch(f"/api/accounts/cohorts/{cid}/", {"name": "Renamed"}, format="json").status_code, 200)
        self.assertEqual(self.admin_client.delete(f"/api/accounts/cohorts/{cid}/").status_code, 204)
        self.assertEqual(self.admin_client.get(f"/api/accounts/cohorts/{cid}/").status_code, 404)

    def test_cohort_create_forbidden_for_non_admin(self):
        res = self.trainee_client.post("/api/accounts/cohorts/", {"code": "C9"}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_batch_list_and_filter(self):
        res = self.admin_client.get(f"/api/accounts/batches/?cohort={self.cohort.id}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["full_code"], "C1-A")

    def test_sub_batch_create_and_detail(self):
        res = self.admin_client.post(
            "/api/accounts/sub-batches/", {"batch": self.batch.id, "name": "A2"}, format="json"
        )
        self.assertEqual(res.status_code, 201)
        sb_id = res.data["id"]
        self.assertEqual(self.admin_client.get(f"/api/accounts/sub-batches/{sb_id}/").status_code, 200)
        self.assertEqual(
            self.admin_client.get(f"/api/accounts/sub-batches/?batch={self.batch.id}").status_code, 200
        )

    def test_lab_crud_and_code_autogen(self):
        create = self.admin_client.post("/api/accounts/labs/", {"name": "Lab Two"}, format="json")
        self.assertEqual(create.status_code, 201)
        self.assertTrue(create.data["code"])
        lab_id = create.data["id"]
        self.assertEqual(self.admin_client.patch(f"/api/accounts/labs/{lab_id}/", {"capacity": 40}, format="json").status_code, 200)
        self.assertEqual(self.admin_client.delete(f"/api/accounts/labs/{lab_id}/").status_code, 204)

    def test_stream_and_subject_crud(self):
        s = self.admin_client.post("/api/accounts/streams/", {"code": "AI", "name": "AI Engineering"}, format="json")
        self.assertEqual(s.status_code, 201)
        sid = s.data["id"]
        self.assertEqual(self.admin_client.get("/api/accounts/streams/").status_code, 200)
        self.assertEqual(self.admin_client.patch(f"/api/accounts/streams/{sid}/", {"name": "AI"}, format="json").status_code, 200)
        self.assertEqual(self.admin_client.delete(f"/api/accounts/streams/{sid}/").status_code, 204)

        sub = self.admin_client.post("/api/accounts/subjects/", {"code": "CJ", "name": "Core Java"}, format="json")
        self.assertEqual(sub.status_code, 201)
        self.assertEqual(self.admin_client.get("/api/accounts/subjects/").status_code, 200)
        self.assertEqual(self.admin_client.delete(f"/api/accounts/subjects/{sub.data['id']}/").status_code, 204)

    def test_bulk_import_hierarchy_csv(self):
        csv_text = "cohort_code,cohort_name,batch_name,sub_batch_name,lab_name\nB99,Cohort 99,B,B7,Lab X"
        res = self.admin_client.post(
            "/api/accounts/bulk-import/", {"type": "hierarchy", "csv_text": csv_text}, format="json"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["created_count"], 1)
        self.assertTrue(SubBatch.objects.filter(name="B7", batch__cohort__code="B99").exists())

    def test_bulk_import_users_csv_default_password(self):
        csv_text = "username,email,role,employee_id\nFresh Guy,fresh.guy@tcs.com,TRAINEE,7654321"
        res = self.admin_client.post(
            "/api/accounts/bulk-import/", {"type": "users", "csv_text": csv_text}, format="json"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["created_count"], 1)
        user = User.objects.get(email="fresh.guy@tcs.com")
        self.assertTrue(user.check_password("Tcs#1234"))
        self.assertTrue(user.must_change_password)

    def test_bulk_import_invalid_type(self):
        res = self.admin_client.post(
            "/api/accounts/bulk-import/", {"type": "nonsense", "csv_text": "a,b\n1,2"}, format="json"
        )
        self.assertEqual(res.status_code, 400)

    def test_bulk_import_missing_data(self):
        res = self.admin_client.post("/api/accounts/bulk-import/", {"type": "users"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_bulk_import_forbidden_for_non_admin(self):
        res = self.ta_client.post(
            "/api/accounts/bulk-import/", {"type": "hierarchy", "csv_text": "cohort_code\nB1"}, format="json"
        )
        self.assertEqual(res.status_code, 403)


class PreferencesExportRbacTests(AccountsTestBase):
    def tearDown(self):
        SystemSetting.objects.all().delete()

    def test_preferences_whitelist_and_persistence(self):
        res = self.admin_client.post(
            "/api/settings/preferences/",
            {"workspace_name": "My Workspace", "theme": "dark", "not_a_real_key": "x"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["preferences"]["workspace_name"], "My Workspace")
        self.assertNotIn("not_a_real_key", res.data["preferences"])

        again = self.admin_client.get("/api/settings/preferences/")
        self.assertEqual(again.data["workspace_name"], "My Workspace")

    def test_preferences_require_authentication(self):
        self.assertEqual(APIClient().get("/api/settings/preferences/").status_code, 401)

    def test_export_requires_admin(self):
        self.assertEqual(self.trainee_client.get("/api/settings/export/?type=users").status_code, 403)
        self.assertEqual(self.admin_client.get("/api/settings/export/?type=users").status_code, 200)

    def test_export_users_csv_headers(self):
        res = self.admin_client.get("/api/settings/export/?type=users")
        self.assertEqual(res["Content-Type"], "text/csv")
        body = res.content.decode()
        self.assertIn("Employee ID", body)
        self.assertIn("admin.mgmt@tcs.com", body)

    def test_export_audit_summary(self):
        res = self.admin_client.get("/api/settings/export/?type=audit")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["total_users"], 3)

    def test_roles_matrix_get_for_trainee_is_read_only(self):
        res = self.trainee_client.get("/api/accounts/roles-permissions/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["can_manage"])
        self.assertIn("ADMIN", res.data["roles"])

    def test_roles_matrix_post_admin_only(self):
        payload = {"roles": {"TA": {"permissions": {"buddy": True}}}}
        self.assertEqual(self.trainee_client.post("/api/accounts/roles-permissions/", payload, format="json").status_code, 403)
        ok = self.admin_client.post("/api/accounts/roles-permissions/", payload, format="json")
        self.assertEqual(ok.status_code, 200)
        self.assertTrue(ok.data["success"])

    def test_admin_role_cannot_be_downgraded(self):
        res = self.admin_client.post(
            "/api/accounts/roles-permissions/",
            {"roles": {"ADMIN": {"permissions": {"users": False}}}},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["roles"]["ADMIN"]["permissions"]["users"])
