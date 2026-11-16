import datetime
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from server.apps.accounts.models import User, Cohort, Batch, SubBatch, Stream, Subject
from server.apps.assignments.models import Assignment
from server.apps.notifications.models import Notification, NotificationRecipient


class AssignmentIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.today = timezone.localdate() if hasattr(timezone, "localdate") else datetime.date.today()
        self.yesterday = self.today - datetime.timedelta(days=1)
        self.tomorrow = self.today + datetime.timedelta(days=1)
        self.next_week = self.today + datetime.timedelta(days=7)

        # Admin user
        self.admin = User.objects.create_user(
            username="Admin Lead",
            email="admin.lead@tcs.com",
            password="SecurePassword@123",
            role="ADMIN",
            employee_id="10001",
            is_staff=True,
        )
        refresh = RefreshToken.for_user(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

        # Staff user 2
        self.staff2 = User.objects.create_user(
            username="Faculty Two",
            email="faculty2@tcs.com",
            password="SecurePassword@123",
            role="TA",
            employee_id="10002",
            is_staff=True,
        )

        # Trainees
        self.cohort = Cohort.objects.create(code="ILP-2026-C1", name="ILP Cohort 1")
        self.batch = Batch.objects.create(cohort=self.cohort, name="A")
        self.sub_batch = SubBatch.objects.create(batch=self.batch, name="A1")
        self.stream = Stream.objects.create(code="STR-AI", name="AI & ML")

        self.trainee1 = User.objects.create_user(
            username="Trainee Alpha",
            email="trainee.alpha@tcs.com",
            password="SecurePassword@123",
            role="TRAINEE",
            sub_batch=self.sub_batch,
            stream=self.stream,
        )
        self.trainee2 = User.objects.create_user(
            username="Trainee Beta",
            email="trainee.beta@tcs.com",
            password="SecurePassword@123",
            role="TRAINEE",
        )

        self.subject = Subject.objects.create(code="SUB-DS", name="Data Structures")

    def test_create_assignment_past_start_date_fails(self):
        payload = {
            "topic": "Binary Search Trees",
            "subject": self.subject.name,
            "start_date": str(self.yesterday),
            "deadline": str(self.next_week),
            "message": "Complete the BST traversal problem set.",
            "recipient_mode": "ALL",
        }
        res = self.client.post("/api/assignments/", payload, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("start_date", res.data)

    def test_create_assignment_past_deadline_fails(self):
        payload = {
            "topic": "Graph Algorithms",
            "subject": self.subject.name,
            "start_date": str(self.today),
            "deadline": str(self.yesterday),
            "message": "Implement BFS and DFS.",
            "recipient_mode": "ALL",
        }
        res = self.client.post("/api/assignments/", payload, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("deadline", res.data)

    def test_create_assignment_deadline_before_start_date_fails(self):
        payload = {
            "topic": "Dynamic Programming",
            "subject": self.subject.name,
            "start_date": str(self.next_week),
            "deadline": str(self.tomorrow),
            "message": "Knapsack 0/1 problem.",
            "recipient_mode": "ALL",
        }
        res = self.client.post("/api/assignments/", payload, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("deadline", res.data)

    def test_create_assignment_success_and_broadcast(self):
        payload = {
            "topic": "Binary Search Implementation",
            "subject": self.subject.name,
            "platform_link": "https://hackerearth.com/challenge/bst-1",
            "start_date": str(self.today),
            "deadline": str(self.next_week),
            "message": "Submit solution on HackerEarth before deadline.",
            "recipient_mode": "ALL",
        }
        res = self.client.post("/api/assignments/", payload, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data.get("posted_by_me"))
        self.assertEqual(res.data["platform_name"], "HackerEarth")

        # Verify database record
        assignment = Assignment.objects.get(id=res.data["id"])
        self.assertEqual(assignment.topic, "Binary Search Implementation")
        self.assertEqual(assignment.created_by, self.admin)

        # Master broadcast record is created for the Broadcast page history
        self.assertTrue(Notification.objects.filter(category="ASSIGNMENT", is_broadcast=True).exists())
        # Individual trainee inbox records are omitted
        self.assertFalse(NotificationRecipient.objects.filter(notification__category="ASSIGNMENT").exists())

    def test_update_deadline_past_date_fails(self):
        assignment = Assignment.objects.create(
            topic="Recursion Lab",
            subject=self.subject,
            start_date=self.today,
            deadline=self.next_week,
            created_by=self.admin,
            recipient_mode="ALL",
        )
        res = self.client.patch(
            f"/api/assignments/{assignment.id}/deadline/",
            {"deadline": str(self.yesterday)},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.data)

    def test_update_deadline_success(self):
        assignment = Assignment.objects.create(
            topic="Recursion Lab",
            subject=self.subject,
            start_date=self.today,
            deadline=self.next_week,
            created_by=self.admin,
            recipient_mode="ALL",
        )

        extended_deadline = self.today + datetime.timedelta(days=14)
        res = self.client.patch(
            f"/api/assignments/{assignment.id}/deadline/",
            {"deadline": str(extended_deadline)},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["deadline"], str(extended_deadline))

        # Master broadcast record is created for the Broadcast page history
        self.assertTrue(Notification.objects.filter(category="ASSIGNMENT", is_broadcast=True).exists())
        # Individual trainee inbox records are omitted
        self.assertFalse(NotificationRecipient.objects.filter(notification__category="ASSIGNMENT").exists())

    def test_assignment_detail_patch_and_delete(self):
        assignment = Assignment.objects.create(
            topic="SQL Joins",
            subject=self.subject,
            start_date=self.today,
            deadline=self.next_week,
            created_by=self.admin,
            recipient_mode="ALL",
        )

        # GET detail
        res = self.client.get(f"/api/assignments/{assignment.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["topic"], "SQL Joins")
        self.assertTrue(res.data["posted_by_me"])

        # PATCH detail
        res = self.client.patch(
            f"/api/assignments/{assignment.id}/",
            {"topic": "Advanced SQL Joins & Subqueries"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["topic"], "Advanced SQL Joins & Subqueries")

        # DELETE
        res = self.client.delete(f"/api/assignments/{assignment.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(Assignment.objects.filter(id=assignment.id).exists())

    def test_mine_and_others_filtering(self):
        # Assignment by admin
        Assignment.objects.create(
            topic="Admin Assignment",
            subject=self.subject,
            start_date=self.today,
            deadline=self.next_week,
            created_by=self.admin,
        )
        # Assignment by staff2
        Assignment.objects.create(
            topic="Faculty2 Assignment",
            subject=self.subject,
            start_date=self.today,
            deadline=self.next_week,
            created_by=self.staff2,
        )

        res_mine = self.client.get("/api/assignments/mine/")
        self.assertEqual(res_mine.status_code, 200)
        mine_topics = [a["topic"] for a in res_mine.data]
        self.assertIn("Admin Assignment", mine_topics)
        self.assertNotIn("Faculty2 Assignment", mine_topics)

        res_others = self.client.get("/api/assignments/others/")
        self.assertEqual(res_others.status_code, 200)
        others_topics = [a["topic"] for a in res_others.data]
        self.assertIn("Faculty2 Assignment", others_topics)
        self.assertNotIn("Admin Assignment", others_topics)

    def test_create_assignment_with_custom_string_subject(self):
        payload = {
            "topic": "Microservices Project",
            "subject": "Incubator Phase 2",
            "start_date": str(self.today),
            "deadline": str(self.next_week),
            "message": "Complete the microservices architecture project.",
            "recipient_mode": "ALL",
        }
        res = self.client.post("/api/assignments/", payload, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["subject_name"], "Incubator Phase 2")

    def test_create_assignment_with_pk_subject(self):
        payload = {
            "topic": "Linked List Algorithms",
            "subject": self.subject.id,
            "start_date": str(self.today),
            "deadline": str(self.next_week),
            "message": "Implement doubly linked list.",
            "recipient_mode": "ALL",
        }
        res = self.client.post("/api/assignments/", payload, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["subject"], self.subject.id)
