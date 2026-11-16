import datetime
import time
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Assignment
from .serializers import AssignmentSerializer
from server.apps.accounts.models import User
from server.apps.notifications.models import Notification, NotificationRecipient
from server.channels_push import send_channel_message
from server.realtime import notifier


def _broadcast_assignment_event(assignment, action_verb="Published", user=None, custom_message=None):
    """
    Broadcasts assignment lifecycle events (created, updated, deadline extended) to targeted trainees.
    - Creates master Notification record with category="ASSIGNMENT" and is_broadcast=True
      so it appears in the Broadcast centre / Announcement History with the Assignment Notice badge.
    - Dispatches real-time websocket announcements to appropriate Channel groups so trainees are notified
      and local assistants extract the deadline for Tasks.md.
    - Omits individual per-trainee NotificationRecipient records and duplicate push toasts.
    - Syncs to central.db for local assistant offline synchronization.
    """
    subject_display = assignment.subject_name or "General Curriculum"
    author_user = user or assignment.created_by

    # Format notification title and message based on action
    if action_verb in ("Deadline Updated", "Deadline Extended"):
        title = f"Deadline Updated: {assignment.topic}"
        msg = custom_message or (
            f"The deadline for assignment '{assignment.topic}' ({subject_display}) "
            f"has been updated to {assignment.deadline}."
        )
    elif action_verb in ("Updated", "Modified"):
        title = f"Updated Assignment: {assignment.topic}"
        msg = custom_message or (
            f"Assignment '{assignment.topic}' ({subject_display}) has been updated. "
            f"Deadline: {assignment.deadline}. {assignment.message or ''}"
        ).strip()
    else:  # Created / Published
        title = f"New Assignment: {assignment.topic}"
        msg = custom_message or (
            f"New assignment for {subject_display}. Deadline: {assignment.deadline}. "
            f"{assignment.message or ''}"
        ).strip()

    recip_mode = assignment.recipient_mode or "ALL"
    target_cohort_obj = assignment.cohort
    target_batch_obj = assignment.batches.first() if assignment.batches.exists() else None
    target_sub_batch_obj = assignment.sub_batches.first() if assignment.sub_batches.exists() else None
    target_stream_obj = assignment.streams.first() if assignment.streams.exists() else None

    # Create master Notification record so it appears on the Broadcast page
    try:
        notif = Notification.objects.create(
            title=title,
            message=msg,
            category="ASSIGNMENT",
            recipient_type=recip_mode,
            target_cohort=target_cohort_obj,
            target_batch=target_batch_obj,
            target_sub_batch=target_sub_batch_obj,
            target_stream=target_stream_obj,
            created_by=author_user,
            is_broadcast=True,
        )

        # Dispatch real-time WebSocket payload to Channel groups
        msg_payload = {
            "type": "trainee.notification",
            "kind": "assignment",
            "notification_id": notif.id,
            "title": title,
            "message": msg,
            "category": "ASSIGNMENT",
            "text": f"{title}: {msg}",
            "created_at": notif.created_at.isoformat(),
        }

        if recip_mode == "ALL":
            send_channel_message(notifier.ALL_GROUP, msg_payload)
        elif recip_mode == "BATCH" and assignment.batches.exists():
            for b in assignment.batches.all():
                send_channel_message(notifier.batch_group(b.full_code), msg_payload)
        elif recip_mode == "SUB_BATCH" and assignment.sub_batches.exists():
            for sb in assignment.sub_batches.all():
                send_channel_message(notifier.batch_group(sb.full_code), msg_payload)
        elif recip_mode == "COHORT" and target_cohort_obj:
            send_channel_message(notifier.batch_group(target_cohort_obj.code), msg_payload)
        elif recip_mode == "STREAM" and assignment.streams.exists():
            for st in assignment.streams.all():
                send_channel_message(notifier.batch_group(st.name), msg_payload)
    except Exception:
        pass

    try:
        from server.storage.central import get_central
        central = get_central()
        target_batch = "*"
        if assignment.cohort:
            target_batch = assignment.cohort.code
        elif assignment.sub_batches.exists():
            target_batch = assignment.sub_batches.first().full_code
        elif assignment.batches.exists():
            target_batch = assignment.batches.first().full_code

        due_ts = time.time() + 86400 * 7
        if assignment.deadline:
            dt = datetime.datetime.combine(assignment.deadline, datetime.time(23, 59, 59))
            due_ts = dt.timestamp()

        central.upsert_assignment(
            batch=target_batch,
            title=f"[{assignment.subject_name or 'General'}] {assignment.topic}",
            description=assignment.message or assignment.platform_link or "",
            due_ts=due_ts,
            aid=str(assignment.id),
        )
        notifier.sync_batch(target_batch)
    except Exception:
        pass


class AssignmentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        assignments = (
            Assignment.objects.all()
            .select_related("subject", "created_by", "cohort")
            .prefetch_related("batches", "sub_batches", "streams")
            .order_by("-created_at")
        )

        cohort_id = request.query_params.get("cohort")
        if cohort_id:
            assignments = assignments.filter(cohort_id=cohort_id)

        data = AssignmentSerializer(assignments, many=True).data
        for item in data:
            item["posted_by_me"] = (item.get("created_by") == request.user.id)

        return Response(data)

    def post(self, request):
        serializer = AssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = serializer.save(created_by=request.user)

        # Broadcast new assignment
        _broadcast_assignment_event(assignment, action_verb="Published", user=request.user)

        data = AssignmentSerializer(assignment).data
        data["posted_by_me"] = True
        return Response(data, status=status.HTTP_201_CREATED)


class AssignmentCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = AssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = serializer.save(created_by=request.user)

        # Broadcast new assignment
        _broadcast_assignment_event(assignment, action_verb="Published", user=request.user)

        data = AssignmentSerializer(assignment).data
        data["posted_by_me"] = True
        return Response(data, status=status.HTTP_201_CREATED)


class AssignmentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            assignment = (
                Assignment.objects
                .select_related("subject", "created_by", "cohort")
                .prefetch_related("batches", "sub_batches", "streams")
                .get(id=pk)
            )
        except Assignment.DoesNotExist:
            return Response({"error": "Assignment not found"}, status=status.HTTP_404_NOT_FOUND)

        data = AssignmentSerializer(assignment).data
        data["posted_by_me"] = (assignment.created_by_id == request.user.id)
        return Response(data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial=True):
        try:
            assignment = Assignment.objects.get(id=pk)
        except Assignment.DoesNotExist:
            return Response({"error": "Assignment not found"}, status=status.HTTP_404_NOT_FOUND)

        old_deadline = assignment.deadline
        serializer = AssignmentSerializer(assignment, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        updated_assignment = serializer.save()

        # Determine action verb
        if "deadline" in request.data and str(old_deadline) != str(updated_assignment.deadline):
            action_verb = "Deadline Updated"
        else:
            action_verb = "Updated"

        _broadcast_assignment_event(updated_assignment, action_verb=action_verb, user=request.user)

        data = AssignmentSerializer(updated_assignment).data
        data["posted_by_me"] = (updated_assignment.created_by_id == request.user.id)
        return Response(data)

    def delete(self, request, pk):
        Assignment.objects.filter(id=pk).delete()
        return Response({"success": True})


class MyAssignmentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        assignments = (
            Assignment.objects.filter(created_by=request.user)
            .select_related("subject", "created_by", "cohort")
            .prefetch_related("batches", "sub_batches", "streams")
            .order_by("-created_at")
        )

        data = AssignmentSerializer(assignments, many=True).data
        for item in data:
            item["posted_by_me"] = True
        return Response(data)


class OthersAssignmentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        assignments = (
            Assignment.objects.exclude(created_by=request.user)
            .select_related("subject", "created_by", "cohort")
            .prefetch_related("batches", "sub_batches", "streams")
            .order_by("-created_at")
        )

        data = AssignmentSerializer(assignments, many=True).data
        for item in data:
            item["posted_by_me"] = False
        return Response(data)


class UpdateDeadlineView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            assignment = Assignment.objects.get(id=pk)
        except Assignment.DoesNotExist:
            return Response({"error": "Assignment not found"}, status=status.HTTP_404_NOT_FOUND)

        deadline = request.data.get("deadline")
        if not deadline:
            return Response({"error": "Deadline is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Validate past date
        today = timezone.localdate() if hasattr(timezone, "localdate") else datetime.date.today()
        if isinstance(deadline, str):
            try:
                parsed_deadline = datetime.date.fromisoformat(deadline)
            except ValueError:
                return Response({"error": "Invalid date format. Expected YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            parsed_deadline = deadline

        if parsed_deadline < today:
            return Response({"error": "Deadline cannot be in the past."}, status=status.HTTP_400_BAD_REQUEST)

        if assignment.start_date and parsed_deadline < assignment.start_date:
            return Response({"error": "Deadline must be on or after start date."}, status=status.HTTP_400_BAD_REQUEST)

        assignment.deadline = parsed_deadline
        assignment.save()

        # Broadcast deadline update
        _broadcast_assignment_event(assignment, action_verb="Deadline Updated", user=request.user)

        data = AssignmentSerializer(assignment).data
        data["posted_by_me"] = (assignment.created_by_id == request.user.id)
        return Response(data)


class DeleteAssignmentView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        Assignment.objects.filter(id=pk).delete()
        return Response({"success": True})
