"""
Tests for the telemetry app models.

Telemetry stores trainee conversation logs, application activity events and
aggregated summaries used for admin auditing and attendance/usage reporting.
"""
import datetime

from django.db import IntegrityError
from django.test import TestCase

from server.apps.accounts.models import User
from server.apps.telemetry.models import ChatLog, ActivityEvent, ActivitySummary


class TelemetryModelTests(TestCase):
    def setUp(self):
        self.trainee = User.objects.create_user(
            username="Tele Trainee", email="tele@tcs.com", password="Pass@1234", role="TRAINEE",
        )

    def test_chat_log_creation_and_str(self):
        log = ChatLog.objects.create(user=self.trainee, role="user", content="How do I debug this?")
        self.assertEqual(log.role, "user")
        self.assertIn("Tele Trainee", str(log))
        self.assertIn("How do I debug", str(log))

    def test_chat_logs_ordered_newest_first(self):
        first = ChatLog.objects.create(user=self.trainee, role="user", content="first")
        second = ChatLog.objects.create(user=self.trainee, role="assistant", content="second")
        self.assertEqual(list(ChatLog.objects.all()), [second, first])

    def test_activity_event_creation_and_str(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        ev = ActivityEvent.objects.create(
            user=self.trainee, app="Code.exe", title="main.py",
            start_ts=now, end_ts=now + datetime.timedelta(minutes=5),
        )
        self.assertFalse(ev.idle)
        self.assertIn("Code.exe", str(ev))

    def test_activity_event_idle_flag_defaults_false(self):
        ev = ActivityEvent.objects.create(
            user=self.trainee, app="Chrome",
            start_ts=datetime.datetime.now(datetime.timezone.utc),
        )
        self.assertFalse(ev.idle)
        self.assertIsNone(ev.end_ts)

    def test_activity_summary_unique_per_user_day_kind(self):
        day = datetime.date(2026, 1, 1)
        ActivitySummary.objects.create(user=self.trainee, day=day, kind="daily", summary_text="ok")
        with self.assertRaises(IntegrityError):
            ActivitySummary.objects.create(user=self.trainee, day=day, kind="daily", summary_text="dup")

    def test_activity_summary_allows_different_kind(self):
        day = datetime.date(2026, 1, 1)
        ActivitySummary.objects.create(user=self.trainee, day=day, kind="daily", summary_text="daily")
        ActivitySummary.objects.create(user=self.trainee, day=day, kind="weekly", summary_text="weekly")
        self.assertEqual(ActivitySummary.objects.filter(user=self.trainee).count(), 2)

    def test_activity_summary_default_kind_and_str(self):
        s = ActivitySummary.objects.create(
            user=self.trainee, day=datetime.date(2026, 2, 2), summary_text="text",
        )
        self.assertEqual(s.kind, "daily")
        self.assertIn("Tele Trainee", str(s))
