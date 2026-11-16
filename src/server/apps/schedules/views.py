"""
Schedule Views for Ignite Buddy (1NF Normalized)
Manages weekly timetable creation, relational TimetableSlot persistence,
Excel schedule parsing, and real-time broadcasts.
"""
import datetime
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Schedule, TimetableSlot
from .serializers import ScheduleSerializer, TimetableSlotSerializer
from .parser import parse_schedule_excel
from server.apps.accounts.models import Cohort, Batch, SubBatch, Stream, Lab, Subject, User, SubBatchStaff, StreamFaculty
from server.apps.accounts.permissions import IsUserManagementStaff, ModuleAccessPermission
from server.storage.central import get_central
from server.realtime import notifier


DAY_TO_INT = {
    "mon": 0, "monday": 0, "0": 0, 0: 0,
    "tue": 1, "tuesday": 1, "1": 1, 1: 1,
    "wed": 2, "wednesday": 2, "2": 2, 2: 2,
    "thu": 3, "thursday": 3, "3": 3, 3: 3,
    "fri": 4, "friday": 4, "4": 4, 4: 4,
    "sat": 5, "saturday": 5, "5": 5, 5: 5,
    "sun": 6, "sunday": 6, "6": 6, 6: 6,
}


def _find_changed_sub_batches(old_grid: dict | None, new_grid: dict | None) -> list[str]:
    """
    Compares two schedule grids and identifies which sub-batches had changes
    in their lecture titles, rooms, times, or test statuses.
    Returns list of sub-batch codes that were modified.
    If old_grid is empty/none, returns all sub-batches in new_grid.
    """
    if not new_grid or not isinstance(new_grid, dict):
        return []

    new_sbs = new_grid.get("sub_batches", {})
    if not isinstance(new_sbs, dict) or not new_sbs:
        return []

    if not old_grid or not isinstance(old_grid, dict):
        return list(new_sbs.keys())

    old_sbs = old_grid.get("sub_batches", {})
    if not isinstance(old_sbs, dict):
        return list(new_sbs.keys())

    changed = []
    for sb_code, new_days in new_sbs.items():
        if sb_code not in old_sbs:
            changed.append(sb_code)
            continue

        old_days = old_sbs[sb_code]
        sb_changed = False
        for day in ("mon", "tue", "wed", "thu", "fri", "sat"):
            new_slots = new_days.get(day, [])
            old_slots = old_days.get(day, [])
            if len(new_slots) != len(old_slots):
                sb_changed = True
                break
            for ns, os in zip(new_slots, old_slots):
                if (
                    ns.get("title") != os.get("title")
                    or ns.get("location") != os.get("location")
                    or ns.get("is_test") != os.get("is_test")
                    or ns.get("start") != os.get("start")
                    or ns.get("end") != os.get("end")
                ):
                    sb_changed = True
                    break
            if sb_changed:
                break

        if sb_changed:
            changed.append(sb_code)

    return changed


