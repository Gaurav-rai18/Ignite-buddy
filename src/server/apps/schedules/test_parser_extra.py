"""
Extended unit tests for the schedules Excel parser (``parser.py``).

These tests exercise the standalone parser module directly (no DB, no HTTP):
  * ``normalize_time`` / ``parse_time_range`` helpers
  * ``parse_schedule_excel`` auto-detection + all three layouts
  * the TCS Ignite multi-sheet campus workbook parser
      (two-row / single-row sub-batches, TA mapping, proctoring, streams,
       fill-colour + keyword session classification, cohort detection)
  * malformed / empty / non-schedule inputs

Everything runs against in-memory workbooks (``io.BytesIO``); no files are
written to disk.
"""
import io

import openpyxl
from openpyxl.styles import PatternFill
from django.test import SimpleTestCase

from server.apps.schedules.parser import (
    normalize_time,
    parse_time_range,
    parse_schedule_excel,
)

EMPTY_GRID = {"mon": [], "tue": [], "wed": [], "thu": [], "fri": [], "sat": []}


def _book(builder):
    """Build a workbook in memory, run ``builder(wb)`` then return a BytesIO."""
    wb = openpyxl.Workbook()
    builder(wb)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def _solid(cell, rgb):
    cell.fill = PatternFill(start_color=rgb, end_color=rgb, fill_type="solid")


# ---------------------------------------------------------------------------
# normalize_time
# ---------------------------------------------------------------------------
class NormalizeTimeTests(SimpleTestCase):
    def test_empty_and_falsy_values(self):
        self.assertEqual(normalize_time(""), "")
        self.assertEqual(normalize_time(None), "")
        self.assertEqual(normalize_time(0), "")

    def test_already_normalized_passthrough(self):
        self.assertEqual(normalize_time("09:00"), "09:00")
        self.assertEqual(normalize_time("23:59"), "23:59")

    def test_single_digit_hour_is_padded(self):
        self.assertEqual(normalize_time("9:05"), "09:05")

    def test_am_pm_conversion(self):
        self.assertEqual(normalize_time("9am"), "09:00")
        self.assertEqual(normalize_time("3pm"), "15:00")
        self.assertEqual(normalize_time("12am"), "00:00")
        self.assertEqual(normalize_time("12pm"), "12:00")
        self.assertEqual(normalize_time("12:30 am"), "00:30")

    def test_whitespace_and_case_insensitive(self):
        self.assertEqual(normalize_time("  9 PM "), "21:00")
        self.assertEqual(normalize_time("10:15AM"), "10:15")

    def test_no_digits_falls_back_to_prefix(self):
        self.assertEqual(normalize_time("hello world"), "hello")
        self.assertEqual(normalize_time("ab"), "ab")

    def test_partial_minutes_are_not_matched(self):
        # ":5" is not two digits, so the minutes are dropped and hour kept.
        self.assertEqual(normalize_time("7:5"), "07:00")


# ---------------------------------------------------------------------------
# parse_time_range
# ---------------------------------------------------------------------------
class ParseTimeRangeTests(SimpleTestCase):
    def test_empty_returns_blank_pair(self):
        self.assertEqual(parse_time_range(""), ("", ""))

    def test_hyphen_separated_range(self):
        self.assertEqual(parse_time_range("09:00 - 10:30"), ("09:00", "10:30"))

    def test_compact_hyphen_range(self):
        self.assertEqual(parse_time_range("9:30-11:00"), ("09:30", "11:00"))

    def test_en_dash_range(self):
        self.assertEqual(parse_time_range("9am \u2013 5pm"), ("09:00", "17:00"))

    def test_em_dash_range(self):
        self.assertEqual(parse_time_range("9:00\u201410:00"), ("09:00", "10:00"))

    def test_word_to_range(self):
        self.assertEqual(parse_time_range("9am to 10:30am"), ("09:00", "10:30"))
        self.assertEqual(parse_time_range("11:00 to 12:00"), ("11:00", "12:00"))

    def test_single_value_has_empty_end(self):
        self.assertEqual(parse_time_range("09:00"), ("09:00", ""))
        self.assertEqual(parse_time_range("3pm"), ("15:00", ""))


