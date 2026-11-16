"""
One request = one call to process(session, text). No transport code, no model deciding what to do.

    route (rules) -> deterministic command  |  screen help  |  summary  |  activity Q&A  |  docs Q&A
                     |  schedule  |  browser  |  chat (+RAG)
"""
import json
import logging
import webbrowser
from datetime import date, timedelta
from urllib.parse import quote_plus

from server import commands, llm
from server.chat import get_chat_service
from server.chat.schedule_tool import schedule_tool
from server.commands import PlanError
from server.features import screen_help
from server.features.activity import qa, sessionize, summarize
from server.util.text import speakable
from server.util.timeparse import fmt_duration
from shared import protocol as P
from . import router
from .session import Cancelled

log = logging.getLogger("orchestrator")
SPEAK_LIMIT = 300


def _stream(ui, chunks) -> str:
    ui.state("generating")
    parts = []
    for c in chunks:
        if c:
            parts.append(c)
            ui.token(c)
    ui.end_message()
    return "".join(parts)


def _direct_reply(ui, message: str):
    """Show a complete message in the chat (frontend) in one go."""
    ui.state("generating")
    ui.token(message)
    ui.end_message()
    return message


def _remember(session, user_text, reply):
    session.history += [{"role": "user", "content": user_text}, {"role": "assistant", "content": reply}]
    del session.history[:-40]


def _screen(session, question):
    ui = session.ui
    ui.state("thinking")
    cap = ui.capture_screen()
    if not cap:
        ui.say("Screen help cancelled.")
        return "Okay."
    reply = _stream(ui, screen_help.answer(session, question, cap, progress=ui.say))

    return speakable(reply, SPEAK_LIMIT)


def _summary(session, which):
    ui = session.ui
    # Prioritize privacy-friendly on-device deterministic day summary (no data sent to LLM)
    if hasattr(ui, "device_call") and which != "yesterday":
        try:
            device_args = {}
            if hasattr(session, "store") and session.store:
                try:
                    day = date.today()
                    s, e = summarize.day_bounds(day)
                    events = summarize.load_events(session.store, s.timestamp(), e.timestamp())
                    if events:
                        _, stats = sessionize.analyze(events)
                        if stats.get("active"):
                            device_args["activity"] = json.dumps({
                                "active": fmt_duration(stats["active"]),
                                "idle": fmt_duration(stats["idle"]),
                                "first": sessionize.hhmm(stats["first"]) if stats.get("first") else "",
                                "last": sessionize.hhmm(stats["last"]) if stats.get("last") else "",
                                "focus_pct": f"{stats.get('focus_pct', 0):.0f}%",
                                "apps": [(app, fmt_duration(sec)) for app, sec in stats["apps"].most_common(5)],
                                "cats": [(cat, fmt_duration(sec)) for cat, sec in stats["cats"].most_common(4)],
                            })
                except Exception as ex:
                    log.warning("failed packaging activity stats for device summary: %s", ex)
            res = ui.device_call(P.SUMMARIZE_DAY, device_args)
            if res and res.status == P.OK and res.data.get("msg"):
                msg = res.data["msg"]
                ui.say(msg)
                return speakable(msg, SPEAK_LIMIT)
        except Exception as e:
            log.warning("device_call summarize_day failed, falling back: %s", e)
    day = date.today() - timedelta(days=1 if which == "yesterday" else 0)
    reply = _stream(ui, summarize.stream_day_summary(session.store, day, progress=ui.say))
    return speakable(reply, SPEAK_LIMIT)


def _index(session, folder):
    ui = session.ui
    ui.state("thinking")
    n = get_chat_service().personal_docs.index_folder(session, folder, say=ui.say)
    return f"Indexed {n} new chunks." if n else "Nothing new to index."


def _run_command(session, plan) -> bool:
    ui = session.ui
    try:
        plan = commands.validate(plan)
    except PlanError as e:
        log.warning("invalid plan from parser: %s", e)
        ui.say("I couldn't build a safe plan for that.")
        return False
    return commands.run_plan(session, plan["steps"])