def _sync_grid_to_central(grid_data: dict, target_batch: str, changed_sub_batches: list[str] | None = None):
    """Syncs a schedule's weekly grid slots into central.db and broadcasts to trainees."""
    if not grid_data:
        return

    central = get_central()
    cohort_str = str(grid_data.get("cohort") or "").strip()

    # Pre-map sub-batch codes to canonical full codes (e.g. B1 -> B50-B-B1)
    sb_code_map = {}
    for sb in SubBatch.objects.select_related("batch__cohort").all():
        sb_code_map[sb.name.upper()] = sb.full_code
        sb_code_map[sb.full_code.upper()] = sb.full_code

    # Case A: Multi-sub-batch layout
    if "sub_batches" in grid_data and isinstance(grid_data["sub_batches"], dict):
        all_sbs = list(grid_data["sub_batches"].keys())
        target_sbs = changed_sub_batches if (changed_sub_batches is not None and len(changed_sub_batches) > 0) else all_sbs

        for sb_code in target_sbs:
            day_dict = grid_data["sub_batches"].get(sb_code)
            if not isinstance(day_dict, dict):
                continue

            canonical_batch = sb_code_map.get(str(sb_code).upper())
            if not canonical_batch:
                canonical_batch = f"{cohort_str}-{sb_code}" if (cohort_str and not str(sb_code).startswith(f"{cohort_str}-")) else str(sb_code)

            for day_code, slots in day_dict.items():
                if not isinstance(slots, list):
                    continue
                w_int = DAY_TO_INT.get(str(day_code).lower(), 0)
                for slot in slots:
                    start_str = str(slot.get("start", "09:00"))
                    end_str = str(slot.get("end", "10:30"))
                    start_clean = start_str.replace(":", "")
                    end_clean = end_str.replace(":", "")
                    sid = str(slot.get("id") or f"{canonical_batch}_{w_int}_{start_clean}_{end_clean}")

                    title = str(slot.get("title", "Lecture"))
                    if slot.get("is_test") and "[TEST]" not in title:
                        title = f"[TEST] {title}"

                    loc = str(slot.get("location", "Home Lab"))

                    central.upsert_slot(
                        batch=canonical_batch,
                        weekday=w_int,
                        start=start_str,
                        end=end_str,
                        title=title,
                        location=loc,
                        sid=sid,
                    )

            try:
                notifier.sync_batch(canonical_batch)
                notifier.sync_batch(sb_code)
                if cohort_str:
                    notifier.sync_batch(cohort_str)
            except Exception:
                pass

        try:
            notifier.sync_batch(target_batch)
            notifier.sync_batch("*")
        except Exception:
            pass
        return

    # Case B: Flat day-wise slots
    for day_code, slots in grid_data.items():
        if not isinstance(slots, list):
            continue
        w_int = DAY_TO_INT.get(str(day_code).lower(), 0)
        for slot in slots:
            batch_for_slot = slot.get("sub_batch") or target_batch
            start_str = str(slot.get("start", "09:00"))
            end_str = str(slot.get("end", "10:30"))
            start_clean = start_str.replace(":", "")
            end_clean = end_str.replace(":", "")
            sid = str(slot.get("id") or f"{batch_for_slot}_{w_int}_{start_clean}_{end_clean}")

            title = str(slot.get("title", "Lecture"))
            if slot.get("is_test") and "[TEST]" not in title:
                title = f"[TEST] {title}"

            central.upsert_slot(
                batch=batch_for_slot,
                weekday=w_int,
                start=start_str,
                end=end_str,
                title=title,
                location=str(slot.get("location", "Home Lab")),
                sid=sid,
            )

    try:
        notifier.sync_batch(target_batch)
        notifier.sync_batch("*")
    except Exception:
        pass


def _create_schedule_broadcast(schedule, action_verb="Published", user=None):
    """
    Creates a Notification and delivers it to cohort trainees and connected clients
    so it shows up on the Broadcast Announcement page (with Timetable Update badge)
    and broadcasts to trainees without individual personal inbox notifications.
    """
    try:
        from server.apps.notifications.models import Notification
        from server.channels_push import send_channel_message

        cohort_code = schedule.cohort.code if schedule.cohort else "Ignite"
        eff_from = schedule.effective_from.strftime("%b %d, %Y") if schedule.effective_from else "This week"
        eff_until = schedule.effective_until.strftime("%b %d, %Y") if schedule.effective_until else "Next week"

        title = f"Timetable {action_verb}: Cohort {cohort_code}"
        message = (
            f"The master timetable '{schedule.title}' for Cohort {cohort_code} "
            f"(Week: {eff_from} to {eff_until}) has been {action_verb.lower()}. "
            f"Please review your daily lab hours, incubator sessions, and stream specializations."
        )

        author = user if (user and user.is_authenticated) else schedule.created_by

        notif = Notification.objects.create(
            title=title,
            message=message,
            category="TIMETABLE",
            recipient_type="COHORT" if schedule.cohort else "ALL",
            target_cohort=schedule.cohort,
            created_by=author,
            is_broadcast=True,
        )

        msg_payload = {
            "type": "trainee.notification",
            "kind": "broadcast",
            "notification_id": notif.id,
            "title": title,
            "message": message,
            "category": "TIMETABLE",
            "text": f"{title}: {message}",
            "created_at": notif.created_at.isoformat(),
        }

        if schedule.cohort:
            send_channel_message(notifier.batch_group(schedule.cohort.code), msg_payload)
        else:
            send_channel_message(notifier.ALL_GROUP, msg_payload)
    except Exception:
        pass


