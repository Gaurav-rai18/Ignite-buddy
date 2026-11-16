import datetime
from django.utils import timezone
from rest_framework import serializers
from .models import Assignment
from server.apps.accounts.models import Subject, Cohort, Batch, SubBatch, Stream


class AssignmentSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    subject_name = serializers.CharField(
        read_only=True
    )
    cohort_id = serializers.IntegerField(
        write_only=True,
        required=False,
        allow_null=True
    )
    batch_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False
    )
    sub_batch_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False
    )
    stream_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False
    )

    class Meta:
        model = Assignment
        fields = [
            "id",
            "topic",
            "subject",
            "subject_name",
            "platform_link",
            "platform_name",
            "message",
            "recipient_mode",
            "start_date",
            "deadline",
            "status",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
            "cohort",
            "cohort_id",
            "batches",
            "sub_batches",
            "streams",
            "batch_ids",
            "sub_batch_ids",
            "stream_ids",
        ]
        read_only_fields = (
            "created_by",
            "created_at",
            "updated_at",
        )

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, "copy") else dict(data)
        if "recipient_type" in data and "recipient_mode" not in data:
            data["recipient_mode"] = data.pop("recipient_type")
        if "cohort_id" in data and "cohort" not in data:
            data["cohort"] = data.get("cohort_id")
        if "batch_id" in data and not data.get("batch_ids"):
            data["batch_ids"] = [data["batch_id"]] if data["batch_id"] else []
        if "sub_batch_id" in data and not data.get("sub_batch_ids"):
            data["sub_batch_ids"] = [data["sub_batch_id"]] if data["sub_batch_id"] else []
        if "stream_id" in data and not data.get("stream_ids"):
            data["stream_ids"] = [data["stream_id"]] if data["stream_id"] else []

        # Resolve subject if passed as string (e.g. name or code), dict, or pk
        raw_subject = data.get("subject")
        if isinstance(raw_subject, dict) and "id" in raw_subject:
            data["subject"] = raw_subject["id"]
        elif isinstance(raw_subject, str) and raw_subject.strip():
            if raw_subject.isdigit():
                data["subject"] = int(raw_subject)
            else:
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

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return "Staff / Admin"
        name = obj.created_by.get_full_name()
        return name if name and name.strip() else obj.created_by.username

    def validate(self, attrs):
        today = timezone.localdate() if hasattr(timezone, "localdate") else datetime.date.today()
        start_date = attrs.get("start_date") or (self.instance.start_date if self.instance else None)
        deadline = attrs.get("deadline") or (self.instance.deadline if self.instance else None)

        # On create, start_date cannot be in the past
        if not self.instance:
            if start_date and start_date < today:
                raise serializers.ValidationError({"start_date": "Start date cannot be in the past."})
        elif "start_date" in attrs and attrs["start_date"] < today:
            raise serializers.ValidationError({"start_date": "Start date cannot be in the past."})

        # Deadline cannot be in the past
        if deadline and deadline < today:
            raise serializers.ValidationError({"deadline": "Deadline cannot be in the past."})

        # Deadline must be on or after start date
        if start_date and deadline and deadline < start_date:
            raise serializers.ValidationError({"deadline": "Deadline must be on or after start date."})

        return attrs

    def create(self, validated_data):
        validated_data.pop("cohort_id", None)
        batch_ids = validated_data.pop("batch_ids", [])
        sub_batch_ids = validated_data.pop("sub_batch_ids", [])
        stream_ids = validated_data.pop("stream_ids", [])

        # If subject was passed as a string or needs resolution
        raw_subject = self.initial_data.get("subject")
        if isinstance(raw_subject, str) and not validated_data.get("subject"):
            sub_obj = Subject.objects.filter(name__iexact=raw_subject).first() or Subject.objects.filter(code__iexact=raw_subject).first()
            if not sub_obj and raw_subject.strip():
                sub_obj = Subject.objects.create(code=raw_subject[:30].upper(), name=raw_subject.strip())
            if sub_obj:
                validated_data["subject"] = sub_obj

        # Derive platform name if not explicitly given
        if not validated_data.get("platform_name") and validated_data.get("platform_link"):
            link = validated_data["platform_link"].lower()
            if "hackerearth" in link:
                validated_data["platform_name"] = "HackerEarth"
            elif "leetcode" in link:
                validated_data["platform_name"] = "LeetCode"
            elif "github" in link:
                validated_data["platform_name"] = "GitHub"
            elif "classroom.google" in link:
                validated_data["platform_name"] = "Google Classroom"
            elif "codechef" in link:
                validated_data["platform_name"] = "CodeChef"
            elif "hackerrank" in link:
                validated_data["platform_name"] = "HackerRank"

        assignment = Assignment.objects.create(**validated_data)

        if batch_ids:
            assignment.batches.set(Batch.objects.filter(id__in=batch_ids))
        if sub_batch_ids:
            assignment.sub_batches.set(SubBatch.objects.filter(id__in=sub_batch_ids))
        if stream_ids:
            assignment.streams.set(Stream.objects.filter(id__in=stream_ids))

        return assignment

    def update(self, instance, validated_data):
        validated_data.pop("cohort_id", None)
        batch_ids = validated_data.pop("batch_ids", None)
        sub_batch_ids = validated_data.pop("sub_batch_ids", None)
        stream_ids = validated_data.pop("stream_ids", None)

        raw_subject = self.initial_data.get("subject")
        if isinstance(raw_subject, str) and not validated_data.get("subject"):
            sub_obj = Subject.objects.filter(name__iexact=raw_subject).first() or Subject.objects.filter(code__iexact=raw_subject).first()
            if not sub_obj and raw_subject.strip():
                sub_obj = Subject.objects.create(code=raw_subject[:30].upper(), name=raw_subject.strip())
            if sub_obj:
                validated_data["subject"] = sub_obj

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if batch_ids is not None:
            instance.batches.set(Batch.objects.filter(id__in=batch_ids))
        if sub_batch_ids is not None:
            instance.sub_batches.set(SubBatch.objects.filter(id__in=sub_batch_ids))
        if stream_ids is not None:
            instance.streams.set(Stream.objects.filter(id__in=stream_ids))

        return instance
