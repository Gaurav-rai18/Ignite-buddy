"""Tests for the legacy Admin API (``server.api``).

Covers the unauthenticated liveness probe, the desktop-app trainee login
(including the forced password-change flow) and the three token-protected
ViewSets that publish assignments / timetable slots and manage trainees.

These endpoints are *not* part of a Django app (``server.api`` is a plain
module), so they are discovered when the whole ``server`` package is tested
(``manage.py test server``).
"""
from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from server.storage.central import get_central
from server.apps.accounts.models import User


def _central():
    return get_central()


def _reset_central():
    """Clear the shared central.db tables so tests are deterministic."""
    with _central().conn() as c:
        c.execute("DELETE FROM assignments")
        c.execute("DELETE FROM timetable_slots")
        c.execute("DELETE FROM trainees")


class HealthViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_probe_is_public(self):
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data, {"ok": True})

    def test_health_rejects_non_get(self):
        res = self.client.post("/health", {}, format="json")
        self.assertEqual(res.status_code, 405)


@mock.patch("server.config.JWT_SECRET", "unit-test-jwt-secret")
class TraineeLoginTests(TestCase):
    """POST /auth/login — Django-account login + legacy central.db fallback."""

    def setUp(self):
        self.client = APIClient()
        _reset_central()

    def _login(self, payload):
        return self.client.post("/auth/login", payload, format="json")

    # ---- validation -------------------------------------------------------
    def test_missing_fields_returns_400(self):
        res = self._login({"user_id": "someone@tcs.com"})
        self.assertEqual(res.status_code, 400)

    def test_unknown_user_returns_401(self):
        res = self._login({"user_id": "nobody@tcs.com", "password": "whatever"})
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.data["error"], "invalid credentials")

    def test_wrong_password_returns_401(self):
        User.objects.create_user(
            username="Trainee One", email="t1@tcs.com", password="Correct@123", role="TRAINEE"
        )
        res = self._login({"user_id": "t1@tcs.com", "password": "Wrong@123"})
        self.assertEqual(res.status_code, 401)

    # ---- happy path -------------------------------------------------------
    def test_login_by_email_success(self):
        User.objects.create_user(
            username="Trainee One",
            email="t1@tcs.com",
            password="Correct@123",
            first_name="Trainee",
            last_name="One",
            role="TRAINEE",
            must_change_password=False,
        )
        res = self._login({"user_id": "t1@tcs.com", "password": "Correct@123"})
        self.assertEqual(res.status_code, 200)
        self.assertIn("token", res.data)
        self.assertEqual(res.data["user_id"], "Trainee One")
        self.assertEqual(res.data["name"], "Trainee One")
        self.assertFalse(res.data["must_change_password"])
        self.assertIn("expires_in_hours", res.data)

    def test_login_by_employee_id_success(self):
        User.objects.create_user(
            username="Emp User",
            email="emp@tcs.com",
            password="Correct@123",
            role="TRAINEE",
            employee_id="3273115",
            must_change_password=False,
        )
        res = self._login({"user_id": "3273115", "password": "Correct@123"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["user_id"], "Emp User")

    def test_login_by_email_is_case_insensitive(self):
        User.objects.create_user(
            username="Case User",
            email="case@tcs.com",
            password="Correct@123",
            role="TRAINEE",
            must_change_password=False,
        )
        res = self._login({"user_id": "CASE@tcs.com", "password": "Correct@123"})
        self.assertEqual(res.status_code, 200)

    # ---- forced password change ------------------------------------------
    def test_must_change_password_prompts_when_no_new_password(self):
        User.objects.create_user(
            username="Fresh User", email="fresh@tcs.com", password="Temp@1234", role="TRAINEE"
        )  # must_change_password defaults to True
        res = self._login({"user_id": "fresh@tcs.com", "password": "Temp@1234"})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["must_change_password"])
        # The echoed identifier must be the login identifier (bug regression guard).
        self.assertEqual(res.data["user_id"], "fresh@tcs.com")
        self.assertEqual(res.data["name"], "Fresh User")

    def test_new_password_too_short_rejected(self):
        User.objects.create_user(
            username="Fresh User", email="fresh@tcs.com", password="Temp@1234", role="TRAINEE"
        )
        res = self._login({"user_id": "fresh@tcs.com", "password": "Temp@1234", "new_password": "short"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("8 characters", res.data["error"])

    def test_new_password_same_as_old_rejected(self):
        User.objects.create_user(
            username="Fresh User", email="fresh@tcs.com", password="Temp@1234", role="TRAINEE"
        )
        res = self._login({"user_id": "fresh@tcs.com", "password": "Temp@1234", "new_password": "Temp@1234"})
        self.assertEqual(res.status_code, 400)

    def test_valid_new_password_updates_account(self):
        user = User.objects.create_user(
            username="Fresh User", email="fresh@tcs.com", password="Temp@1234", role="TRAINEE"
        )
        res = self._login(
            {"user_id": "fresh@tcs.com", "password": "Temp@1234", "new_password": "BrandNew@999"}
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["must_change_password"])
        user.refresh_from_db()
        self.assertTrue(user.check_password("BrandNew@999"))
        self.assertFalse(user.must_change_password)

    # ---- legacy central.db fallback --------------------------------------
    def test_central_db_fallback_login(self):
        _central().create_trainee("legacy-user", "Legacy User", "B50-A1", "Legacy@123")
        res = self._login({"user_id": "legacy-user", "password": "Legacy@123"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["user_id"], "legacy-user")
        self.assertIn("token", res.data)

    def test_central_db_fallback_wrong_password_401(self):
        _central().create_trainee("legacy-user", "Legacy User", "B50-A1", "Legacy@123")
        res = self._login({"user_id": "legacy-user", "password": "nope"})
        self.assertEqual(res.status_code, 401)

    def test_central_db_fallback_503_without_jwt_secret(self):
        _central().create_trainee("legacy-user", "Legacy User", "B50-A1", "Legacy@123")
        with mock.patch("server.config.JWT_SECRET", ""):
            res = self._login({"user_id": "legacy-user", "password": "Legacy@123"})
        self.assertEqual(res.status_code, 503)


@mock.patch("server.config.ADMIN_TOKEN", "unit-admin-secret")
class AdminTokenProtectedViewSetTests(TestCase):
    """The admin-api ViewSets require a valid X-Admin-Token header."""

    def setUp(self):
        self.client = APIClient()
        _reset_central()

    def _auth(self):
        self.client.credentials(HTTP_X_ADMIN_TOKEN="unit-admin-secret")

    # ---- authentication enforcement --------------------------------------
    def test_wrong_token_rejected(self):
        self.client.credentials(HTTP_X_ADMIN_TOKEN="nope")
        res = self.client.get("/admin-api/assignments")
        self.assertEqual(res.status_code, 403)

    def test_missing_token_rejected(self):
        res = self.client.get("/admin-api/assignments")
        self.assertEqual(res.status_code, 403)

    # ---- assignments ------------------------------------------------------
    def test_assignment_crud_lifecycle(self):
        self._auth()
        create = self.client.post(
            "/admin-api/assignments",
            {"batch": "B50-A1", "title": "Intro Lab", "description": "Do it", "due_ts": 1900000000.0},
            format="json",
        )
        self.assertEqual(create.status_code, 201)
        aid = create.data["id"]

        listing = self.client.get("/admin-api/assignments?batch=B50-A1")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data["assignments"]), 1)
        self.assertEqual(listing.data["assignments"][0]["title"], "Intro Lab")

        upd = self.client.put(
            f"/admin-api/assignments/{aid}",
            {"batch": "B50-A1", "title": "Intro Lab v2", "due": None},
            format="json",
        )
        self.assertEqual(upd.status_code, 200)
        self.assertEqual(upd.data["id"], aid)

        delete = self.client.delete(f"/admin-api/assignments/{aid}")
        self.assertEqual(delete.status_code, 200)
        self.assertTrue(delete.data["deleted"])
        self.assertEqual(self.client.get("/admin-api/assignments?batch=B50-A1").data["assignments"], [])

    def test_assignment_requires_title(self):
        self._auth()
        res = self.client.post("/admin-api/assignments", {"batch": "A1"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_assignment_due_string_is_parsed(self):
        self._auth()
        res = self.client.post(
            "/admin-api/assignments",
            {"batch": "A1", "title": "Dated", "due": "2030-01-01T09:00:00"},
            format="json",
        )
        self.assertEqual(res.status_code, 201)

    def test_delete_unknown_assignment_returns_false(self):
        self._auth()
        res = self.client.delete("/admin-api/assignments/does-not-exist")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["deleted"])

    # ---- timetable --------------------------------------------------------
    def test_timetable_crud_and_validation(self):
        self._auth()
        create = self.client.post(
            "/admin-api/timetable",
            {"batch": "A1", "weekday": 2, "start": "09:00", "end": "10:00", "title": "Java", "location": "Lab 1"},
            format="json",
        )
        self.assertEqual(create.status_code, 201)
        sid = create.data["id"]

        listing = self.client.get("/admin-api/timetable?batch=A1")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.data["timetable"][0]["title"], "Java")

        upd = self.client.put(
            f"/admin-api/timetable/{sid}",
            {"batch": "A1", "weekday": 3, "start": "11:00", "end": "12:00", "title": "Java II"},
            format="json",
        )
        self.assertEqual(upd.status_code, 200)

        delete = self.client.delete(f"/admin-api/timetable/{sid}")
        self.assertTrue(delete.data["deleted"])

    def test_timetable_weekday_out_of_range(self):
        self._auth()
        res = self.client.post(
            "/admin-api/timetable",
            {"batch": "A1", "weekday": 9, "start": "09:00", "end": "10:00", "title": "X"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_timetable_invalid_time_format(self):
        self._auth()
        res = self.client.post(
            "/admin-api/timetable",
            {"batch": "A1", "weekday": 1, "start": "9am", "end": "10:00", "title": "X"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    # ---- trainees ---------------------------------------------------------
    def test_trainee_create_list_and_update(self):
        self._auth()
        create = self.client.post(
            "/admin-api/trainees",
            {"user_id": "trainee-1", "name": "Trainee One", "batch": "A1", "password": "Pass@1234"},
            format="json",
        )
        self.assertEqual(create.status_code, 201)
        self.assertTrue(create.data["has_password"])

        listing = self.client.get("/admin-api/trainees")
        self.assertEqual(listing.status_code, 200)
        self.assertIn("trainee-1", [t["user_id"] for t in listing.data["trainees"]])

        moved = self.client.put("/admin-api/trainees/trainee-1", {"batch": "A2"}, format="json")
        self.assertEqual(moved.status_code, 200)

        reset = self.client.put("/admin-api/trainees/trainee-1", {"password": "NewPass@4321"}, format="json")
        self.assertEqual(reset.status_code, 200)

    def test_trainee_password_reset_unknown_returns_404(self):
        self._auth()
        res = self.client.put("/admin-api/trainees/ghost", {"password": "NewPass@4321"}, format="json")
        self.assertEqual(res.status_code, 404)
