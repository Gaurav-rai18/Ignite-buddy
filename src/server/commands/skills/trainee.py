"""Programme data (assignments, timetable, history) + schedule-aware intents.

TRUE DROP-IN: only uses existing device tools (SHOW_TIMETABLE, NEXT_CLASS, …)
plus one optional SERVER tool `schedule_lookup` that calls the existing
ScheduleTool when the full app is present. No orchestrator or client changes
required.
"""
from __future__ import annotations
import re
from shared import protocol as P
from ..model import CONFIRM, Incomplete, NoMatch, SAFE, ToolError
from ..intents import intent
from ..registry import device_tool, tool

# Existing device tools – already known to client + protocol
device_tool(P.LIST_ASSIGNMENTS, SAFE, "List assignments (pending, all, done, week).", {"filter": "str?"})
device_tool(P.NEXT_ASSIGNMENT, SAFE, "Say which assignment is due next.", {})
device_tool(P.SET_ASSIGNMENT, SAFE, "Mark an assignment done or pending.", {"query": "str", "status": "str"})
device_tool(P.SHOW_TIMETABLE, SAFE, "Show the timetable for a day or the week.", {"day": "str?"})
device_tool(P.NEXT_CLASS, SAFE, "Say what the next class is.", {})
device_tool(P.SHOW_AUDIT, SAFE, "List the commands recently run on this PC.", {})
device_tool(P.CLEAR_AUDIT, CONFIRM, "Clear the command history (the PC asks first).", {})
device_tool(P.CLEAR_CHAT, CONFIRM, "Forget the remembered conversation (the PC asks first).", {})


def _batch_from_session(s):
    """Best-effort batch id from the live session (same logic as orchestrator)."""
    for obj in (
        s,
        getattr(s, "user", None),
        getattr(s, "profile", None),
        getattr(s, "auth", None),
        getattr(s, "store", None),
    ):
        if obj is None:
            continue
        b = obj.get("batch") if isinstance(obj, dict) else getattr(obj, "batch", None)
        if b:
            return b
        prof = obj.get("profile") if isinstance(obj, dict) else getattr(obj, "profile", None)
        if isinstance(prof, dict) and prof.get("batch"):
            return prof["batch"]
    return None


def _format_day_schedule(title: str, result) -> str:
    if not result.get("slots"):
        return f"No classes scheduled on {result.get('day', 'that day')}."
    lines = [title, f"{result.get('day', '')} | {len(result['slots'])} Sessions", ""]
    for i, s in enumerate(result["slots"], 1):
        slot_title = " ".join(str(s.get("title", "")).split())
        venue = " ".join(str(s.get("location", "")).split())
        lines.append(f"{i}. {s.get('start', '')} - {s.get('end', '')}")
        lines.append(f"   {slot_title}")
        if venue.lower() != slot_title.lower():
            lines.append(f"   Location: {venue}")
        lines.append("")
    return "\n".join(lines).strip()