def _save_slots_from_payload(schedule: Schedule, data: dict):
    """
    High-performance batch persistence of normalized TimetableSlot records.
    Pre-caches all related entities in memory (O(1) dictionary lookups) to
    eliminate thousands of redundant round-trip queries, and performs bulk central sync.
    """
    slots_data = data.get("slots")
    grid_data = data.get("grid_data")

    # Clear existing slots for clean atomic update
    schedule.slots.all().delete()

    # Pre-fetch cache in 4 single bulk queries
    cohort_code = schedule.cohort.code if schedule.cohort else "B50"

    sb_map = {}
    for sb in SubBatch.objects.select_related("batch__cohort").all():
        sb_map[sb.id] = sb
        sb_map[sb.name.upper()] = sb
        sb_map[sb.full_code.upper()] = sb
        sb_map[f"{cohort_code}-{sb.name}".upper()] = sb

    stream_map = {}
    for st in Stream.objects.all():
        stream_map[st.id] = st
        stream_map[st.name.upper()] = st
        stream_map[st.code.upper()] = st

    lab_map = {}
    for l in Lab.objects.all():
        lab_map[l.name.upper()] = l
        lab_map[l.code.upper()] = l
        lab_map[l.name.replace(" ", "").upper()] = l

    subject_map = {}
    for sub in Subject.objects.all():
        subject_map[sub.id] = sub
        subject_map[sub.name.upper()] = sub
        subject_map[sub.code.upper()] = sub

    def resolve_lab(loc_str):
        raw = str(loc_str or "WA").strip()
        key = raw.upper()
        if key in lab_map:
            return lab_map[key]
        clean_key = raw.replace(" ", "").upper()
        if clean_key in lab_map:
            return lab_map[clean_key]
        # Fallback to safe get_or_create and cache
        obj = Lab.get_or_create_by_name(raw)
        lab_map[obj.name.upper()] = obj
        lab_map[obj.code.upper()] = obj
        return obj

    def resolve_sb(sb_val):
        if not sb_val:
            return None
        if isinstance(sb_val, int) and sb_val in sb_map:
            return sb_map[sb_val]
        raw = str(sb_val).strip().upper()
        if raw in sb_map:
            return sb_map[raw]
        # Try with cohort prefix e.g. B50-A1
        pref = f"{cohort_code}-{raw}"
        if pref in sb_map:
            return sb_map[pref]
        return None

    def resolve_stream(st_val):
        if not st_val:
            return None
        if isinstance(st_val, int) and st_val in stream_map:
            return stream_map[st_val]
        raw = str(st_val).strip().upper()
        if raw in stream_map:
            return stream_map[raw]
        obj = Stream.get_or_create_by_name(str(st_val).strip())
        stream_map[obj.name.upper()] = obj
        stream_map[obj.code.upper()] = obj
        return obj

    def resolve_subject(sub_val):
        if not sub_val:
            return None
        if isinstance(sub_val, int) and sub_val in subject_map:
            return subject_map[sub_val]
        raw = str(sub_val).strip().upper()
        return subject_map.get(raw)

    def parse_time(val, default_val):
        if isinstance(val, datetime.time):
            return val
        try:
            parts = str(val).strip().split(":")
            return datetime.time(int(parts[0]), int(parts[1]))
        except Exception:
            return default_val

    created_slots = []
    central_items = []

    # Format 1: Direct slots list
    if isinstance(slots_data, list) and slots_data:
        for s in slots_data:
            sb_obj = resolve_sb(s.get("sub_batch"))
            stream_obj = resolve_stream(s.get("stream"))
            lab_obj = resolve_lab(s.get("location") or s.get("lab") or "WA")

            title = str(s.get("title") or s.get("subject") or "Lecture").strip()
            sub_val = s.get("subject_id") or s.get("subject")
            sub_obj = resolve_subject(sub_val)

            st = parse_time(s.get("start") or s.get("start_time"), datetime.time(8, 30))
            et = parse_time(s.get("end") or s.get("end_time"), datetime.time(9, 30))

            day_raw = s.get("day_of_week") if s.get("day_of_week") is not None else s.get("day", 0)
            day_int = DAY_TO_INT.get(str(day_raw).lower(), 0)

            # Determine if slot is an assessment (never match substring 'tr' which corrupts Stream and TR sessions)
            if s.get("is_test") is not None:
                is_test = bool(s.get("is_test"))
            elif s.get("is_assessment") is not None:
                is_test = bool(s.get("is_assessment"))
            else:
                t_low = title.lower()
                is_test = any(k in t_low for k in ("exit", "exam", "assessment", "evaluation")) or (t_low.startswith("test") or " test" in t_low)

            raw_p = s.get("platform") or s.get("test_platform")
            platform = str(raw_p).strip() if raw_p else None
            slot = TimetableSlot(
                schedule=schedule,
                sub_batch=sb_obj,
                stream=stream_obj,
                day_of_week=day_int,
                start_time=st,
                end_time=et,
                subject=sub_obj,
                title=title,
                lab=lab_obj,
                is_assessment=is_test,
                platform=platform,
            )
            created_slots.append(slot)

            target_batch = sb_obj.full_code if sb_obj else (stream_obj.name if stream_obj else cohort_code)
            sid = f"{target_batch}_{day_int}_{st.strftime('%H%M')}_{et.strftime('%H%M')}"
            central_items.append({
                "batch": target_batch,
                "weekday": day_int,
                "start": st.strftime("%H:%M"),
                "end": et.strftime("%H:%M"),
                "title": title,
                "location": lab_obj.name,
                "sid": sid,
            })

    # Format 2: Nested grid_data or dictionary payload structure
    elif isinstance(grid_data, dict) or isinstance(data.get("sub_batches"), dict) or isinstance(data.get("streams"), dict):
        base_dict = grid_data if isinstance(grid_data, dict) else {}
        sbs_dict = base_dict.get("sub_batches") or data.get("sub_batches") or {}
        if isinstance(sbs_dict, dict):
            for sb_code, days in sbs_dict.items():
                sb_obj = resolve_sb(sb_code)
                if not sb_obj:
                    batch_name = sb_code[0] if sb_code else "A"
                    batch_obj, _ = Batch.objects.get_or_create(cohort=schedule.cohort, name=batch_name)
                    sb_obj, _ = SubBatch.objects.get_or_create(batch=batch_obj, name=sb_code)
                    sb_map[sb_code.upper()] = sb_obj
                    sb_map[sb_obj.full_code.upper()] = sb_obj

                for day_code, slots in days.items():
                    day_int = DAY_TO_INT.get(str(day_code).lower(), 0)
                    for s in slots:
                        lab_obj = resolve_lab(s.get("location") or s.get("room") or "WA")
                        title = str(s.get("title") or "Incubator").strip()
                        st = parse_time(s.get("start", "08:30"), datetime.time(8, 30))
                        et = parse_time(s.get("end", "09:30"), datetime.time(9, 30))
                        sub_obj = resolve_subject(title)

                        # Determine if slot is an assessment (never match substring 'tr' which corrupts Stream and TR sessions)
                        if s.get("is_test") is not None:
                            is_test = bool(s.get("is_test"))
                        elif s.get("is_assessment") is not None:
                            is_test = bool(s.get("is_assessment"))
                        else:
                            t_low = title.lower()
                            is_test = any(k in t_low for k in ("exit", "exam", "assessment", "evaluation")) or (t_low.startswith("test") or " test" in t_low)

                        raw_p = s.get("platform") or s.get("test_platform")
                        platform = str(raw_p).strip() if raw_p else None

                        slot = TimetableSlot(
                            schedule=schedule,
                            sub_batch=sb_obj,
                            day_of_week=day_int,
                            start_time=st,
                            end_time=et,
                            subject=sub_obj,
                            title=title,
                            lab=lab_obj,
                            is_assessment=is_test,
                            platform=platform,
                        )
                        created_slots.append(slot)

                        target_batch = sb_obj.full_code
                        sid = f"{target_batch}_{day_int}_{st.strftime('%H%M')}_{et.strftime('%H%M')}"
                        central_items.append({
                            "batch": target_batch,
                            "weekday": day_int,
                            "start": st.strftime("%H:%M"),
                            "end": et.strftime("%H:%M"),
                            "title": title,
                            "location": lab_obj.name,
                            "sid": sid,
                        })

        streams_dict = base_dict.get("streams") or data.get("streams") or {}
        if isinstance(streams_dict, dict):
            for st_name, days in streams_dict.items():
                stream_obj = resolve_stream(st_name)
                # In case stream object has a 'days' dictionary
                day_items = days.get("days", days) if isinstance(days, dict) else days
                if not isinstance(day_items, dict):
                    continue
                for day_code, slots in day_items.items():
                    if day_code in ("count", "faculty", "backup_faculty", "name") or not isinstance(slots, list):
                        continue
                    day_int = DAY_TO_INT.get(str(day_code).lower(), 0)
                    for s in slots:
                        lab_obj = resolve_lab(s.get("room") or s.get("location") or "WA")
                        title = f"Stream: {st_name}"
                        # Parse dynamic stream start and end time instead of static 2:30 to 5:30
                        st = parse_time(s.get("start") or s.get("time"), datetime.time(14, 30))
                        default_et = datetime.time(min(st.hour + 1, 23), st.minute)
                        et = parse_time(s.get("end"), default_et)
                        slot = TimetableSlot(
                            schedule=schedule,
                            stream=stream_obj,
                            day_of_week=day_int,
                            start_time=st,
                            end_time=et,
                            title=title,
                            lab=lab_obj,
                            is_assessment=False,
                            platform=None,
                        )
                        created_slots.append(slot)

                        target_batch = stream_obj.name
                        sid = f"{target_batch}_{day_int}_{st.strftime('%H%M')}_{et.strftime('%H%M')}"
                        central_items.append({
                            "batch": target_batch,
                            "weekday": day_int,
                            "start": st.strftime("%H:%M"),
                            "end": et.strftime("%H:%M"),
                            "title": title,
                            "location": lab_obj.name,
                            "sid": sid,
                        })

    if created_slots:
        TimetableSlot.objects.bulk_create(created_slots, batch_size=500)

    # High speed atomic central.db bulk sync
    try:
        if central_items:
            central = get_central()
            central.bulk_upsert_slots(central_items)

            # Mark any stale slots in central.db for these batches as deleted
            new_sids = {item["sid"] for item in central_items if item.get("sid")}
            cohort_batches = {item["batch"] for item in central_items if item.get("batch")}
            if cohort_batches:
                with central.conn() as c:
                    ph = ",".join("?" for _ in cohort_batches)
                    rows = c.execute(
                        f"SELECT id FROM timetable_slots WHERE deleted=0 AND batch IN ({ph})",
                        list(cohort_batches)
                    ).fetchall()
                    stale_sids = [r[0] for r in rows if r[0] not in new_sids]
                    if stale_sids:
                        rev = central._bump(c)
                        c.executemany(
                            "UPDATE timetable_slots SET deleted=1, rev=? WHERE id=?",
                            [(rev, sid) for sid in stale_sids]
                        )

            notifier.sync_batch(cohort_code)
            notifier.sync_batch("*")
    except Exception:
        pass


class ScheduleListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsUserManagementStaff, ModuleAccessPermission]
    module_permission = "schedule"
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        schedules = Schedule.objects.all().select_related("cohort").prefetch_related("slots__lab", "slots__sub_batch", "slots__stream", "slots__subject").order_by("-is_active", "-effective_from", "-created_at")

        cohort_id = request.query_params.get("cohort_id") or request.query_params.get("cohort")
        if cohort_id:
            if str(cohort_id).isdigit():
                schedules = schedules.filter(cohort_id=int(cohort_id))
            else:
                schedules = schedules.filter(cohort__code__iexact=str(cohort_id))

        serializer = ScheduleSerializer(schedules, many=True)
        return Response(serializer.data)

    def post(self, request):
        data = request.data.copy()
        if request.user.is_authenticated:
            data["created_by"] = request.user.id

        cohort_id = data.get("cohort") or data.get("target_cohort")
        if not cohort_id:
            # Fallback to first active cohort or default B50
            cohort = Cohort.objects.filter(is_active=True).first() or Cohort.objects.first()
            if not cohort:
                cohort = Cohort.objects.create(code="B50", name="Ignite Cohort B50")
            data["cohort"] = cohort.id

        effective_from_raw = data.get("effective_from")
        effective_until_raw = data.get("effective_until")

        today = datetime.date.today()
        # Default effective_from to start of current week (Monday)
        if not effective_from_raw:
            monday = today - datetime.timedelta(days=today.weekday())
            data["effective_from"] = monday.isoformat()
            data["effective_until"] = (monday + datetime.timedelta(days=5)).isoformat()
        elif not effective_until_raw or effective_until_raw == effective_from_raw:
            try:
                ef_date = datetime.date.fromisoformat(str(effective_from_raw).split("T")[0])
                data["effective_until"] = (ef_date + datetime.timedelta(days=5)).isoformat()
            except Exception:
                pass

        if data.get("is_active", True):
            # Deactivate previous active schedules for this cohort
            Schedule.objects.filter(cohort_id=data["cohort"], is_active=True).update(is_active=False, status="ARCHIVED")
            data["is_active"] = True
            data["status"] = "PUBLISHED"

        serializer = ScheduleSerializer(data=data)
        if serializer.is_valid():
            schedule = serializer.save()
            _save_slots_from_payload(schedule, data)
            _create_schedule_broadcast(schedule, action_verb="Published", user=request.user)

            return Response(
                {
                    "message": f"Schedule '{schedule.title}' created and synchronized successfully.",
                    "data": ScheduleSerializer(schedule).data,
                },
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ScheduleDetailView(APIView):
    permission_classes = [IsAuthenticated, IsUserManagementStaff, ModuleAccessPermission]
    module_permission = "schedule"
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_object(self, pk):
        return Schedule.objects.filter(pk=pk).select_related("cohort").prefetch_related("slots__lab", "slots__sub_batch", "slots__stream", "slots__subject").first()

    def get(self, request, pk):
        schedule = self.get_object(pk)
        if not schedule:
            return Response({"error": "Schedule not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ScheduleSerializer(schedule)
        return Response(serializer.data)

    def put(self, request, pk):
        schedule = self.get_object(pk)
        if not schedule:
            return Response({"error": "Schedule not found"}, status=status.HTTP_404_NOT_FOUND)

        put_data = request.data.copy()
        ef_raw = put_data.get("effective_from")
        eu_raw = put_data.get("effective_until")
        if ef_raw and (not eu_raw or eu_raw == ef_raw):
            try:
                ef_date = datetime.date.fromisoformat(str(ef_raw).split("T")[0])
                put_data["effective_until"] = (ef_date + datetime.timedelta(days=5)).isoformat()
            except Exception:
                pass

        if put_data.get("is_active") is True:
            Schedule.objects.filter(cohort_id=schedule.cohort_id, is_active=True).exclude(pk=schedule.pk).update(is_active=False, status="ARCHIVED")
            put_data["status"] = "PUBLISHED"

        serializer = ScheduleSerializer(schedule, data=put_data, partial=True)
        if serializer.is_valid():
            instance = serializer.save()
            if "slots" in request.data or "grid_data" in request.data:
                _save_slots_from_payload(instance, request.data)
            if instance.status == "PUBLISHED" or put_data.get("is_active"):
                _create_schedule_broadcast(instance, action_verb="Updated", user=request.user)

            return Response(
                {
                    "message": "Schedule updated and synced successfully.",
                    "data": ScheduleSerializer(instance).data,
                }
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        schedule = self.get_object(pk)
        if not schedule:
            return Response({"error": "Schedule not found"}, status=status.HTTP_404_NOT_FOUND)
        cohort_code = schedule.cohort.code if schedule.cohort else None
        try:
            central = get_central()
            slots = schedule.slots.all()
            sids_to_del = []
            for sl in slots:
                b = sl.sub_batch.full_code if sl.sub_batch else (sl.stream.name if sl.stream else cohort_code)
                sid = f"{b}_{sl.day_of_week}_{sl.start_time.strftime('%H%M')}_{sl.end_time.strftime('%H%M')}"
                sids_to_del.append(sid)
            if sids_to_del:
                with central.conn() as c:
                    rev = central._bump(c)
                    c.executemany(
                        "UPDATE timetable_slots SET deleted=1, rev=? WHERE id=?",
                        [(rev, sid) for sid in sids_to_del]
                    )
        except Exception:
            pass

        schedule.delete()
        if cohort_code:
            notifier.sync_batch(cohort_code)
            notifier.sync_batch("*")
        return Response({"message": "Schedule deleted successfully"}, status=status.HTTP_200_OK)


class ScheduleActivateView(APIView):
    permission_classes = [IsAuthenticated, IsUserManagementStaff, ModuleAccessPermission]
    module_permission = "schedule"

    def post(self, request, pk):
        schedule = Schedule.objects.filter(pk=pk).first()
        if not schedule:
            return Response({"error": "Schedule not found"}, status=status.HTTP_404_NOT_FOUND)

        Schedule.objects.filter(cohort_id=schedule.cohort_id, is_active=True).exclude(pk=schedule.pk).update(is_active=False, status="ARCHIVED")
        schedule.is_active = True
        schedule.status = "PUBLISHED"
        schedule.save()

        if schedule.cohort:
            notifier.sync_batch(schedule.cohort.code)
        _create_schedule_broadcast(schedule, action_verb="Activated", user=request.user)

        return Response({
            "message": f"Schedule '{schedule.title}' is now active.",
            "data": ScheduleSerializer(schedule).data,
        })


class ScheduleParseExcelView(APIView):
    permission_classes = [IsAuthenticated, IsUserManagementStaff, ModuleAccessPermission]
    module_permission = "schedule"
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        excel_file = request.FILES.get("file") or request.FILES.get("excel_file")
        if not excel_file:
            return Response({"error": "Please upload an Excel timetable file (.xlsx)."}, status=status.HTTP_400_BAD_REQUEST)

        result = parse_schedule_excel(excel_file)
        if not result.get("success") and result.get("errors"):
            return Response({"error": result["errors"][0]}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)


class BatchTimetableLiveView(APIView):
    permission_classes = [IsAuthenticated, ModuleAccessPermission]
    module_permission = "schedule"

    def get(self, request):
        batch = request.query_params.get("batch", "*")
        rows = get_central().timetable(batch)
        return Response({"batch": batch, "slots": rows})


class TraineeCurrentSeatingView(APIView):
    """
    Answers: 'Where do I sit right now?' deterministically by querying active TimetableSlot.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sub_batch_code = request.query_params.get("sub_batch")
        if not sub_batch_code and request.user.is_authenticated and getattr(request.user, "sub_batch", None):
            sub_batch_code = request.user.sub_batch.name

        if not sub_batch_code:
            return Response({"error": "sub_batch is required (e.g. ?sub_batch=A1)"}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.localtime()
        weekday_int = now.weekday()
        current_time = now.time()

        slot = TimetableSlot.objects.filter(
            schedule__is_active=True,
            sub_batch__name__iexact=sub_batch_code,
            day_of_week=weekday_int,
            start_time__lte=current_time,
            end_time__gt=current_time,
        ).select_related("lab", "subject", "stream").first()

        if not slot:
            return Response({
                "status": "off_hours",
                "sub_batch": sub_batch_code,
                "message": f"No active lecture scheduled right now for {sub_batch_code}."
            })

        return Response({
            "status": "in_session",
            "sub_batch": sub_batch_code,
            "subject": slot.title or (slot.subject.name if slot.subject else "Lecture"),
            "location": slot.lab.name,
            "is_test": slot.is_assessment,
            "time_label": f"{slot.start_time.strftime('%H:%M')} - {slot.end_time.strftime('%H:%M')}",
            "message": f"Currently in session: {slot.title} in {slot.lab.name}.",
        })
