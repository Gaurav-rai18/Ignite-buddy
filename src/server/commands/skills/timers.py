"""Timers – high-coverage slot-based."""
import re
import time
from server.features import personal
from server.util import timeparse
from ..model import Incomplete, NoMatch, SAFE, ToolError
from ..intents import intent
from ..pick import pick
from ..registry import tool
from . import _native

@tool("set_timer", SAFE, "Start a countdown timer. duration like '10 minutes'.", {"duration": "str", "label": "str?"})
def set_timer(s, duration, label=""):
    try:
        secs = timeparse.parse_duration(duration)
    except ValueError:
        raise ToolError(f"I couldn't understand the duration '{duration}'.")
    if not 1 <= secs <= 24 * 3600:
        raise ToolError("Timers must be between 1 second and 24 hours.")
    tid = personal.add_timer(s.store, secs, label)
    native = _native.mirror(s, "timers", "timer", tid, time.time() + secs, label or "Your timer is done")
    return {"msg": f"Timer set for {timeparse.fmt_duration(secs)}" + (f" ({label})" if label else "")
                   + (" - Windows will alert you even if this app is closed." if native else "")}

@tool("list_timers", SAFE, "List active timers.", {})
def list_timers(s):
    rows = personal.pending_timers(s.store)
    if not rows:
        return {"msg": "No active timers."}
    return {"msg": "\n".join(f"• {label or 'Timer'}: {timeparse.fmt_duration(max(0, end - time.time()))} left"
                             for _, label, end in rows)}

@tool("cancel_timer", SAFE, "Cancel a timer (query = its label, optional).", {"query": "str?"})
def cancel_timer(s, query=""):
    def finish(row):
        _native.unmirror(s, "timers", "timer", row[0])
        personal.cancel_timer(s.store, row[0])
        return {"msg": f"Cancelled timer {row[1] or '#' + str(row[0])}."}
    return pick(personal.pending_timers(s.store), query, lambda r: r[1] or "timer",
                lambda r: f"#{r[0]} {r[1] or 'timer'} ({timeparse.fmt_duration(max(0, r[2] - time.time()))} left)",
                finish)


@intent("set_timer",
        triggers=[
            r"(?:set|start|create|begin|make).{0,30}timer",
            r"timer\s+(?:for|of)\s+",
            # broad form removed – cancel/list must win for those verbs
            r"countdown\b",
        ],
        slots=[
            {"name": "duration", "extractor": "duration", "required": True},
            {"name": "label", "extractor": "label", "required": False},
        ],
        examples=(
            "set a timer for 10 minutes",
            "start a timer for 25 minutes for pomodoro",
            "set a 10 minute timer for pasta",
            "set a pasta timer for 10 minutes",
            "start a 5 min timer",
            "timer for 1 hour",
            "set pomodoro timer 25 minutes",
            "countdown 30 seconds",
        ), priority=20,
        clarify="For how long? For example: '10 minutes' or '1 hour'.")
def set_timer_intent(slots, text, b, mem):
    try:
        timeparse.parse_duration(slots["duration"])
    except ValueError:
        raise NoMatch
    label = (slots.get("label") or "").strip() or None
    if not label and "pomodoro" in text.lower():
        label = "pomodoro"
    b.add("set_timer", duration=slots["duration"].strip(), label=label)
    mem.remember("timer", label or "timer")


@intent("list_timers",
        triggers=[
            r"(?:list|show|what are|what's|whats).{0,25}timers?",
            r"how (?:much time|long).{0,30}timer",
            r"(?:do i have|are there).{0,20}timers?",
            r"active timers?",
        ],
        slots=[], examples=("list my timers", "how much time is left on my timer", "active timers"), priority=30)
def list_timers_intent(slots, text, b, mem):
    b.add("list_timers")


@intent("cancel_timer",
        triggers=[
            r"(?:cancel|stop|delete|remove|clear|kill).{0,25}timer",
            r"stop (?:the |my )?timer",
            r"^cancel\s+(?:it|that)$",
        ],
        slots=[
            {"name": "label", "extractor": "label", "required": False},
            {"name": "pronoun", "extractor": "pronoun", "required": False, "resolve_anaphora": True},
        ],
        examples=("cancel the pasta timer", "stop my timer", "cancel it", "stop the timer"), priority=25)
def cancel_timer_intent(slots, text, b, mem):
    q = slots.get("label") or slots.get("pronoun") or ""
    if not q:
        ent = mem.last("timer")
        q = ent.value if ent else ""
    if not q:
        m = re.search(r"(?:cancel|stop|delete|remove|clear|kill)\s+(?:my\s+|the\s+)?(.+?)\s+timer", text, re.I)
        if m:
            q = m.group(1).strip()
    b.add("cancel_timer", query=q or None)
