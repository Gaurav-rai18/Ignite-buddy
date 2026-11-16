"""
API tests for the Buddy Controller app.

Covers Exam Mode toggles, the unified Buddy settings endpoint
(/api/settings/buddy/), the hierarchical exam policy rule CRUD and the
SystemSetting key/value helpers. Global policy state is reset in tearDown so
tests remain isolated.
"""
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from server.apps.accounts.models import User, Cohort, Batch, SubBatch
from server.apps.buddy_controller.models import SystemSetting, ExamPolicyRule
from server.domain import policy


def auth_client(user):
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


class SystemSettingTests(TestCase):
    def test_bool_roundtrip_and_default(self):
        self.assertTrue(SystemSetting.get_bool("missing", default=True))
        SystemSetting.set_bool("buddy_enabled", False)
        self.assertFalse(SystemSetting.get_bool("buddy_enabled", default=True))
        SystemSetting.set_bool("buddy_enabled", True)
        self.assertTrue(SystemSetting.get_bool("buddy_enabled"))

    def test_int_float_str_roundtrip(self):
        SystemSetting.set_int("max_queries_per_hour", 42)
        self.assertEqual(SystemSetting.get_int("max_queries_per_hour"), 42)
        SystemSetting.set_float("llm_temperature", 0.7)
        self.assertAlmostEqual(SystemSetting.get_float("llm_temperature"), 0.7)
        SystemSetting.set_str("llm_model", "gpt-oss:20b")
        self.assertEqual(SystemSetting.get_str("llm_model"), "gpt-oss:20b")

    def test_invalid_int_falls_back_to_default(self):
        SystemSetting.set_str("max_queries_per_hour", "not-a-number")
        self.assertEqual(SystemSetting.get_int("max_queries_per_hour", default=7), 7)

    def test_str_value_parsing_truthiness(self):
        SystemSetting.objects.create(key="flag_on", value="YES")
        SystemSetting.objects.create(key="flag_off", value="no")
        self.assertTrue(SystemSetting.get_bool("flag_on"))
        self.assertFalse(SystemSetting.get_bool("flag_off"))


class ExamModeApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def tearDown(self):
        policy.set_blocked(False, reason="")
        SystemSetting.objects.all().delete()

    def test_start_exam_enables_lockdown(self):
        res = self.client.post("/api/buddy/start-exam/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["exam_mode"])
        self.assertFalse(SystemSetting.get_bool("buddy_enabled", default=True))
        self.assertTrue(SystemSetting.get_bool("exam_mode", default=False))
        self.assertTrue(policy.is_blocked())

    def test_end_exam_restores_buddy(self):
        self.client.post("/api/buddy/start-exam/")
        res = self.client.post("/api/buddy/end-exam/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["exam_mode"])
        self.assertTrue(SystemSetting.get_bool("buddy_enabled", default=False))
        self.assertFalse(policy.is_blocked())

    def test_exam_status_reports_block_state(self):
        res = self.client.get("/api/buddy/status/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["exam_mode"])
        self.assertIn("test_lock", res.data)

        self.client.post("/api/buddy/start-exam/")
        res = self.client.get("/api/buddy/status/")
        self.assertTrue(res.data["exam_mode"])


class BuddySettingsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def tearDown(self):
        policy.set_blocked(False, reason="")
        SystemSetting.objects.all().delete()

    def test_get_returns_full_default_config(self):
        res = self.client.get("/api/settings/buddy/")
        self.assertEqual(res.status_code, 200)
        for key in ("enabled", "exam_mode", "llm_model", "llm_temperature",
                    "max_queries_per_hour", "voice_enabled", "rag_ignite_enabled",
                    "blocked_keywords", "active_test_lock"):
            self.assertIn(key, res.data)

    def test_patch_updates_multiple_settings(self):
        res = self.client.patch("/api/settings/buddy/", {
            "enabled": False,
            "llm_model": "llama3.2:3b",
            "llm_temperature": 0.5,
            "max_queries_per_hour": 15,
            "blocked_keywords": "cheat, leak",
            "voice_enabled": False,
        }, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["enabled"])
        self.assertEqual(res.data["llm_model"], "llama3.2:3b")
        self.assertAlmostEqual(res.data["llm_temperature"], 0.5)
        self.assertEqual(res.data["max_queries_per_hour"], 15)
        self.assertEqual(res.data["blocked_keywords"], "cheat, leak")
        self.assertFalse(res.data["voice_enabled"])
        self.assertFalse(SystemSetting.get_bool("buddy_enabled"))

    def test_patch_ignores_invalid_numeric_values(self):
        res = self.client.patch("/api/settings/buddy/", {
            "max_queries_per_hour": "abc",
            "llm_temperature": "not-a-float",
            "test_buffer_before_minutes": "oops",
        }, format="json")
        self.assertEqual(res.status_code, 200)
        # Defaults remain because the invalid values were swallowed
        self.assertEqual(res.data["max_queries_per_hour"], 30)
        self.assertAlmostEqual(res.data["llm_temperature"], 0.3)

    def test_exam_mode_toggle_sets_policy(self):
        res = self.client.patch("/api/settings/buddy/", {"exam_mode": True}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["exam_mode"])
        self.assertTrue(policy.is_blocked())

        res = self.client.patch("/api/settings/buddy/", {"exam_mode": False}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["exam_mode"])

    def test_rag_capability_toggle(self):
        policy.set_capability("kb.ignite", True)
        self.client.patch("/api/settings/buddy/", {"rag_ignite_enabled": False}, format="json")
        self.assertFalse(policy.allows("kb.ignite"))


class ExamPolicyRuleApiTests(TestCase):
    def setUp(self):
        self.cohort = Cohort.objects.create(code="B50", name="Ignite 50")
        self.batch = Batch.objects.create(cohort=self.cohort, name="A")
        self.sub_batch = SubBatch.objects.create(batch=self.batch, name="A1")
        self.trainee = User.objects.create_user(
            username="Rule Trainee", email="rule.trainee@tcs.com", password="Pass@1234",
            role="TRAINEE", employee_id="30001", sub_batch=self.sub_batch,
        )
        self.admin = User.objects.create_user(
            username="Rule Admin", email="rule.admin@tcs.com", password="Pass@1234",
            role="ADMIN", is_staff=True,
        )
        self.client = auth_client(self.admin)

    def tearDown(self):
        policy.set_blocked(False, reason="")

    def test_rules_require_authentication(self):
        res = APIClient().get("/api/buddy/rules/")
        self.assertEqual(res.status_code, 401)

    def test_create_cohort_rule_and_list(self):
        res = self.client.post("/api/buddy/rules/", {
            "action": "BLOCK", "scope": "COHORT", "target_id": self.cohort.id,
            "reason": "Mid-term assessment", "duration_minutes": 45,
        }, format="json")
        self.assertEqual(res.status_code, 201)
        rule_id = res.data["id"]
        self.assertEqual(ExamPolicyRule.objects.get(id=rule_id).scope, "COHORT")

        res = self.client.get("/api/buddy/rules/")
        self.assertEqual(res.status_code, 200)
        labels = [r["target_label"] for r in res.data]
        self.assertIn("B50", labels)

    def test_create_trainee_rule_requires_valid_target(self):
        res = self.client.post("/api/buddy/rules/", {
            "action": "BLOCK", "scope": "TRAINEE", "employee_id": "9999999",
        }, format="json")
        self.assertEqual(res.status_code, 400)

    def test_create_trainee_rule_by_employee_id(self):
        res = self.client.post("/api/buddy/rules/", {
            "action": "OVERRIDE_ALLOW", "scope": "TRAINEE", "employee_id": "30001",
            "reason": "Retest approved", "duration_minutes": 30,
        }, format="json")
        self.assertEqual(res.status_code, 201)
        rule = ExamPolicyRule.objects.get(id=res.data["id"])
        self.assertEqual(rule.trainee, self.trainee)
        self.assertEqual(rule.action, "OVERRIDE_ALLOW")

    def test_revoke_rule_deactivates(self):
        res = self.client.post("/api/buddy/rules/", {
            "action": "BLOCK", "scope": "BATCH", "target_id": self.batch.id,
        }, format="json")
        rule_id = res.data["id"]

        res = self.client.delete(f"/api/buddy/rules/{rule_id}/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(ExamPolicyRule.objects.get(id=rule_id).is_active)

    def test_revoke_missing_rule_returns_404(self):
        res = self.client.delete("/api/buddy/rules/999999/")
        self.assertEqual(res.status_code, 404)