# ---------------------------------------------------------------------------
# TCS Ignite campus workbook parser
# ---------------------------------------------------------------------------
def _ignite_slot_wb(wb, *, subject=None, room=None, subject_fill=None,
                    room_fill=None, cohort=None, ta_home_lab="Home Lab 1"):
    """Minimal Ignite workbook: one Schedule sheet with sub-batch A1 (two-row)."""
    ws = wb.active
    ws.title = "Schedule"
    if cohort is not None:
        ws["A1"] = cohort
    ws.cell(1, 2).value = "Monday"
    ws.cell(2, 2).value = "09:00 - 10:00"
    ws.cell(3, 1).value = "A1"
    if subject is not None:
        ws.cell(3, 2).value = subject
    if room is not None:
        ws.cell(4, 2).value = room
    if subject_fill is not None:
        _solid(ws.cell(3, 2), subject_fill)
    if room_fill is not None:
        _solid(ws.cell(4, 2), room_fill)

    ta = wb.create_sheet("TA mapping")
    ta.cell(3, 2).value = "B50"
    ta.cell(3, 3).value = "A"
    ta.cell(3, 4).value = "A1"
    ta.cell(3, 5).value = "TA Primary"
    ta.cell(3, 6).value = "TA Backup"
    ta.cell(3, 7).value = "Owner A"
    ta.cell(3, 8).value = ta_home_lab

    if subject is not None:
        p = wb.create_sheet("Proctoring List")
        p.cell(2, 4).value = subject
        p.cell(3, 3).value = "A1"
        p.cell(3, 4).value = "Invigilator"
    return ws


