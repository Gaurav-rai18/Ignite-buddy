"""
Extended API tests for the notifications app (views.py).

These complement the tests in ``tests.py`` by exercising the branches that were
previously untested:

* legacy single-id targeting aliases (``batch_id`` / ``target_batch`` /
  ``sub_batch_id`` / ``stream_id`` / ``target_cohort`` ...)
* multi-select targeting (several batches / sub-batches / streams)
* category + recipient_type normalisation (``.upper()``) and title/message strip
* exhaustive validation failures (empty selections, blank role, whitespace ...)
* persistence of the master Notification row and the recipient rows
* inactive-user handling for every targeting mode
* the full CanManageBroadcasts role matrix (broadcast + history)
* history serialisation extras (target codes, "System / Admin", ordering)
* trainee inbox shape / ordering / mark-as-read idempotency
* the real-time channel dispatch branches (via a mocked ``send_channel_message``)
"""
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from server.apps.accounts.models import User, Cohort, Batch, SubBatch, Stream
from server.apps.notifications.models import Notification, NotificationRecipient
from server.realtime import notifier


BROADCAST_URL = "/api/notifications/broadcast/"
HISTORY_URL = "/api/notifications/broadcast/history/"
INBOX_URL = "/api/notifications/user-notifications/"


def read_url(recipient_id):
    return f"/api/notifications/read/{recipient_id}/"


def auth_client(user):
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


