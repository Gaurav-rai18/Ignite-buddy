"""Reminders – high-coverage slot-based."""
import re
from server.features import personal
from server.util import timeparse
from ..model import Incomplete, SAFE, ToolError
from ..intents import intent
from ..pick import pick
from ..registry import tool
from . import _native

@tool("set_reminder", SAFE,
      "Set a reminder. when = time phrase as the user said it ('tomorrow at 5pm', 'in 2 hours'). "
      "repeat = '', 'daily' or 'weekly'.", {"text": "str", "when": "str", "repeat": "str?"})
def set_reminder(s, text, when, repeat=""):
    repeat = (repeat or "").lower().strip()
    if repeat not in ("", "daily", "weekly"):
        raise ToolError("Repeat must be daily or weekly.")
    try:
        due = timeparse.parse_when(when)
    except ValueError as e:
        raise ToolError(str(e))
    rid = personal.add_reminder(s.store, text, due, repeat)
    native = _native.mirror(s, "reminders", "reminder", rid, due.timestamp(), text, repeat)
    return {"msg": f"Reminder set for {personal.fmt_dt(due.timestamp())}: {text}" +
                   (f" (repeats {repeat})" if repeat else "") +
                   (" - Windows will alert you even if this app is closed." if native else "")}

@tool("list_reminders", SAFE, "List pending reminders.", {})
def list_reminders(s):
    rows = personal.pending_reminders(s.store)
    if not rows:
        return {"msg": "No pending reminders."}
    return {"msg": "\n".join(f"• {personal.fmt_dt(due)}: {text}" + (f" ({rep})" if rep else "")
                             for _, text, due, rep in rows)}

@tool("cancel_reminder", SAFE, "Cancel a reminder (query = words from its text, optional).", {"query": "str?"})
def cancel_reminder(s, query=""):
    def finish(row):
        _native.unmirror(s, "reminders", "reminder", row[0])
        personal.cancel_reminder(s.store, row[0])
        return {"msg": f"Cancelled reminder: {row[1]}"}
    return pick(personal.pending_reminders(s.store), query, lambda r: r[1],
                lambda r: f"#{r[0]} {r[1]} ({personal.fmt_dt(r[2])})", finish)


def _remind(rest: str, b, mem):
    try:
        text, when, repeat = timeparse.split_when(rest)
    except ValueError:
        raise Incomplete("When should I remind you? For example: 'tomorrow at 5pm' or 'in 20 minutes'.")
    b.add("set_reminder", text=text, when=when, repeat=repeat or None)
    mem.remember("reminder", text[:40] if text else "reminder")


@intent("set_reminder",
        triggers=[
            r"remind me\b",
            r"(?:set|add|create|make)(?:\s+a)?\s+reminder\b",
            r"(?:don't forget|dont forget|remember to)\b",
        ],
        slots=[], examples=(
            "remind me to submit the assignment tomorrow at 5pm",
            "remind me every day at 9am to log my hours",
            "remind me in 1 minute to stretch",
            "set a reminder for the viva on Friday at 10am",
            "remind me to call mom at 6pm",
            "don't forget to revise DSA tonight",
        ), priority=18,
        clarify="What should I remind you about, and when?")
def set_reminder_intent(slots, text, b, mem):
    m = re.search(r"remind me\s+(?:to\s+|about\s+|that\s+)?(.+)", text, re.I)
    if not m:
        m = re.search(r"(?:set|add|create|make)(?:\s+a)?\s+reminder\s+(?:to\s+|for\s+|about\s+)?(.+)", text, re.I)
    if not m:
        m = re.search(r"(?:don't forget|dont forget|remember to)\s+(.+)", text, re.I)
    if not m:
        raise Incomplete("What should I remind you about, and when?")
    _remind(m.group(1).strip(), b, mem)


@intent("list_reminders",
        triggers=[
            r"(?:list|show|what are|what's|whats).{0,30}reminders?",
            r"(?:do i have|any|pending) reminders?",
        ],
        slots=[], examples=("list my reminders", "pending reminders", "what are my reminders"), priority=32)
def list_reminders_intent(slots, text, b, mem):
    b.add("list_reminders")


@intent("cancel_reminder",
        triggers=[
            r"(?:cancel|delete|remove|clear).{0,30}reminder",
            r"stop (?:the |my )?reminder",
        ],
        slots=[
            {"name": "label", "extractor": "label", "required": False},
            {"name": "pronoun", "extractor": "pronoun", "required": False, "resolve_anaphora": True},
        ],
        examples=("cancel the reminder about stretch", "delete my reminder"), priority=26)
def cancel_reminder_intent(slots, text, b, mem):
    q = slots.get("label") or slots.get("pronoun") or ""
    if not q:
        ent = mem.last("reminder")
        q = ent.value if ent else ""
    if not q:
        m = re.search(r"(?:cancel|delete|remove|clear)\s+(?:the\s+|my\s+)?(?:reminder\s+(?:about|for|to)\s+)?(.+?)(?:\s+reminder)?$", text, re.I)
        if m:
            q = m.group(1).strip()
    b.add("cancel_reminder", query=q or None)