class IgniteWorkbookTests(SimpleTestCase):
    def test_full_workbook_two_row_layout_and_mappings(self):
        def build(wb):
            ws = wb.active
            ws.title = "Schedule"
            ws["A1"] = "Batch: B50"
            ws.cell(1, 2).value = "Monday"
            ws.cell(2, 2).value = "09:00 - 10:00"
            ws.cell(1, 3).value = "Tuesday"
            ws.cell(2, 3).value = "10:00 - 11:00"

            # Sub-batch A1 (two-row layout)
            ws.cell(3, 1).value = "A1"
            ws.cell(3, 2).value = "Incubator"
            ws.cell(4, 2).value = "Lab 1"
            ws.cell(3, 3).value = "Exit Test"
            ws.cell(4, 3).value = "TS Room"

            ta = wb.create_sheet("TA mapping")
            ta.cell(3, 2).value = "B50"
            ta.cell(3, 3).value = "A"
            ta.cell(3, 4).value = "A1"
            ta.cell(3, 5).value = "TA One"
            ta.cell(3, 6).value = "TA Two"
            ta.cell(3, 7).value = "Owner A"
            ta.cell(3, 8).value = "Home Lab 1"

            p = wb.create_sheet("Proctoring List")
            p.cell(2, 4).value = "Exit Test"
            p.cell(3, 3).value = "A1"
            p.cell(3, 4).value = "Invigilator X"

            sf = wb.create_sheet("Stream Faculty")
            sf.cell(2, 2).value = "AI"
            sf.cell(2, 3).value = "Dr Stream"
            sf.cell(2, 4).value = "Backup Stream"

            st = wb.create_sheet("Stream")
            st.cell(1, 3).value = "Monday"
            st.cell(2, 3).value = "14:30 - 17:30"
            st.cell(3, 1).value = "AI"
            st.cell(3, 3).value = "Lab 5"

        res = parse_schedule_excel(_book(build))

        self.assertTrue(res["success"])
        self.assertEqual(res["slot_count"], 2)
        self.assertEqual(res["cohort"], "B50")
        self.assertEqual(res["detected_cohort"], "B50")
        self.assertEqual(res["detected_batch"], "A")
        self.assertEqual(res["errors"], [])

        # Sub-batch A1 / Monday: plain incubator session -> self study in Lab 1
        mon = res["sub_batches"]["A1"]["mon"][0]
        self.assertEqual(mon["id"], "slot_a1_mon_0")
        self.assertEqual(mon["title"], "Incubator")
        self.assertEqual(mon["location"], "Lab 1")
        self.assertEqual(mon["session_type"], "self_study")
        self.assertFalse(mon["is_test"])
        self.assertEqual(mon["start"], "09:00")
        self.assertEqual(mon["end"], "10:00")
        self.assertEqual(mon["time_label"], "09:00 - 10:00")
        self.assertEqual(mon["batch"], "A")
        self.assertEqual(mon["color"], "none")
        self.assertEqual(mon["faculty"], "")
        self.assertEqual(mon["proctor"], "")

        # Sub-batch A1 / Tuesday: "Exit Test" + "TS Room" -> proctored test
        tue = res["sub_batches"]["A1"]["tue"][0]
        self.assertEqual(tue["id"], "slot_a1_tue_0")
        self.assertEqual(tue["title"], "Exit Test")
        self.assertEqual(tue["location"], "TS Room")
        self.assertTrue(tue["is_test"])
        self.assertEqual(tue["session_type"], "test")
        self.assertEqual(tue["proctor"], "Invigilator X")
        self.assertEqual(tue["start"], "10:00")
        self.assertEqual(tue["end"], "11:00")

        self.assertEqual(len(res["grid_data"]["mon"]), 1)
        self.assertEqual(len(res["grid_data"]["tue"]), 1)
        self.assertEqual(len(res["test_slots"]), 1)
        self.assertEqual(res["test_slots"][0]["title"], "Exit Test")

        self.assertEqual(res["batches"]["A"], {
            "name": "A", "cohort": "B50", "sub_batches": ["A1"],
        })

        self.assertEqual(res["ta_mapping"]["A1"], {
            "cohort": "B50", "batch": "A", "primary_ta": "TA One",
            "backup_ta": "TA Two", "owner": "Owner A", "home_lab": "Home Lab 1",
        })
        self.assertEqual(res["proctoring"]["A1"], {"Exit Test": "Invigilator X"})
        self.assertEqual(res["stream_faculty"]["AI"],
                         {"primary": "Dr Stream", "backup": "Backup Stream"})
        self.assertEqual(res["streams"]["AI"]["mon"][0], {
            "time": "14:30 - 17:30", "room": "Lab 5", "faculty": "Dr Stream",
        })

    def test_two_single_row_sub_batches_use_home_lab(self):
        def build(wb):
            ws = wb.active
            ws.title = "Schedule"
            ws.cell(1, 2).value = "Monday"
            ws.cell(2, 2).value = "09:00 - 10:00"
            ws.cell(3, 1).value = "A1"
            ws.cell(3, 2).value = "Incubator"
            ws.cell(4, 1).value = "A2"
            ws.cell(4, 2).value = "Incubator"

            ta = wb.create_sheet("TA mapping")
            ta.cell(3, 2).value = "B50"
            ta.cell(3, 4).value = "A1"
            ta.cell(3, 8).value = "Home Lab 1"

        res = parse_schedule_excel(_book(build))
        self.assertEqual(res["slot_count"], 2)
        # A1 has an explicit home lab from TA mapping
        self.assertEqual(res["sub_batches"]["A1"]["mon"][0]["location"], "Home Lab 1")
        # A2 has no mapping -> generic default
        self.assertEqual(res["sub_batches"]["A2"]["mon"][0]["location"], "Home Lab")

    def test_home_lab_default_when_no_mapping(self):
        res = parse_schedule_excel(_book(
            lambda wb: _ignite_slot_wb(wb, subject="Incubator",
                                       room=None, ta_home_lab=None)))
        slot = res["sub_batches"]["A1"]["mon"][0]
        self.assertEqual(slot["location"], "Home Lab")

    def test_only_room_defaults_subject_to_incubator(self):
        res = parse_schedule_excel(_book(
            lambda wb: _ignite_slot_wb(wb, subject=None, room="Lab 9")))
        slot = res["sub_batches"]["A1"]["mon"][0]
        self.assertEqual(slot["title"], "Incubator")
        self.assertEqual(slot["location"], "Lab 9")
        self.assertEqual(slot["session_type"], "self_study")

    def test_test_session_detected_by_subject_keyword_and_proctor(self):
        res = parse_schedule_excel(_book(
            lambda wb: _ignite_slot_wb(wb, subject="Exit Assessment", room="Lab 1")))
        slot = res["sub_batches"]["A1"]["mon"][0]
        self.assertTrue(slot["is_test"])
        self.assertEqual(slot["session_type"], "test")
        self.assertEqual(slot["proctor"], "Invigilator")
        self.assertEqual(slot["faculty"], "")

    def test_test_session_detected_by_ts_room(self):
        res = parse_schedule_excel(_book(
            lambda wb: _ignite_slot_wb(wb, subject="Workshop", room="TS-01")))
        slot = res["sub_batches"]["A1"]["mon"][0]
        self.assertTrue(slot["is_test"])
        self.assertEqual(slot["session_type"], "test")

    def test_faculty_session_detected_by_tr_room_and_ta(self):
        res = parse_schedule_excel(_book(
            lambda wb: _ignite_slot_wb(wb, subject="Lecture", room="TR-01")))
        slot = res["sub_batches"]["A1"]["mon"][0]
        self.assertFalse(slot["is_test"])
        self.assertEqual(slot["session_type"], "faculty")
        self.assertEqual(slot["faculty"], "TA Primary")

    def test_session_type_from_fill_colours(self):
        cases = {
            "FF64B5F6": "faculty",
            "FF81C784": "in_place",
            "FFFFB74D": "test",
        }
        for rgb, expected in cases.items():
            with self.subTest(rgb=rgb):
                res = parse_schedule_excel(_book(
                    lambda wb, rgb=rgb: _ignite_slot_wb(
                        wb, subject="Lecture", room="Lab 1", subject_fill=rgb)))
                slot = res["sub_batches"]["A1"]["mon"][0]
                self.assertEqual(slot["session_type"], expected)
                self.assertEqual(slot["color"], rgb)
                self.assertEqual(slot["is_test"], expected == "test")

    def test_session_type_from_room_fill_colour(self):
        res = parse_schedule_excel(_book(
            lambda wb: _ignite_slot_wb(wb, subject="Lecture", room="Lab 1",
                                       room_fill="FF64B5F6")))
        slot = res["sub_batches"]["A1"]["mon"][0]
        self.assertEqual(slot["session_type"], "faculty")
        self.assertEqual(slot["color"], "FF64B5F6")

    def test_stream_session_uses_stream_faculty(self):
        def build(wb):
            _ignite_slot_wb(wb, subject="Stream", room="Lab 1")
            sf = wb.create_sheet("Stream Faculty")
            sf.cell(2, 2).value = "Stream"
            sf.cell(2, 3).value = "Stream Lead"

        res = parse_schedule_excel(_book(build))
        slot = res["sub_batches"]["A1"]["mon"][0]
        self.assertEqual(slot["session_type"], "stream")
        self.assertEqual(slot["faculty"], "Stream Lead")

    def test_empty_merged_sub_batch_block_above_data(self):
        def build(wb):
            ws = wb.active
            ws.title = "Schedule"
            ws.cell(1, 2).value = "Monday"
            ws.cell(2, 2).value = "09:00 - 10:00"
            # Empty merged block occupying the sub-batch column (rows 3-4)
            ws.merge_cells(start_row=3, start_column=1, end_row=4, end_column=1)
            # Real sub-batch starts below the merged block
            ws.cell(5, 1).value = "A1"
            ws.cell(5, 2).value = "Incubator"
            ws.cell(6, 2).value = "Lab 1"

        res = parse_schedule_excel(_book(build))
        self.assertEqual(res["slot_count"], 1)
        slot = res["sub_batches"]["A1"]["mon"][0]
        self.assertEqual(slot["title"], "Incubator")
        self.assertEqual(slot["location"], "Lab 1")

    def test_merged_sub_batch_cells_are_unfolded(self):
        def build(wb):
            ws = wb.active
            ws.title = "Schedule"
            ws.cell(1, 2).value = "Monday"
            ws.cell(2, 2).value = "09:00 - 10:00"
            ws.cell(3, 1).value = "A1"
            ws.merge_cells(start_row=3, start_column=1, end_row=4, end_column=1)
            ws.cell(3, 2).value = "Incubator"
            ws.cell(4, 2).value = "Lab 1"

        res = parse_schedule_excel(_book(build))
        self.assertEqual(res["slot_count"], 1)
        slot = res["sub_batches"]["A1"]["mon"][0]
        self.assertEqual(slot["title"], "Incubator")
        self.assertEqual(slot["location"], "Lab 1")

    def test_cohort_defaults_to_b50_when_absent(self):
        res = parse_schedule_excel(_book(
            lambda wb: _ignite_slot_wb(wb, subject="Incubator", room="Lab 1",
                                       cohort=None)))
        self.assertEqual(res["cohort"], "B50")

    def test_cohort_label_without_known_pattern_kept_as_is(self):
        res = parse_schedule_excel(_book(
            lambda wb: _ignite_slot_wb(wb, subject="Incubator", room="Lab 1",
                                       cohort="Ignite")))
        self.assertEqual(res["cohort"], "Ignite")

    def test_cohort_label_pattern_is_upper_cased(self):
        res = parse_schedule_excel(_book(
            lambda wb: _ignite_slot_wb(wb, subject="Incubator", room="Lab 1",
                                       cohort="Cohort 7")))
        self.assertEqual(res["cohort"], "COHORT 7")

    def test_non_time_slot_label_defaults_to_one_hour(self):
        def build(wb):
            ws = wb.active
            ws.title = "Schedule"
            ws.cell(1, 2).value = "Monday"
            ws.cell(2, 2).value = "Slot A"
            ws.cell(3, 1).value = "A1"
            ws.cell(3, 2).value = "Incubator"
            ws.cell(4, 2).value = "Lab 1"

        res = parse_schedule_excel(_book(build))
        slot = res["sub_batches"]["A1"]["mon"][0]
        self.assertEqual(slot["start"], "09:00")
        self.assertEqual(slot["end"], "10:00")
        self.assertEqual(slot["time_label"], "Slot A")

    def test_end_time_wraps_at_midnight(self):
        def build(wb):
            ws = wb.active
            ws.title = "Schedule"
            ws.cell(1, 2).value = "Monday"
            ws.cell(2, 2).value = "23:30 - 00:30"
            ws.cell(3, 1).value = "A1"
            ws.cell(3, 2).value = "Incubator"
            ws.cell(4, 2).value = "Lab 1"

        res = parse_schedule_excel(_book(build))
        slot = res["sub_batches"]["A1"]["mon"][0]
        self.assertEqual(slot["start"], "23:30")
        self.assertEqual(slot["end"], "00:30")

    def test_unknown_weekday_column_is_ignored(self):
        def build(wb):
            ws = wb.active
            ws.title = "Schedule"
            ws.cell(1, 2).value = "Sunday"   # not in WEEKDAY_MAP -> skipped
            ws.cell(2, 2).value = "09:00 - 10:00"
            ws.cell(1, 3).value = "Monday"
            ws.cell(2, 3).value = "09:00 - 10:00"
            ws.cell(3, 1).value = "A1"
            ws.cell(3, 2).value = "Ignored"
            ws.cell(4, 2).value = "Lab X"
            ws.cell(3, 3).value = "Incubator"
            ws.cell(4, 3).value = "Lab 1"

        res = parse_schedule_excel(_book(build))
        self.assertEqual(res["slot_count"], 1)
        self.assertIn("mon", res["grid_data"])
        self.assertNotIn("sun", res["grid_data"])
        self.assertEqual(res["sub_batches"]["A1"]["mon"][0]["title"], "Incubator")

    def test_merged_day_header_time_variants_and_trailing_rows(self):
        def build(wb):
            ws = wb.active
            ws.title = "Schedule"
            # Merged day header spanning two slot columns
            ws.cell(1, 2).value = "Monday"
            ws.merge_cells(start_row=1, start_column=2, end_row=1, end_column=3)
            ws.cell(2, 2).value = "02:00 pm"
            ws.cell(2, 3).value = "12:00 am"
            # Day header with no slot row -> skipped column
            ws.cell(1, 4).value = "Wednesday"

            ws.cell(3, 1).value = "A1"
            ws.cell(3, 2).value = "Session A"
            ws.cell(4, 2).value = "Lab 1"
            ws.cell(3, 3).value = "Session B"
            ws.cell(4, 3).value = "Lab 2"
            # Non sub-batch trailing row -> exercises the loop's else branch
            ws.cell(5, 6).value = "trailing note"

        res = parse_schedule_excel(_book(build))
        self.assertEqual(res["slot_count"], 2)
        mon = res["sub_batches"]["A1"]["mon"]
        self.assertEqual(mon[0]["title"], "Session A")
        self.assertEqual(mon[0]["start"], "14:00")
        self.assertEqual(mon[0]["end"], "15:00")
        self.assertEqual(mon[1]["title"], "Session B")
        self.assertEqual(mon[1]["start"], "00:00")
        self.assertEqual(mon[1]["end"], "01:00")

    def test_empty_schedule_sheet(self):
        def build(wb):
            wb.active.title = "Schedule"

        res = parse_schedule_excel(_book(build))
        self.assertFalse(res["success"])
        self.assertEqual(res["slot_count"], 0)
        self.assertEqual(res["detected_batch"], "")
        self.assertEqual(res["cohort"], "B50")
        self.assertEqual(res["errors"], [])


