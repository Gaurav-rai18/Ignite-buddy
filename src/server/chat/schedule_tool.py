"""
Schedule Tool

Provides timetable lookups using the normalized timetable_slots
stored in central.db.

Source:
    get_central().slots(batch)

Entry points:

    parse(text, batch)   -> {"intent", "subject", "day"} or None
                            Understands natural questions such as
                            "do we have java today", "where is DBMS",
                            "how many classes tomorrow", "first class on friday".
                            Returns None when the text is not a schedule question.

    execute(batch, intent=..., subject=..., day=...)
                            Runs an intent and returns a dict.
                            Some results carry a ready-to-show "text" field.

Supported intents:

    today_schedule, tomorrow_schedule, day_schedule
    next_class, current_class, first_class, last_class, class_count
    subject_check, subject_venue, subject_time, subject_week
"""

import re
from datetime import datetime, timedelta

from server.storage.central import get_central


DAY_NAMES = {
    0: "Monday",
    1: "Tuesday",
    2: "Wednesday",
    3: "Thursday",
    4: "Friday",
    5: "Saturday",
    6: "Sunday",
}

DAY_LOOKUP = {
    "today": None,
    "tomorrow": None,

    "monday": 0,
    "mon": 0,

    "tuesday": 1,
    "tue": 1,
    "tues": 1,

    "wednesday": 2,
    "wed": 2,

    "thursday": 3,
    "thu": 3,
    "thur": 3,
    "thurs": 3,

    "friday": 4,
    "fri": 4,

    "saturday": 5,
    "sat": 5,

    "sunday": 6,
    "sun": 6,
}

TOKEN = r"[a-z0-9+#]+"

# Words that mean "this is about classes / timetable"
SCHEDULE_WORDS = {
    "class", "classes", "period", "periods", "lecture", "lectures",
    "timetable", "schedule", "session", "sessions", "slot", "slots",
}

# Words that must never be treated as a subject name
IGNORE_WORDS = SCHEDULE_WORDS | set(DAY_LOOKUP) | {
    "the", "and", "of", "to", "for", "in", "on", "a", "an", "is", "at", "with", "by",
    "what", "when", "where", "which", "who", "how", "do", "does", "did", "we", "i",
    "have", "has", "had", "any", "there", "that", "this", "it", "my", "our", "me",
    "you", "time", "day", "week", "now", "next", "first", "last", "many", "are",
    "was", "will", "be", "can", "tell", "show", "give", "please", "about", "exam",
    "venue", "room", "location", "timing", "timings", "hall", "unit", "batch",
}

# Phrases that mean "do we have X?"
CHECK_PHRASES = (
    "do we have", "do i have", "have we", "is there", "are there", "we have",
    "i have", "any", "got", "is that", "is it", "are we", "will we have",
    "will there be", "there",
)


