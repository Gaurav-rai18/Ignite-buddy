"""
Tests for the schedules app (Master Timetable / weekly grid).

Covers the normalized Schedule + TimetableSlot models, the change-detection
helper, the Excel-free grid persistence path, the schedule CRUD APIs, exam /
seating lookups, permission enforcement and validation failures.
"""
import datetime

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from server.apps.accounts.models import User, Cohort, Batch, SubBatch, Stream, Lab, Subject
from server.apps.schedules.models import Schedule, TimetableSlot
from server.apps.schedules.views import _find_changed_sub_batches
from server.apps.notifications.models import Notification


def auth_client(user):
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


class ScheduleModelTests(TestCase):
    def setUp(self):
        self.cohort = Cohort.objects.create(code="B50", name="Ignite 50")
        self.batch = Batch.objects.create(cohort=self.cohort, name="A")
        self.sub_batch = SubBatch.objects.create(batch=self.batch, name="A1")
        self.lab = Lab.objects.create(name="Lab 1")  # code auto-generated
        self.stream = Stream.objects.create(code="AI", name="AI Engineering")

    def test_lab_code_auto_generated(self):
        self.assertEqual(self.lab.code, "LAB-1")

    def test_schedule_str_and_target_cohort(self):
        s = Schedule.objects.create(cohort=self.cohort, title="Week 1")
        self.assertIn("Week 1", str(s))
        self.assertEqual(s.target_cohort, self.cohort)

    def test_grid_data_groups_slots_by_sub_batch_and_stream(self):
        s = Schedule.objects.create(cohort=self.cohort, title="Week 1")
        TimetableSlot.objects.create(
            schedule=s, sub_batch=self.sub_batch, day_of_week=0,
            start_time=datetime.time(9, 0), end_time=datetime.time(10, 30),
            title="Incubator", lab=self.lab, is_assessment=False,
        )
        TimetableSlot.objects.create(
            schedule=s, stream=self.stream, day_of_week=1,
            start_time=datetime.time(14, 30), end_time=datetime.time(17, 30),
            title="Stream: AI", lab=self.lab, is_assessment=True,
        )

        grid = s.grid_data
        self.assertEqual(grid["cohort"], "B50")
        self.assertIn("A1", grid["sub_batches"])
        self.assertEqual(len(grid["sub_batches"]["A1"]["mon"]), 1)
        self.assertEqual(grid["sub_batches"]["A1"]["mon"][0]["location"], "Lab 1")
        self.assertIn("AI Engineering", grid["streams"])
        self.assertEqual(len(grid["test_slots"]), 1)

    def test_timetable_slot_str_and_day_display(self):
        s = Schedule.objects.create(cohort=self.cohort, title="Week 1")
        slot = TimetableSlot.objects.create(
            schedule=s, sub_batch=self.sub_batch, day_of_week=2,
            start_time=datetime.time(9, 0), end_time=datetime.time(10, 0),
            title="BizSkill", lab=self.lab,
        )
        self.assertEqual(slot.get_day_of_week_display(), "Wednesday")
        self.assertIn("BizSkill", str(slot))
        self.assertIn("Lab 1", str(slot))


class FindChangedSubBatchesTests(TestCase):
    def test_empty_new_grid_returns_empty(self):
        self.assertEqual(_find_changed_sub_batches(None, None), [])
        self.assertEqual(_find_changed_sub_batches({}, {}), [])

    def test_no_old_grid_returns_all(self):
        new = {"sub_batches": {"A1": {"mon": []}, "A2": {"mon": []}}}
        self.assertEqual(sorted(_find_changed_sub_batches(None, new)), ["A1", "A2"])

    def test_new_sub_batch_detected(self):
        old = {"sub_batches": {"A1": {"mon": []}}}
        new = {"sub_batches": {"A1": {"mon": []}, "A2": {"mon": []}}}
        self.assertEqual(_find_changed_sub_batches(old, new), ["A2"])

    def test_title_change_detected(self):
        old = {"sub_batches": {"A1": {"mon": [{"title": "Old", "location": "L", "is_test": False, "start": "09:00", "end": "10:00"}]}}}
        new = {"sub_batches": {"A1": {"mon": [{"title": "New", "location": "L", "is_test": False, "start": "09:00", "end": "10:00"}]}}}
        self.assertEqual(_find_changed_sub_batches(old, new), ["A1"])

    def test_unchanged_grid_returns_empty(self):
        grid = {"sub_batches": {"A1": {"mon": [{"title": "T", "location": "L", "is_test": False, "start": "09:00", "end": "10:00"}]}}}
        self.assertEqual(_find_changed_sub_batches(grid, grid), [])

    def test_slot_count_change_detected(self):
        old = {"sub_batches": {"A1": {"mon": [{"title": "T", "location": "L", "is_test": False, "start": "09:00", "end": "10:00"}]}}}
        new = {"sub_batches": {"A1": {"mon": []}}}
        self.assertEqual(_find_changed_sub_batches(old, new), ["A1"])