# ---------------------------------------------------------------------------
# Standard weekday matrix layout (Strategy A)
# ---------------------------------------------------------------------------
def _matrix_wb(wb):
    ws = wb.active
    ws.title = "Grid"
    ws.cell(1, 1).value = "Time"
    ws.cell(1, 2).value = "Monday"
    ws.cell(1, 3).value = "Tuesday"
    ws.cell(1, 4).value = "Wednesday"
    ws.cell(1, 6).value = "Batch: A"
    ws.cell(2, 6).value = "Cohort: B50"

    ws.cell(2, 1).value = "09:00 - 10:00"
    ws.cell(2, 2).value = "Math\nRoom 101\nProf. Smith"
    ws.cell(2, 3).value = "Physics"
    ws.cell(2, 4).value = "-"

    ws.cell(3, 1).value = "08:00 - 09:00"
    ws.cell(3, 2).value = "Early Class"
    ws.cell(3, 3).value = "Lunch"

    ws.cell(4, 1).value = "11:00 - 12:00"
    ws.cell(4, 2).value = "Exit Exam"
    ws.cell(4, 3).value = "Break"
    ws.cell(4, 4).value = "N/A"

    # An all-empty spacer row (row 5) is skipped by the layout loop; row 6 only
    # extends the used range so the spacer row is actually emitted by openpyxl.
    ws.cell(6, 1).value = "13:00 - 14:00"