def _format_schedule_result(result: dict) -> str:
    """Same wording as orchestrator._schedule_reply (without UI side-effects)."""
    if not result:
        return "I couldn't look up the schedule."
    if not result.get("success", True) and result.get("success") is not True:
        # schedule_tool returns success: False on errors
        if result.get("success") is False:
            return result.get("message") or "Something went wrong with the schedule."
    if result.get("text"):
        return result["text"]
    if result.get("message") and result.get("intent") is None:
        return result["message"]

    intent = result.get("intent") or ""

    if intent == "subject_venue":
        return (
            f"{result.get('subject')} is scheduled on {result.get('day')} "
            f"from {result.get('start')} to {result.get('end')} in {result.get('venue')}."
        )
    if intent == "subject_time":
        return (
            f"{result.get('subject')} is scheduled on {result.get('day')} "
            f"from {result.get('start')} to {result.get('end')}."
        )
    if intent == "subject_check":
        return result.get("text") or result.get("message") or (
            f"{result.get('subject', 'That subject')}: see your timetable."
        )
    if intent == "next_class" and result.get("slot"):
        s = result["slot"]
        return (
            f"Your next class is {s.get('title')} from {s.get('start')} "
            f"to {s.get('end')} in {s.get('location')}."
        )
    if intent == "current_class" and result.get("slot"):
        s = result["slot"]
        return (
            f"Right now: {s.get('title')} from {s.get('start')} "
            f"to {s.get('end')} in {s.get('location')}."
        )
    if intent == "today_schedule":
        return _format_day_schedule("TODAY'S SCHEDULE", result)
    if intent == "tomorrow_schedule":
        return _format_day_schedule("TOMORROW'S SCHEDULE", result)
    if intent == "day_schedule":
        day = result.get("day") or "that day"
        return _format_day_schedule(f"{str(day).upper()} SCHEDULE", result)
    if intent == "subject_week":
        if not result.get("matches"):
            return "No classes found for that subject this week."
        return "\n".join(
            f"{m.get('day')} : {m.get('start')} - {m.get('end')} ({m.get('venue')})"
            for m in result["matches"]
        )
    if intent == "first_class" and result.get("slot"):
        s = result["slot"]
        return f"First class: {s.get('title')} at {s.get('start')} in {s.get('location')}."
    if intent == "last_class" and result.get("slot"):
        s = result["slot"]
        return f"Last class: {s.get('title')} at {s.get('start')} in {s.get('location')}."
    if intent == "class_count":
        n = result.get("count", len(result.get("slots") or []))
        day = result.get("day") or "that day"
        return f"You have {n} class(es) on {day}."
    return result.get("message") or result.get("text") or "Schedule looked up."



@tool("schedule_lookup", SAFE,
      "Answer a timetable / subject schedule question via the existing ScheduleTool.",
      {"intent": "str", "subject": "str?", "day": "str?"})
def schedule_lookup(s, intent, subject=None, day=None):
    """SERVER tool – drop-in. Calls ScheduleTool.execute; no client change required.

    Also works if the orchestrator is patched to intercept this tool name and
    call _schedule() for richer UI streaming; without a patch, executor runs
    this function and ui.say()'s the returned msg.
    """
    try:
        from server.chat.schedule_tool import schedule_tool
    except Exception as e:
        raise ToolError(
            "Schedule lookup is not available right now. "
            "Try 'show my timetable' or 'what is my next class'."
        ) from e
    batch = _batch_from_session(s)
    if not batch:
        raise ToolError("I couldn't find your batch. Please log in again.")
    result = schedule_tool.execute(
        batch=batch,
        intent=intent,
        subject=subject or None,
        day=day or None,
    )
    if not isinstance(result, dict):
        result = {"message": str(result)}
    return {"msg": _format_schedule_result(result)}

# Alias so plans using tool name "schedule_query" also work
from ..registry import REGISTRY as _REG
if "schedule_lookup" in _REG:
    _REG["schedule_query"] = _REG["schedule_lookup"]



def _clean_query(q: str) -> str:
    q = re.sub(r"\b(?:the|my|a|an|assignment|assign|homework|project)\b", " ", q, flags=re.I)
    return re.sub(r"\s+", " ", q).strip()


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------
@intent("next_assignment",
        triggers=[
            r"(?:when is|what(?:'s| is)|which).{0,20}next assignment",
            r"what(?:'s| is) due next",
            r"next (?:assignment|deadline|submission)",
            r"which assignment is (?:due|next)",
        ],
        slots=[], examples=(
            "when is my next assignment due",
            "what's due next",
            "next assignment",
            "which assignment is due next",
        ), priority=40)
def next_assignment(slots, text, b, mem):
    b.add(P.NEXT_ASSIGNMENT)


@intent("list_assignments",
        triggers=[
            r"(?:list|show|what|which|display).{0,30}assignments?",
            r"(?:do i have|are there|any).{0,20}assignments?",
            r"pending assignments?",
            r"my (?:pending|upcoming|completed|all) assignments?",
            r"assignments? (?:pending|upcoming|completed|done|this week|for the week)",
            r"what assignments do i have",
            r"assignments? (?:do i|i) have",
        ],
        slots=[
            {"name": "status", "extractor": "status", "required": False},
            {"name": "day", "extractor": "day", "required": False},
        ],
        examples=(
            "show my pending assignments",
            "list all assignments",
            "what assignments do I have this week",
            "completed assignments",
            "do I have any pending assignments",
        ), priority=41)
