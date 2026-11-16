"""Device operations backed by the local SQLite database: assignments, timetable, audit log, chat context."""
import time
from datetime import datetime, timedelta
from pathlib import Path

from rapidfuzz import fuzz

from client.localdb import LocalDB
from .errors import Ambiguity, Declined, DeviceError


def _norm_hm(s: str) -> str:
    """Zero-pad HH:MM so lexical compare and sort match clock order (9:30 < 10:00)."""
    try:
        h, m = str(s).strip().split(":", 1)
        return f"{int(h):02d}:{int(m):02d}"
    except (TypeError, ValueError):
        return str(s or "")


DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _fmt_due(ts) -> str:
    if ts is None:
        return "no due date"
    d = datetime.fromtimestamp(ts)
    left = (d - datetime.now()).total_seconds()
    when = d.strftime("%a %d %b, %I:%M %p")
    if left < 0:
        return f"{when} (overdue)"
    return f"{when} (in {int(left // 86400)}d {int(left % 86400 // 3600)}h)" if left >= 86400 else f"{when} (in {int(left // 3600)}h)"


class LocalOps:
    def __init__(self, db: LocalDB, confirm, vault=None):
        self.db, self.confirm, self.vault = db, confirm, vault

    def ops(self):
        return {n[3:]: getattr(self, n) for n in dir(self) if n.startswith("op_")}

    # ---------------- chat ----------------
    def op_chat_context(self, a):
        return {"turns": self.db.chat_context(a.get("query", ""))}

    def op_clear_chat_history(self, a):
        if not self.confirm("Forget our conversation history?", "Only the history kept on this computer is deleted."):
            raise Declined
        return {"msg": f"Deleted {self.db.clear_chat()} remembered conversation turns."}

    # ---------------- assignments ----------------
    def op_list_assignments(self, a):
        flt = (a.get("filter") or "pending").lower()
        rows = self.db.assignments()
        if flt == "pending":
            rows = [r for r in rows if r[4] != "done"]
        elif flt == "done":
            rows = [r for r in rows if r[4] == "done"]
        elif flt == "week":
            end = (datetime.now() + timedelta(days=7)).timestamp()
            rows = [r for r in rows if r[4] != "done" and r[3] is not None and r[3] <= end]
        if not rows:
            return {"msg": "No assignments." if flt == "all" else f"No {flt} assignments."}
        return {"msg": "\n".join(f"{'[DONE]' if st == 'done' else '[ ]'} {t}: {_fmt_due(due)}" for _, t, _, due, st in rows)}

    def op_next_assignment(self, a):
        rows = [r for r in self.db.assignments() if r[4] != "done" and r[3] is not None]
        if not rows:
            return {"msg": "You have no pending assignments with a due date."}
        _, t, desc, due, _ = rows[0]
        return {"msg": f"Next: {t}, due {_fmt_due(due)}." + (f"\n{desc}" if desc else "")}

    def op_set_assignment(self, a):
        status = a["status"]
        if status not in ("pending", "done"):
            raise DeviceError("Status must be done or pending.")
        rows = self.db.assignments()
        if a.get("choice"):
            hit = [r for r in rows if r[1] == a["choice"]]
        else:
            q = a["query"].lower().strip()
            scored = sorted(((fuzz.WRatio(q, r[1].lower()), r) for r in rows), key=lambda x: -x[0])
            if not scored or scored[0][0] < 60:
                raise DeviceError(f"No assignment matches '{a['query']}'.")
            close = [r for s, r in scored if s >= scored[0][0] - 5]
            if len(close) > 1:
                raise Ambiguity("Which assignment?", [r[1] for r in close[:5]])
            hit = [close[0]]
        if not hit:
            raise DeviceError("That assignment no longer exists.")
        self.db.set_assignment_status(hit[0][0], status)
        return {"msg": f"Marked '{hit[0][1]}' as {status}."}

    # ---------------- timetable ----------------
    @staticmethod
    def _slots_text(rows) -> str:
        lines = []
        for _, s, e, t, loc in rows:
            tag = " **[TEST BLACKOUT]**" if "[TEST]" in t or "test" in t.lower() or "exit" in t.lower() else ""
            clean_title = t.replace("[TEST]", "").strip()
            loc_str = f" in **{loc}**" if loc else ""
            lines.append(f"• **{s} - {e}**: {clean_title}{loc_str}{tag}")
        return "\n".join(lines)

    def op_show_timetable(self, a):
        day = (a.get("day") or "today").lower().strip()
        today = datetime.now().weekday()
        home_lab = self.db.get_meta("home_lab")
        sub_batch = self.db.get_meta("sub_batch")
        ta = self.db.get_meta("primary_ta")
        anchor = f"*(Sub-batch: **{sub_batch}** · Home Lab: **{home_lab}**" + (f" · TA: **{ta}**" if ta else "") + ")*\n\n" if home_lab else ""

        if day in ("week", "this week", "weekly", "all"):
            rows = self.db.slots()
            if not rows:
                if home_lab:
                    return {"msg": f"Your timetable is not loaded yet.\nYour assigned workspace is **Home Lab: {home_lab}** (Sub-batch {sub_batch})."}
                return {"msg": "Your timetable is empty (no schedule has been published yet)."}
            out = ["### Weekly Timetable\n" + anchor]
            for wd in range(5):  # 5 working days (Monday - Friday)
                day_rows = sorted([r for r in rows if r[0] == wd], key=lambda r: _norm_hm(r[1]))
                if day_rows:
                    out.append(f"\n**{DAYS[wd].capitalize()}**:\n" + self._slots_text(day_rows))
            return {"msg": "\n".join(out)}
        wd = {"today": today, "tomorrow": (today + 1) % 7, "yesterday": (today - 1) % 7}.get(day)
        if wd is None:
            wd = next((i for i, d in enumerate(DAYS) if d.startswith(day[:3])), None)
        if wd is None:
            raise DeviceError(f"I don't know the day '{day}'.")
        rows = self.db.slots(wd)
        if not rows:
            if home_lab:
                return {"msg": f"Nothing scheduled for {DAYS[wd].capitalize()}.\nPlease report to your **Home Lab: {home_lab}** (Sub-batch {sub_batch})."}
            return {"msg": f"Nothing scheduled for {DAYS[wd].capitalize()}."}
        return {"msg": f"### Timetable for {DAYS[wd].capitalize()}\n{anchor}" + self._slots_text(rows)}

    def op_next_class(self, a):
        now = datetime.now()
        cur_hm = now.strftime("%H:%M")
        today_wd = now.weekday()
        home_lab = self.db.get_meta("home_lab")
        sub_batch = self.db.get_meta("sub_batch")
        ta = self.db.get_meta("primary_ta")
        seat_ctx = (
            f"Outside scheduled lecture hours, please be in your **Home Lab: {home_lab}**"
            + (f" (Sub-batch {sub_batch})" if sub_batch else "")
            + (f" with TA {ta}." if ta else ".")
        ) if home_lab else ""

        # Check if a class/lecture is currently in session right now
        for _, s, e, t, loc in self.db.slots(today_wd):
            if _norm_hm(s) <= cur_hm < _norm_hm(e):
                loc_str = f" in **{loc}**" if loc else ""
                clean_title = t.replace("[TEST]", "").strip()
                test_warn = " *(Assessment in progress - Buddy is in test lockdown)*" if "[TEST]" in t or "test" in t.lower() else ""
                return {"msg": f"Currently in session ({s} - {e}): **{clean_title}**{loc_str}.{test_warn}"}

        for offset in range(8):
            wd = (now.weekday() + offset) % 7
            for _, s, e, t, loc in self.db.slots(wd):
                if offset or _norm_hm(s) > cur_hm:
                    day = "today" if offset == 0 else "tomorrow" if offset == 1 else DAYS[wd].capitalize()
                    loc_str = f" in **{loc}**" if loc else ""
                    clean_title = t.replace("[TEST]", "").strip()
                    test_note = " *(Assessment / Test)*" if "[TEST]" in t or "test" in t.lower() else ""
                    prefix = f"{seat_ctx}\n\n" if seat_ctx else ""
                    return {"msg": f"{prefix}Your next lecture is **{clean_title}** {day} at **{s} - {e}**{loc_str}.{test_note}"}

        if home_lab:
            return {"msg": f"No upcoming lectures found. Your designated seating is **Home Lab: {home_lab}**" + (f" for sub-batch {sub_batch}" if sub_batch else "") + (f" (Primary TA: {ta})" if ta else "") + "."}
        return {"msg": "Nothing is scheduled in your timetable right now."}

    # ---------------- audit ----------------
    def op_show_audit(self, a):
        rows = self.db.recent_audit(15)
        if not rows:
            return {"msg": "No commands have been recorded yet."}
        return {"msg": "\n".join(f"• {time.strftime('%d %b %H:%M', time.localtime(ts))}  {op} {args}  [{st}]" for ts, op, args, st in rows)}

    def op_clear_audit(self, a):
        if not self.confirm("Clear the record of commands run on this computer?", ""):
            raise Declined
        return {"msg": f"Deleted {self.db.clear_audit()} audit entries."}

    # ---------------- day summary (on-device, privacy-friendly) ----------------
    def op_summarize_day(self, a=None):
        """Generates a deterministic summary of the day directly on-device using local DB and Tasks.md.

        Zero LLM calls and zero remote data transmission: 100% privacy-friendly.
        """
        now = datetime.now()
        date_display = now.strftime("%A, %d %b %Y")
        today_wd = now.weekday()
        cur_hm = now.strftime("%H:%M")

        # 1. Tasks analysis from local Vault / Tasks.md
        completed_tasks = []
        pending_today = []
        overdue_tasks = []
        upcoming_tasks = []

        all_tasks = self.vault.get_tasks_view() if self.vault else []

        # If vault task list is empty, fallback to local DB assignments
        if not all_tasks and self.db:
            db_asgns = self.db.assignments()
            for aid, title, desc, due_ts, status in db_asgns:
                done = (status == "done")
                due_str = ""
                is_overdue = False
                is_today = False
                if due_ts:
                    try:
                        due_dt = datetime.fromtimestamp(due_ts)
                        due_str = due_dt.strftime("%Y-%m-%d %H:%M")
                        if not done:
                            if due_dt.date() < now.date():
                                is_overdue = True
                            elif due_dt.date() == now.date():
                                is_today = True
                    except Exception:
                        pass
                all_tasks.append({
                    "text": f"[Assignment] {title}",
                    "done": done,
                    "due": due_str,
                    "is_overdue": is_overdue,
                    "is_today": is_today,
                })

        for t in all_tasks:
            text = t["text"]
            due = t.get("due")
            due_str = f" *(Due: {due})*" if due else ""
            if t.get("done"):
                completed_tasks.append(f"- [x] {text}{due_str}")
            else:
                if t.get("is_today"):
                    pending_today.append(f"- [ ] {text}{due_str}")
                elif t.get("is_overdue") or t.get("is_yesterday"):
                    overdue_tasks.append(f"- [ ] {text}{due_str} **[Overdue]**")
                else:
                    upcoming_tasks.append(f"- [ ] {text}{due_str}")

        total_tasks = len(all_tasks)
        num_done = len(completed_tasks)
        num_remaining = len(pending_today) + len(overdue_tasks) + len(upcoming_tasks)
        pct = int(round((num_done / total_tasks * 100))) if total_tasks > 0 else 0

        # 2. Timetable & Lectures for today
        day_slots = sorted(self.db.slots(today_wd), key=lambda r: _norm_hm(r[1])) if self.db else []
        home_lab = self.db.get_meta("home_lab") if self.db else None
        sub_batch = self.db.get_meta("sub_batch") if self.db else None
        ta = self.db.get_meta("primary_ta") if self.db else None

        concluded_slots = []
        current_slot = None
        upcoming_slots = []

        for _, s, e, title, loc in day_slots:
            clean_title = title.replace("[TEST]", "").strip()
            loc_str = f" in **{loc}**" if loc else ""
            tag = " *(Assessment / Test)*" if "[TEST]" in title or "test" in title.lower() else ""
            desc = f"- **{s} - {e}**: {clean_title}{loc_str}{tag}"
            if _norm_hm(e) <= cur_hm:
                concluded_slots.append(desc)
            elif _norm_hm(s) <= cur_hm < _norm_hm(e):
                current_slot = desc
            else:
                upcoming_slots.append(desc)

        # 3. Assemble Markdown summary
        sections = [
            f"### Day Summary & Progress\n"
            f"> **Date:** {date_display} · **Status:** {num_done} of {total_tasks} tasks completed ({pct}%)\n"
        ]

        # Completed tasks section
        if completed_tasks:
            sections.append(f"#### Completed Tasks ({num_done})\n" + "\n".join(completed_tasks))
        else:
            sections.append("#### Completed Tasks\n*No tasks completed yet today.*")

        # Remaining tasks section
        if num_remaining > 0:
            remaining_lines = []
            if pending_today:
                remaining_lines.append("**Due Today:**\n" + "\n".join(pending_today))
            if overdue_tasks:
                remaining_lines.append("**Overdue / Carried Over:**\n" + "\n".join(overdue_tasks))
            if upcoming_tasks:
                remaining_lines.append("**Upcoming / Backlog:**\n" + "\n".join(upcoming_tasks))
            sections.append(f"#### Remaining Tasks ({num_remaining})\n" + "\n\n".join(remaining_lines))
        else:
            if total_tasks > 0:
                sections.append("#### Remaining Tasks\n*All tasks completed for today.*")
            else:
                sections.append("#### Remaining Tasks\n*Your task list is empty. Add tasks via Tasks.md or say 'add task <task name>'.*")

        # Schedule section
        sched_lines = []
        if current_slot:
            sched_lines.append(f"**In Session Now:**\n{current_slot}")
        if upcoming_slots:
            sched_lines.append("**Upcoming Sessions Today:**\n" + "\n".join(upcoming_slots))
        elif concluded_slots and not current_slot:
            sched_lines.append("*All scheduled lectures for today have concluded.*")
        elif not day_slots:
            sched_lines.append("*No classes scheduled for today.*")

        if home_lab:
            seat_info = f"*(Designated Seating: **Home Lab: {home_lab}**" + (f", Sub-batch **{sub_batch}**" if sub_batch else "") + (f", TA **{ta}**" if ta else "") + ")*"
            sched_lines.append(seat_info)

        if sched_lines:
            sections.append("#### Today's Schedule\n" + "\n\n".join(sched_lines))

        # 4. Workstation & Application Usage from local DB
        act = self._get_activity_stats(a)
        if act and act.get("active"):
            act_lines = [
                f"- **Active Time:** {act['active']} · **Idle Time:** {act['idle']}" + (f" *(Session: {act['first']} to {act['last']})*" if act.get("first") else ""),
            ]
            if act.get("apps"):
                apps_str = ", ".join(f"**{app}** ({dur})" for app, dur in act["apps"])
                act_lines.append(f"- **Top Applications:** {apps_str}")
            if act.get("cats"):
                cats_str = ", ".join(f"{cat.capitalize()} ({dur})" for cat, dur in act["cats"])
                act_lines.append(f"- **Categories:** {cats_str}")
            sections.append("#### Application & Workstation Usage\n" + "\n".join(act_lines))

        return {"msg": "\n\n".join(sections)}

    def _get_activity_stats(self, a=None) -> dict | None:
        """Loads workstation and application usage directly from the local database without LLMs."""
        if a and a.get("activity"):
            try:
                import json
                return json.loads(a["activity"]) if isinstance(a["activity"], str) else a["activity"]
            except Exception:
                pass

        now = datetime.now()
        s_day = datetime.combine(now.date(), datetime.min.time()).timestamp()
        e_day = now.timestamp()

        candidates = []
        for base in [Path("data/users"), Path.home() / ".ignite_buddy_server" / "users", Path.home() / ".trainee_assistant_server" / "users"]:
            if base.exists():
                candidates.extend(sorted(base.glob("*/local.db"), key=lambda p: p.stat().st_mtime, reverse=True))

        for db_path in candidates:
            if db_path.is_file():
                try:
                    import sqlite3
                    con = sqlite3.connect(f"file:{db_path.resolve()}?mode=ro", uri=True)
                    has_table = con.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='activity_events'").fetchone()[0]
                    if not has_table:
                        con.close()
                        continue
                    rows = con.execute("SELECT start_ts, end_ts, app, title, idle FROM activity_events WHERE end_ts > ? AND start_ts < ? ORDER BY start_ts", (s_day, e_day)).fetchall()
                    con.close()
                    if rows:
                        events = [{"start": max(r[0], s_day), "end": min(r[1], e_day), "app": r[2], "title": r[3], "idle": r[4]} for r in rows]
                        from server.features.activity import sessionize
                        from server.util.timeparse import fmt_duration
                        _, stats = sessionize.analyze(events)
                        if stats.get("active"):
                            return {
                                "active": fmt_duration(stats["active"]),
                                "idle": fmt_duration(stats["idle"]),
                                "first": sessionize.hhmm(stats["first"]) if stats.get("first") else "",
                                "last": sessionize.hhmm(stats["last"]) if stats.get("last") else "",
                                "focus_pct": f"{stats.get('focus_pct', 0):.0f}%",
                                "apps": [(app, fmt_duration(sec)) for app, sec in stats["apps"].most_common(5)],
                                "cats": [(cat, fmt_duration(sec)) for cat, sec in stats["cats"].most_common(4)],
                            }
                except Exception:
                    continue
        return None