class MatrixLayoutTests(SimpleTestCase):
    def setUp(self):
        self.res = parse_schedule_excel(_book(_matrix_wb))

    def test_slots_are_grouped_and_sorted_by_start(self):
        self.assertTrue(self.res["success"])
        self.assertEqual(self.res["slot_count"], 4)
        mon = self.res["grid_data"]["mon"]
        self.assertEqual([s["title"] for s in mon],
                         ["Early Class", "Math", "Exit Exam"])
        self.assertEqual([s["start"] for s in mon], ["08:00", "09:00", "11:00"])

    def test_multi_line_cell_parses_subject_room_faculty(self):
        math = self.res["grid_data"]["mon"][1]
        self.assertEqual(math["title"], "Math")
        self.assertEqual(math["location"], "Room 101")
        self.assertEqual(math["faculty"], "Prof. Smith")
        self.assertEqual(math["session_type"], "faculty")
        self.assertEqual(math["start"], "09:00")
        self.assertEqual(math["end"], "10:00")
        self.assertTrue(math["id"].startswith("slot_"))

    def test_bare_cell_defaults_to_home_lab_self_study(self):
        phys = self.res["grid_data"]["tue"][0]
        self.assertEqual(phys["title"], "Physics")
        self.assertEqual(phys["location"], "Home Lab")
        self.assertEqual(phys["session_type"], "self_study")
        self.assertFalse(phys["is_test"])

    def test_test_keyword_flags_slot(self):
        exam = self.res["grid_data"]["mon"][2]
        self.assertTrue(exam["is_test"])
        self.assertEqual(exam["session_type"], "test")

    def test_skip_tokens_are_dropped(self):
        self.assertEqual(self.res["grid_data"]["wed"], [])
        self.assertNotIn("Lunch", [s["title"] for s in self.res["grid_data"]["tue"]])

    def test_batch_and_cohort_labels_detected(self):
        self.assertEqual(self.res["detected_batch"], "A")
        self.assertEqual(self.res["detected_cohort"], "B50")


