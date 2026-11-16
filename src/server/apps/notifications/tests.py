"""
Tests for the notifications app.

Covers the Broadcast Announcement APIs (create / history), the trainee inbox,
mark-as-read behaviour, permission enforcement, the full recipient targeting
matrix (ALL / ROLE / COHORT / BATCH / SUB_BATCH / STREAM / USERS), validation
failures and the underlying model constraints.
"""
from django.db import IntegrityError
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from server.apps.accounts.models import User, Cohort, Batch, SubBatch, Stream
from server.apps.notifications.models import Notification, NotificationRecipient


def auth_client(user):
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


class NotificationModelTests(TestCase):
    def setUp(self):
        self.trainee = User.objects.create_user(
            username="Trainee M", email="trainee.model@tcs.com",
            password="Pass@1234", role="TRAINEE",
        )

    def test_notification_defaults_and_str(self):
        n = Notification.objects.create(title="Hello", message="World")
        self.assertEqual(n.recipient_type, "ALL")
        self.assertEqual(n.category, "GENERAL")
        self.assertTrue(n.is_broadcast)
        self.assertIn("Hello", str(n))

    def test_recipient_str_and_read_defaults(self):
        n = Notification.objects.create(title="T", message="M")
        r = NotificationRecipient.objects.create(notification=n, user=self.trainee)
        self.assertFalse(r.is_read)
        self.assertIsNone(r.read_at)
        self.assertIn("Trainee M", str(r))

    def test_recipient_is_unique_per_notification_and_user(self):
        n = Notification.objects.create(title="T", message="M")
        NotificationRecipient.objects.create(notification=n, user=self.trainee)
        with self.assertRaises(IntegrityError):
            NotificationRecipient.objects.create(notification=n, user=self.trainee)

    def test_notifications_ordered_newest_first(self):
        first = Notification.objects.create(title="First", message="1")
        second = Notification.objects.create(title="Second", message="2")
        self.assertEqual(list(Notification.objects.all()), [second, first])


class BroadcastPermissionTests(TestCase):
    def setUp(self):
        self.trainee = User.objects.create_user(
            username="Trainee P", email="trainee.perm@tcs.com",
            password="Pass@1234", role="TRAINEE",
        )

    def test_anonymous_cannot_broadcast(self):
        res = APIClient().post(
            "/api/notifications/broadcast/",
            {"title": "T", "message": "M"},
            format="json",
        )
        self.assertEqual(res.status_code, 401)

    def test_trainee_cannot_broadcast(self):
        res = auth_client(self.trainee).post(
            "/api/notifications/broadcast/",
            {"title": "T", "message": "M"},
            format="json",
        )
        self.assertEqual(res.status_code, 403)

    def test_trainee_cannot_view_history(self):
        res = auth_client(self.trainee).get("/api/notifications/broadcast/history/")
        self.assertEqual(res.status_code, 403)


class BroadcastTargetingTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="Broadcast Admin", email="admin.broadcast@tcs.com",
            password="Pass@1234", role="ADMIN", is_staff=True,
        )
        self.hr = User.objects.create_user(
            username="HR User", email="hr@tcs.com",
            password="Pass@1234", role="HR",
        )
        self.client = auth_client(self.admin)

        self.cohort = Cohort.objects.create(code="B50", name="Ignite 50")
        self.batch_a = Batch.objects.create(cohort=self.cohort, name="A")
        self.batch_b = Batch.objects.create(cohort=self.cohort, name="B")
        self.sub_batch_a1 = SubBatch.objects.create(batch=self.batch_a, name="A1")
        self.stream = Stream.objects.create(code="AI", name="AI Engineering")

        self.trainee_a1 = User.objects.create_user(
            username="Trainee A1", email="t.a1@tcs.com", password="Pass@1234",
            role="TRAINEE", sub_batch=self.sub_batch_a1, stream=self.stream,
        )
        self.trainee_b1 = User.objects.create_user(
            username="Trainee B1", email="t.b1@tcs.com", password="Pass@1234",
            role="TRAINEE", sub_batch=SubBatch.objects.create(batch=self.batch_b, name="B1"),
        )
        self.trainee_unassigned = User.objects.create_user(
            username="Trainee U", email="t.u@tcs.com", password="Pass@1234",
            role="TRAINEE",
        )

    def _recipient_ids(self, notification_id):
        return set(
            NotificationRecipient.objects.filter(notification_id=notification_id)
            .values_list("user_id", flat=True)
        )

    def test_missing_title_rejected(self):
        res = self.client.post("/api/notifications/broadcast/", {"message": "M"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.data)

    def test_missing_message_rejected(self):
        res = self.client.post("/api/notifications/broadcast/", {"title": "T"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_invalid_recipient_type_rejected(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {"title": "T", "message": "M", "recipient_type": "NONSENSE"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_broadcast_all_reaches_every_active_user(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {"title": "All hands", "message": "Attention", "recipient_type": "ALL"},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        nid = res.data["notification_id"]
        active_ids = set(User.objects.filter(is_active=True).values_list("id", flat=True))
        self.assertEqual(self._recipient_ids(nid), active_ids)

        notif = Notification.objects.get(id=nid)
        self.assertEqual(notif.created_by, self.admin)
        self.assertTrue(notif.is_broadcast)

    def test_role_targeting_requires_role(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {"title": "T", "message": "M", "recipient_type": "ROLE"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_role_targeting_only_reaches_that_role(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {"title": "HR memo", "message": "M", "recipient_type": "ROLE", "target_role": "HR"},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        ids = self._recipient_ids(res.data["notification_id"])
        self.assertEqual(ids, {self.hr.id})

    def test_cohort_targeting_requires_valid_cohort(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {"title": "T", "message": "M", "recipient_type": "COHORT", "cohort_id": 999999},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_cohort_targeting_reaches_cohort_trainees(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {
                "title": "Cohort news", "message": "M",
                "recipient_type": "COHORT", "cohort_id": self.cohort.id,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        ids = self._recipient_ids(res.data["notification_id"])
        self.assertIn(self.trainee_a1.id, ids)
        self.assertIn(self.trainee_b1.id, ids)
        self.assertNotIn(self.trainee_unassigned.id, ids)

    def test_batch_targeting_requires_selection(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {"title": "T", "message": "M", "recipient_type": "BATCH"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_batch_targeting_nonexistent_rejected(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {"title": "T", "message": "M", "recipient_type": "BATCH", "batch_ids": [999999]},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_batch_targeting_reaches_only_that_batch(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {
                "title": "Batch A news", "message": "M",
                "recipient_type": "BATCH", "batch_ids": [self.batch_a.id],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        ids = self._recipient_ids(res.data["notification_id"])
        self.assertEqual(ids, {self.trainee_a1.id})

    def test_sub_batch_targeting_requires_selection(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {"title": "T", "message": "M", "recipient_type": "SUB_BATCH"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_sub_batch_targeting_reaches_members(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {
                "title": "Sub-batch news", "message": "M",
                "recipient_type": "SUB_BATCH", "sub_batch_ids": [self.sub_batch_a1.id],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        ids = self._recipient_ids(res.data["notification_id"])
        self.assertEqual(ids, {self.trainee_a1.id})

    def test_stream_targeting_requires_selection(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {"title": "T", "message": "M", "recipient_type": "STREAM"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_stream_targeting_reaches_enrolled_trainees(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {
                "title": "Stream session", "message": "M",
                "recipient_type": "STREAM", "stream_ids": [self.stream.id],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        ids = self._recipient_ids(res.data["notification_id"])
        self.assertEqual(ids, {self.trainee_a1.id})

    def test_users_targeting_requires_usernames(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {"title": "T", "message": "M", "recipient_type": "USERS"},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_users_targeting_unknown_username_rejected(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {
                "title": "T", "message": "M",
                "recipient_type": "USERS", "target_usernames": ["ghost-user"],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_users_targeting_reaches_selected_users(self):
        res = self.client.post(
            "/api/notifications/broadcast/",
            {
                "title": "Direct", "message": "M",
                "recipient_type": "USERS",
                "target_usernames": [self.trainee_a1.username, self.trainee_b1.username],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        ids = self._recipient_ids(res.data["notification_id"])
        self.assertEqual(ids, {self.trainee_a1.id, self.trainee_b1.id})


class BroadcastHistoryTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="Hist Admin", email="admin.hist@tcs.com", password="Pass@1234",
            role="ADMIN", is_staff=True,
        )
        self.ta = User.objects.create_user(
            username="TA User", email="ta@tcs.com", password="Pass@1234", role="TA",
        )
        self.trainee = User.objects.create_user(
            username="Hist Trainee", email="t.hist@tcs.com", password="Pass@1234", role="TRAINEE",
        )

    def test_history_lists_all_with_posted_by_me_flag(self):
        Notification.objects.create(title="By admin", message="M", created_by=self.admin)
        Notification.objects.create(title="By TA", message="M", created_by=self.ta)

        res = auth_client(self.admin).get("/api/notifications/broadcast/history/")
        self.assertEqual(res.status_code, 200)
        by_title = {item["title"]: item for item in res.data}
        self.assertTrue(by_title["By admin"]["posted_by_me"])
        self.assertFalse(by_title["By TA"]["posted_by_me"])
        self.assertEqual(by_title["By admin"]["created_by_name"], "Hist Admin")

    def test_history_allowed_for_ta_role(self):
        res = auth_client(self.ta).get("/api/notifications/broadcast/history/")
        self.assertEqual(res.status_code, 200)


class UserInboxTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="Inbox Admin", email="admin.inbox@tcs.com", password="Pass@1234",
            role="ADMIN", is_staff=True,
        )
        self.trainee = User.objects.create_user(
            username="Inbox Trainee", email="t.inbox@tcs.com", password="Pass@1234", role="TRAINEE",
        )
        self.other = User.objects.create_user(
            username="Other Trainee", email="t.other@tcs.com", password="Pass@1234", role="TRAINEE",
        )

    def test_inbox_returns_only_own_notifications(self):
        n1 = Notification.objects.create(title="Mine", message="M")
        n2 = Notification.objects.create(title="Theirs", message="M")
        NotificationRecipient.objects.create(notification=n1, user=self.trainee)
        NotificationRecipient.objects.create(notification=n2, user=self.other)

        res = auth_client(self.trainee).get("/api/notifications/user-notifications/")
        self.assertEqual(res.status_code, 200)
        titles = [item["title"] for item in res.data]
        self.assertEqual(titles, ["Mine"])

    def test_mark_read_success_and_persists(self):
        n = Notification.objects.create(title="Read me", message="M")
        r = NotificationRecipient.objects.create(notification=n, user=self.trainee)

        res = auth_client(self.trainee).patch(f"/api/notifications/read/{r.id}/")
        self.assertEqual(res.status_code, 200)
        r.refresh_from_db()
        self.assertTrue(r.is_read)
        self.assertIsNotNone(r.read_at)

    def test_mark_read_rejects_non_owner(self):
        n = Notification.objects.create(title="Read me", message="M")
        r = NotificationRecipient.objects.create(notification=n, user=self.other)

        res = auth_client(self.trainee).patch(f"/api/notifications/read/{r.id}/")
        self.assertEqual(res.status_code, 404)
        r.refresh_from_db()
        self.assertFalse(r.is_read)

    def test_mark_read_unknown_id_returns_404(self):
        res = auth_client(self.trainee).patch("/api/notifications/read/999999/")
        self.assertEqual(res.status_code, 404)

    def test_inbox_requires_authentication(self):
        res = APIClient().get("/api/notifications/user-notifications/")
        self.assertEqual(res.status_code, 401)
