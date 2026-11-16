from django.http import JsonResponse
from .models import SystemSetting, ExamPolicyRule
from django.utils import timezone


class ExamModeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            # Global switch check
            is_global_exam = SystemSetting.get_bool("exam_mode", default=False)
            if is_global_exam:
                blocked_prefixes = ["/api/chat/"]
                if any(request.path.startswith(path) for path in blocked_prefixes):
                    return JsonResponse(
                        {
                            "success": False,
                            "message": SystemSetting.get_str("exam_reason", "Ignite Buddy is disabled during assessment.")
                        },
                        status=403
                    )
        except Exception:
            pass

        return self.get_response(request)