# ---------------------------------------------------------------------------
# Row-by-row layout (Strategy B)
# ---------------------------------------------------------------------------
class RowLayoutTests(SimpleTestCase):
    def test_start_and_end_columns(self):
        def build(wb):
            ws = wb.active
            ws.title = "Rows"
            ws.cell(1, 1).value = "Batch: A"
            ws.cell(1, 2).value = "Cohort: B50"
            ws.cell(2, 1).value = "Day"
            ws.cell(2, 2).value = "Start"
            ws.cell(2, 3).value = "End"
            ws.cell(2, 4).value = "Subject"
            ws.cell(2, 5).value = "Room"
            ws.cell(2, 6).value = "Faculty"

            ws.cell(3, 1).value = "Monday"
            ws.cell(3, 2).value = "9am"
            ws.cell(3, 3).value = "10am"
            ws.cell(3, 4).value = "Incubator"
            ws.cell(3, 5).value = "Lab 2"
            ws.cell(3, 6).value = "Trainer T"

            ws.cell(4, 1).value = "Tuesday"
            ws.cell(4, 2).value = "11:00"
            ws.cell(4, 3).value = "12:00"
            ws.cell(4, 4).value = "IO Exit Assessment"
            ws.cell(4, 5).value = "Lab 2"
            ws.cell(4, 6).value = ""

            ws.cell(5, 1).value = "Sunday"   # unknown day -> skipped
            ws.cell(5, 2).value = "13:00"
            ws.cell(5, 3).value = "14:00"
            ws.cell(5, 4).value = "Rest"

            # All-empty spacer row (row 6) is skipped; row 7 extends the range.
            ws.cell(7, 1).value = "---"

        res = parse_schedule_excel(_book(build))

        self.assertTrue(res["success"])
        self.assertEqual(res["slot_count"], 2)
        self.assertEqual(res["detected_batch"], "A")
        self.assertEqual(res["detected_cohort"], "B50")
        self.assertNotIn("sun", res["grid_data"])

        mon = res["grid_data"]["mon"][0]
        self.assertEqual(mon["title"], "Incubator")
        self.assertEqual(mon["start"], "09:00")
        self.assertEqual(mon["end"], "10:00")
        self.assertEqual(mon["location"], "Lab 2")
        self.assertEqual(mon["faculty"], "Trainer T")
        self.assertEqual(mon["session_type"], "faculty")

        tue = res["grid_data"]["tue"][0]
        self.assertEqual(tue["title"], "IO Exit Assessment")
        self.assertTrue(tue["is_test"])
        self.assertEqual(tue["session_type"], "test")

    def test_time_range_column(self):
        def build(wb):
            ws = wb.active
            ws.title = "Rows2"
            ws.cell(1, 1).value = "Day"
            ws.cell(1, 2).value = "Timing"
            ws.cell(1, 3).value = "Subject"
            ws.cell(2, 1).value = "Wednesday"
            ws.cell(2, 2).value = "14:30 - 17:30"
            ws.cell(2, 3).value = "AI Stream"

        res = parse_schedule_excel(_book(build))
        slot = res["grid_data"]["wed"][0]
        self.assertEqual(slot["title"], "AI Stream")
        self.assertEqual(slot["start"], "14:30")
        self.assertEqual(slot["end"], "17:30")
        self.assertEqual(slot["location"], "Home Lab")
        self.assertEqual(slot["session_type"], "self_study")

    def test_missing_subject_header_defaults_to_lecture(self):
        def build(wb):
            ws = wb.active
            ws.title = "Rows3"
            ws.cell(1, 1).value = "Day"
            ws.cell(1, 2).value = "Room"
            ws.cell(2, 1).value = "Monday"
            ws.cell(2, 2).value = "Lab 3"

        res = parse_schedule_excel(_book(build))
        slot = res["grid_data"]["mon"][0]
        self.assertEqual(slot["title"], "Lecture")
        self.assertEqual(slot["location"], "Lab 3")
        self.assertEqual(slot["start"], "09:00")
        self.assertEqual(slot["end"], "10:30")

    def test_header_without_data_rows(self):
        def build(wb):
            ws = wb.active
            ws.title = "Rows4"
            ws.cell(1, 1).value = "Day"
            ws.cell(1, 2).value = "Subject"

        res = parse_schedule_excel(_book(build))
        self.assertFalse(res["success"])
        self.assertEqual(res["slot_count"], 0)
        self.assertEqual(res["errors"], [])