def list_assignments(slots, text, b, mem):
    flt = (slots.get("status") or "pending").lower()
    t = text.lower()
    if slots.get("day") and "week" in (slots.get("day") or ""):
        flt = "week"
    if "week" in t:
        flt = "week"
    if any(w in t for w in ("completed", "done", "finished", "submitted")):
        flt = "done"
    if "all" in t and "pending" not in t:
        flt = "all"
    if "upcoming" in t:
        flt = "pending"
    b.add(P.LIST_ASSIGNMENTS, filter={"upcoming": "pending", "completed": "done", "finished": "done"}.get(flt, flt))


@intent("assignment_done",
        triggers=[
            r"mark.{0,40}(?:done|complete|finished|submitted)",
            r"(?:i |i've |i have )?(?:submitted|finished|completed|done).{0,25}assignment",
            r"(?:assignment|homework).{0,20}(?:is |as )?(?:done|complete|finished|submitted)",
            r"i (?:finished|completed|submitted) (?:the )?.+",
        ],
        slots=[{"name": "subject", "extractor": "subject", "required": False}],
        examples=(
            "mark the react assignment as done",
            "I submitted the java assignment",
            "mark assignment 3 complete",
            "react assignment is done",
            "I finished the DBMS homework",
        ), priority=34)
def assignment_done(slots, text, b, mem):
    q = slots.get("subject")
    if not q:
        m = re.search(
            r"(?:assignment|homework|project|lab)\s+(?:(?:number|#)?\s*)?(.+?)\s+(?:as\s+)?(?:done|complete|finished|submitted)",
            text, re.I)
        if not m:
            m = re.search(r"mark(?:\s+the)?\s+(.+?)\s+(?:assignment|homework|project)", text, re.I)
        if not m:
            m = re.search(
                r"(?:submitted|finished|completed|done)(?:\s+the)?\s+(.+?)(?:\s+(?:assignment|homework|project))?",
                text, re.I)
        if m:
            q = m.group(1).strip()
    if not q:
        ent = mem.last("assignment")
        if ent:
            q = ent.value
    if not q:
        raise Incomplete("Which assignment should I mark as done?")
    b.add(P.SET_ASSIGNMENT, query=_clean_query(q), status="done")
    mem.remember("assignment", _clean_query(q))


@intent("assignment_reopen",
        triggers=[
            r"(?:reopen|unmark|re-?open).{0,25}assignment",
            r"mark.{0,35}(?:pending|not done|incomplete|open)",
            r"(?:assignment|homework).{0,15}(?:is |as )?(?:pending|not done)",
        ],
        slots=[{"name": "subject", "extractor": "subject", "required": False}],
        examples=("reopen the react assignment", "mark java assignment as pending"), priority=35)
def assignment_reopen(slots, text, b, mem):
    q = slots.get("subject")
    if not q:
        m = re.search(r"(?:reopen|unmark)(?:\s+the)?\s+(.+?)\s+assignment", text, re.I)
        if not m:
            m = re.search(r"mark(?:\s+the)?\s+(.+?)\s+assignment", text, re.I)
        if m:
            q = m.group(1).strip()
    if not q:
        ent = mem.last("assignment")
        if ent:
            q = ent.value
    if not q:
        raise Incomplete("Which assignment should I mark as pending?")
    b.add(P.SET_ASSIGNMENT, query=_clean_query(q), status="pending")


@intent("open_assignment",
        triggers=[
            r"open.{0,25}assignment",
            r"(?:go to|show me|take me to).{0,20}assignment",
            r"open (?:the )?(?:react|java|dbms|python|node).{0,15}(?:assignment|project|folder)",
        ],
        slots=[{"name": "subject", "extractor": "subject", "required": False}],
        examples=(
            "open the react assignment",
            "open java assignment 3",
            "open my DBMS project folder",
        ), priority=46)
