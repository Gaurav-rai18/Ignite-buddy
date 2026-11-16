from rest_framework import serializers
from .models import Schedule, TimetableSlot
from server.apps.accounts.serializers import CohortSerializer, SubBatchSerializer, StreamSerializer, LabSerializer, SubjectSerializer


class TimetableSlotSerializer(serializers.ModelSerializer):
    lab_name = serializers.CharField(source="lab.name", read_only=True)
    lab_code = serializers.CharField(source="lab.code", read_only=True)
    sub_batch_code = serializers.CharField(source="sub_batch.name", read_only=True)
    stream_name = serializers.CharField(source="stream.name", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    evaluator_name = serializers.CharField(source="evaluator.get_full_name", read_only=True)
    day_name = serializers.CharField(source="get_day_of_week_display", read_only=True)
    platform = serializers.CharField(required=False, allow_null=True, allow_blank=True, default=None)

    class Meta:
        model = TimetableSlot
        fields = [
            "id",
            "schedule",
            "sub_batch",
            "sub_batch_code",
            "stream",
            "stream_name",
            "day_of_week",
            "day_name",
            "start_time",
            "end_time",
            "subject",
            "subject_name",
            "title",
            "lab",
            "lab_name",
            "lab_code",
            "is_assessment",
            "platform",
            "evaluator",
            "evaluator_name",
        ]

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, "copy") else dict(data)
        raw_subject = data.get("subject")
        if isinstance(raw_subject, dict) and "id" in raw_subject:
            data["subject"] = raw_subject["id"]
        elif isinstance(raw_subject, str) and raw_subject.strip():
            if raw_subject.isdigit():
                data["subject"] = int(raw_subject)
            else:
                from server.apps.accounts.models import Subject
                sub_obj = (
                    Subject.objects.filter(name__iexact=raw_subject.strip()).first()
                    or Subject.objects.filter(code__iexact=raw_subject.strip()).first()
                )
                if not sub_obj:
                    sub_obj = Subject.objects.create(
                        code=raw_subject[:30].upper(),
                        name=raw_subject.strip()
                    )
                data["subject"] = sub_obj.id
        elif raw_subject == "" or raw_subject is None:
            data["subject"] = None
        return super().to_internal_value(data)


class ScheduleSerializer(serializers.ModelSerializer):
    cohort_detail = CohortSerializer(source="cohort", read_only=True)
    target_cohort = CohortSerializer(source="cohort", read_only=True)
    slots = TimetableSlotSerializer(many=True, read_only=True)
    grid_data = serializers.DictField(read_only=True)

    class Meta:
        model = Schedule
        fields = [
            "id",
            "cohort",
            "cohort_detail",
            "target_cohort",
            "title",
            "effective_from",
            "effective_until",
            "is_active",
            "phase",
            "status",
            "created_by",
            "created_at",
            "slots",
            "grid_data",
        ]
        read_only_fields = ("created_by", "created_at")
