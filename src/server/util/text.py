"""Text helpers: phonetic/STT normalization, fuzzy scoring, speakable output."""
from __future__ import annotations

import re
from difflib import SequenceMatcher

_FILE_EXT = r"(bat|cmd|py|sh|js|json|txt|md|pdf|docx|xlsx|csv|ps1|html|css|ts|tsx|jsx|java|kt|go|rs|c|cpp|h)"

# Domain-specific STT / phonetic map (applied once, before any parsing)
_PHONETIC_MAP = [
    (rf"\bdot\s+{_FILE_EXT}\b", r".\1"),
    (rf"\bpoint\s+{_FILE_EXT}\b", r".\1"),
    (r"\bdot\s+exe\b", ".exe"),
    (r"\bdot\s+com\b", ".com"),
    (r"\bvs\s*code\b", "vs code"),
    (r"\bvisual\s+studio\s+code\b", "vs code"),
    (r"\bvscode\b", "vs code"),
    (r"\bnote\s*pad\b", "notepad"),
    (r"\bopen\s+up\b", "open"),
    (r"\blaunch\s+up\b", "launch"),
    (r"\brun\s+the\s+script\b", "run"),
    (r"\bexecute\b", "run"),
    (r"\bokey\b", "okay"),
    (r"\balright\b", "all right"),
    (rf"\b(install|setup|run|start)\s+(\w+)\s+{_FILE_EXT}\b", r"\1 \2.\3"),
]

_SPOKEN_NUM = {
    "zero": "0", "oh": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
    "eleven": "11", "twelve": "12", "thirteen": "13", "fourteen": "14", "fifteen": "15",
    "sixteen": "16", "seventeen": "17", "eighteen": "18", "nineteen": "19", "twenty": "20",
    "thirty": "30", "forty": "40", "fifty": "50", "sixty": "60",
}


def norm(s: str) -> str:
    return re.sub(r"[\W_]+", " ", (s or "").lower()).strip()


def normalize_spoken(text: str) -> str:
    """Phonetic / STT normalization. Idempotent. Safe for typed text too."""
    if not text:
        return text
    s = text.strip()
    for pat, repl in _PHONETIC_MAP:
        s = re.sub(pat, repl, s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip()


def expand_spoken_numbers(text: str) -> str:
    def repl(m):
        return _SPOKEN_NUM.get(m.group(0).lower(), m.group(0))
    return re.sub(
        r"\b(" + "|".join(sorted(_SPOKEN_NUM, key=len, reverse=True)) + r")\b",
        repl, text, flags=re.I,
    )


def fuzzy_ratio(a: str, b: str) -> float:
    """0..1 similarity (SequenceMatcher). Pure stdlib – no rapidfuzz required."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, norm(a), norm(b)).ratio()


def best_fuzzy(query: str, candidates: list[str], threshold: float = 0.72) -> tuple[str | None, float]:
    """Return (best_candidate, score) or (None, 0) if below threshold."""
    best, score = None, 0.0
    nq = norm(query)
    for c in candidates:
        r = SequenceMatcher(None, nq, norm(c)).ratio()
        if r > score:
            best, score = c, r
    return (best, score) if score >= threshold else (None, score)


def speakable(text: str, limit: int = 300) -> str:
    text = re.sub(r"```.*?```", " (code omitted) ", text, flags=re.S)
    text = re.sub(r"[*#`_>]", "", text)
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "))
    return cut[:end + 1] if end > 80 else cut + "..."
