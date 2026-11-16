"""
Unmatched / clarify utterance logger.

Every time the deterministic parser returns None (not a command) or
{"intent": "clarify", ...}, a compact record is appended to a local JSONL
file.  Review these offline to extend triggers and slots.

No PII beyond the raw utterance is stored.  Rotate / delete the log as needed.
"""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any

# Default location – override with env IGNITE_NLU_LOG
_DEFAULT = Path(os.environ.get("IGNITE_NLU_LOG", "") or
                Path.home() / ".ignite_buddy" / "nlu_feedback.jsonl")

_lock = threading.Lock()
_path: Path | None = None


def _log_path() -> Path:
    global _path
    if _path is None:
        _path = _DEFAULT
        _path.parent.mkdir(parents=True, exist_ok=True)
    return _path


def record(utterance: str, outcome: str, detail: dict[str, Any] | None = None) -> None:
    """
    outcome: "none" | "clarify" | "refuse" | "command"
    detail: optional {question, intent_name, slots, ...}
    """
    if outcome not in ("none", "clarify"):
        return  # only log the interesting failures by default
    row = {
        "ts": time.time(),
        "iso": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "utterance": (utterance or "")[:500],
        "outcome": outcome,
        "detail": detail or {},
    }
    try:
        with _lock:
            with open(_log_path(), "a", encoding="utf-8") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
    except OSError:
        pass  # never break the command path for logging


def read_recent(limit: int = 50) -> list[dict]:
    p = _log_path()
    if not p.exists():
        return []
    rows = []
    with open(p, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows[-limit:]


def summarize(limit: int = 200) -> dict[str, int]:
    """Quick counts by outcome for the last N rows."""
    counts: dict[str, int] = {}
    for r in read_recent(limit):
        counts[r.get("outcome", "?")] = counts.get(r.get("outcome", "?"), 0) + 1
    return counts
