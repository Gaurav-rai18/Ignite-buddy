"""
Hierarchical Exam Policy Engine
Evaluates whether Trainee Buddy assistant is allowed or blocked.
Precedence:
  1. Trainee-level Override / Rule (Most specific)
  2. Sub-Batch-level Override / Rule
  3. Batch-level Override / Rule
  4. Cohort-level Override / Rule
  5. Schedule-driven assessment check (TimetableSlot)
  6. Global Buddy / Exam Mode switch (Least specific)
"""
from django.utils import timezone
from .models import ExamPolicyRule, SystemSetting


def evaluate_buddy_access(user=None, check_dt=None) -> tuple[bool, str, dict]:
    """
    Returns (is_blocked: bool, reason: str, meta: dict)
    """
    if check_dt is None:
        check_dt = timezone.now()

    meta = {
        "is_blocked": False,
        "matched_rule": None,
        "matched_scope": None,
        "action": "ALLOW",
        "reason": "",
    }

    # Staff / admin are never blocked
    if user and user.is_authenticated and user.role not in ("TRAINEE",):
        return False, "", meta

    # 1. Trainee level rule
    if user and user.is_authenticated:
        t_rule = ExamPolicyRule.objects.filter(
            scope="TRAINEE",
            trainee=user,
            is_active=True,
            valid_from__lte=check_dt,
            valid_until__gte=check_dt,
        ).first()
        if t_rule:
            is_blocked = (t_rule.action == "BLOCK")
            meta.update({
                "is_blocked": is_blocked,
                "matched_rule": t_rule.id,
                "matched_scope": "TRAINEE",
                "action": t_rule.action,
                "reason": t_rule.reason,
            })
            return is_blocked, t_rule.reason, meta

    # 2. Sub-batch level rule
    sb = getattr(user, "sub_batch", None) if user and user.is_authenticated else None
    if sb:
        sb_rule = ExamPolicyRule.objects.filter(
            scope="SUB_BATCH",
            sub_batch=sb,
            is_active=True,
            valid_from__lte=check_dt,
            valid_until__gte=check_dt,
        ).first()
        if sb_rule:
            is_blocked = (sb_rule.action == "BLOCK")
            meta.update({
                "is_blocked": is_blocked,
                "matched_rule": sb_rule.id,
                "matched_scope": "SUB_BATCH",
                "action": sb_rule.action,
                "reason": sb_rule.reason,
            })
            return is_blocked, sb_rule.reason, meta

        # 3. Batch level rule
        if sb.batch:
            b_rule = ExamPolicyRule.objects.filter(
                scope="BATCH",
                batch=sb.batch,
                is_active=True,
                valid_from__lte=check_dt,
                valid_until__gte=check_dt,
            ).first()
            if b_rule:
                is_blocked = (b_rule.action == "BLOCK")
                meta.update({
                    "is_blocked": is_blocked,
                    "matched_rule": b_rule.id,
                    "matched_scope": "BATCH",
                    "action": b_rule.action,
                    "reason": b_rule.reason,
                })
                return is_blocked, b_rule.reason, meta

            # 4. Cohort level rule
            if sb.batch.cohort:
                c_rule = ExamPolicyRule.objects.filter(
                    scope="COHORT",
                    cohort=sb.batch.cohort,
                    is_active=True,
                    valid_from__lte=check_dt,
                    valid_until__gte=check_dt,
                ).first()
                if c_rule:
                    is_blocked = (c_rule.action == "BLOCK")
                    meta.update({
                        "is_blocked": is_blocked,
                        "matched_rule": c_rule.id,
                        "matched_scope": "COHORT",
                        "action": c_rule.action,
                        "reason": c_rule.reason,
                    })
                    return is_blocked, c_rule.reason, meta

    # 5. Global exam mode switch
    if SystemSetting.get_bool("exam_mode", default=False):
        reason = SystemSetting.get_str("exam_reason", "Assessment in progress. Buddy assistant is temporarily paused.")
        meta.update({
            "is_blocked": True,
            "matched_scope": "GLOBAL_EXAM",
            "action": "BLOCK",
            "reason": reason,
        })
        return True, reason, meta

    # 6. Global master buddy toggle
    if not SystemSetting.get_bool("buddy_enabled", default=True):
        reason = "The assistant has been disabled by the administrator."
        meta.update({
            "is_blocked": True,
            "matched_scope": "GLOBAL_MASTER",
            "action": "BLOCK",
            "reason": reason,
        })
        return True, reason, meta

    return False, "", meta