# ---------------------------------------------------------
# Browser
# ---------------------------------------------------------
def _browser(session, extra):
    """Open a web search (or a given URL) in the browser on this machine."""
    ui = session.ui
    query = (extra.get("query") or "").strip()
    url = extra.get("url")

    if not url and not query:
        return _direct_reply(ui, "What should I search for?")

    if not url:
        url = "https://www.google.com/search?q=" + quote_plus(query)

    try:
        if hasattr(ui, "device_call"):
            if extra.get("url"):
                ui.device_call(P.OPEN_URL, {"url": url})
            else:
                ui.device_call(P.WEB_SEARCH, {"query": query})
        else:
            webbrowser.open(url)
    except Exception:
        log.exception("failed launching web browser search")

    message = f"Searching the web for {query}." if query else f"Opening {url}."
    _direct_reply(ui, message)
    return message


# ---------------------------------------------------------
# Schedule
# ---------------------------------------------------------
def _format_day_schedule(title: str, result) -> str:
    if not result["slots"]:
        return f"No classes scheduled on {result['day']}."

    lines = [
        title,
        f"{result['day']} | {len(result['slots'])} Sessions",
        "",
    ]

    for i, s in enumerate(result["slots"], 1):
        slot_title = " ".join(str(s["title"]).split())
        venue = " ".join(str(s["location"]).split())

        lines.append(f"{i}. {s['start']} - {s['end']}")
        lines.append(f"   {slot_title}")

        if venue.lower() != slot_title.lower():
            lines.append(f"   Location: {venue}")

        lines.append("")

    return "\n".join(lines).strip()


def _schedule_reply(ui, result):
    """Turn a schedule_tool result into a chat message (shown in the frontend)."""
    if not result.get("success"):
        message = result.get("message", "Something went wrong with the schedule.")
        _direct_reply(ui, message)
        return message

    # Answers the tool already worded ("Yes, you have Java today ...")
    if result.get("text"):
        message = result["text"]
        _direct_reply(ui, message)
        return speakable(message, SPEAK_LIMIT)

    intent = result["intent"]

    if intent == "subject_venue":
        message = (
            f"{result['subject']} is scheduled on {result['day']} "
            f"from {result['start']} to {result['end']} in {result['venue']}."
        )

    elif intent == "subject_time":
        message = (
            f"{result['subject']} is scheduled on {result['day']} "
            f"from {result['start']} to {result['end']}."
        )

    elif intent == "next_class":
        s = result["slot"]
        message = (
            f"Your next class is {s['title']} from {s['start']} "
            f"to {s['end']} in {s['location']}."
        )

    elif intent == "today_schedule":
        message = _format_day_schedule("TODAY'S SCHEDULE", result)

    elif intent == "tomorrow_schedule":
        message = _format_day_schedule("TOMORROW'S SCHEDULE", result)

    elif intent == "day_schedule":
        message = _format_day_schedule(f"{result['day'].upper()} SCHEDULE", result)

    elif intent == "subject_week":
        if not result["matches"]:
            message = "No classes found for that subject this week."
        else:
            message = "\n".join(
                f"{m['day']} : {m['start']} - {m['end']} ({m['venue']})"
                for m in result["matches"]
            )

    else:
        message = "Unsupported schedule result."

    _direct_reply(ui, message)
    return speakable(message, SPEAK_LIMIT)


def _batch(session):
    """The logged-in user's batch, or None if the session doesn't have one."""
    for obj in (
        session,
        getattr(session, "user", None),
        getattr(session, "profile", None),
        getattr(session, "auth", None),
    ):
        if obj is None:
            continue
        b = obj.get("batch") if isinstance(obj, dict) else getattr(obj, "batch", None)
        if b:
            return b
    return None


