"""
Tests for the dashboard summary API (/api/dashboard/).

The endpoint aggregates counts across notifications, schedules, the user
hierarchy and buddy availability. It is intentionally public (no permission
classes) so the admin console can render before auth is fully resolved.
"""
from django.test import TestCase
from rest_framework.test import APIClient

from server.apps.accounts.models import User, Cohort, Batch, SubBatch
from server.apps.notifications.models import Notification
from server.apps.schedules.models import Schedule
from server.apps.buddy_controller.models import SystemSetting


class DashboardSummaryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cohort = Cohort.objects.create(code="B50", name="Ignite 50")
        self.batch = Batch.objects.create(cohort=self.cohort, name="A")
        self.sub_batch = SubBatch.objects.create(batch=self.batch, name="A1")

        self.admin = User.objects.create_user(
            username="Dash Admin", email="admin.dash@tcs.com", password="Pass@1234",
            role="ADMIN", is_staff=True,
        )
        self.trainee1 = User.objects.create_user(
            username="Dash T1", email="t1.dash@tcs.com", password="Pass@1234",
            role="TRAINEE", sub_batch=self.sub_batch,
        )
        self.trainee2 = User.objects.create_user(
            username="Dash T2", email="t2.dash@tcs.com", password="Pass@1234",
            role="TRAINEE",
        )

    def test_endpoint_is_public(self):
        res = self.client.get("/api/dashboard/")
        self.assertEqual(res.status_code, 200)

    def test_hierarchy_counts(self):
        res = self.client.get("/api/dashboard/")
        self.assertEqual(res.data["total_users"], 3)
        self.assertEqual(res.data["total_trainees"], 2)
        self.assertEqual(res.data["total_cohorts"], 1)
        self.assertEqual(res.data["total_batches"], 1)
        self.assertEqual(res.data["total_sub_batches"], 1)

    def test_broadcast_count_only_counts_broadcasts(self):
        Notification.objects.create(title="B1", message="M", is_broadcast=True)
        Notification.objects.create(title="B2", message="M", is_broadcast=True)
        Notification.objects.create(title="Direct", message="M", is_broadcast=False)

        res = self.client.get("/api/dashboard/")
        self.assertEqual(res.data["broadcast_count"], 2)

    def test_scheduled_count_reflects_schedules(self):
        Schedule.objects.create(cohort=self.cohort, title="Week 1")
        Schedule.objects.create(cohort=self.cohort, title="Week 2")

        res = self.client.get("/api/dashboard/")
        self.assertEqual(res.data["scheduled_count"], 2)
        # `upcoming_count` queries a non-existent `publish_at` field; the view
        # swallows the resulting FieldError and therefore always reports 0.
        self.assertEqual(res.data["upcoming_count"], 0)

    def test_buddy_enabled_flag_follows_system_setting(self):
        SystemSetting.set_bool("buddy_enabled", True)
        res = self.client.get("/api/dashboard/")
        self.assertTrue(res.data["buddy_enabled"])

        SystemSetting.set_bool("buddy_enabled", False)
        res = self.client.get("/api/dashboard/")
        self.assertFalse(res.data["buddy_enabled"])

    def test_response_shape(self):
        res = self.client.get("/api/dashboard/")
        expected_keys = {
            "broadcast_count", "scheduled_count", "upcoming_count", "buddy_enabled",
            "total_users", "total_trainees", "total_cohorts", "total_batches",
            "total_sub_batches",
        }
        self.assertEqual(set(res.data.keys()), expected_keys)
