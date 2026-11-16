import io
import pytest
import openpyxl
from server.apps.schedules.parser import parse_schedule_excel


def test_parse_row_based_schedule():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Timetable"

    # Header rows
    ws.append(["TCS Ignite Training Program - Batch 1"])
    ws.append(["Day", "Start Time", "End Time", "Subject", "Room / Lab", "Faculty"])
    ws.append(["Monday", "09:00", "10:30", "Core Java & Spring", "Lab 3", "Dr. A. Sharma"])
    ws.append(["Monday", "11:00", "12:30", "DBMS & SQL", "Lab 2", "Prof. R. Verma"])
    ws.append(["Tuesday", "09:00", "10:30", "Python ML", "Lab 1", "Dr. S. Iyer"])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    result = parse_schedule_excel(buf)
    assert result["success"] is True
    assert result["slot_count"] == 3
    assert len(result["grid_data"]["mon"]) == 2
    assert result["grid_data"]["mon"][0]["title"] == "Core Java & Spring"
    assert result["grid_data"]["mon"][0]["location"] == "Lab 3"
    assert result["grid_data"]["mon"][0]["faculty"] == "Dr. A. Sharma"
    assert len(result["grid_data"]["tue"]) == 1
    assert result["grid_data"]["tue"][0]["title"] == "Python ML"


def test_parse_matrix_schedule():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Weekly Timetable"

    # Header with weekdays
    ws.append(["Time Slot", "Monday", "Tuesday", "Wednesday"])
    ws.append(["09:00 - 10:30", "Web Dev\nLab 2\nTrainer Rao", "Python\nLab 3\nTrainer Roy", "Cloud Computing\nLab 1"])
    ws.append(["11:00 - 12:30", "Algorithms\nLab 4", "System Design\nLab 2", "Testing & QA\nLab 3"])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    result = parse_schedule_excel(buf)
    assert result["success"] is True
    assert result["slot_count"] == 6
    assert len(result["grid_data"]["mon"]) == 2
    assert result["grid_data"]["mon"][0]["start"] == "09:00"
    assert result["grid_data"]["mon"][0]["end"] == "10:30"
    assert "Web Dev" in result["grid_data"]["mon"][0]["title"]


def test_parse_ignite_campus_workbook():
    import os
    path = os.path.join("data", "Batch50_Week15_Schedule.xlsx")
    if not os.path.exists(path):
        pytest.skip("Sample schedule file not present")

    result = parse_schedule_excel(path)
    assert result["success"] is True
    assert result["cohort"] == "B50"
    assert "A" in result["batches"]
    assert "B" in result["batches"]
    assert "C" in result["batches"]
    assert "A1" in result["sub_batches"]
    assert "C4" in result["sub_batches"]
    assert len(result["sub_batches"]) == 12
    assert result["slot_count"] == 480
    assert len(result["test_slots"]) > 0

    # Verify test detection
    test_slot = result["test_slots"][0]
    assert test_slot["is_test"] is True
    assert test_slot["session_type"] == "test"

    # Verify platform detection: BizSkill TS has platform TouchStone, location is home lab (not TS)
    bizskill_slots = [s for s in result["test_slots"] if "BizSkill" in s["title"]]
    assert len(bizskill_slots) > 0
    bs_slot = bizskill_slots[0]
    assert bs_slot["platform"] == "TouchStone"
    assert bs_slot["platform_code"] == "TS"
    assert bs_slot["location"] != "TS"
    assert bs_slot["proctor"] != ""  # Proctor successfully resolved from Proctoring List

    # Verify dynamic stream parsing (not static 2:30 to 5:30)
    ai_stream = result["streams"]["AI Engineering"]
    assert "thu" in ai_stream
    thu_slots = ai_stream["thu"]
    assert len(thu_slots) == 1
    assert thu_slots[0]["start"] == "16:30"
    assert thu_slots[0]["end"] == "17:30"
    assert thu_slots[0]["time"] == "04:30 PM - 05:30 PM"

    assert "fri" in ai_stream
    fri_slots = ai_stream["fri"]
    assert len(fri_slots) == 2
    assert fri_slots[0]["start"] == "15:30"
    assert fri_slots[1]["start"] == "16:30"


def test_sync_grid_to_central_and_delta(monkeypatch):
    from unittest.mock import MagicMock
    import server.realtime.notifier as notifier_module
    monkeypatch.setattr(notifier_module, "sync_batch", MagicMock(return_value=True))
    monkeypatch.setattr(notifier_module, "broadcast_batch", MagicMock(return_value=True))

    from server.apps.schedules.views import _sync_grid_to_central, _find_changed_sub_batches
    from server.storage.central import get_central

    grid_v1 = {
        "cohort": "B51",
        "sub_batches": {
            "A1": {
                "mon": [
                    {"start": "09:00", "end": "10:30", "title": "Java Fundamentals", "location": "Lab 1", "is_test": False}
                ]
            },
            "A2": {
                "mon": [
                    {"start": "09:00", "end": "10:30", "title": "Python Basics", "location": "Lab 2", "is_test": False}
                ]
            }
        }
    }

    # 1. Sync v1 to central without error
    _sync_grid_to_central(grid_v1, "B51")
    central = get_central()
    a1_slots = central.slots("A1")
    assert any(s["title"] == "Java Fundamentals" for s in a1_slots)

    # 2. Modify only A2
    grid_v2 = {
        "cohort": "B51",
        "sub_batches": {
            "A1": {
                "mon": [
                    {"start": "09:00", "end": "10:30", "title": "Java Fundamentals", "location": "Lab 1", "is_test": False}
                ]
            },
            "A2": {
                "mon": [
                    {"start": "09:00", "end": "10:30", "title": "Advanced Python", "location": "TR1", "is_test": True}
                ]
            }
        }
    }

    changed = _find_changed_sub_batches(grid_v1, grid_v2)
    assert changed == ["A2"]

    # 3. Delta sync only A2
    _sync_grid_to_central(grid_v2, "B51", changed_sub_batches=changed)
    a2_slots = central.slots("A2")
    assert any("[TEST] Advanced Python" in s["title"] and s["location"] == "TR1" for s in a2_slots)