# ---------------------------------------------------------------------------
# Malformed / non-schedule inputs
# ---------------------------------------------------------------------------
class ParserErrorTests(SimpleTestCase):
    def test_invalid_bytes_returns_error(self):
        res = parse_schedule_excel(io.BytesIO(b"this is definitely not an excel file"))
        self.assertFalse(res["success"])
        self.assertEqual(res["slot_count"], 0)
        self.assertEqual(res["grid_data"], EMPTY_GRID)
        self.assertEqual(len(res["errors"]), 1)
        self.assertTrue(res["errors"][0].startswith("Could not read Excel file:"))

    def test_empty_workbook_returns_no_slots(self):
        # NOTE: the parser's "Worksheet is empty" branch is effectively
        # unreachable, because the preceding ``c1_sample`` / ``r1_sample``
        # loops call ``ws.cell(...)`` which materialises cells, so
        # ``iter_rows()`` never yields an empty list. An empty workbook thus
        # falls through the layout detection and returns zero slots.
        res = parse_schedule_excel(_book(lambda wb: None))
        self.assertFalse(res["success"])
        self.assertEqual(res["slot_count"], 0)
        self.assertEqual(res["grid_data"], EMPTY_GRID)
        self.assertEqual(res["errors"], [])

    def test_non_schedule_sheet_returns_no_slots(self):
        def build(wb):
            wb.active.title = "Notes"
            wb.active.cell(1, 1).value = "Hello World"

        res = parse_schedule_excel(_book(build))
        self.assertFalse(res["success"])
        self.assertEqual(res["slot_count"], 0)
        self.assertEqual(res["errors"], [])


# ---------------------------------------------------------------------------
# Auto-detection routing
# ---------------------------------------------------------------------------
class RoutingTests(SimpleTestCase):
    def test_sub_batch_column_and_weekday_row_route_to_ignite_parser(self):
        # No "Schedule" sheet, but column 1 holds sub-batch codes and row 1
        # holds weekday names -> the Ignite parser must be selected.
        def build(wb):
            ws = wb.active
            ws.title = "Data"
            ws.cell(1, 2).value = "Monday"
            ws.cell(1, 3).value = "Tuesday"
            ws.cell(2, 2).value = "09:00 - 10:00"
            ws.cell(2, 3).value = "10:00 - 11:00"
            ws.cell(3, 1).value = "A1"
            ws.cell(3, 2).value = "Incubator"
            ws.cell(4, 2).value = "Lab 1"

        res = parse_schedule_excel(_book(build))
        self.assertTrue(res["success"])
        self.assertEqual(res["slot_count"], 1)
        self.assertEqual(res["cohort"], "B50")
        self.assertEqual(res["grid_data"]["mon"][0]["title"], "Incubator")
        self.assertEqual(res["grid_data"]["mon"][0]["location"], "Lab 1")
