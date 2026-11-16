"""Activity tracking – tools + slot-based intents."""
import re
from datetime import datetime
from server.features.activity import sessionize, summarize, usage
from server.features.activity.recorder import recorder_for
from server.util import timeparse
from ..model import CONFIRM, Incomplete, SAFE, ToolError
from ..intents import intent
from ..registry import tool

def _tell_client(s, rec):
    s.ui.push({"type": "tracking", **rec.pause_state()})

@tool("pause_tracking", SAFE, "Pause activity tracking, optionally for a duration like '30 minutes'.",
      {"duration": "str?"})
def pause_tracking(s, duration=""):
    secs = None
    if (duration or "").strip():
        try:
            secs = timeparse.parse_duration(duration)
        except ValueError:
            raise ToolError(f"I couldn't understand the duration '{duration}'.")
    rec = recorder_for(s.store)
    rec.pause(secs)
    _tell_client(s, rec)
    return {"msg": "Activity tracking paused" + (f" for {timeparse.fmt_duration(secs)}." if secs else
                                                 " until you resume it.")}

@tool("resume_tracking", SAFE, "Resume activity tracking.", {})
def resume_tracking(s):
    rec = recorder_for(s.store)
    rec.resume()
    _tell_client(s, rec)
    return {"msg": "Activity tracking resumed."}

@tool("tracking_status", SAFE, "Say whether activity tracking is on.", {})
def tracking_status(s):
    return {"msg": "Activity tracking is paused." if recorder_for(s.store).is_paused() else "Activity tracking is on."}

@tool("focus_report", SAFE, "Instant statistics (time per category/app, focus %) for a period. No AI.",
      {"when": "str?"})
def focus_report(s, when="today"):
    start, end, label = timeparse.parse_range(when or "today")
    events = summarize.load_events(s.store, start.timestamp(), end.timestamp())
    _, stats = sessionize.analyze(events)
    return {"msg": sessionize.format_stats(f"Focus report for {label}", stats)}

@tool("activity_time", SAFE, "Time spent in an app, category or window title, for a period. No AI.",
      {"subject": "str", "when": "str?"})
def activity_time(s, subject, when="today"):
    label, matched, total = usage.usage(s.store, subject, when)
    if not total:
        return {"msg": f"I have no recorded activity for {label}."}
    if not matched:
        return {"msg": f"I have no record of '{subject}' for {label}."}
    return {"msg": f"{subject}: {timeparse.fmt_duration(matched)} {label} "
                   f"({matched / total * 100:.0f}% of {timeparse.fmt_duration(total)} active)."}

@intent("pause_tracking", triggers=[r"pause (?:activity )?tracking", r"stop tracking"],
        slots=[{"name": "duration", "extractor": "duration", "required": False}],
        examples=("pause tracking for 30 minutes",), priority=80)
def pause_tracking_intent(slots, text, b, mem):
    b.add("pause_tracking", duration=slots.get("duration"))

@intent("resume_tracking", triggers=[r"resume (?:activity )?tracking", r"start tracking"],
        slots=[], examples=("resume tracking",), priority=81)
def resume_tracking_intent(slots, text, b, mem):
    b.add("resume_tracking")

@intent("tracking_status", triggers=[r"(?:is |are you )?tracking", r"tracking status"],
        slots=[], examples=("are you tracking",), priority=82)
def tracking_status_intent(slots, text, b, mem):
    b.add("tracking_status")

@intent("focus_report", triggers=[r"focus report", r"(?:show|give).{0,15}focus", r"how (?:focused|productive)"],
        slots=[{"name": "day", "extractor": "day", "required": False}],
        examples=("focus report today",), priority=83)
def focus_report_intent(slots, text, b, mem):
    b.add("focus_report", when=slots.get("day") or "today")

@intent("activity_time",
        triggers=[
            r"how much time (?:did i|have i) (?:spend|spent)",
            r"time (?:spent|spent in|in).{0,20}(?:vs\s*code|chrome|today|yesterday)",
            r"(?:show|what).{0,15}(?:time|usage|activity).{0,15}(?:in|for|on)",
        ],
        slots=[{"name": "day", "extractor": "day", "required": False}],
        examples=("how much time did I spend in VS Code today", "time spent in chrome yesterday"),
        priority=84)
def activity_time_intent(slots, text, b, mem):
    m = re.search(r"(?:in|on|for)\s+(.+?)(?:\s+(?:today|yesterday|this week|last week))?$", text, re.I)
    subject = m.group(1).strip() if m else "all"
    subject = re.sub(r"\b(?:today|yesterday|this week|last week)\b", "", subject, flags=re.I).strip() or "all"
    b.add("activity_time", subject=subject, when=slots.get("day") or "today")


def _range(when):
    if (when or "").strip().lower() in ("all", "everything"):
        return datetime.fromtimestamp(0), datetime(2100, 1, 1), "all recorded activity"
    return timeparse.parse_range(when or "today")


def _delete_describe(s, when):
    return f"Permanently delete recorded activity for: {_range(when)[2]}"


def _delete_preview(s, when):
    a, e, _ = _range(when)
    with s.store.conn() as con:
        n = con.execute("SELECT COUNT(*) FROM activity_events WHERE end_ts>? AND start_ts<?",
                        (a.timestamp(), e.timestamp())).fetchone()[0]
    return f"{n} activity records (and any daily summaries in this period) will be deleted."


@tool("delete_activity", CONFIRM, "Delete recorded activity data for a period ('today', 'last hour', 'all').",
      {"when": "str"}, describe=_delete_describe, preview=_delete_preview)
def delete_activity(s, when):
    a, e, label = _range(when)
    with s.store.conn() as con:
        con.execute("DELETE FROM activity_events WHERE end_ts>? AND start_ts<?", (a.timestamp(), e.timestamp()))
        con.execute("DELETE FROM summaries WHERE start_ts>=? AND end_ts<=?", (a.timestamp(), e.timestamp()))
    recorder_for(s.store).reset()
    return {"msg": f"Deleted activity data for {label}."}


@intent("delete_activity",
        triggers=[r"(?:delete|clear|erase|remove|wipe).{0,25}activity"],
        slots=[{"name": "day", "extractor": "day", "required": False}],
        examples=("delete today's activity", "clear activity for yesterday"),
        priority=85)
def delete_activity_intent(slots, text, b, mem):
    w = slots.get("day")
    if not w:
        m = re.search(r"\b(today'?s?|yesterday'?s?|all|everything|last\s+week|this\s+week)\b", text, re.I)
        w = m.group(1) if m else None
    if not w:
        raise Incomplete("For which period? For example 'today', 'yesterday', 'last hour' or 'all'.")
    w = w.lower().replace("'s", "").replace("s'", "")
    b.add("delete_activity", when=w)