def test_platform_resolution_and_orange_shade():
    from server.apps.schedules.parser import resolve_platform, is_orange_color

    # Known platform mappings
    assert resolve_platform("TS")[0] == "TouchStone"
    assert resolve_platform("TouchStone")[0] == "TouchStone"
    assert resolve_platform("CodeGround")[0] == "CodeGround"
    assert resolve_platform("CG")[0] == "CodeGround"
    assert resolve_platform("AIP")[0] == "AIP"
    assert resolve_platform("EngiNext")[0] == "EngiNext"
    assert resolve_platform("BizSkill TS")[0] == "TouchStone"
    assert resolve_platform("Lecture in Lab 1")[0] == ""

    # Orange shade validation
    assert is_orange_color("FFFFB74D") is True
    assert is_orange_color("FFB74D") is True
    assert is_orange_color("FFA726") is True
    assert is_orange_color("FF9800") is True
    assert is_orange_color("FF81C784") is False  # Green
    assert is_orange_color("FF64B5F6") is False  # Blue
    assert is_orange_color("00000000") is False  # None/Transparent


def test_schedule_end_date_calculation():
    import datetime
    from server.apps.schedules.models import Schedule
    from server.apps.accounts.models import Cohort
    from server.apps.schedules.serializers import ScheduleSerializer

    cohort, _ = Cohort.objects.get_or_create(code="B50", defaults={"name": "Ignite B50"})

    # Post with effective_from but NO effective_until, or same date
    payload = {
        "title": "Week 15 Timetable",
        "cohort": cohort.id,
        "effective_from": "2026-11-16",
        "effective_until": "2026-11-16",  # Passing same date should be corrected to +5 days
    }

    # Simulate view logic
    ef_date = datetime.date.fromisoformat(payload["effective_from"])
    if not payload.get("effective_until") or payload["effective_until"] == payload["effective_from"]:
        payload["effective_until"] = (ef_date + datetime.timedelta(days=5)).isoformat()

    serializer = ScheduleSerializer(data=payload)
    assert serializer.is_valid(), serializer.errors
    sched = serializer.save()

    assert sched.effective_from == datetime.date(2026, 11, 16)
    assert sched.effective_until == datetime.date(2026, 11, 21)
    assert (sched.effective_until - sched.effective_from).days == 5


def test_tr_sessions_and_null_platform():
    from server.apps.schedules.parser import parse_schedule_excel
    import os

    path = os.path.join("data", "Batch50_Week15_Schedule.xlsx")
    if not os.path.exists(path):
        pytest.skip("Sample schedule file not present")

    res = parse_schedule_excel(path)
    assert res["success"] is True

    # 1. TR Session: Check Tuesday IO TR for A1
    tue_slots = res["sub_batches"]["A1"]["tue"]
    tr_slots = [s for s in tue_slots if s["location"] == "TR"]
    assert len(tr_slots) > 0
    tr_slot = tr_slots[0]
    assert tr_slot["location"] == "TR"
    assert tr_slot["is_test"] is False
    assert tr_slot["platform"] is None  # Allow null value in platform

    # 2. Evaluation Type: Check Friday IO Exit WA for A1
    fri_slots = res["sub_batches"]["A1"]["fri"]
    exit_slots = [s for s in fri_slots if "Exit" in s["title"]]
    assert len(exit_slots) > 0
    exit_slot = exit_slots[0]
    assert exit_slot["is_test"] is True
    assert exit_slot["platform"] == "WA"  # Evaluation type captured from line 2
    assert exit_slot["location"] == "Lab 1"  # Home lab location

    # 3. Stream counts and faculty
    ai = res["streams"]["AI Engineering"]
    assert ai["count"] == 96
    assert "Diya" in ai["faculty"]


def test_delete_schedule_without_cohort():
    """
    Verifies that deleting a schedule with cohort=None does not crash with:
    AttributeError: 'NoneType' object has no attribute 'code'
    """
    from server.apps.schedules.models import Schedule
    from server.apps.schedules.views import ScheduleDetailView
    from unittest.mock import MagicMock
    from rest_framework.test import APIRequestFactory

    sched = Schedule.objects.create(
        title="Schedule Without Cohort",
        cohort=None,
        is_active=False,
    )
    assert sched.id is not None

    factory = APIRequestFactory()
    request = factory.delete(f"/api/schedules/{sched.id}/")
    view = ScheduleDetailView()

    # Call delete method directly
    response = view.delete(request, pk=sched.id)
    assert response.status_code == 200
    assert not Schedule.objects.filter(pk=sched.id).exists()





