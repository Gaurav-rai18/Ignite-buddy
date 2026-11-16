"""Privacy / data report – slot-based."""
from datetime import datetime
from server import config
from server.knowledge.personal import PersonalVectors
from server.features.activity.recorder import recorder_for
from ..model import CONFIRM, SAFE
from ..intents import intent
from ..registry import tool

TABLES = [("reminders", "Reminders", None), ("timers", "Timers", None),
          ("activity_events", "Activity records", "start_ts"), ("summaries", "Daily/session summaries", "created"),
          ("screen_history", "Screen-help history (question + answer only)", "ts"),
          ("actions", "Executed-action log", None)]

def _fmt(ts):
    return datetime.fromtimestamp(ts).strftime("%d %b")

def counts(store):
    out = []
    with store.conn() as con:
        for table, label, tcol in TABLES:
            n = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            span = ""
            if tcol and n:
                lo, hi = con.execute(f"SELECT MIN({tcol}), MAX({tcol}) FROM {table}").fetchone()
                if lo is not None and hi is not None:
                    span = f" ({_fmt(lo)} to {_fmt(hi)})"
            out.append((label, n, span))
    return out

@tool("data_report", SAFE, "Show what data the assistant has stored about the user.", {})
def data_report(s):
    lines = [f"• {label}: {n}{span}" for label, n, span in counts(s.store)]
    try:
        vec = PersonalVectors().count(s.store.key)
        lines.append(f"• Document passages indexed (embeddings): {vec[PersonalVectors.DOCS]}")
        lines.append(f"• Summary embeddings: {vec[PersonalVectors.SUMS]}")
    except Exception:
        pass
    return {"msg": "Data stored about you:\n" + "\n".join(lines)}

@intent("data_report", triggers=[r"(?:what|show).{0,25}(?:data|information).{0,15}(?:stored|you have|about me)",
                                  r"privacy report", r"what do you (?:know|store) about me"],
        slots=[], examples=("what data do you store about me",), priority=90)
def data_report_intent(slots, text, b, mem):
    b.add("data_report")

def _wipe_describe(s):
    return "Permanently delete ALL data the assistant has stored about you"


def _wipe_preview(s):
    return "\n".join(f"{label}: {n}" for label, n, _ in counts(s.store) if n)


@tool("wipe_all_data", CONFIRM, "Delete everything the assistant has stored about the user.", {},
      describe=_wipe_describe, preview=_wipe_preview)
def wipe_all_data(s):
    with s.store.conn() as con:
        for table, _, _ in TABLES:
            con.execute(f"DELETE FROM {table}")
        con.execute("DELETE FROM settings")
    try:
        PersonalVectors().delete_user(s.store.key)                # the vectors too
    except Exception:
        pass
    s.store.purge_storage()
    recorder_for(s.store).reset()
    s.ui.push({"type": "tracking", "paused": False, "seconds": None})
    return {"msg": "All data stored on the server has been deleted. Your notes and tasks on this computer were not touched."}


@intent("wipe_all_data",
        triggers=[r"wipe (?:all )?(?:my )?data", r"(?:delete|erase|clear) all my data", r"forget everything about me"],
        slots=[], examples=("wipe all my data",), priority=91)
def wipe_all_data_intent(slots, text, b, mem):
    b.add("wipe_all_data")
