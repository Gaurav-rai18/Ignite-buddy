"""Slot extractors – pure deterministic entity extraction. No LLM.
High-coverage extractors tuned for trainee spoken + typed commands.
"""
from __future__ import annotations
import re
from dataclasses import dataclass
from typing import Callable

from server.util.text import expand_spoken_numbers, norm
from server.util import timeparse


@dataclass(frozen=True)
class Span:
    start: int
    end: int
    value: str
    confidence: float = 1.0
    kind: str = ""


# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------
_APP = re.compile(
    r"\b(vs\s*code|visual\s+studio\s+code|vscode|code|notepad\+?\+?|chrome|edge|firefox|"
    r"explorer|file\s+explorer|terminal|cmd|powershell|word|excel|outlook|"
    r"settings|calculator|paint|postman|git\s*bash|android\s*studio|intellij|"
    r"pycharm|sublime|atom)\b", re.I)
_EDITOR = re.compile(
    r"\b(vs\s*code|visual\s+studio\s+code|vscode|code|notepad\+?\+?|sublime|atom|pycharm|intellij)\b", re.I)
_DURATION = re.compile(
    r"\b((?:\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|"
    r"eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|half|quarter)"
    r"(?:\s+(?:and\s+)?(?:a\s+)?half)?"
    r"(?:\s*[-–]?\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|s|m|h))+)\b", re.I)
_WHEN = re.compile(
    r"\b((?:in|after)\s+(?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|"
    r"fifteen|twenty|thirty|forty|fifty|sixty)\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?)|"
    r"tomorrow(?:\s+(?:morning|afternoon|evening|night|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?|"
    r"today(?:\s+(?:morning|afternoon|evening|night|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?|"
    r"tonight|this\s+(?:morning|afternoon|evening|night)|"
    r"every\s+day|daily|weekly|every\s+week|"
    r"next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)"
    r"(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|"
    r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
    r"(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|"
    r"\d{1,2}(?::\d{2})?\s*(?:am|pm)|"
    r"at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm))\b", re.I)
_FILE = re.compile(
    r"\b([\w\-.]+\.(?:bat|cmd|py|sh|js|json|txt|md|pdf|docx?|xlsx?|csv|ps1|html?|css|ts|tsx|jsx|"
    r"java|kt|go|rs|c|cpp|h|xml|yml|yaml|sql|ipynb|zip|rar|7z))\b", re.I)
_URL = re.compile(
    r"(?:https?://\S+|(?:www\.)?[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|io|dev|in|edu|gov|ai|co|app|me)(?:/\S*)?)", re.I)
_PRONOUN = re.compile(
    r"\b(it|that|this|them|those|these|the\s+same(?:\s+one)?|the\s+last\s+one|"
    r"the\s+previous\s+one|that\s+one|this\s+one|"
    r"the\s+(?:folder|directory|project|file|script|app|timer|reminder|assignment|note|task|one))\b", re.I)
_DAY = re.compile(
    r"\b(today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
    r"mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|"
    r"this\s+week|the\s+week|week|weekly|this\s+month)\b", re.I)
_STATUS = re.compile(
    r"\b(pending|upcoming|completed|done|finished|submitted|all|week|overdue|missed|open)\b", re.I)

# Common training subjects / modules (extensible; helps schedule + assignment matching)
_SUBJECT = re.compile(
    r"\b(java|python|javascript|js|react|node|nodejs|angular|vue|spring|hibernate|"
    r"dbms|sql|mysql|postgres|mongodb|nosql|"
    r"dsa|algorithms?|data\s+structures?|"
    r"os|operating\s+systems?|cn|computer\s+networks?|networks?|"
    r"oop|oops|object\s+oriented|"
    r"html|css|bootstrap|tailwind|"
    r"git|github|devops|docker|kubernetes|k8s|"
    r"machine\s+learning|ml|ai|deep\s+learning|nlp|"
    r"android|flutter|kotlin|swift|"
    r"c\+\+|cpp|c#|csharp|\.net|dotnet|"
    r"linux|bash|shell|"
    r"soft\s+skills?|communication|aptitude|"
    r"project|mini\s+project|capstone|"
    r"viva|lab|practical|theory|unit\s+test|mock)\b", re.I)

_ASSIGNMENT_HINT = re.compile(
    r"\b(assignment|assign|homework|hw|task|project|lab\s+work|exercise|problem\s+set)\b", re.I)


