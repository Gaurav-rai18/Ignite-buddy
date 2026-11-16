"""
Notes and tasks, stored as plain files in a dedicated folder ON THIS COMPUTER (default ~/Documents/IgniteBuddy):

    IgniteBuddy/
        Notes/2026-10-29_101500_viva-is-on-friday.md      one markdown file per note (editable in any app)
        Notes/.trash/                                      deleted notes are moved here, never destroyed
        Tasks.md                                           "- [ ] item" / "- [x] item" checklist

Nothing here is sent to the server except the short result line shown to the user. Search is local keyword/fuzzy.
"""
import re
import shutil
import time
from pathlib import Path

from rapidfuzz import fuzz

from .errors import Ambiguity, DeviceError, Declined


def _slug(text: str, words=6) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", " ".join(text.lower().split()[:words])).strip("-")
    return s[:50] or "note"


def _title(text: str) -> str:
    return (text.strip().splitlines() or [""])[0][:60]


class Vault:
    def __init__(self, home: Path, confirm=lambda title, preview: False):
        self.home, self.confirm = Path(home), confirm
        self.notes, self.trash, self.tasks = self.home / "Notes", self.home / "Notes" / ".trash", self.home / "Tasks.md"

    def protected(self) -> list[Path]:
        return [self.home, self.notes]

    def _ensure(self):
        self.notes.mkdir(parents=True, exist_ok=True)

    # ------------------------------ notes ------------------------------
    def files(self) -> list[Path]:
        if not self.notes.exists():
            return []
        return sorted((p for p in self.notes.glob("*.md") if p.is_file()), key=lambda p: p.stat().st_mtime, reverse=True)

    def _resolve(self, query: str, choice: str | None) -> Path:
        files = self.files()
        if choice:
            p = (self.notes / Path(choice).name)
            if p not in files:
                raise DeviceError("That note does not exist")
            return p
        if not files:
            raise DeviceError("You have no notes yet.")
        q = query.lower().strip()
        if not q:
            if len(files) == 1:
                return files[0]
            raise Ambiguity("Which note?", [p.name for p in files[:5]])
        scored = sorted(((max(fuzz.partial_ratio(q, p.read_text(errors="ignore").lower()),
                              fuzz.WRatio(q, p.stem.lower())), p) for p in files), key=lambda x: -x[0])
        best = scored[0][0]
        close = [p for s, p in scored if s >= best - 5]
        if best < 70:
            raise DeviceError(f"No note matches '{query}'.")
        if len(close) > 1:
            raise Ambiguity("Which note did you mean?", [p.name for p in close[:5]])
        return close[0]

    def op_add_note(self, a):
        text = a["text"].strip()                       # the user's own words are saved as typed
        if not text:
            raise DeviceError("The note is empty.")
        self._ensure()
        p = self.notes / f"{time.strftime('%Y-%m-%d_%H%M%S')}_{_slug(text)}.md"
        n = 1
        while p.exists():
            p = p.with_name(f"{p.stem}-{n}.md")
            n += 1
        p.write_text(f"# {_title(text)}\n\n{text}\n", encoding="utf-8")
        return {"msg": f"Saved note: {p.name}", "path": str(p)}

    def op_list_notes(self, a):
        files = self.files()[:10]
        if not files:
            return {"msg": "You have no notes yet."}
        return {"msg": "\n".join(f"• {p.stem.split('_', 2)[-1].replace('-', ' ')} ({time.strftime('%d %b %H:%M', time.localtime(p.stat().st_mtime))})" for p in files)}

    def op_search_notes(self, a):
        q = a["query"].lower().strip()
        hits = []
        for p in self.files():
            body = p.read_text(errors="ignore")
            line = next((l for l in body.splitlines() if q in l.lower()), None)
            score = 100 if line else max(fuzz.partial_ratio(q, body.lower()), fuzz.WRatio(q, p.stem.lower()))
            if score >= 75:
                hits.append((score, p, (line or _title(body.replace('# ', '', 1))).strip()))
        if not hits:
            return {"msg": "No notes found."}
        hits.sort(key=lambda h: -h[0])
        return {"msg": "\n".join(f"• {p.name}: {snippet[:100]}" for _, p, snippet in hits[:5])}

    def op_read_note(self, a):
        p = self._resolve(a["query"], a.get("choice"))
        return {"msg": p.read_text(errors="ignore")[:3000], "path": str(p)}

    def op_append_note(self, a):
        p = self._resolve(a["query"], a.get("choice"))
        with p.open("a", encoding="utf-8") as f:
            f.write(f"\n{a['text'].strip()}\n")
        return {"msg": f"Added to {p.name}", "path": str(p)}

    def op_update_note(self, a):
        p = self._resolve(a["query"], a.get("choice"))
        p.write_text(f"# {_title(a['text'])}\n\n{a['text'].strip()}\n", encoding="utf-8")
        return {"msg": f"Updated {p.name}", "path": str(p)}

    def op_delete_note(self, a):
        p = self._resolve(a["query"], a.get("choice"))
        if not self.confirm(f"Delete note {p.name}?", p.read_text(errors="ignore")[:400] + "\n(moved to Notes/.trash, recoverable)"):
            raise Declined
        self.trash.mkdir(parents=True, exist_ok=True)
        dest = self.trash / p.name
        if dest.exists():
            dest = self.trash / f"{int(time.time())}_{p.name}"
        shutil.move(str(p), str(dest))
        return {"msg": f"Deleted {p.name} (kept in Notes/.trash)"}

    # ------------------------------ tasks ------------------------------
    _LINE = re.compile(r"^- \[( |x)\] (.*)$")
    _DUE_TAG = re.compile(r"@due\(([^)]+)\)")
    _AID_TAG = re.compile(r"@aid\(([^)]+)\)")

    def _load(self) -> list[list]:
        if not self.tasks.exists():
            return []
        out = []
        for l in self.tasks.read_text(encoding="utf-8", errors="ignore").splitlines():
            m = self._LINE.match(l)
            if m:
                out.append([m.group(1) == "x", m.group(2)])
        return out

    def _save(self, items):
        self.home.mkdir(parents=True, exist_ok=True)
        self.tasks.write_text("# Tasks\n\n" + "\n".join(f"- [{'x' if d else ' '}] {t}" for d, t in items) + "\n", encoding="utf-8")

    def get_tasks_view(self) -> list[dict]:
        """Returns structured task objects with rollover and due date status."""
        import datetime
        today = datetime.date.today()
        yesterday = today - datetime.timedelta(days=1)
        today_str = today.isoformat()
        yesterday_str = yesterday.isoformat()

        raw_items = self._load()
        out = []
        for i, (done, raw) in enumerate(raw_items):
            due_match = self._DUE_TAG.search(raw)
            due = due_match.group(1).strip() if due_match else None
            aid_match = self._AID_TAG.search(raw)
            aid = aid_match.group(1).strip() if aid_match else None
            clean_text = self._AID_TAG.sub("", self._DUE_TAG.sub("", raw)).strip()

            is_overdue = False
            is_yesterday = False
            is_today = False
            is_rolled_over = False

            if due:
                d_part = due.split(" ")[0].split("T")[0]
                if d_part < today_str:
                    is_overdue = not done
                    is_rolled_over = not done
                    if d_part == yesterday_str:
                        is_yesterday = not done
                elif d_part == today_str:
                    is_today = True

            out.append({
                "id": i,
                "done": bool(done),
                "text": clean_text,
                "raw": raw,
                "due": due,
                "aid": aid,
                "is_assignment": bool(aid or clean_text.startswith("[Assignment]")),
                "is_overdue": is_overdue,
                "is_yesterday": is_yesterday,
                "is_today": is_today,
                "is_rolled_over": is_rolled_over,
            })
        return out

    def auto_add_assignment(self, title: str, due_date: str | None = None, aid: str | None = None) -> bool:
        """Adds or updates an assignment task in Tasks.md without duplicates."""
        items = self._load()
        tag = f"@aid({aid})" if aid else None
        existing_idx = None
        for i, (d, t) in enumerate(items):
            if tag and tag in t:
                existing_idx = i
                break
            if f"[Assignment] {title}" in t or f"[Assignment: {title}]" in t:
                existing_idx = i
                break

        due_tag = f" @due({due_date})" if due_date else ""
        aid_tag = f" @aid({aid})" if aid else ""
        new_text = f"[Assignment] {title}{due_tag}{aid_tag}".strip()

        if existing_idx is not None:
            done, old_text = items[existing_idx]
            if not done and due_date:
                if "@due(" in old_text:
                    updated_text = self._DUE_TAG.sub(f"@due({due_date})", old_text)
                else:
                    updated_text = f"{old_text} @due({due_date})"
                items[existing_idx] = [done, updated_text]
                self._save(items)
                return True
            return False

        items.insert(0, [False, new_text])
        self._save(items)
        return True

    def _find_task(self, query, choice, only_open=False):
        items = self._load()
        cands = [i for i, (d, t) in enumerate(items) if not (only_open and d)]
        if choice:
            hit = [i for i in cands if items[i][1] == choice]
            if hit:
                return items, hit[0]
            raise DeviceError("That task no longer exists")
        if not cands:
            raise DeviceError("You have no matching tasks.")
        q = query.lower().strip()
        scored = sorted(((fuzz.WRatio(q, items[i][1].lower()), i) for i in cands), reverse=True)
        best = scored[0][0]
        close = [i for s, i in scored if s >= best - 5]
        if best < 60:
            raise DeviceError(f"No task matches '{query}'.")
        if len(close) > 1:
            raise Ambiguity("Which task?", [items[i][1] for i in close[:5]])
        return items, close[0]

    def op_add_task(self, a):
        text = a["text"].strip()
        due = a.get("due")
        if not text:
            raise DeviceError("The task is empty.")
        items = self._load()
        due_tag = f" @due({due})" if due else ""
        items.append([False, f"{text}{due_tag}"])
        self._save(items)
        return {"msg": f"Added task: {text}" + (f" (Due: {due})" if due else "")}

    def op_list_tasks(self, a):
        tasks = self.get_tasks_view()
        if not tasks:
            return {"msg": "Your task list is empty."}
        lines = ["Your task list:"]
        for n, t in enumerate(tasks, 1):
            check = "x" if t["done"] else " "
            due_tag = f" (Due: {t['due']})" if t.get("due") else ""
            rollover_tag = " [Rolled over from yesterday]" if t.get("is_yesterday") else " [Overdue]" if t.get("is_overdue") else ""
            lines.append(f"{n}. [{check}] {t['text']}{due_tag}{rollover_tag}")
        return {"msg": "\n".join(lines)}

    def op_complete_task(self, a):
        items, i = self._find_task(a["query"], a.get("choice"), only_open=True)
        items[i][0] = True
        self._save(items)
        return {"msg": f"Done: {items[i][1]}"}

    def op_delete_task(self, a):
        items, i = self._find_task(a["query"], a.get("choice"))
        gone = items.pop(i)
        self._save(items)
        return {"msg": f"Removed task: {gone[1]}"}

    def ops(self):
        return {n[3:]: getattr(self, n) for n in dir(self) if n.startswith("op_")}
