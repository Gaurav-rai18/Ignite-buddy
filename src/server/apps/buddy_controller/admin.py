from django.contrib import admin
from .models import SystemSetting, LabWorkstation, ExamPolicyRule


@admin.register(SystemSetting)
class SystemSettingAdmin(admin.ModelAdmin):
    list_display = ("key", "value", "updated_at", "updated_by")
    search_fields = ("key", "value", "description")


@admin.register(LabWorkstation)
class LabWorkstationAdmin(admin.ModelAdmin):
    list_display = ("device_id", "hostname", "lab", "ip_address", "last_ping_at")
    list_filter = ("lab",)
    search_fields = ("device_id", "hostname", "ip_address")


@admin.register(ExamPolicyRule)
class ExamPolicyRuleAdmin(admin.ModelAdmin):
    list_display = ("action", "scope", "reason", "valid_from", "valid_until", "is_active", "created_at")
    list_filter = ("action", "scope", "is_active")
    search_fields = ("reason", "trainee__username", "sub_batch__name", "batch__name")
