"""
Timetable Excel Parser
Parses campus schedules from Excel workbooks into normalized JSON grid formats.
Supports:
  1. TCS Ignite Multi-Sheet Campus Workbooks (Schedule, Stream, Faculty, TA Mapping, Proctoring).
  2. Sub-batch and batch-wise matrix schedules with interleaved or single-row layouts.
  3. Row-based lecture lists.
  4. Standard weekday matrix grids.
"""
import re
import uuid
import openpyxl

WEEKDAY_MAP = {
    "monday": "mon", "mon": "mon", "m": "mon",
    "tuesday": "tue", "tue": "tue", "tues": "tue", "t": "tue",
    "wednesday": "wed", "wed": "wed", "w": "wed",
    "thursday": "thu", "thu": "thu", "thur": "thu", "thurs": "thu", "th": "thu",
    "friday": "fri", "fri": "fri", "f": "fri",
    "saturday": "sat", "sat": "sat", "s": "sat",
}

TIME_PATTERN = re.compile(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", re.IGNORECASE)

KNOWN_PLATFORMS = {
    "ts": "TouchStone",
    "touchstone": "TouchStone",
    "touch stone": "TouchStone",
    "codeground": "CodeGround",
    "code ground": "CodeGround",
    "cg": "CodeGround",
    "aip": "AIP",
    "enginext": "EngiNext",
    "engi next": "EngiNext",
    "mettl": "Mettl",
    "hackerrank": "HackerRank",
}

PLATFORM_PATTERN = re.compile(
    r"\b(TouchStone|CodeGround|EngiNext|AIP|Touch\s*Stone|Code\s*Ground|Engi\s*Next|Mettl|HackerRank|TS|CG)\b",
    re.IGNORECASE,
)


def is_orange_color(color_hex: str | None) -> bool:
    """Detects whether an openpyxl fill color represents an orange/amber assessment shade."""
    if not color_hex:
        return False
    hex_clean = str(color_hex).upper().strip()
    if len(hex_clean) == 8:
        hex_clean = hex_clean[2:]
    if len(hex_clean) != 6:
        return False
    known_oranges = {
        "FFB74D", "FFA726", "FF9800", "FB8C00", "F57C00", "EF6C00", "E65100",
        "FFCC80", "FFE0B2", "FFF3E0", "FFD54F", "FFCA28", "FFC107", "FFB300",
        "FFA000", "FF8F00", "FF6F00", "F57F17", "FF8A65", "FF7043", "FF5722",
    }
    if hex_clean in known_oranges:
        return True
    try:
        r = int(hex_clean[0:2], 16)
        g = int(hex_clean[2:4], 16)
        b = int(hex_clean[4:6], 16)
        return r >= 200 and 90 <= g <= 215 and b <= 140 and r > g and g > b
    except Exception:
        return False


def resolve_platform(raw_str: str) -> tuple[str, str]:
    """
    Identifies test platforms like TouchStone (TS), CodeGround, AIP, EngiNext, etc.
    Returns (platform_name, platform_code).
    """
    if not raw_str:
        return "", ""
    s_clean = str(raw_str).strip()
    s_lower = s_clean.lower()

    if s_lower in KNOWN_PLATFORMS:
        norm = KNOWN_PLATFORMS[s_lower]
        code = "TS" if norm == "TouchStone" else ("CG" if norm == "CodeGround" else norm)
        return norm, code

    match = PLATFORM_PATTERN.search(s_clean)
    if match:
        key = match.group(1).lower().replace(" ", "")
        norm = KNOWN_PLATFORMS.get(key, match.group(1).strip())
        code = match.group(1).strip()
        return norm, code

    return "", ""


def find_proctor(p_dict: dict, subject: str, title: str, platform: str, platform_code: str) -> str:
    """Finds the assigned invigilator from the Proctoring List sheet."""
    if not p_dict:
        return ""
    for key in (title, subject, f"{subject} {platform_code}", f"{subject} {platform}", f"{subject} {platform_code} Exit"):
        if key in p_dict and p_dict[key]:
            return p_dict[key]

    s_low = subject.lower().strip()
    t_low = title.lower().strip()
    p_low = platform.lower().strip() if platform else ""
    pc_low = platform_code.lower().strip() if platform_code else ""

    for test_name, invig in p_dict.items():
        if not invig:
            continue
        tn_low = test_name.lower().strip()
        if s_low and s_low in tn_low:
            if pc_low and (pc_low in tn_low or p_low in tn_low):
                return invig
            if not pc_low and not any(k in tn_low for k in ("ts", "touchstone", "codeground", "aip", "enginext")):
                return invig
        if t_low and t_low in tn_low:
            return invig

    for test_name, invig in p_dict.items():
        if s_low and s_low in test_name.lower() and invig:
            return invig
    return ""


def normalize_stream_slot(t_val) -> tuple[str, str, str]:
    """
    Normalizes a stream time value (e.g. '2:30', '3:30', '4:30', '2:30 PM')
    into (start_t, end_t, time_label).
    """
    raw_str = str(t_val or "").strip()
    if "-" in raw_str or "to" in raw_str:
        st, et = parse_time_range(raw_str)
        lbl = f"{st} - {et}"
        return st, et, lbl

    m = TIME_PATTERN.search(raw_str)
    if not m:
        return "14:30", "15:30", "02:30 - 03:30 PM"

    h = int(m.group(1))
    mins = int(m.group(2) or 0)
    mer = (m.group(3) or "").lower()

    if mer == "pm" and h < 12:
        h += 12
    elif not mer and h < 8:
        h += 12
    elif mer == "am" and h == 12:
        h = 0

    end_h = (h + 1) if (h + 1) < 24 else 0
    start_t = f"{h:02d}:{mins:02d}"
    end_t = f"{end_h:02d}:{mins:02d}"

    def to_12h(hr, mn):
        ap = "AM" if hr < 12 else "PM"
        h12 = hr % 12 or 12
        return f"{h12:02d}:{mn:02d} {ap}"

    time_label = f"{to_12h(h, mins)} - {to_12h(end_h, mins)}"
    return start_t, end_t, time_label


def normalize_time(val: str) -> str:
    """Normalizes string time representations to HH:MM format."""
    if not val:
        return ""
    val_str = str(val).strip().lower()
    match = TIME_PATTERN.search(val_str)
    if not match:
        return val_str[:5]
    hours = int(match.group(1))
    minutes = int(match.group(2) or 0)
    meridiem = match.group(3)

    if meridiem == "pm" and hours < 12:
        hours += 12
    elif meridiem == "am" and hours == 12:
        hours = 0
    return f"{hours:02d}:{minutes:02d}"


def parse_time_range(raw: str) -> tuple[str, str]:
    """Splits '09:00 - 10:30' or '9am to 10:30am' into (start, end)."""
    if not raw:
        return "", ""
    parts = re.split(r"[-–—to]+", str(raw), maxsplit=1)
    if len(parts) == 2:
        return normalize_time(parts[0]), normalize_time(parts[1])
    return normalize_time(parts[0]), ""


def _parse_ignite_campus_workbook(wb) -> dict:
    """
    Parses a TCS Ignite master schedule workbook containing sub-batches, batches,
    streams, TA mappings, and exit tests.
    """
    ws = wb["Schedule"] if "Schedule" in wb.sheetnames else wb.active

    # 1. Unfold all merged cells so every coordinate has correct value and fill
    merged_map = {}
    for rng in ws.merged_cells.ranges:
        min_col, min_row, max_col, max_row = rng.min_col, rng.min_row, rng.max_col, rng.max_row
        top_cell = ws.cell(min_row, min_col)
        top_val = top_cell.value
        top_fill = top_cell.fill
        for r in range(min_row, max_row + 1):
            for c in range(min_col, max_col + 1):
                merged_map[(r, c)] = (top_val, top_fill)

    def get_cell(r, c):
        if (r, c) in merged_map:
            return merged_map[(r, c)]
        cell = ws.cell(r, c)
        return (cell.value, cell.fill)

    # 2. Extract TA mapping (Home Labs, Primary/Backup TAs, Batch Owners)
    ta_mapping = {}
    detected_cohort_ta = ""
    if "TA mapping" in wb.sheetnames:
        ta_ws = wb["TA mapping"]
        for r in range(3, ta_ws.max_row + 1):
            c_val = str(ta_ws.cell(r, 2).value or "").strip()
            if c_val and not detected_cohort_ta:
                detected_cohort_ta = c_val
            sb = ta_ws.cell(r, 4).value
            if sb:
                sb_str = str(sb).strip()
                ta_mapping[sb_str] = {
                    "cohort": c_val or "B50",
                    "batch": str(ta_ws.cell(r, 3).value or sb_str[0]).strip(),
                    "primary_ta": str(ta_ws.cell(r, 5).value or "").strip(),
                    "backup_ta": str(ta_ws.cell(r, 6).value or "").strip(),
                    "owner": str(ta_ws.cell(r, 7).value or "").strip(),
                    "home_lab": str(ta_ws.cell(r, 8).value or "").strip(),
                }

    # 3. Extract Proctoring List (Invigilators for exit evaluations)
    proctoring = {}
    if "Proctoring List" in wb.sheetnames:
        p_ws = wb["Proctoring List"]
        header_row = 2
        test_cols = {}
        for c in range(4, p_ws.max_column + 1):
            tname = p_ws.cell(header_row, c).value
            if tname:
                test_cols[c] = str(tname).strip()
        for r in range(header_row + 1, p_ws.max_row + 1):
            sb = p_ws.cell(r, 3).value
            if sb:
                sb_str = str(sb).strip()
                proctoring[sb_str] = {}
                for col_idx, tname in test_cols.items():
                    invig = p_ws.cell(r, col_idx).value
                    if invig:
                        proctoring[sb_str][tname] = str(invig).strip()

    # 4. Extract Stream Faculty & Stream Schedules
    stream_faculty = {}
    if "Stream Faculty" in wb.sheetnames:
        sf_ws = wb["Stream Faculty"]
        for r in range(2, sf_ws.max_row + 1):
            s_name = sf_ws.cell(r, 2).value
            if s_name:
                stream_faculty[str(s_name).strip()] = {
                    "primary": str(sf_ws.cell(r, 3).value or "").strip(),
                    "backup": str(sf_ws.cell(r, 4).value or "").strip(),
                }

    stream_schedule = {}
    if "Stream" in wb.sheetnames:
        s_ws = wb["Stream"]
        # Map Stream sheet days and timings (forward-fill day names across merged columns)
        s_cols = []
        current_day_str = ""
        for c in range(3, s_ws.max_column + 1):
            d_val = s_ws.cell(1, c).value
            if d_val:
                current_day_str = str(d_val).strip().lower()
            t_val = s_ws.cell(2, c).value
            if t_val and current_day_str in WEEKDAY_MAP:
                st, et, lbl = normalize_stream_slot(t_val)
                s_cols.append((c, WEEKDAY_MAP[current_day_str], st, et, lbl))

        for r in range(3, s_ws.max_row + 1):
            s_name = s_ws.cell(r, 1).value
            if s_name:
                s_name_str = str(s_name).strip()
                count_val = s_ws.cell(r, 2).value
                try:
                    count_num = int(float(count_val)) if count_val is not None else 0
                except Exception:
                    count_num = 0

                primary_fac = stream_faculty.get(s_name_str, {}).get("primary", "")
                backup_fac = stream_faculty.get(s_name_str, {}).get("backup", "")

                stream_schedule[s_name_str] = {
                    "name": s_name_str,
                    "count": count_num,
                    "faculty": primary_fac,
                    "backup_faculty": backup_fac,
                    "mon": [],
                    "tue": [],
                    "wed": [],
                    "thu": [],
                    "fri": [],
                    "sat": [],
                    "days": {"mon": [], "tue": [], "wed": [], "thu": [], "fri": [], "sat": []},
                }
                for c_idx, day_c, st, et, lbl in s_cols:
                    room_allocated = s_ws.cell(r, c_idx).value
                    if room_allocated:
                        room_clean = str(room_allocated).strip()
                        slot_obj = {
                            "time": lbl,
                            "room": room_clean,
                            "faculty": primary_fac,
                        }
                        stream_schedule[s_name_str][day_c].append(slot_obj)
                        stream_schedule[s_name_str]["days"][day_c].append(slot_obj)

    # 5. Extract Days and Time Slots from Schedule sheet
    col_day_slot = []
    for c in range(2, ws.max_column + 1):
        day_raw, _ = get_cell(1, c)
        slot_raw, _ = get_cell(2, c)
        if not day_raw or not slot_raw:
            continue
        day_str = str(day_raw).strip().lower()
        day_code = WEEKDAY_MAP.get(day_str)
        if not day_code:
            continue

        slot_str = str(slot_raw).strip()
        m = TIME_PATTERN.search(slot_str)
        if m:
            h = int(m.group(1))
            mins = int(m.group(2) or 0)
            mer = (m.group(3) or "").lower()
            if mer == "pm" and h < 12:
                h += 12
            elif mer == "am" and h == 12:
                h = 0
            start_t = f"{h:02d}:{mins:02d}"
            end_h = (h + 1) if (h + 1) < 24 else 0
            end_t = f"{end_h:02d}:{mins:02d}"
        else:
            start_t, end_t = "09:00", "10:00"

        col_day_slot.append({
            "col": c,
            "day": day_code,
            "slot_label": slot_str,
            "start": start_t,
            "end": end_t,
        })

    # 6. Extract Sub-batches and Slots
    sub_batch_rows = []
    r = 3
    while r <= ws.max_row:
        val, _ = ws.cell(r, 1).value, None
        if not val and (r, 1) in merged_map:
            val = merged_map[(r, 1)][0]
        if val and re.match(r"^[A-Za-z]+\d+$", str(val).strip()):
            sb_code = str(val).strip()
            # Check if row r+1 is a room row (empty or merged with same sub-batch)
            next_val = ws.cell(r + 1, 1).value if (r + 1) <= ws.max_row else None
            if not next_val and (r + 1, 1) in merged_map:
                next_val = merged_map[(r + 1, 1)][0]

            is_two_row = (r + 1 <= ws.max_row) and (not next_val or str(next_val).strip() == sb_code)
            sub_batch_rows.append((sb_code, r, is_two_row))
            r += 2 if is_two_row else 1
        else:
            r += 1

    sub_batches_data = {}
    batches_data = {}
    flat_grid = {"mon": [], "tue": [], "wed": [], "thu": [], "fri": [], "sat": []}
    all_test_slots = []
    total_slot_count = 0

    cohort_raw = str(get_cell(1, 1)[0] or detected_cohort_ta or "B50").strip()
    cohort_m = re.search(r"\b(B\d+|Cohort\s*\d+|Batch\s*\d+)\b", cohort_raw, re.IGNORECASE)
    cohort_str = cohort_m.group(1).upper() if cohort_m else cohort_raw

    for sb_code, row_idx, is_two_row in sub_batch_rows:
        batch_letter = re.match(r"^([A-Za-z]+)", sb_code).group(1)
        if batch_letter not in batches_data:
            batches_data[batch_letter] = {
                "name": batch_letter,
                "cohort": cohort_str,
                "sub_batches": [],
            }
        if sb_code not in batches_data[batch_letter]["sub_batches"]:
            batches_data[batch_letter]["sub_batches"].append(sb_code)

        home_lab = ta_mapping.get(sb_code, {}).get("home_lab") or "Home Lab"
        sub_batches_data[sb_code] = {"mon": [], "tue": [], "wed": [], "thu": [], "fri": [], "sat": []}

        for col_info in col_day_slot:
            c = col_info["col"]
            day = col_info["day"]
            subj_val, subj_fill = get_cell(row_idx, c)
            room_val, room_fill = get_cell(row_idx + 1, c) if is_two_row else (None, None)

            subject = str(subj_val or "").strip()
            room = str(room_val or "").strip()

            if not subject and not room:
                continue

            if not subject and room:
                subject = "Incubator"
            if not room:
                room = home_lab

            # Fill color detection and orange shade check
            fill_color = "none"
            is_orange = False
            for f in (subj_fill, room_fill):
                if f and f.start_color and f.start_color.rgb:
                    rgb_str = str(f.start_color.rgb).upper()
                    if rgb_str not in ("00000000", "FFFFFFFF"):
                        fill_color = rgb_str
                        if is_orange_color(rgb_str):
                            is_orange = True
                        break

            # 1. TR Session detection: cell contains subject as first line and TR as location
            is_tr_session = False
            if room and room.strip().upper() == "TR":
                is_tr_session = True
                room = "TR"
            elif subject.upper().endswith(" TR"):
                is_tr_session = True
                subject = re.sub(r"\s+TR$", "", subject, flags=re.IGNORECASE).strip()
                room = "TR"
            elif fill_color in ("FF64B5F6", "64B5F6") and "TR" in subject.upper():
                is_tr_session = True
                subject = re.sub(r"\s*TR\b", "", subject, flags=re.IGNORECASE).strip()
                room = "TR"

            platform_norm = None
            platform_code = None
            subj_lower = subject.lower()
            room_lower = room.lower()
            is_test = False

            if is_tr_session:
                session_type = "faculty"
                is_test = False
                room = "TR"
                title_text = subject
            else:
                # 2. Test cell detection: orange shade, test keywords, or resolved platform
                p_norm_room, p_code_room = resolve_platform(room)
                p_norm_subj, p_code_subj = resolve_platform(subject)

                if (
                    is_orange
                    or any(k in subj_lower for k in ("exit", "test", "eval", "exam", "assessment"))
                    or bool(p_norm_room)
                    or bool(p_norm_subj)
                ):
                    is_test = True
                    session_type = "test"

                    # "Consider the second line of test cell as platform name or evaluation type. Allow null value in platform name."
                    if "room" in room_lower or any(room_lower.startswith(k) for k in ("lab ", "lab1", "lab2", "lab3", "lab4", "coe", "tr1", "tr2")):
                        # Line 2 was an actual room allocation for the test (e.g. "TS Room", "Lab 1")
                        platform_norm = p_norm_room if (p_norm_room and "room" not in room_lower) else None
                        platform_code = p_code_room if (p_code_room and "room" not in room_lower) else None
                    elif p_norm_room:
                        platform_norm = p_norm_room
                        platform_code = p_code_room
                        room = home_lab
                    elif p_norm_subj:
                        platform_norm = p_norm_subj
                        platform_code = p_code_subj
                        if not room or room == home_lab:
                            room = home_lab
                    elif room:
                        # Second line is not a physical computer lab -> platform name or evaluation type (e.g. Exit, WA, Unit Test)
                        platform_norm = room
                        platform_code = room
                        room = home_lab
                    else:
                        platform_norm = None
                        platform_code = None
                        room = home_lab

                    title_text = subject
                elif subj_lower == "stream":
                    session_type = "stream"
                    title_text = subject
                elif fill_color in ("FF64B5F6", "64B5F6") or "tr" in room_lower:
                    session_type = "faculty"
                    title_text = subject
                elif fill_color in ("FF81C784", "81C784", "FF2E7D32", "2E7D32"):
                    session_type = "in_place"
                    title_text = subject
                else:
                    session_type = "self_study"
                    title_text = subject

            # Invigilator / Faculty assignment
            proctor = find_proctor(proctoring.get(sb_code, {}), subject, title_text, platform_norm or "", platform_code or "")
            faculty = ""
            if session_type == "stream" and subject in stream_faculty:
                faculty = stream_faculty[subject].get("primary", "")
            elif session_type == "faculty":
                faculty = ta_mapping.get(sb_code, {}).get("primary_ta", "")

            slot_item = {
                "id": f"slot_{sb_code.lower()}_{day}_{len(sub_batches_data[sb_code][day])}",
                "sub_batch": sb_code,
                "batch": batch_letter,
                "cohort": cohort_str,
                "day": day,
                "start": col_info["start"],
                "end": col_info["end"],
                "time_label": col_info["slot_label"],
                "title": title_text,
                "subject": subject,
                "location": room,
                "session_type": session_type,
                "is_test": is_test,
                "platform": platform_norm,
                "platform_code": platform_code,
                "color": fill_color,
                "faculty": faculty,
                "proctor": proctor,
            }

            sub_batches_data[sb_code][day].append(slot_item)
            flat_grid[day].append(slot_item)
            total_slot_count += 1

            if is_test:
                all_test_slots.append(slot_item)

    return {
        "success": total_slot_count > 0,
        "cohort": cohort_str,
        "detected_cohort": cohort_str,
        "detected_batch": list(batches_data.keys())[0] if batches_data else "",
        "slot_count": total_slot_count,
        "sub_batches": sub_batches_data,
        "batches": batches_data,
        "grid_data": {
            **flat_grid,
            "sub_batches": sub_batches_data,
            "streams": stream_schedule,
        },
        "ta_mapping": ta_mapping,
        "proctoring": proctoring,
        "streams": stream_schedule,
        "stream_faculty": stream_faculty,
        "test_slots": all_test_slots,
        "errors": [],
    }


def parse_schedule_excel(excel_file) -> dict:
    """
    Parses an uploaded Excel file and returns normalized schedule JSON.
    Auto-detects:
      - TCS Ignite Campus Multi-Batch Workbook (Schedule, TA Mapping, Stream)
      - Standard Weekday Matrix Timetable
      - Row-based flat timetable list
    """
    try:
        wb = openpyxl.load_workbook(excel_file, data_only=True)
    except Exception as exc:
        return {
            "success": False,
            "grid_data": {"mon": [], "tue": [], "wed": [], "thu": [], "fri": [], "sat": []},
            "slot_count": 0,
            "errors": [f"Could not read Excel file: {exc}"],
        }

    # Strategy 0: Check if this is a TCS Ignite Campus Master Schedule workbook
    if "Schedule" in wb.sheetnames:
        return _parse_ignite_campus_workbook(wb)

    ws = wb.active
    # Also check if sheet 1 has sub-batches in column 1 (e.g. A1, A2, B1) and days in row 1
    c1_sample = [str(ws.cell(r, 1).value or "").strip() for r in range(1, min(10, ws.max_row + 1))]
    r1_sample = [str(ws.cell(1, c).value or "").strip().lower() for c in range(1, min(10, ws.max_column + 1))]
    if any(re.match(r"^[A-Za-z]+\d+$", x) for x in c1_sample) and any(d in r1_sample for d in ("monday", "tuesday")):
        return _parse_ignite_campus_workbook(wb)

    all_rows = list(ws.iter_rows(values_only=True))
    if not all_rows:
        return {
            "success": False,
            "grid_data": {"mon": [], "tue": [], "wed": [], "thu": [], "fri": [], "sat": []},
            "slot_count": 0,
            "errors": ["Worksheet is empty"],
        }

    grid_data = {
        "mon": [],
        "tue": [],
        "wed": [],
        "thu": [],
        "fri": [],
        "sat": [],
    }

    detected_batch = ""
    detected_cohort = ""
    errors = []

    # Search top 4 rows for batch or cohort labels
    for r in all_rows[:4]:
        for cell in r:
            if not cell:
                continue
            c_text = str(cell).strip()
            b_match = re.search(r"(?:batch|section)\s*[:#-]?\s*([A-Za-z0-9_-]+)", c_text, re.IGNORECASE)
            if b_match and not detected_batch:
                detected_batch = b_match.group(1)
            c_match = re.search(r"(?:cohort)\s*[:#-]?\s*([A-Za-z0-9_-]+)", c_text, re.IGNORECASE)
            if c_match and not detected_cohort:
                detected_cohort = c_match.group(1)

    # Strategy A: Check if columns represent Weekdays (Matrix layout)
    header_row_idx = -1
    day_col_indices = {}

    for row_idx, r in enumerate(all_rows[:8]):
        found_days = {}
        for col_idx, cell in enumerate(r):
            if not cell:
                continue
            cleaned = str(cell).strip().lower()
            if cleaned in WEEKDAY_MAP:
                found_days[WEEKDAY_MAP[cleaned]] = col_idx
        if len(found_days) >= 3:
            header_row_idx = row_idx
            day_col_indices = found_days
            break

    if header_row_idx != -1 and day_col_indices:
        # Matrix Layout: Rows are time slots, columns are days
        for r in all_rows[header_row_idx + 1:]:
            if not any(c is not None for c in r):
                continue
            # Look for a time string in the first 2 columns
            time_raw = ""
            for cell in r[:3]:
                if cell and ("am" in str(cell).lower() or "pm" in str(cell).lower() or ":" in str(cell) or "-" in str(cell)):
                    time_raw = str(cell).strip()
                    break

            start_t, end_t = parse_time_range(time_raw)

            for day_code, col_idx in day_col_indices.items():
                if col_idx >= len(r) or not r[col_idx]:
                    continue
                cell_val = str(r[col_idx]).strip()
                if not cell_val or cell_val.lower() in ("-", "nil", "na", "n/a", "recess", "break", "lunch"):
                    continue

                lines = [l.strip() for l in re.split(r"[\n\r/|]+", cell_val) if l.strip()]
                subject = lines[0] if lines else "Lecture"
                room = ""
                faculty = ""
                platform_norm = None
                platform_code = None

                # Check if TR session (subject line 1, TR location)
                is_tr = False
                if len(lines) >= 2 and lines[1].strip().upper() == "TR":
                    is_tr = True
                    subject = lines[0]
                    room = "TR"
                elif subject.upper().endswith(" TR"):
                    is_tr = True
                    subject = re.sub(r"\s+TR$", "", subject, flags=re.IGNORECASE).strip()
                    room = "TR"

                if not is_tr:
                    for sub_line in lines[1:]:
                        p_norm, p_code = resolve_platform(sub_line)
                        if p_norm:
                            platform_norm = p_norm
                            platform_code = p_code
                        elif re.search(r"lab|room|hall|lh|audi|wa|tr|coe", sub_line, re.IGNORECASE):
                            room = sub_line
                        elif re.search(r"dr\.|prof\.|mr\.|ms\.|mrs\.|trainer|faculty", sub_line, re.IGNORECASE) or not faculty:
                            faculty = sub_line

                    if not platform_norm:
                        p_norm, p_code = resolve_platform(subject)
                        if p_norm:
                            platform_norm = p_norm
                            platform_code = p_code

                    subj_lower = subject.lower()
                    is_test = any(k in subj_lower for k in ("exit", "test", "eval", "exam", "assessment")) or bool(platform_norm)
                    if is_test and not platform_norm and len(lines) >= 2 and not re.search(r"lab|room|hall|lh|audi|wa|tr|coe", lines[1], re.IGNORECASE):
                        platform_norm = lines[1]
                        platform_code = lines[1]

                    if is_test and platform_code and platform_code.lower() not in subj_lower:
                        title_text = f"{subject} {platform_code}".strip()
                    else:
                        title_text = subject
                else:
                    is_test = False
                    title_text = subject

                grid_data[day_code].append({
                    "id": f"slot_{uuid.uuid4().hex[:8]}",
                    "start": start_t or "09:00",
                    "end": end_t or "10:30",
                    "title": title_text,
                    "subject": subject,
                    "location": room or "Home Lab",
                    "faculty": faculty,
                    "is_test": is_test,
                    "platform": platform_norm if platform_norm else None,
                    "platform_code": platform_code if platform_code else None,
                    "session_type": "test" if is_test else "faculty" if (faculty or is_tr) else "self_study",
                })

    else:
        # Strategy B: Row-by-Row Layout (Day, Start, End, Subject, Room, Faculty)
        header_map = {}
        for row_idx, r in enumerate(all_rows[:6]):
            for col_idx, cell in enumerate(r):
                if not cell:
                    continue
                c_clean = str(cell).strip().lower()
                if any(w in c_clean for w in ("day", "weekday")):
                    header_map["day"] = col_idx
                elif any(w in c_clean for w in ("start", "from", "start_time")):
                    header_map["start"] = col_idx
                elif any(w in c_clean for w in ("end", "to", "end_time")):
                    header_map["end"] = col_idx
                elif any(w in c_clean for w in ("time", "timing", "slot")):
                    header_map["time_range"] = col_idx
                elif any(w in c_clean for w in ("subject", "course", "module", "topic", "session", "title")):
                    header_map["subject"] = col_idx
                elif any(w in c_clean for w in ("room", "lab", "venue", "location")):
                    header_map["location"] = col_idx
                elif any(w in c_clean for w in ("faculty", "trainer", "instructor", "teacher")):
                    header_map["faculty"] = col_idx

            if "day" in header_map and ("subject" in header_map or "title" in header_map):
                header_row_idx = row_idx
                break

        if "day" in header_map:
            for r in all_rows[header_row_idx + 1:]:
                if not any(c is not None for c in r):
                    continue
                day_val = str(r[header_map["day"]]).strip().lower() if header_map.get("day") is not None and header_map["day"] < len(r) else ""
                day_code = WEEKDAY_MAP.get(day_val)
                if not day_code:
                    continue

                subject = str(r[header_map["subject"]]).strip() if header_map.get("subject") is not None and header_map["subject"] < len(r) and r[header_map["subject"]] else "Lecture"

                start_t = ""
                end_t = ""
                if header_map.get("time_range") is not None and header_map["time_range"] < len(r) and r[header_map["time_range"]]:
                    start_t, end_t = parse_time_range(r[header_map["time_range"]])
                else:
                    if header_map.get("start") is not None and header_map["start"] < len(r) and r[header_map["start"]]:
                        start_t = normalize_time(str(r[header_map["start"]]))
                    if header_map.get("end") is not None and header_map["end"] < len(r) and r[header_map["end"]]:
                        end_t = normalize_time(str(r[header_map["end"]]))

                loc = str(r[header_map["location"]]).strip() if header_map.get("location") is not None and header_map["location"] < len(r) and r[header_map["location"]] else "Home Lab"
                fac = str(r[header_map["faculty"]]).strip() if header_map.get("faculty") is not None and header_map["faculty"] < len(r) and r[header_map["faculty"]] else ""

                # TR session check
                is_tr = False
                if loc.upper() == "TR":
                    is_tr = True
                elif subject.upper().endswith(" TR"):
                    is_tr = True
                    subject = re.sub(r"\s+TR$", "", subject, flags=re.IGNORECASE).strip()
                    loc = "TR"

                if is_tr:
                    is_test = False
                    p_norm = None
                    p_code = None
                    title_text = subject
                else:
                    p_norm, p_code = resolve_platform(loc)
                    if not p_norm:
                        p_norm, p_code = resolve_platform(subject)

                    if p_norm and (loc.lower() in ("ts", "cg", "aip") or resolve_platform(loc)[0]):
                        loc = "Home Lab"

                    subj_lower = subject.lower()
                    is_test = any(k in subj_lower for k in ("exit", "test", "eval", "exam", "assessment")) or bool(p_norm)
                    if is_test and not p_norm and loc and not re.search(r"lab|room|hall|lh|audi|wa|tr|coe", loc, re.IGNORECASE):
                        p_norm = loc
                        p_code = loc
                        loc = "Home Lab"

                    if not is_test:
                        p_norm = None
                        p_code = None

                    if is_test and p_code and p_code.lower() not in subj_lower:
                        title_text = f"{subject} {p_code}".strip()
                    else:
                        title_text = subject

                grid_data[day_code].append({
                    "id": f"slot_{uuid.uuid4().hex[:8]}",
                    "start": start_t or "09:00",
                    "end": end_t or "10:30",
                    "title": title_text,
                    "subject": subject,
                    "location": loc,
                    "faculty": fac,
                    "is_test": is_test,
                    "platform": p_norm if p_norm else None,
                    "platform_code": p_code if p_code else None,
                    "session_type": "test" if is_test else "faculty" if (fac or is_tr) else "self_study",
                })

    # Sort each day's slots by start time
    total_slots = 0
    for day_code in grid_data:
        grid_data[day_code].sort(key=lambda item: item.get("start", "00:00"))
        total_slots += len(grid_data[day_code])

    return {
        "success": total_slots > 0,
        "grid_data": grid_data,
        "slot_count": total_slots,
        "detected_batch": detected_batch,
        "detected_cohort": detected_cohort,
        "errors": errors if total_slots == 0 else [],
    }
