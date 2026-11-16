"""Anaphora / pronoun memory – session-scoped rolling context of entities."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Entity:
    kind: str
    value: str
    step_id: int | None = None
    meta: dict = field(default_factory=dict)


class AnaphoraMemory:
    def __init__(self, max_per_kind: int = 6):
        self._by_kind: dict[str, list[Entity]] = {}
        self._recent: list[Entity] = []
        self.max_per_kind = max_per_kind

    def remember(self, kind: str, value: str, step_id: int | None = None, **meta) -> Entity:
        e = Entity(kind=kind, value=value, step_id=step_id, meta=meta or {})
        bucket = self._by_kind.setdefault(kind, [])
        bucket.append(e)
        if len(bucket) > self.max_per_kind:
            del bucket[0]
        self._recent.append(e)
        if len(self._recent) > self.max_per_kind * 4:
            self._recent = self._recent[-self.max_per_kind * 3:]
        return e

    def remember_from_step(self, tool: str, args: dict, step_id: int) -> None:
        if tool in ("find_folder", "open_folder") and args.get("query"):
            self.remember("folder", args["query"], step_id)
        elif tool == "find_file" and args.get("query"):
            self.remember("file", args["query"], step_id)
        elif tool == "open_app" and args.get("name"):
            self.remember("app", args["name"], step_id)
        elif tool == "open_in_app":
            if args.get("path"):
                self.remember("file", args["path"], step_id)
            if args.get("app"):
                self.remember("app", args["app"], step_id)
        elif tool == "run_file" and args.get("file"):
            self.remember("file", args["file"], step_id)
        elif tool == "set_timer":
            self.remember("timer", args.get("label") or "timer", step_id, duration=args.get("duration"))
        elif tool == "set_reminder" and args.get("text"):
            self.remember("reminder", args["text"], step_id)
        elif tool in ("open_url", "web_search"):
            self.remember("url" if "url" in args else "query",
                          args.get("url") or args.get("query", ""), step_id)
        elif tool in ("add_note", "read_note", "search_notes") and args.get("query") or args.get("text"):
            self.remember("note", args.get("query") or args.get("text", "")[:40], step_id)
        elif tool in ("add_task", "complete_task") and (args.get("text") or args.get("query")):
            self.remember("task", args.get("text") or args.get("query", ""), step_id)
        elif tool == "set_assignment" and args.get("query"):
            self.remember("assignment", args["query"], step_id)

    def last(self, kind: str | None = None) -> Entity | None:
        if kind:
            b = self._by_kind.get(kind) or []
            return b[-1] if b else None
        return self._recent[-1] if self._recent else None

    def resolve_pronoun(self, text: str) -> Entity | None:
        t = (text or "").lower().strip()
        if any(w in t for w in ("folder", "directory", "project", "dir")):
            return self.last("folder")
        if any(w in t for w in ("file", "script", "document", "doc")):
            return self.last("file") or self.last("folder")
        if any(w in t for w in ("app", "application", "program", "editor")):
            return self.last("app")
        if "timer" in t:
            return self.last("timer")
        if "reminder" in t:
            return self.last("reminder")
        if any(w in t for w in ("assignment", "task")):
            return self.last("assignment") or self.last("task")
        if "note" in t:
            return self.last("note")
        if t in ("it", "that", "this", "the same", "the same one", "the last one",
                 "the previous one", "that one", "this one", "them", "those", "these"):
            return self.last()
        return None

    def clear(self) -> None:
        self._by_kind.clear()
        self._recent.clear()

    def snapshot(self) -> dict[str, Any]:
        return {
            "recent": [(e.kind, e.value, e.step_id) for e in self._recent[-10:]],
            "kinds": {k: [(e.value, e.step_id) for e in v] for k, v in self._by_kind.items()},
        }
