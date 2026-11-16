"""
Notification Serializers
Converts Notification model instances into JSON format for API responses
and provides author and target hierarchy metadata.
"""
from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    """
    Notification Model Serializer.
    Includes creator full name, target hierarchy codes, and category details.
    """
    created_by_name = serializers.SerializerMethodField()
    target_cohort_code = serializers.CharField(source="target_cohort.code", read_only=True)
    target_batch_code = serializers.CharField(source="target_batch.full_code", read_only=True)
    target_sub_batch_code = serializers.CharField(source="target_sub_batch.full_code", read_only=True)
    target_stream_name = serializers.CharField(source="target_stream.name", read_only=True)

    class Meta:
        model = Notification
        fields = [
            "id",
            "title",
            "message",
            "category",
            "recipient_type",
            "target_role",
            "target_cohort",
            "target_cohort_code",
            "target_batch",
            "target_batch_code",
            "target_sub_batch",
            "target_sub_batch_code",
            "target_stream",
            "target_stream_name",
            "created_by",
            "created_by_name",
            "is_broadcast",
            "created_at",
        ]
        read_only_fields = ("created_at",)

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return "System / Admin"
        name = obj.created_by.get_full_name()
        return name if name and name.strip() else obj.created_by.username
