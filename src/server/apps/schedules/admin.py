from django.contrib import admin
from .models import Schedule, TimetableSlot


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    list_display = ("title", "cohort", "effective_from", "effective_until", "phase", "is_active", "status", "created_at")
    list_filter = ("phase", "is_active", "status", "cohort")
    search_fields = ("title", "cohort__code")


@admin.register(TimetableSlot)
class TimetableSlotAdmin(admin.ModelAdmin):
    list_display = ("schedule", "day_of_week", "start_time", "end_time", "title", "lab", "sub_batch", "stream", "is_assessment")
    list_filter = ("day_of_week", "is_assessment", "lab", "schedule__cohort")
    search_fields = ("title", "sub_batch__name", "stream__name", "lab__name")