def _schedule(session, extra):
    ui = session.ui
    ui.state("thinking")

    batch = _batch(session)
    print("[orchestrator] batch from session:", repr(batch))
    if not batch:
        log.warning("schedule: no batch on session: %s", session.__dict__)
        return _direct_reply(ui, "I couldn't find your batch. Please log in again.")

    result = schedule_tool.execute(
        batch=batch,
        intent=extra.get("intent"),
        subject=extra.get("subject"),
        day=extra.get("day"),
    )
    return _schedule_reply(ui, result)


# ---------------------------------------------------------
# Entry points
# ---------------------------------------------------------
def process(session, text: str):
    """Returns a short spoken reply (or None). Raises Cancelled if the user cancelled."""
    session.ui.state("thinking")
    try:
        return _dispatch(session, text.strip(), allow_mixed=True)
    except llm.LLMError as e:
        session.ui.say(str(e))
        return "I couldn't reach the model."


def _dispatch(session, low: str, allow_mixed: bool):
    ui = session.ui
    # ---- slash shortcuts (explicit, deterministic) ----
    if low.startswith("/screen"):
        return _screen(session, low[7:].strip() or screen_help.DEFAULT_QUESTION)
    if low.startswith("/summary"):
        return _summary(session, "yesterday" if "yesterday" in low else "today")
    if low.startswith("/index"):
        folder = low[6:].strip()
        return _index(session, folder) if folder else "Usage: /index <folder>"
    if low.startswith("/ask") or low.startswith("/search"):
        prefix_len = 4 if low.startswith("/ask") else 7
        q = low[prefix_len:].strip()
        if not q:
            ui.say("Please provide a question or search query.")
            return "Please provide a question to search."
        reply = _stream(ui, get_chat_service().stream_rag_answer(session, q))
        _remember(session, q, reply)
        return speakable(reply, SPEAK_LIMIT)

    r = router.route(low, allow_mixed)
    log.info("route kind=%s extra=%s", r.kind, getattr(r, "extra", None))

    if r.kind == "command":
        return "Done." if _run_command(session, r.plan) else "Sorry, that didn't complete."
    if r.kind == "mixed":
        # "<command> and <question/rag>": each half is handled by its own engine; neither can swallow the other.
        rest = r.extra["remainder"]
        if r.extra["order"] == "command_first":
            ok = _run_command(session, r.plan)
            answer = _dispatch(session, rest, allow_mixed=False)
            return (answer if ok else f"The command didn't complete. {answer or ''}").strip()
        answer = _dispatch(session, rest, allow_mixed=False)
        ok = _run_command(session, r.plan)
        return f"{answer or ''} {'Done.' if ok else 'The command did not complete.'}".strip()
    if r.kind in ("clarify", "refuse", "smalltalk"):
        ui.say(r.message)
        return r.message
    # Natural schedule questions ("do we have java today?") win over the
    # router's guess, but never over commands, screen help or summaries.
    if r.kind not in ("screen", "summary", "activity") and _batch(session):
        parsed = schedule_tool.parse(low, _batch(session))
        if parsed:
            return _schedule(session, parsed)
    if r.kind == "screen":
        return _screen(session, r.extra["question"])
    if r.kind == "summary":
        return _summary(session, r.extra["day"])
    if r.kind == "activity":
        return speakable(_stream(ui, qa.answer(session.store, r.extra["question"])), SPEAK_LIMIT)
    if r.kind == "rag":
        reply = _stream(ui, get_chat_service().stream_rag_answer(session, r.extra["question"]))
        _remember(session, r.extra["question"], reply)
        return speakable(reply, SPEAK_LIMIT)
    if r.kind == "schedule":
        return _schedule(session, r.extra)
    if r.kind == "browser":
        return _browser(session, r.extra)

    query = r.extra.get("question") or r.extra.get("query") or low
    reply = _stream(ui, get_chat_service().stream_reply(session, query))
    _remember(session, query, reply)
    return speakable(reply, SPEAK_LIMIT)