def open_assignment(slots, text, b, mem):
    q = slots.get("subject")
    if not q:
        m = re.search(
            r"(?:open|go to|show me|take me to)(?:\s+the|\s+my)?\s+(.+?)(?:\s+(?:assignment|project|folder|directory))?",
            text, re.I)
        if m:
            q = m.group(1).strip()
    if not q:
        raise Incomplete("Which assignment or project should I open?")
    sid = b.add(P.FIND_FOLDER, query=_clean_query(q) + " assignment")
    b.add(P.OPEN_FOLDER, path=b.ref(sid))
    mem.remember("folder", _clean_query(q))
    mem.remember("assignment", _clean_query(q))


# ---------------------------------------------------------------------------
# Timetable / Class – existing device tools + schedule_lookup (server)
# ---------------------------------------------------------------------------
@intent("next_class",
        triggers=[
            r"(?:what(?:'s| is)|when is|which).{0,20}next (?:class|session|lecture|slot|lab|period)",
            r"where (?:do|should) i (?:sit|go|be)",
            r"where is my (?:class|session|lecture|lab)",
            r"what am i (?:having|doing) (?:right )?now",
            r"what am i having",
            r"(?:current|ongoing) (?:class|session|lecture)",
            r"what(?:'s| is) (?:my )?(?:next|current) (?:class|lecture|lab)",
        ],
        slots=[], examples=(
            "what is my next class",
            "where should I sit",
            "what's the next lecture",
            "current class",
            "what am I having right now",
        ), priority=44)
def next_class(slots, text, b, mem):
    t = text.lower()
    if any(w in t for w in ("current", "right now", "now", "ongoing", "this period", "having")):
        # Prefer rich schedule_lookup when available; still works offline via next_class device tool
        b.add("schedule_lookup", intent="current_class")
    else:
        b.add(P.NEXT_CLASS)


@intent("timetable",
        triggers=[
            r"(?:timetable|time table|schedule|classes|lectures|periods)\b",
            r"do i have (?:any )?(?:class|classes|sessions?|lectures?)",
            r"(?:my|the) (?:timetable|schedule)(?:\s+for)?",
            r"what (?:classes|lectures|sessions) (?:do i have|are there)",
            r"show (?:me )?(?:my )?(?:timetable|schedule|classes)",
            r"classes (?:today|tomorrow|on\s+\w+|this week)",
        ],
        slots=[{"name": "day", "extractor": "day", "required": False}],
        examples=(
            "what is my timetable today",
            "schedule for friday",
            "do I have any classes tomorrow",
            "show my timetable",
            "classes this week",
            "timetable for Monday",
        ), priority=45)
def timetable(slots, text, b, mem):
    d = (slots.get("day") or "today").lower()
    d = d.replace("the week", "week").replace("this week", "week")
    # Existing device tool only – true drop-in, no orchestrator change
    b.add(P.SHOW_TIMETABLE, day=d)


@intent("first_last_class",
        triggers=[
            r"(?:first|last|earliest|latest) (?:class|lecture|session|period|slot)",
            r"what(?:'s| is) (?:the )?(?:first|last) (?:class|lecture)",
        ],
        slots=[{"name": "day", "extractor": "day", "required": False}],
        examples=("first class today", "what is the last lecture on Friday"), priority=47)
def first_last_class(slots, text, b, mem):
    d = (slots.get("day") or "today").lower()
    intent_name = "first_class" if "first" in text.lower() or "earliest" in text.lower() else "last_class"
    b.add("schedule_lookup", intent=intent_name, day=d)


@intent("class_count",
        triggers=[
            r"how many (?:classes|lectures|sessions|periods)",
            r"(?:number|count) of (?:classes|lectures)",
        ],
        slots=[{"name": "day", "extractor": "day", "required": False}],
        examples=("how many classes today", "how many lectures on Monday"), priority=48)
def class_count(slots, text, b, mem):
    d = (slots.get("day") or "today").lower()
    b.add("schedule_lookup", intent="class_count", day=d)