def _spans(rx: re.Pattern, text: str, kind: str, conf: float = 1.0) -> list[Span]:
    return [Span(m.start(), m.end(), m.group(0).strip(), conf, kind) for m in rx.finditer(text)]


# ---------------------------------------------------------------------------
# Extractors
# ---------------------------------------------------------------------------
def extract_apps(text: str) -> list[Span]:
    return _spans(_APP, text, "app")


def extract_editors(text: str) -> list[Span]:
    return _spans(_EDITOR, text, "app")


def extract_durations(text: str) -> list[Span]:
    text2 = expand_spoken_numbers(text)
    out = []
    for m in _DURATION.finditer(text2):
        raw = m.group(1).strip()
        out.append(Span(m.start(), m.end(), raw, 1.0, "duration"))
    return out


def extract_when(text: str) -> list[Span]:
    return _spans(_WHEN, text, "when", 0.95)


def extract_files(text: str) -> list[Span]:
    return _spans(_FILE, text, "file")


def extract_urls(text: str) -> list[Span]:
    return _spans(_URL, text, "url")


def extract_pronouns(text: str) -> list[Span]:
    return _spans(_PRONOUN, text, "pronoun", 0.9)


def extract_days(text: str) -> list[Span]:
    return _spans(_DAY, text, "day")


def extract_status(text: str) -> list[Span]:
    return _spans(_STATUS, text, "status")


def extract_subjects(text: str) -> list[Span]:
    """Training subjects / module names (for schedule + assignment queries)."""
    return _spans(_SUBJECT, text, "subject", 0.92)


def extract_label(text: str) -> list[Span]:
    out = []
    for m in re.finditer(
        r"(?:\b(?:called|named|for|labelled|labeled|to|about)\s+)(?P<label>[\w\s\-]{1,50}?)(?=\s*$|\s+(?:for|of|in|at|on|to|and|then)\b)",
        text, re.I,
    ):
        lab = (m.group("label") or "").strip()
        if lab and lab.lower() not in ("a", "an", "the", "my", "me", "you"):
            out.append(Span(m.start("label"), m.end("label"), lab, 0.9, "label"))
    return out


def extract_free_after(verbs: str, text: str, stop_words: str = r"in|with|using|for|called|named|at|on") -> list[Span]:
    """Capture free-text target after a command verb."""
    rx = re.compile(
        rf"^(?:(?:the|my|a|an|up)\s+)*(?:{verbs})\s+(?:(?:the|my|a|an)\s+)*(?P<q>.+?)(?:\s+(?:{stop_words})\s+.+)?$",
        re.I,
    )
    m = rx.match(text.strip())
    if not m:
        return []
    q = m.group("q").strip()
    q = re.sub(rf"\s+(?:{stop_words})\s+.+$", "", q, flags=re.I).strip()
    if not q or len(q) < 1:
        return []
    return [Span(m.start("q"), m.end("q"), q, 0.85, "query")]


def extract_query_generic(text: str) -> list[Span]:
    """Fallback free-text query: strip leading command verbs and return the rest."""
    cleaned = re.sub(
        r"^(?:please\s+|can you\s+|could you\s+|would you\s+|i want to\s+|i need to\s+)?"
        r"(?:open|launch|run|search|find|show|list|read|delete|remove|cancel|set|start|"
        r"create|make|add|mark|complete|remind|note|help)\s+",
        "", text.strip(), flags=re.I,
    ).strip()
    if not cleaned or cleaned.lower() == text.strip().lower():
        return []
    return [Span(0, len(text), cleaned, 0.7, "query")]


def best_non_overlapping(spans: list[Span]) -> list[Span]:
    spans = sorted(spans, key=lambda s: (-s.confidence, s.start, -(s.end - s.start)))
    chosen, occupied = [], []
    for s in spans:
        if any(not (s.end <= a or s.start >= b) for a, b in occupied):
            continue
        chosen.append(s)
        occupied.append((s.start, s.end))
    return sorted(chosen, key=lambda s: s.start)


EXTRACTORS: dict[str, Callable[[str], list[Span]]] = {
    "app": extract_apps,
    "editor": extract_editors,
    "duration": extract_durations,
    "when": extract_when,
    "file": extract_files,
    "url": extract_urls,
    "pronoun": extract_pronouns,
    "label": extract_label,
    "day": extract_days,
    "status": extract_status,
    "subject": extract_subjects,
    "query": extract_query_generic,
}
