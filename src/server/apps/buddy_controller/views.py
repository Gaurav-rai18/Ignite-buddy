import datetime
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from .models import SystemSetting, LabWorkstation, ExamPolicyRule
from .policy_engine import evaluate_buddy_access
from server.apps.accounts.models import User, Cohort, Batch, SubBatch
from server.domain import policy
from server.channels_push import send_channel_message


def notify_policy_update():
    """Broadcasts policy change (exam mode / buddy blocked) to all active trainees."""
    send_channel_message("policy", {"type": "policy.update"})


@api_view(["POST"])
def start_exam(request):
    """Enables Exam Mode: blocks Trainee Buddy assistants during assessments."""
    SystemSetting.set_bool("buddy_enabled", False, description="Exam mode active", user=request.user)
    SystemSetting.set_bool("exam_mode", True, description="Exam mode active", user=request.user)
    policy.set_blocked(True, reason="Exam in progress. The assistant is disabled.")
    notify_policy_update()

    return Response({
        "success": True,
        "exam_mode": True,
        "message": "Exam Mode Enabled (Campus-wide)"
    })


@api_view(["POST"])
def end_exam(request):
    """Disables Exam Mode: restores normal Trainee Buddy assistance."""
    SystemSetting.set_bool("buddy_enabled", True, description="Buddy available", user=request.user)
    SystemSetting.set_bool("exam_mode", False, description="Exam mode disabled", user=request.user)
    # Deactivate active block rules
    ExamPolicyRule.objects.filter(action="BLOCK", is_active=True).update(is_active=False)
    policy.set_blocked(False, reason="")
    notify_policy_update()

    return Response({
        "success": True,
        "exam_mode": False,
        "message": "Exam Mode Disabled"
    })


@api_view(["GET"])
def exam_status(request):
    """Returns whether Exam Mode or an automated Test Lock is currently active."""
    user_obj = request.user if request.user.is_authenticated else None
    is_blocked, reason, meta = evaluate_buddy_access(user=user_obj)

    from .test_lock import get_active_test_lock
    test_lock = get_active_test_lock(user=user_obj)

    total_is_blocked = (
        policy.is_blocked(request.user.id if request.user.is_authenticated else None)
        or is_blocked
        or test_lock.get("is_locked", False)
    )
    return Response({
        "exam_mode": total_is_blocked,
        "is_manual_exam": is_blocked,
        "reason": reason or test_lock.get("reason", ""),
        "policy_meta": meta,
        "test_lock": test_lock,
    })