@intent("subject_schedule",
        triggers=[
            r"(?:do (?:we|i) have|is there|are there).{0,10}(?:a |any )?(?:java|python|react|dbms|sql|dsa|os|cn|oop|ml|android|node)\b",
            r"where (?:is|are).{0,15}(?:the )?(?:java|python|react|dbms|sql|dsa|os|cn|oop|ml|android|node)\b",
            r"when (?:is|are).{0,15}(?:the )?(?:java|python|react|dbms|sql|dsa|os|cn|oop|ml|android|node).{0,15}(?:class|lecture|lab|session)?",
            r"(?:which day|what day|what time).{0,10}(?:is|are).{0,10}(?:the )?(?:java|python|react|dbms|sql|dsa|os|cn)\b",
            r"(?:java|python|react|dbms|sql|dsa|os|cn|oop|ml|android|node).{0,20}(?:today|tomorrow|class|lecture|lab|when|where|schedule|venue|room)",
            r"(?:class|lecture|lab|session).{0,10}(?:for|of|on).{0,10}(?:java|python|react|dbms|sql|dsa)",
            r"(?:java|python|react|dbms|sql|dsa|os|cn)\s+(?:venue|room|location|schedule)",
        ],
        slots=[
            {"name": "subject", "extractor": "subject", "required": False},
            {"name": "day", "extractor": "day", "required": False},
        ],
        examples=(
            "do we have java today",
            "where is DBMS",
            "when is the react lab",
            "what time is python class",
            "which day is OS lecture",
            "is there a DSA class tomorrow",
            "DBMS venue",
            "java schedule this week",
        ), priority=39)
def subject_schedule(slots, text, b, mem):
    subject = slots.get("subject")
    day = slots.get("day")
    t = text.lower()

    if not subject:
        m = re.search(
            r"\b(java|python|react|dbms|sql|dsa|os|cn|oop|ml|android|node|[A-Za-z][A-Za-z0-9+#]{1,12})\b",
            text, re.I)
        if m and m.group(1).lower() not in (
            "do", "we", "have", "is", "there", "any", "the", "my", "what", "when", "where", "which",
            "class", "lecture", "lab", "today", "tomorrow", "schedule", "time", "day", "room", "venue",
        ):
            subject = m.group(1)

    if not subject:
        # Let the orchestrator's schedule_tool path handle it (parse returns None)
        raise NoMatch

    asks_days = any(p in t for p in ("which day", "what day", "this week", "whole week", "all days", "per week"))
    asks_where = any(p in t for p in ("where", "venue", "room", "location", "hall"))
    asks_when = any(p in t for p in ("when", "what time", "timing", "starts", "start time"))

    if asks_days or "week" in t:
        intent_name = "subject_week"
    elif asks_where:
        intent_name = "subject_venue"
    elif asks_when:
        intent_name = "subject_time"
    else:
        intent_name = "subject_check"

    b.add("schedule_lookup", intent=intent_name, subject=subject, day=day or None)
    mem.remember("subject", subject)


# ---------------------------------------------------------------------------
# History / audit
# ---------------------------------------------------------------------------
@intent("show_audit",
        triggers=[
            r"(?:show|list|what).{0,20}(?:command|action) (?:history|log)",
            r"what (?:did you|have you) (?:do|done)",
            r"(?:recent|last) (?:commands|actions)",
        ],
        slots=[], examples=("show my command history", "what did you do recently"), priority=50)
def show_audit(slots, text, b, mem):
    b.add(P.SHOW_AUDIT)


@intent("clear_audit",
        triggers=[r"clear.{0,20}(?:command|action) (?:history|log)"],
        slots=[], examples=("clear my command history",), priority=51)
def clear_audit(slots, text, b, mem):
    b.add(P.CLEAR_AUDIT)


@intent("clear_chat",
        triggers=[
            r"(?:forget|clear|reset).{0,20}(?:conversation|chat|history|memory)",
            r"start (?:a )?new (?:conversation|chat)",
        ],
        slots=[], examples=("forget our conversation", "clear chat history"), priority=52)
def clear_chat(slots, text, b, mem):
    b.add(P.CLEAR_CHAT)