class ScheduleApiTests(TestCase):
    def setUp(self):
        self.cohort = Cohort.objects.create(code="B50", name="Ignite 50")
        self.batch = Batch.objects.create(cohort=self.cohort, name="A")
        self.sub_batch = SubBatch.objects.create(batch=self.batch, name="A1")
        self.lab = Lab.objects.create(name="Lab 1")
        self.subject = Subject.objects.create(code="INC", name="Incubator")

        self.admin = User.objects.create_user(
            username="Sched Admin", email="admin.sched@tcs.com", password="Pass@1234",
            role="ADMIN", is_staff=True,
        )
        self.trainee = User.objects.create_user(
            username="Sched Trainee", email="t.sched@tcs.com", password="Pass@1234",
            role="TRAINEE", sub_batch=self.sub_batch,
        )
        self.client = auth_client(self.admin)

    def _grid_payload(self, title="Week 1"):
        return {
            "title": title,
            "cohort": self.cohort.id,
            "effective_from": "2026-01-05",
            "effective_until": "2026-01-10",
            "grid_data": {
                "sub_batches": {
                    "A1": {
                        "mon": [
                            {"title": "Incubator", "start": "09:00", "end": "10:30",
                             "location": "Lab 1", "is_test": False},
                            {"title": "IO Exit Assessment", "start": "11:00", "end": "12:00",
                             "location": "Lab 1"},
                        ]
                    }
                }
            },
        }

    def test_list_requires_staff(self):
        res = auth_client(self.trainee).get("/api/schedules/")
        self.assertEqual(res.status_code, 403)

    def test_list_requires_authentication(self):
        res = APIClient().get("/api/schedules/")
        self.assertEqual(res.status_code, 401)

    def test_create_schedule_persists_slots_and_notification(self):
        res = self.client.post("/api/schedules/", self._grid_payload(), format="json")
        self.assertEqual(res.status_code, 201)
        schedule_id = res.data["data"]["id"]
        self.assertEqual(Schedule.objects.count(), 1)

        slots = TimetableSlot.objects.filter(schedule_id=schedule_id)
        self.assertEqual(slots.count(), 2)
        titles = set(slots.values_list("title", flat=True))
        self.assertIn("Incubator", titles)

        # Assessment slot auto-flagged from title keyword "exit"
        exit_slot = slots.get(title="IO Exit Assessment")
        self.assertTrue(exit_slot.is_assessment)

        # Timetable broadcast notification created
        self.assertTrue(Notification.objects.filter(category="TIMETABLE").exists())

    def test_new_active_schedule_deactivates_previous(self):
        first = self.client.post("/api/schedules/", self._grid_payload("Week 1"), format="json")
        self.assertEqual(first.status_code, 201)
        second = self.client.post("/api/schedules/", self._grid_payload("Week 2"), format="json")
        self.assertEqual(second.status_code, 201)

        active = Schedule.objects.filter(cohort=self.cohort, is_active=True)
        self.assertEqual(active.count(), 1)
        self.assertEqual(active.first().title, "Week 2")
        self.assertEqual(Schedule.objects.get(title="Week 1").status, "ARCHIVED")

    def test_list_filters_by_cohort_code(self):
        self.client.post("/api/schedules/", self._grid_payload(), format="json")
        res = self.client.get("/api/schedules/?cohort=B50")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)

    def test_detail_get_update_delete(self):
        created = self.client.post("/api/schedules/", self._grid_payload(), format="json")
        sid = created.data["data"]["id"]

        res = self.client.get(f"/api/schedules/{sid}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["title"], "Week 1")

        res = self.client.put(f"/api/schedules/{sid}/", {"title": "Week 1 Revised"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Schedule.objects.get(id=sid).title, "Week 1 Revised")

        res = self.client.delete(f"/api/schedules/{sid}/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Schedule.objects.filter(id=sid).exists())

    def test_detail_missing_returns_404(self):
        self.assertEqual(self.client.get("/api/schedules/999999/").status_code, 404)
        self.assertEqual(self.client.put("/api/schedules/999999/", {"title": "x"}, format="json").status_code, 404)
        self.assertEqual(self.client.delete("/api/schedules/999999/").status_code, 404)

    def test_activate_schedule(self):
        created = self.client.post("/api/schedules/", self._grid_payload(), format="json")
        sid = created.data["data"]["id"]
        # A second active schedule supersedes the first
        other = self.client.post("/api/schedules/", self._grid_payload("Week 2"), format="json")
        self.assertTrue(other.status_code, 201)

        res = self.client.post(f"/api/schedules/{sid}/activate/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(Schedule.objects.get(id=sid).is_active)

    def test_activate_missing_returns_404(self):
        self.assertEqual(self.client.post("/api/schedules/999999/activate/").status_code, 404)

    def test_parse_excel_requires_file(self):
        res = self.client.post("/api/schedules/parse-excel/", {}, format="multipart")
        self.assertEqual(res.status_code, 400)

    def test_live_timetable_returns_slots(self):
        self.client.post("/api/schedules/", self._grid_payload(), format="json")
        res = self.client.get("/api/schedules/live-timetable/?batch=A1")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["batch"], "A1")

    def test_current_seating_requires_sub_batch(self):
        # A user without sub_batch and no query param -> 400
        staff = User.objects.create_user(
            username="Seat Staff", email="seat@tcs.com", password="Pass@1234",
            role="ADMIN", is_staff=True,
        )
        res = auth_client(staff).get("/api/schedules/current-seating/")
        self.assertEqual(res.status_code, 400)

    def test_current_seating_in_session_and_off_hours(self):
        now = timezone.localtime()
        schedule = Schedule.objects.create(cohort=self.cohort, title="Live", is_active=True)
        TimetableSlot.objects.create(
            schedule=schedule, sub_batch=self.sub_batch, day_of_week=now.weekday(),
            start_time=datetime.time(0, 0), end_time=datetime.time(23, 59, 59),
            title="Incubator", lab=self.lab,
        )
        res = auth_client(self.trainee).get("/api/schedules/current-seating/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "in_session")
        self.assertEqual(res.data["location"], "Lab 1")

        res = auth_client(self.trainee).get("/api/schedules/current-seating/?sub_batch=ZZ9")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "off_hours")