class ExamPolicyRuleListCreateView(APIView):
    """
    CRUD for Hierarchical Exam Policy Rules and Admin Overrides.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        rules = ExamPolicyRule.objects.filter(is_active=True, valid_until__gte=now).select_related("trainee", "sub_batch", "batch", "cohort", "created_by").order_by("-created_at")

        result = []
        for r in rules:
            target_label = "Global"
            target_id = None
            if r.scope == "TRAINEE" and r.trainee:
                target_label = f"{r.trainee.get_full_name() or r.trainee.username} ({r.trainee.employee_id or 'No ID'})"
                target_id = r.trainee.id
            elif r.scope == "SUB_BATCH" and r.sub_batch:
                target_label = r.sub_batch.full_code
                target_id = r.sub_batch.id
            elif r.scope == "BATCH" and r.batch:
                target_label = r.batch.full_code
                target_id = r.batch.id
            elif r.scope == "COHORT" and r.cohort:
                target_label = r.cohort.code
                target_id = r.cohort.id

            result.append({
                "id": r.id,
                "action": r.action,
                "scope": r.scope,
                "target_label": target_label,
                "target_id": target_id,
                "reason": r.reason,
                "valid_from": r.valid_from.isoformat() if r.valid_from else "",
                "valid_until": r.valid_until.isoformat() if r.valid_until else "",
                "is_active": r.is_active,
                "created_by": r.created_by.username if r.created_by else "Admin",
                "created_at": r.created_at.isoformat() if r.created_at else "",
            })

        return Response(result)

    def post(self, request):
        data = request.data
        action = data.get("action", "BLOCK").upper()
        scope = data.get("scope", "COHORT").upper()
        reason = data.get("reason", "Assessment Policy").strip()
        duration_minutes = int(data.get("duration_minutes", 60))

        now = timezone.now()
        valid_until = now + datetime.timedelta(minutes=duration_minutes)

        target_kwargs = {}
        target_id = data.get("target_id")

        if scope == "TRAINEE":
            if not target_id:
                # Can also search by employee_id or email
                emp_id = data.get("employee_id")
                email = data.get("email")
                user = None
                if emp_id:
                    user = User.objects.filter(employee_id=emp_id).first()
                elif email:
                    user = User.objects.filter(email__iexact=email).first()
                if not user:
                    return Response({"error": "Target trainee not found."}, status=status.HTTP_400_BAD_REQUEST)
                target_kwargs["trainee"] = user
            else:
                target_kwargs["trainee_id"] = target_id
        elif scope == "SUB_BATCH":
            target_kwargs["sub_batch_id"] = target_id
        elif scope == "BATCH":
            target_kwargs["batch_id"] = target_id
        elif scope == "COHORT":
            target_kwargs["cohort_id"] = target_id

        rule = ExamPolicyRule.objects.create(
            action=action,
            scope=scope,
            reason=reason,
            valid_from=now,
            valid_until=valid_until,
            is_active=True,
            created_by=request.user,
            **target_kwargs
        )
        notify_policy_update()

        return Response({
            "success": True,
            "id": rule.id,
            "action": rule.action,
            "scope": rule.scope,
            "reason": rule.reason,
            "valid_until": rule.valid_until.isoformat(),
            "message": f"Successfully created {rule.action} rule for {rule.scope}."
        }, status=status.HTTP_201_CREATED)


class ExamPolicyRuleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            rule = ExamPolicyRule.objects.get(pk=pk)
            rule.is_active = False
            rule.save()
            notify_policy_update()
            return Response({"success": True, "message": "Rule revoked successfully."})
        except ExamPolicyRule.DoesNotExist:
            return Response({"error": "Rule not found"}, status=status.HTTP_404_NOT_FOUND)


@api_view(["GET", "PATCH", "POST", "PUT"])
def get_or_update_buddy_setting(request):
    """
    Comprehensive Buddy configuration endpoint for Admin Console (/api/settings/buddy/).
    """
    if request.method == "GET":
        master_enabled = SystemSetting.get_bool("buddy_enabled", default=not policy.is_blocked())
        exam_mode = SystemSetting.get_bool("exam_mode", default=False)

        from .test_lock import get_active_test_lock
        user_obj = request.user if request.user.is_authenticated else None
        active_test_lock = get_active_test_lock(user=user_obj)

        active_rules_count = ExamPolicyRule.objects.filter(is_active=True, valid_until__gte=timezone.now()).count()

        return Response({
            "enabled": master_enabled,
            "exam_mode": exam_mode,
            "exam_reason": SystemSetting.get_str("exam_reason", default="Assessment in progress. Buddy assistant is temporarily paused."),
            "test_auto_lock_enabled": SystemSetting.get_bool("test_auto_lock_enabled", default=True),
            "test_buffer_before_minutes": SystemSetting.get_int("test_buffer_before_minutes", default=15),
            "test_buffer_after_minutes": SystemSetting.get_int("test_buffer_after_minutes", default=15),
            "active_test_lock": active_test_lock,
            "active_rules_count": active_rules_count,
            "voice_enabled": SystemSetting.get_bool("voice_enabled", default=True),
            "voice_tts_enabled": SystemSetting.get_bool("voice_tts_enabled", default=True),
            "screen_help_enabled": SystemSetting.get_bool("screen_help_enabled", default=True),
            "ide_tracking_enabled": SystemSetting.get_bool("ide_tracking_enabled", default=True),
            "llm_model": SystemSetting.get_str("llm_model", default="llama3.2:3b"),
            "llm_temperature": SystemSetting.get_float("llm_temperature", default=0.3),
            "llm_system_prompt": SystemSetting.get_str("llm_system_prompt", default="Encourage trainees to think logically. Guide with hints and explanations before solutions."),
            "max_queries_per_hour": SystemSetting.get_int("max_queries_per_hour", default=30),
            "rag_ignite_enabled": SystemSetting.get_bool("rag_ignite_enabled", default=True),
            "rag_general_enabled": SystemSetting.get_bool("rag_general_enabled", default=True),
            "rag_personal_enabled": SystemSetting.get_bool("rag_personal_enabled", default=True),
            "blocked_keywords": SystemSetting.get_str("blocked_keywords", default="exam leak, test solutions, cheat, bypass policy"),
        })

    data = request.data
    user = request.user

    # Master Buddy toggle
    if "enabled" in data:
        enabled_val = bool(data["enabled"])
        SystemSetting.set_bool("buddy_enabled", enabled_val, user=user)
        policy.set_blocked(not enabled_val, reason="The assistant has been disabled by the administrator." if not enabled_val else "")

    # Exam Mode toggle & reason
    if "exam_mode" in data:
        exam_mode_val = bool(data["exam_mode"])
        SystemSetting.set_bool("exam_mode", exam_mode_val, user=user)
        if exam_mode_val:
            reason = data.get("exam_reason", "Assessment in progress. Buddy assistant is temporarily paused.")
            policy.set_blocked(True, reason=reason)
        else:
            is_enabled = SystemSetting.get_bool("buddy_enabled", default=True)
            policy.set_blocked(not is_enabled, reason="")

    if "exam_reason" in data:
        SystemSetting.set_str("exam_reason", str(data["exam_reason"]).strip(), user=user)

    # Automated Test Lockdown Settings
    if "test_auto_lock_enabled" in data:
        SystemSetting.set_bool("test_auto_lock_enabled", bool(data["test_auto_lock_enabled"]), user=user)
    if "test_buffer_before_minutes" in data:
        try:
            SystemSetting.set_int("test_buffer_before_minutes", int(data["test_buffer_before_minutes"]), user=user)
        except (ValueError, TypeError):
            pass
    if "test_buffer_after_minutes" in data:
        try:
            SystemSetting.set_int("test_buffer_after_minutes", int(data["test_buffer_after_minutes"]), user=user)
        except (ValueError, TypeError):
            pass

    # Feature switches
    if "voice_enabled" in data:
        SystemSetting.set_bool("voice_enabled", bool(data["voice_enabled"]), user=user)
    if "voice_tts_enabled" in data:
        SystemSetting.set_bool("voice_tts_enabled", bool(data["voice_tts_enabled"]), user=user)
    if "screen_help_enabled" in data:
        SystemSetting.set_bool("screen_help_enabled", bool(data["screen_help_enabled"]), user=user)
    if "ide_tracking_enabled" in data:
        SystemSetting.set_bool("ide_tracking_enabled", bool(data["ide_tracking_enabled"]), user=user)

    # AI / LLM configuration
    if "llm_model" in data:
        SystemSetting.set_str("llm_model", str(data["llm_model"]).strip(), user=user)
    if "llm_temperature" in data:
        try:
            SystemSetting.set_float("llm_temperature", float(data["llm_temperature"]), user=user)
        except (ValueError, TypeError):
            pass
    if "llm_system_prompt" in data:
        SystemSetting.set_str("llm_system_prompt", str(data["llm_system_prompt"]).strip(), user=user)

    # Safety & RAG
    if "max_queries_per_hour" in data:
        try:
            SystemSetting.set_int("max_queries_per_hour", int(data["max_queries_per_hour"]), user=user)
        except (ValueError, TypeError):
            pass
    if "rag_ignite_enabled" in data:
        val = bool(data["rag_ignite_enabled"])
        SystemSetting.set_bool("rag_ignite_enabled", val, user=user)
        policy.set_capability("kb.ignite", val)
    if "rag_general_enabled" in data:
        val = bool(data["rag_general_enabled"])
        SystemSetting.set_bool("rag_general_enabled", val, user=user)
        policy.set_capability("kb.general", val)
    if "rag_personal_enabled" in data:
        SystemSetting.set_bool("rag_personal_enabled", bool(data["rag_personal_enabled"]), user=user)
    if "blocked_keywords" in data:
        SystemSetting.set_str("blocked_keywords", str(data["blocked_keywords"]).strip(), user=user)

    notify_policy_update()

    master_enabled = SystemSetting.get_bool("buddy_enabled", default=not policy.is_blocked())
    exam_mode = SystemSetting.get_bool("exam_mode", default=False)
    return Response({
        "success": True,
        "enabled": master_enabled,
        "exam_mode": exam_mode,
        "exam_reason": SystemSetting.get_str("exam_reason", default="Assessment in progress. Buddy assistant is temporarily paused."),
        "voice_enabled": SystemSetting.get_bool("voice_enabled", default=True),
        "voice_tts_enabled": SystemSetting.get_bool("voice_tts_enabled", default=True),
        "screen_help_enabled": SystemSetting.get_bool("screen_help_enabled", default=True),
        "ide_tracking_enabled": SystemSetting.get_bool("ide_tracking_enabled", default=True),
        "llm_model": SystemSetting.get_str("llm_model", default="llama3.2:3b"),
        "llm_temperature": SystemSetting.get_float("llm_temperature", default=0.3),
        "llm_system_prompt": SystemSetting.get_str("llm_system_prompt", default="Encourage trainees to think logically. Guide with hints and explanations before solutions."),
        "max_queries_per_hour": SystemSetting.get_int("max_queries_per_hour", default=30),
        "rag_ignite_enabled": SystemSetting.get_bool("rag_ignite_enabled", default=True),
        "rag_general_enabled": SystemSetting.get_bool("rag_general_enabled", default=True),
        "rag_personal_enabled": SystemSetting.get_bool("rag_personal_enabled", default=True),
        "blocked_keywords": SystemSetting.get_str("blocked_keywords", default="exam leak, test solutions, cheat, bypass policy"),
        "message": "Buddy settings updated successfully",
    })
