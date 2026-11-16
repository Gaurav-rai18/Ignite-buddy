from django.test import TestCase
from rest_framework.test import APIClient
from django.utils import timezone
import datetime

from server.apps.accounts.models import Cohort, Batch, Lab, SubBatch, User
from server.apps.buddy_controller.models import SystemSetting, LabWorkstation, ExamPolicyRule
from server.apps.buddy_controller.policy_engine import evaluate_buddy_access


class ExamPolicyModelTest(TestCase):
    def setUp(self):
        self.cohort = Cohort.objects.create(code="B50", name="Cohort 50")
        self.batch = Batch.objects.create(name="A", cohort=self.cohort)
        self.lab = Lab.objects.create(code="LAB-01", name="Lab 1")
        self.sub_batch = SubBatch.objects.create(name="A1", batch=self.batch, home_lab=self.lab)
        self.trainee = User.objects.create_user(
            username="john_doe",
            email="john@ignite.com",
            role="TRAINEE",
            sub_batch=self.sub_batch,
        )

    def test_workstation_creation(self):
        ws = LabWorkstation.objects.create(
            device_id="DEV001",
            hostname="WS-01",
            lab=self.lab,
        )
        self.assertEqual(ws.device_id, "DEV001")

    def test_hierarchical_policy_evaluation(self):
        # 1. Default: allowed
        is_blocked, reason, _ = evaluate_buddy_access(user=self.trainee)
        self.assertFalse(is_blocked)

        # 2. Block Batch A
        now = timezone.now()
        ExamPolicyRule.objects.create(
            action="BLOCK",
            scope="BATCH",
            batch=self.batch,
            reason="Batch A Assessment",
            valid_from=now - datetime.timedelta(minutes=5),
            valid_until=now + datetime.timedelta(minutes=60),
            is_active=True,
        )
        is_blocked, reason, meta = evaluate_buddy_access(user=self.trainee)
        self.assertTrue(is_blocked)
        self.assertEqual(meta["matched_scope"], "BATCH")

        # 3. Override specifically for trainee
        ExamPolicyRule.objects.create(
            action="OVERRIDE_ALLOW",
            scope="TRAINEE",
            trainee=self.trainee,
            reason="Retest approved",
            valid_from=now - datetime.timedelta(minutes=5),
            valid_until=now + datetime.timedelta(minutes=30),
            is_active=True,
        )
        is_blocked, reason, meta = evaluate_buddy_access(user=self.trainee)
        self.assertFalse(is_blocked)
        self.assertEqual(meta["matched_scope"], "TRAINEE")
        self.assertEqual(meta["action"], "OVERRIDE_ALLOW")
