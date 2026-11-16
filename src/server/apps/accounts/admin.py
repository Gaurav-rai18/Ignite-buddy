from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Cohort, Batch, Lab, SubBatch, Stream, Subject, SubBatchStaff, StreamFaculty


@admin.register(Cohort)
class CohortAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "start_date", "end_date", "is_active", "created_at")
    search_fields = ("code", "name")


@admin.register(Batch)
class BatchAdmin(admin.ModelAdmin):
    list_display = ("full_code", "cohort", "name", "description", "created_at")
    list_filter = ("cohort",)
    search_fields = ("name", "cohort__code")


@admin.register(Lab)
class LabAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "capacity", "location")
    search_fields = ("code", "name", "location")


@admin.register(SubBatch)
class SubBatchAdmin(admin.ModelAdmin):
    list_display = ("full_code", "batch", "name", "home_lab", "created_at")
    list_filter = ("batch__cohort", "batch")
    search_fields = ("name", "batch__name", "batch__cohort__code")


@admin.register(Stream)
class StreamAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "created_at")
    search_fields = ("code", "name")


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "is_active", "created_at")
    search_fields = ("code", "name")


@admin.register(SubBatchStaff)
class SubBatchStaffAdmin(admin.ModelAdmin):
    list_display = ("sub_batch", "user", "role", "created_at")
    list_filter = ("role", "sub_batch__batch")


@admin.register(StreamFaculty)
class StreamFacultyAdmin(admin.ModelAdmin):
    list_display = ("stream", "user", "is_primary", "created_at")
    list_filter = ("stream", "is_primary")


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "email", "role", "sub_batch", "stream", "employee_id", "accops_id", "is_active", "last_active_at")
    list_filter = ("role", "is_active", "sub_batch__batch__cohort", "sub_batch", "stream")
    search_fields = ("username", "email", "employee_id", "accops_id")
    fieldsets = BaseUserAdmin.fieldsets + (
        ("TCS Ignite Hierarchy", {"fields": ("role", "sub_batch", "stream", "employee_id", "accops_id", "last_active_at")}),
    )