class BroadcastFixture(TestCase):
    """Shared hierarchy + admin client used by the broadcast-focused test cases."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="Fixture Admin", email="fixture.admin@tcs.com",
            password="Pass@1234", role="ADMIN", is_staff=True,
        )
        self.cohort = Cohort.objects.create(code="B77", name="Ignite 77")
        self.batch_a = Batch.objects.create(cohort=self.cohort, name="A")
        self.batch_b = Batch.objects.create(cohort=self.cohort, name="B")
        self.sb_a1 = SubBatch.objects.create(batch=self.batch_a, name="A1")
        self.sb_a2 = SubBatch.objects.create(batch=self.batch_a, name="A2")
        self.sb_b1 = SubBatch.objects.create(batch=self.batch_b, name="B1")
        self.stream_x = Stream.objects.create(code="AI_X", name="AI X")
        self.stream_y = Stream.objects.create(code="SPR_Y", name="Spring Y")

        self.t_a1 = User.objects.create_user(
            username="Trainee A1", email="t.a1.fx@tcs.com", password="Pass@1234",
            role="TRAINEE", sub_batch=self.sb_a1, stream=self.stream_x,
        )
        self.t_a2 = User.objects.create_user(
            username="Trainee A2", email="t.a2.fx@tcs.com", password="Pass@1234",
            role="TRAINEE", sub_batch=self.sb_a2, stream=self.stream_y,
        )
        self.t_b1 = User.objects.create_user(
            username="Trainee B1", email="t.b1.fx@tcs.com", password="Pass@1234",
            role="TRAINEE", sub_batch=self.sb_b1, stream=self.stream_y,
        )
        self.client = auth_client(self.admin)

    def post_broadcast(self, payload, client=None):
        return (client or self.client).post(BROADCAST_URL, payload, format="json")

    def recipient_ids(self, notification_id):
        return set(
            NotificationRecipient.objects
            .filter(notification_id=notification_id)
            .values_list("user_id", flat=True)
        )


class AliasTargetingTests(BroadcastFixture):
    """Legacy single-id aliases resolved in BroadcastCreateView.post()."""

    def test_batch_single_id_alias_persists_single_batch(self):
        res = self.post_broadcast(
            {"title": "B", "message": "M", "recipient_type": "BATCH", "batch_id": self.batch_a.id}
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.recipient_ids(res.data["notification_id"]), {self.t_a1.id, self.t_a2.id})
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertEqual(notif.target_batch_id, self.batch_a.id)

    def test_target_batch_alias_name(self):
        res = self.post_broadcast(
            {"title": "B", "message": "M", "recipient_type": "BATCH", "target_batch": self.batch_b.id}
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.recipient_ids(res.data["notification_id"]), {self.t_b1.id})

    def test_sub_batch_single_id_alias(self):
        res = self.post_broadcast(
            {"title": "S", "message": "M", "recipient_type": "SUB_BATCH", "sub_batch_id": self.sb_a1.id}
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.recipient_ids(res.data["notification_id"]), {self.t_a1.id})
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertEqual(notif.target_sub_batch_id, self.sb_a1.id)

    def test_target_sub_batch_alias_name(self):
        res = self.post_broadcast(
            {"title": "S", "message": "M", "recipient_type": "SUB_BATCH", "target_sub_batch": self.sb_b1.id}
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.recipient_ids(res.data["notification_id"]), {self.t_b1.id})

    def test_stream_single_id_alias(self):
        res = self.post_broadcast(
            {"title": "St", "message": "M", "recipient_type": "STREAM", "stream_id": self.stream_x.id}
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.recipient_ids(res.data["notification_id"]), {self.t_a1.id})
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertEqual(notif.target_stream_id, self.stream_x.id)

    def test_target_stream_alias_name(self):
        res = self.post_broadcast(
            {"title": "St", "message": "M", "recipient_type": "STREAM", "target_stream": self.stream_y.id}
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.recipient_ids(res.data["notification_id"]), {self.t_a2.id, self.t_b1.id})

    def test_cohort_target_alias_name(self):
        res = self.post_broadcast(
            {"title": "C", "message": "M", "recipient_type": "COHORT", "target_cohort": self.cohort.id}
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(
            self.recipient_ids(res.data["notification_id"]),
            {self.t_a1.id, self.t_a2.id, self.t_b1.id},
        )
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertEqual(notif.target_cohort_id, self.cohort.id)


class MultiSelectTargetingTests(BroadcastFixture):
    """Multi-select hero filters (batch_ids / sub_batch_ids / stream_ids)."""

    def test_multiple_batches_reach_all_members(self):
        res = self.post_broadcast(
            {
                "title": "MB", "message": "M", "recipient_type": "BATCH",
                "batch_ids": [self.batch_a.id, self.batch_b.id],
            }
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(
            self.recipient_ids(res.data["notification_id"]),
            {self.t_a1.id, self.t_a2.id, self.t_b1.id},
        )
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertIsNone(notif.target_batch_id)

    def test_multiple_sub_batches(self):
        res = self.post_broadcast(
            {
                "title": "MS", "message": "M", "recipient_type": "SUB_BATCH",
                "sub_batch_ids": [self.sb_a1.id, self.sb_a2.id],
            }
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.recipient_ids(res.data["notification_id"]), {self.t_a1.id, self.t_a2.id})
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertIsNone(notif.target_sub_batch_id)

    def test_multiple_streams(self):
        res = self.post_broadcast(
            {
                "title": "MSt", "message": "M", "recipient_type": "STREAM",
                "stream_ids": [self.stream_x.id, self.stream_y.id],
            }
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(
            self.recipient_ids(res.data["notification_id"]),
            {self.t_a1.id, self.t_a2.id, self.t_b1.id},
        )
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertIsNone(notif.target_stream_id)

    def test_mixed_valid_and_unknown_batch_ids_keeps_valid(self):
        res = self.post_broadcast(
            {
                "title": "Mix", "message": "M", "recipient_type": "BATCH",
                "batch_ids": [self.batch_a.id, 999999],
            }
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.recipient_ids(res.data["notification_id"]), {self.t_a1.id, self.t_a2.id})
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertEqual(notif.target_batch_id, self.batch_a.id)


class NormalizationTests(BroadcastFixture):
    """Category / recipient_type upper-casing and title/message stripping."""

    def test_default_category_is_general(self):
        res = self.post_broadcast(
            {"title": "D", "message": "M", "recipient_type": "USERS",
             "target_usernames": [self.t_a1.username]}
        )
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertEqual(notif.category, "GENERAL")

    def test_lowercase_category_is_upper_cased(self):
        res = self.post_broadcast(
            {"title": "D", "message": "M", "recipient_type": "USERS",
             "target_usernames": [self.t_a1.username], "category": "timetable"}
        )
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertEqual(notif.category, "TIMETABLE")

    def test_lowercase_recipient_type_is_upper_cased(self):
        res = self.post_broadcast({"title": "D", "message": "M", "recipient_type": "all"})
        self.assertEqual(res.status_code, 201)
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertEqual(notif.recipient_type, "ALL")

    def test_title_and_message_are_stripped(self):
        res = self.post_broadcast(
            {"title": "  Trim me  ", "message": "  Body  ", "recipient_type": "USERS",
             "target_usernames": [self.t_a1.username]}
        )
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertEqual(notif.title, "Trim me")
        self.assertEqual(notif.message, "Body")


class ValidationEdgeCaseTests(BroadcastFixture):
    """Every 400 path in BroadcastCreateView.post()."""

    def test_empty_batch_ids_list_rejected(self):
        res = self.post_broadcast({"title": "T", "message": "M", "recipient_type": "BATCH", "batch_ids": []})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error"], "At least one batch must be selected")
        self.assertEqual(Notification.objects.count(), 0)

    def test_empty_sub_batch_ids_list_rejected(self):
        res = self.post_broadcast({"title": "T", "message": "M", "recipient_type": "SUB_BATCH", "sub_batch_ids": []})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error"], "At least one sub-batch must be selected")
        self.assertEqual(Notification.objects.count(), 0)

    def test_empty_stream_ids_list_rejected(self):
        res = self.post_broadcast({"title": "T", "message": "M", "recipient_type": "STREAM", "stream_ids": []})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error"], "At least one elective stream must be selected")
        self.assertEqual(Notification.objects.count(), 0)

    def test_empty_target_usernames_list_rejected(self):
        res = self.post_broadcast({"title": "T", "message": "M", "recipient_type": "USERS", "target_usernames": []})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error"], "Select at least one user")
        self.assertEqual(Notification.objects.count(), 0)

    def test_nonexistent_sub_batch_ids_rejected(self):
        res = self.post_broadcast(
            {"title": "T", "message": "M", "recipient_type": "SUB_BATCH", "sub_batch_ids": [999999]}
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error"], "Selected sub-batch(es) do not exist")
        self.assertEqual(Notification.objects.count(), 0)

    def test_nonexistent_stream_ids_rejected(self):
        res = self.post_broadcast(
            {"title": "T", "message": "M", "recipient_type": "STREAM", "stream_ids": [999999]}
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error"], "Selected stream(s) do not exist")
        self.assertEqual(Notification.objects.count(), 0)

    def test_blank_role_rejected(self):
        res = self.post_broadcast({"title": "T", "message": "M", "recipient_type": "ROLE", "target_role": ""})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error"], "target_role is required for ROLE recipient type")

    def test_cohort_missing_id_rejected(self):
        res = self.post_broadcast({"title": "T", "message": "M", "recipient_type": "COHORT"})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error"], "Valid cohort_id is required")

    def test_users_partially_missing_rejected(self):
        res = self.post_broadcast(
            {"title": "T", "message": "M", "recipient_type": "USERS",
             "target_usernames": [self.t_a1.username, "ghost-user"]}
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error"], "One or more usernames do not exist")
        self.assertEqual(Notification.objects.count(), 0)

    def test_duplicate_usernames_rejected(self):
        # Count mismatch (1 real user, 2 entries) is treated as "one does not exist".
        res = self.post_broadcast(
            {"title": "T", "message": "M", "recipient_type": "USERS",
             "target_usernames": [self.t_a1.username, self.t_a1.username]}
        )
        self.assertEqual(res.status_code, 400)

    def test_whitespace_title_rejected(self):
        res = self.post_broadcast(
            {"title": "   ", "message": "M", "recipient_type": "USERS",
             "target_usernames": [self.t_a1.username]}
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error"], "Title is required")

    def test_whitespace_message_rejected(self):
        res = self.post_broadcast(
            {"title": "T", "message": "   ", "recipient_type": "USERS",
             "target_usernames": [self.t_a1.username]}
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error"], "Message is required")

    def test_invalid_recipient_type_error_message(self):
        res = self.post_broadcast({"title": "T", "message": "M", "recipient_type": "WAT"})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["error"], "Invalid recipient type 'WAT'")
        self.assertEqual(Notification.objects.count(), 0)


class ZeroRecipientTests(BroadcastFixture):
    """A broadcast may resolve to zero recipients yet still be stored."""

    def test_role_with_no_matching_users_still_creates_notification(self):
        res = self.post_broadcast(
            {"title": "Nobody", "message": "M", "recipient_type": "ROLE", "target_role": "OWNER"}
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["recipient_count"], 0)
        self.assertEqual(self.recipient_ids(res.data["notification_id"]), set())

    def test_lowercase_role_value_matches_nothing(self):
        # target_role is used verbatim (not upper-cased); lowercase matches no role.
        res = self.post_broadcast(
            {"title": "Case", "message": "M", "recipient_type": "ROLE", "target_role": "trainee"}
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["recipient_count"], 0)


class BroadcastPersistenceTests(BroadcastFixture):
    """Response bodies + persisted DB state for each targeting mode."""

    def test_response_body_and_db_rows_for_all(self):
        res = self.post_broadcast({"title": "Everyone", "message": "Hi", "recipient_type": "ALL"})
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data["success"])

        expected = set(User.objects.filter(is_active=True).values_list("id", flat=True))
        self.assertEqual(res.data["recipient_count"], len(expected))
        self.assertEqual(self.recipient_ids(res.data["notification_id"]), expected)

        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertEqual(notif.created_by, self.admin)
        self.assertTrue(notif.is_broadcast)
        self.assertEqual(notif.title, "Everyone")

    def test_role_target_persists_target_role_string(self):
        res = self.post_broadcast(
            {"title": "R", "message": "M", "recipient_type": "ROLE", "target_role": "TRAINEE"}
        )
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertEqual(notif.target_role, "TRAINEE")
        self.assertEqual(self.recipient_ids(notif.id), {self.t_a1.id, self.t_a2.id, self.t_b1.id})

    def test_cohort_target_persists_object(self):
        res = self.post_broadcast(
            {"title": "C", "message": "M", "recipient_type": "COHORT", "cohort_id": self.cohort.id}
        )
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertEqual(notif.target_cohort_id, self.cohort.id)

    def test_single_batch_persists_object(self):
        res = self.post_broadcast(
            {"title": "B", "message": "M", "recipient_type": "BATCH", "batch_ids": [self.batch_a.id]}
        )
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertEqual(notif.target_batch_id, self.batch_a.id)

    def test_single_sub_batch_persists_object(self):
        res = self.post_broadcast(
            {"title": "S", "message": "M", "recipient_type": "SUB_BATCH", "sub_batch_ids": [self.sb_a1.id]}
        )
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertEqual(notif.target_sub_batch_id, self.sb_a1.id)

    def test_single_stream_persists_object(self):
        res = self.post_broadcast(
            {"title": "St", "message": "M", "recipient_type": "STREAM", "stream_ids": [self.stream_x.id]}
        )
        notif = Notification.objects.get(id=res.data["notification_id"])
        self.assertEqual(notif.target_stream_id, self.stream_x.id)

    def test_recipient_rows_default_unread(self):
        res = self.post_broadcast(
            {"title": "U", "message": "M", "recipient_type": "USERS",
             "target_usernames": [self.t_a1.username]}
        )
        rows = NotificationRecipient.objects.filter(notification_id=res.data["notification_id"])
        self.assertEqual(rows.count(), 1)
        row = rows.first()
        self.assertEqual(row.user_id, self.t_a1.id)
        self.assertFalse(row.is_read)
        self.assertIsNone(row.read_at)


class InactiveUserTargetingTests(BroadcastFixture):
    """is_active handling across targeting modes."""

    def setUp(self):
        super().setUp()
        self.inactive = User.objects.create_user(
            username="Inactive Trainee", email="inactive.fx@tcs.com",
            password="Pass@1234", role="TRAINEE", sub_batch=self.sb_a1, is_active=False,
        )

    def test_all_excludes_inactive(self):
        res = self.post_broadcast({"title": "A", "message": "M", "recipient_type": "ALL"})
        self.assertNotIn(self.inactive.id, self.recipient_ids(res.data["notification_id"]))

    def test_role_excludes_inactive(self):
        res = self.post_broadcast(
            {"title": "R", "message": "M", "recipient_type": "ROLE", "target_role": "TRAINEE"}
        )
        self.assertNotIn(self.inactive.id, self.recipient_ids(res.data["notification_id"]))

    def test_cohort_excludes_inactive(self):
        res = self.post_broadcast(
            {"title": "C", "message": "M", "recipient_type": "COHORT", "cohort_id": self.cohort.id}
        )
        self.assertNotIn(self.inactive.id, self.recipient_ids(res.data["notification_id"]))

    def test_users_targeting_includes_inactive(self):
        # Documents current behaviour: manual USERS selection ignores is_active.
        res = self.post_broadcast(
            {"title": "U", "message": "M", "recipient_type": "USERS",
             "target_usernames": [self.inactive.username]}
        )
        self.assertEqual(res.status_code, 201)
        self.assertIn(self.inactive.id, self.recipient_ids(res.data["notification_id"]))


class BroadcastPermissionMatrixTests(TestCase):
    """CanManageBroadcasts gating for both the create + history endpoints."""

    def setUp(self):
        self.admin_staff = User.objects.create_user(
            username="PM Admin Staff", email="pm.admin.staff@tcs.com",
            password="Pass@1234", role="ADMIN", is_staff=True,
        )
        self.admin_role = User.objects.create_user(
            username="PM Admin Role", email="pm.admin.role@tcs.com",
            password="Pass@1234", role="ADMIN",
        )
        self.ta = User.objects.create_user(
            username="PM TA", email="pm.ta@tcs.com", password="Pass@1234", role="TA",
        )
        self.hr = User.objects.create_user(
            username="PM HR", email="pm.hr@tcs.com", password="Pass@1234", role="HR",
        )
        self.manager = User.objects.create_user(
            username="PM Manager", email="pm.mgr@tcs.com", password="Pass@1234", role="MANAGER",
        )
        self.superuser = User.objects.create_superuser(
            username="PM Root", email="pm.root@tcs.com", password="Pass@1234",
        )
        self.faculty = User.objects.create_user(
            username="PM Faculty", email="pm.fac@tcs.com", password="Pass@1234", role="FACULTY",
        )
        self.owner = User.objects.create_user(
            username="PM Owner", email="pm.owner@tcs.com", password="Pass@1234", role="OWNER",
        )
        self.trainee = User.objects.create_user(
            username="PM Trainee", email="pm.trainee@tcs.com", password="Pass@1234", role="TRAINEE",
        )

    def _broadcast_status(self, user):
        res = auth_client(user).post(
            BROADCAST_URL,
            {"title": "T", "message": "M", "recipient_type": "USERS",
             "target_usernames": [self.trainee.username]},
            format="json",
        )
        return res.status_code

    def test_allowed_roles_can_broadcast(self):
        for user in (self.admin_staff, self.admin_role, self.ta, self.hr, self.manager, self.superuser):
            self.assertEqual(self._broadcast_status(user), 201, user.username)

    def test_forbidden_roles_cannot_broadcast(self):
        for user in (self.faculty, self.owner, self.trainee):
            self.assertEqual(self._broadcast_status(user), 403, user.username)

    def test_history_allowed_for_support_roles(self):
        for user in (self.admin_staff, self.ta, self.hr, self.manager):
            self.assertEqual(auth_client(user).get(HISTORY_URL).status_code, 200, user.username)

    def test_history_forbidden_for_other_roles(self):
        for user in (self.faculty, self.owner, self.trainee):
            self.assertEqual(auth_client(user).get(HISTORY_URL).status_code, 403, user.username)

    def test_history_requires_authentication(self):
        self.assertEqual(APIClient().get(HISTORY_URL).status_code, 401)


class BroadcastHistoryExtraTests(BroadcastFixture):
    """History serialisation / ordering extras."""

    def test_history_uses_system_admin_name_for_null_creator(self):
        Notification.objects.create(title="Orphan", message="M")  # created_by=None
        res = self.client.get(HISTORY_URL)
        self.assertEqual(res.status_code, 200)
        item = next(i for i in res.data if i["title"] == "Orphan")
        self.assertEqual(item["created_by_name"], "System / Admin")
        self.assertFalse(item["posted_by_me"])

    def test_history_marks_own_notifications(self):
        Notification.objects.create(title="Mine", message="M", created_by=self.admin)
        res = self.client.get(HISTORY_URL)
        item = next(i for i in res.data if i["title"] == "Mine")
        self.assertTrue(item["posted_by_me"])

    def test_history_ordered_newest_first(self):
        older = Notification.objects.create(title="First", message="M", created_by=self.admin)
        newer = Notification.objects.create(title="Second", message="M", created_by=self.admin)
        now = timezone.now()
        Notification.objects.filter(id=older.id).update(created_at=now - timedelta(minutes=5))
        Notification.objects.filter(id=newer.id).update(created_at=now)
        titles = [i["title"] for i in self.client.get(HISTORY_URL).data]
        self.assertLess(titles.index("Second"), titles.index("First"))

    def test_history_exposes_target_codes(self):
        Notification.objects.create(
            title="Scoped", message="M", recipient_type="SUB_BATCH",
            target_cohort=self.cohort, target_batch=self.batch_a,
            target_sub_batch=self.sb_a1, target_stream=self.stream_x,
            created_by=self.admin,
        )
        res = self.client.get(HISTORY_URL)
        item = next(i for i in res.data if i["title"] == "Scoped")
        self.assertEqual(item["target_cohort_code"], self.cohort.code)
        self.assertEqual(item["target_batch_code"], self.batch_a.full_code)
        self.assertEqual(item["target_sub_batch_code"], self.sb_a1.full_code)
        self.assertEqual(item["target_stream_name"], self.stream_x.name)


class UserInboxExtraTests(TestCase):
    """Trainee inbox shape, ordering and mark-as-read behaviour."""

    def setUp(self):
        self.trainee = User.objects.create_user(
            username="Inbox T", email="inbox.extra@tcs.com", password="Pass@1234", role="TRAINEE",
        )
        self.other = User.objects.create_user(
            username="Inbox Other", email="inbox.other@tcs.com", password="Pass@1234", role="TRAINEE",
        )
        self.client = auth_client(self.trainee)

    def test_inbox_response_shape(self):
        n = Notification.objects.create(title="Hello", message="Body")
        r = NotificationRecipient.objects.create(notification=n, user=self.trainee)
        res = self.client.get(INBOX_URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        item = res.data[0]
        self.assertEqual(
            set(item.keys()),
            {"id", "notification_id", "title", "message", "is_read", "created_at"},
        )
        self.assertEqual(item["id"], r.id)
        self.assertEqual(item["notification_id"], n.id)
        self.assertEqual(item["title"], "Hello")
        self.assertFalse(item["is_read"])

    def test_inbox_ordering_newest_first(self):
        n1 = Notification.objects.create(title="Old", message="M")
        n2 = Notification.objects.create(title="New", message="M")
        r1 = NotificationRecipient.objects.create(notification=n1, user=self.trainee)
        r2 = NotificationRecipient.objects.create(notification=n2, user=self.trainee)
        now = timezone.now()
        NotificationRecipient.objects.filter(id=r1.id).update(created_at=now - timedelta(minutes=5))
        NotificationRecipient.objects.filter(id=r2.id).update(created_at=now)
        titles = [i["title"] for i in self.client.get(INBOX_URL).data]
        self.assertEqual(titles, ["New", "Old"])

    def test_inbox_is_read_reflects_state(self):
        n = Notification.objects.create(title="R", message="M")
        NotificationRecipient.objects.create(notification=n, user=self.trainee, is_read=True)
        item = self.client.get(INBOX_URL).data[0]
        self.assertTrue(item["is_read"])

    def test_mark_read_is_idempotent(self):
        n = Notification.objects.create(title="R", message="M")
        r = NotificationRecipient.objects.create(notification=n, user=self.trainee)
        first = self.client.patch(read_url(r.id))
        second = self.client.patch(read_url(r.id))
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data["message"], "Notification marked as read")
        r.refresh_from_db()
        self.assertTrue(r.is_read)
        self.assertIsNotNone(r.read_at)

    def test_mark_read_requires_authentication(self):
        n = Notification.objects.create(title="R", message="M")
        r = NotificationRecipient.objects.create(notification=n, user=self.trainee)
        self.assertEqual(APIClient().patch(read_url(r.id)).status_code, 401)


class RealtimeDispatchTests(BroadcastFixture):
    """Real-time channel dispatch branches, verified with a mocked helper."""

    def setUp(self):
        super().setUp()
        self.hr = User.objects.create_user(
            username="Dispatch HR", email="dispatch.hr@tcs.com", password="Pass@1234", role="HR",
        )

    def _groups(self, payload):
        with patch("server.apps.notifications.views.send_channel_message") as mocked:
            res = self.post_broadcast(payload)
            self.assertEqual(res.status_code, 201)
            return res, [call.args[0] for call in mocked.call_args_list]

    def test_all_dispatch_to_all_group(self):
        _, groups = self._groups({"title": "A", "message": "M", "recipient_type": "ALL"})
        self.assertEqual(groups, [notifier.ALL_GROUP])

    def test_single_batch_dispatch_group(self):
        _, groups = self._groups(
            {"title": "B", "message": "M", "recipient_type": "BATCH", "batch_ids": [self.batch_a.id]}
        )
        self.assertEqual(groups, [notifier.batch_group(self.batch_a.full_code)])

    def test_multi_batch_dispatch_groups(self):
        _, groups = self._groups(
            {"title": "B", "message": "M", "recipient_type": "BATCH",
             "batch_ids": [self.batch_a.id, self.batch_b.id]}
        )
        self.assertEqual(
            set(groups),
            {notifier.batch_group(self.batch_a.full_code), notifier.batch_group(self.batch_b.full_code)},
        )

    def test_sub_batch_dispatch_group(self):
        _, groups = self._groups(
            {"title": "S", "message": "M", "recipient_type": "SUB_BATCH", "sub_batch_ids": [self.sb_a1.id]}
        )
        self.assertEqual(groups, [notifier.batch_group(self.sb_a1.full_code)])

    def test_stream_dispatch_to_stream_and_users(self):
        _, groups = self._groups(
            {"title": "St", "message": "M", "recipient_type": "STREAM", "stream_ids": [self.stream_x.id]}
        )
        self.assertEqual(
            set(groups),
            {notifier.batch_group(self.stream_x.name), notifier.user_group(self.t_a1.username)},
        )

    def test_users_dispatch_to_each_user_group(self):
        _, groups = self._groups(
            {"title": "U", "message": "M", "recipient_type": "USERS",
             "target_usernames": [self.t_a1.username, self.t_b1.username]}
        )
        self.assertEqual(
            set(groups),
            {notifier.user_group(self.t_a1.username), notifier.user_group(self.t_b1.username)},
        )

    def test_role_dispatch_to_user_groups(self):
        _, groups = self._groups(
            {"title": "R", "message": "M", "recipient_type": "ROLE", "target_role": "HR"}
        )
        self.assertEqual(groups, [notifier.user_group(self.hr.username)])

    def test_cohort_dispatch_to_all_member_groups(self):
        _, groups = self._groups(
            {"title": "C", "message": "M", "recipient_type": "COHORT", "cohort_id": self.cohort.id}
        )
        self.assertEqual(
            set(groups),
            {
                notifier.user_group(self.t_a1.username),
                notifier.user_group(self.t_a2.username),
                notifier.user_group(self.t_b1.username),
            },
        )