class ScheduleTool:
    def __init__(self):
        self.central = get_central()

    # ---------------------------------------------------------
    # Helpers
    # ---------------------------------------------------------
    def _clean(self, text):
        return " ".join(str(text).split()).strip()

    def _slots(self, batch: str):
        if not batch:
            return []  # never fall back to all batches
        rows = self.central.slots(batch) or []

        # The same slot can come back more than once (e.g. one row per batch
        # alias, or the timetable imported twice). Keep one of each.
        seen = set()
        unique = []
        for r in rows:
            key = (
                int(r["weekday"]),
                str(r["start"]),
                str(r["end"]),
                self._clean(r["title"]).lower(),
                self._clean(r["location"]).lower(),
            )
            if key in seen:
                continue
            seen.add(key)
            unique.append(r)

        if len(unique) != len(rows):
            print(f"[schedule_tool] removed {len(rows) - len(unique)} duplicate slots")

        return unique

    def _today(self) -> int:
        return datetime.now().weekday()

    def _tomorrow(self) -> int:
        return (datetime.now() + timedelta(days=1)).weekday()

    def _weekday_from_day(self, day: str | None):
        """Return a weekday number (0-6) or None if no/unknown day."""
        if not day:
            return None

        day = day.lower().strip()

        if day == "today":
            return self._today()

        if day == "tomorrow":
            return self._tomorrow()

        return DAY_LOOKUP.get(day)

    def _rows_for_weekday(self, slots, weekday: int):
        rows = [r for r in slots if int(r["weekday"]) == weekday]
        rows.sort(key=lambda x: x["start"])
        return rows

    def _label(self, day: str | None, weekday: int) -> str:
        """today / tomorrow / on Monday"""
        d = (day or "today").lower().strip()
        if d == "today":
            return "today"
        if d == "tomorrow":
            return "tomorrow"
        return f"on {DAY_NAMES[weekday]}"

    def _venue(self, row) -> str:
        """' in Room 5' or '' when the location just repeats the title."""
        venue = self._clean(row["location"])
        title = self._clean(row["title"])
        if not venue or venue.lower() == title.lower():
            return ""
        return f" in {venue}"

    def _slot_text(self, row) -> str:
        return f"{row['start']} to {row['end']}{self._venue(row)}"

    # ---------------------------------------------------------
    # Natural-language parsing
    # ---------------------------------------------------------
    def _find_subject(self, words, padded, slots):
        titles = {self._clean(r["title"]).lower() for r in slots if r["title"]}

        # 1) a full title appears in the question
        full = []
        for title in titles:
            norm = " ".join(re.findall(TOKEN, title))
            if norm and f" {norm} " in padded:
                full.append(title)
        if full:
            return max(full, key=len)

        # 2) a single keyword from a title appears in the question
        vocab = set()
        for title in titles:
            for tok in re.findall(TOKEN, title):
                if len(tok) >= 2 and tok not in IGNORE_WORDS:
                    vocab.add(tok)

        matched = [w for w in words if w in vocab]
        if matched:
            return max(matched, key=len)

        return None

    def parse(self, text: str, batch: str):
        """
        Turn a free-text question into {"intent", "subject", "day"}.
        Returns None if the text does not look like a schedule question.
        """
        words = re.findall(TOKEN, (text or "").lower())
        if not words:
            return None

        padded = " " + " ".join(words) + " "

        def has(*phrases):
            return any(f" {p} " in padded for p in phrases)

        day = next((w for w in words if w in DAY_LOOKUP), None)
        has_kw = any(w in SCHEDULE_WORDS for w in words)
        subject = self._find_subject(words, padded, self._slots(batch))

        # ---------- questions about one subject ----------
        if subject:
            asks_days = has(
                "which day", "what day", "which days", "this week",
                "whole week", "all days", "in a week", "per week",
            )
            asks_where = has("where", "venue", "room", "location", "which hall")
            asks_when = has("when", "what time", "timing", "timings", "starts", "start")
            is_check = has(*CHECK_PHRASES)

            if not (has_kw or day or asks_days or asks_where or asks_when or is_check):
                return None  # e.g. "what is java" -> not a schedule question

            if asks_days:
                intent = "subject_week"
            elif asks_where and not is_check:
                intent = "subject_venue"
            elif asks_when and not is_check:
                intent = "subject_time"
            else:
                intent = "subject_check"

            return {"intent": intent, "subject": subject, "day": day}

        # ---------- general schedule questions ----------
        if not has_kw:
            return None

        if has("next class", "next period", "next lecture", "next session") or "next" in words:
            intent = "next_class"
        elif has("how many"):
            intent = "class_count"
        elif has("first class", "first period", "first lecture",
                 "classes start", "class start", "class starts", "when do classes start"):
            intent = "first_class"
        elif has("last class", "last period", "last lecture",
                 "classes end", "class end", "class ends", "finish", "over"):
            intent = "last_class"
        elif has("right now", "current", "ongoing", "going on") or "now" in words:
            intent = "current_class"
        elif day == "tomorrow":
            intent = "tomorrow_schedule"
        elif day and day != "today":
            intent = "day_schedule"
        else:
            intent = "today_schedule"

        return {"intent": intent, "subject": None, "day": day}

    # ---------------------------------------------------------
    # Public Entry Point
    # ---------------------------------------------------------

    def execute(
        self,
        batch: str,
        query: str | None = None,
        intent: str | None = None,
        subject: str | None = None,
        day: str | None = None,
    ):
        """
        Main entry point called by the orchestrator.
        """

        if not batch:
            return {
                "success": False,
                "message": "I couldn't find your batch. Please log in again.",
            }

        slots = self._slots(batch)

        print(
            f"[schedule_tool] batch={batch!r} intent={intent!r} "
            f"subject={subject!r} day={day!r} slots={len(slots)}"
        )

        # router may send intents like "monday_schedule"
        if intent and intent.endswith("_schedule"):
            prefix = intent[: -len("_schedule")]
            if prefix in DAY_LOOKUP and prefix not in ("today", "tomorrow"):
                day = prefix
                intent = "day_schedule"

        # A named weekday ("Monday schedule") must never fall back to today.
        named = (day or "").lower().strip()
        if intent in ("today_schedule", "day_schedule") and named not in ("", "today", "tomorrow"):
            weekday = self._weekday_from_day(named)
            if weekday is None:
                return {
                    "success": False,
                    "message": f"I couldn't understand the day '{day}'.",
                }
            return self._day_schedule(slots, weekday, "day_schedule")

        if intent == "day_schedule":
            return {
                "success": False,
                "message": "Which day do you want the schedule for?",
            }

        if intent == "today_schedule":
            return self._day_schedule(slots, self._today(), "today_schedule")

        if intent == "tomorrow_schedule":
            return self._day_schedule(slots, self._tomorrow(), "tomorrow_schedule")

        if intent == "next_class":
            return self._next_class(slots)

        if intent == "current_class":
            return self._current_class(slots)

        if intent == "first_class":
            return self._first_last(slots, day, first=True)

        if intent == "last_class":
            return self._first_last(slots, day, first=False)

        if intent == "class_count":
            return self._class_count(slots, day)

        if intent == "subject_check":
            return self._subject_check(slots=slots, subject=subject, day=day)

        if intent == "subject_venue":
            return self._subject_venue(slots=slots, subject=subject, day=day)

        if intent == "subject_time":
            return self._subject_time(slots=slots, subject=subject, day=day)

        if intent == "subject_week":
            return self._subject_week(slots=slots, subject=subject)

        return {
            "success": False,
            "message": "Unsupported schedule intent.",
        }

    # ---------------------------------------------------------
    # Schedule Views
    # ---------------------------------------------------------

    def _day_schedule(self, slots, weekday: int, intent: str):
        rows = self._rows_for_weekday(slots, weekday)

        return {
            "success": True,
            "intent": intent,
            "day": DAY_NAMES[weekday],
            "slots": rows,
        }

    def _class_count(self, slots, day=None):
        weekday = self._weekday_from_day(day or "today")
        if weekday is None:
            return {"success": False, "message": f"I couldn't understand the day '{day}'."}

        rows = self._rows_for_weekday(slots, weekday)
        label = self._label(day, weekday)

        if not rows:
            text = f"You have no classes {label}."
        else:
            n = len(rows)
            text = (
                f"You have {n} class{'es' if n != 1 else ''} {label}, "
                f"from {rows[0]['start']} to {rows[-1]['end']}."
            )

        return {"success": True, "intent": "class_count", "text": text}

    def _first_last(self, slots, day=None, first=True):
        weekday = self._weekday_from_day(day or "today")
        if weekday is None:
            return {"success": False, "message": f"I couldn't understand the day '{day}'."}

        rows = self._rows_for_weekday(slots, weekday)
        label = self._label(day, weekday)
        intent = "first_class" if first else "last_class"

        if not rows:
            return {"success": True, "intent": intent, "text": f"You have no classes {label}."}

        if first:
            r = rows[0]
            text = (
                f"Your first class {label} is {self._clean(r['title'])} "
                f"at {r['start']}{self._venue(r)}."
            )
        else:
            r = rows[-1]
            text = (
                f"Your last class {label} is {self._clean(r['title'])}, "
                f"ending at {r['end']}{self._venue(r)}."
            )

        return {"success": True, "intent": intent, "text": text}

    def _current_class(self, slots):
        now = datetime.now()
        current_time = now.strftime("%H:%M")

        for row in self._rows_for_weekday(slots, now.weekday()):
            if row["start"] <= current_time < row["end"]:
                text = (
                    f"You're in {self._clean(row['title'])} right now, "
                    f"until {row['end']}{self._venue(row)}."
                )
                return {"success": True, "intent": "current_class", "text": text}

        return {
            "success": True,
            "intent": "current_class",
            "text": "No class is going on right now.",
        }

    # ---------------------------------------------------------
    # Subject Lookups
    # ---------------------------------------------------------

    def _subject_check(self, slots, subject, day=None):
        """Answers 'do we have java today?' with a clear yes / no."""
        if not subject:
            return {"success": False, "message": "Subject not provided."}

        key = subject.lower()
        weekday = self._weekday_from_day(day)

        matches = [r for r in slots if key in self._clean(r["title"]).lower()]
        matches.sort(key=lambda r: (int(r["weekday"]), r["start"]))

        if not matches:
            return {
                "success": True,
                "intent": "subject_check",
                "text": f"No, I couldn't find {subject} in your timetable.",
            }

        name = self._clean(matches[0]["title"])

        # No day asked: tell them the whole week
        if weekday is None:
            parts = [
                f"{DAY_NAMES[int(r['weekday'])]} {self._slot_text(r)}"
                for r in matches
            ]
            return {
                "success": True,
                "intent": "subject_check",
                "text": f"Yes, {name} is on " + "; ".join(parts) + ".",
            }

        label = self._label(day, weekday)
        on_day = [r for r in matches if int(r["weekday"]) == weekday]

        if on_day:
            parts = [self._slot_text(r) for r in on_day]
            text = f"Yes, you have {name} {label}: " + "; ".join(parts) + "."
        else:
            other_days = sorted({int(r["weekday"]) for r in matches})
            text = (
                f"No, you don't have {name} {label}. "
                f"It's on {', '.join(DAY_NAMES[d] for d in other_days)}."
            )

        return {"success": True, "intent": "subject_check", "text": text}

    def _subject_venue(self, slots, subject, day=None):
        if not subject:
            return {
                "success": False,
                "message": "Subject not provided.",
            }

        weekday = self._weekday_from_day(day)

        for row in slots:

            if weekday is not None and int(row["weekday"]) != weekday:
                continue

            if subject.lower() in row["title"].lower():
                return {
                    "success": True,
                    "intent": "subject_venue",
                    "subject": self._clean(row["title"]),
                    "venue": self._clean(row["location"]),
                    "start": row["start"],
                    "end": row["end"],
                    "day": DAY_NAMES[int(row["weekday"])],
                }

        return {
            "success": False,
            "message": f"No timetable found for '{subject}'.",
        }

    def _subject_time(self, slots, subject, day=None):
        if not subject:
            return {
                "success": False,
                "message": "Subject not provided.",
            }

        weekday = self._weekday_from_day(day)

        for row in slots:

            if weekday is not None and int(row["weekday"]) != weekday:
                continue

            if subject.lower() in row["title"].lower():
                return {
                    "success": True,
                    "intent": "subject_time",
                    "subject": self._clean(row["title"]),
                    "start": row["start"],
                    "end": row["end"],
                    "venue": self._clean(row["location"]),
                    "day": DAY_NAMES[int(row["weekday"])],
                }

        return {
            "success": False,
            "message": f"No timetable found for '{subject}'.",
        }

    def _subject_week(self, slots, subject):
        if not subject:
            return {
                "success": False,
                "message": "Subject not provided.",
            }

        matches = []

        for row in slots:

            if subject.lower() in row["title"].lower():
                matches.append(
                    {
                        "day": DAY_NAMES[int(row["weekday"])],
                        "subject": self._clean(row["title"]),
                        "start": row["start"],
                        "end": row["end"],
                        "venue": self._clean(row["location"]),
                    }
                )

        return {
            "success": True,
            "intent": "subject_week",
            "matches": matches,
        }

    # ---------------------------------------------------------
    # Next Class
    # ---------------------------------------------------------

    def _next_class(self, slots):

        now = datetime.now()
        current_time = now.strftime("%H:%M")

        rows = self._rows_for_weekday(slots, now.weekday())

        for row in rows:
            if row["start"] > current_time:
                return {
                    "success": True,
                    "intent": "next_class",
                    "slot": row,
                }

        return {
            "success": False,
            "message": "No more classes scheduled today.",
        }


schedule_tool = ScheduleTool()
