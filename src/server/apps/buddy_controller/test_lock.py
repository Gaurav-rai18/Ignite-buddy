"""
Automated Test Lockdown Engine
Monitors published schedules and automatically disables the Trainee Buddy
assistant during scheduled assessment/exit test hours (including configurable
buffers before and after the test).
"""
import datetime
from django.utils import timezone
from .models import SystemSetting


def get_active_test_lock(user=None, check_dt=None) -> dict:
    """
    Evaluates whether the Trainee Buddy assistant is currently locked due to
    an active assessment/test in the weekly schedule.
    """
    auto_lock_enabled = SystemSetting.get_bool("test_auto_lock_enabled", default=True)
    buffer_before = SystemSetting.get_int("test_buffer_before_minutes", default=15)
    buffer_after = SystemSetting.get_int("test_buffer_after_minutes", default=15)

    base_response = {
        "is_locked": False,
        "test_title": "",
        "target_sub_batch": "",
        "target_batch": "",
        "location": "",
        "start_time": "",
        "end_time": "",
        "lock_start": "",
        "lock_end": "",
        "buffer_before": buffer_before,
        "buffer_after": buffer_after,
        "reason": "",
        "auto_lock_enabled": auto_lock_enabled,
    }

    if not auto_lock_enabled:
        return base_response

    if check_dt is None:
        check_dt = timezone.localtime()

    weekday_int = check_dt.weekday()

    try:
        from server.apps.schedules.models import TimetableSlot
    except ImportError:
        return base_response

    # Look for active schedule slots flagged as assessment
    qs = TimetableSlot.objects.filter(
        schedule__is_active=True,
        is_assessment=True,
        day_of_week=weekday_int,
    ).select_related("sub_batch__batch", "stream", "lab", "schedule")

    if user and getattr(user, "sub_batch", None):
        # Match user's sub_batch or stream or global slots
        from django.db.models import Q
        q_filter = Q(sub_batch=user.sub_batch)
        if getattr(user, "stream", None):
            q_filter |= Q(stream=user.stream)
        qs = qs.filter(q_filter)

    cur_time = check_dt.time()

    for slot in qs:
        # Calculate buffer windows
        start_dt = check_dt.replace(hour=slot.start_time.hour, minute=slot.start_time.minute, second=0, microsecond=0)
        end_dt = check_dt.replace(hour=slot.end_time.hour, minute=slot.end_time.minute, second=0, microsecond=0)

        lock_start = start_dt - datetime.timedelta(minutes=buffer_before)
        lock_end = end_dt + datetime.timedelta(minutes=buffer_after)

        if lock_start <= check_dt <= lock_end:
            title = slot.title or "Assessment"
            sb_name = slot.sub_batch.name if slot.sub_batch else "All Sub-Batches"
            batch_name = slot.sub_batch.batch.name if (slot.sub_batch and slot.sub_batch.batch) else "All Batches"
            loc = slot.lab.name if slot.lab else "Testing Venue"

            reason = (
                f"Assessment in progress ({title} in {loc}). "
                f"Buddy assistant is automatically disabled from {lock_start.strftime('%I:%M %p')} "
                f"to {lock_end.strftime('%I:%M %p')} "
                f"({buffer_before}m preparation and {buffer_after}m wrap-up buffers)."
            )

            return {
                "is_locked": True,
                "test_title": title,
                "target_sub_batch": sb_name,
                "target_batch": batch_name,
                "location": loc,
                "start_time": slot.start_time.strftime("%H:%M"),
                "end_time": slot.end_time.strftime("%H:%M"),
                "lock_start": lock_start.strftime("%I:%M %p"),
                "lock_end": lock_end.strftime("%I:%M %p"),
                "buffer_before": buffer_before,
                "buffer_after": buffer_after,
                "reason": reason,
                "auto_lock_enabled": True,
            }

    return base_response
