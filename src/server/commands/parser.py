"""
Pure slot-based deterministic command parser. NO model call. NO full-sentence regex rules.

Flow:
  1. normalize_spoken (phonetics / STT)
  2. clean fillers
  3. clause split on "and / then / ,"
  4. for each clause → try_intents (slot-based)
  5. AnaphoraMemory updated after each successful clause
  6. On None / clarify → feedback.record (offline review)
  7. Optional BoW classifier suggestion attached to clarify messages

Public API stays compatible with the existing orchestrator/router.
"""
from __future__ import annotations
import re

from .builder import Builder
from .memory import AnaphoraMemory
from server.util.text import normalize_spoken
from .model import Incomplete, NoMatch, Refuse
from . import intents as intent_mod
from . import feedback
from . import classifier


_FILLER = re.compile(
    r"^(?:(?:hey|hi|ok|okay|please|assistant|computer|buddy)\b[\s,]*"
    r"|(?:can|could|would|will) you(?: please)?\s+"
    r"|i (?:want|need|would like) you to\s+|i'd like you to\s+|let's\s+)+", re.I)
_TRAIL = re.compile(r"[\s,]+(?:please|for me|now|thanks|thank you)$", re.I)
_CONJ = re.compile(
    r"(?:\s*[,;]\s*(?:and\s+)?(?:then\s+)?|\s+(?:and\s+then|and\s+also|and|then|after\s+that)\s+)", re.I)
_COMMAND_VERB = re.compile(
    r"^(?:open|launch|run|remind|cancel|pause|resume|set|start|show|list|mark|delete|clear|"
    r"create|make|add|note|search|google|find|read|move|copy|rename|help|lock|"
    r"timetable|schedule|assignment)\b", re.I)


def clean(clause: str) -> str:
    s = clause.strip().rstrip(".!?").strip()
    s = _FILLER.sub("", s)
    s = _TRAIL.sub("", s)
    return s.strip()


def _clause(text: str, b: Builder, mem: AnaphoraMemory):
    s = clean(text)
    if not s:
        raise NoMatch
    mark = b.mark()
    try:
        intent_mod.try_intents(s, b, mem)
    except NoMatch:
        b.rewind(mark)
        raise
    for step in b.steps[mark[0]:]:
        mem.remember_from_step(step["tool"], step.get("args") or {}, step["id"])


def _sequence(text: str, b: Builder, mem: AnaphoraMemory):
    pending = None
    for m in _CONJ.finditer(text):
        left, right = text[:m.start()].strip(), text[m.end():].strip()
        if not left or not right:
            continue
        mark = b.mark()
        try:
            _clause(left, b, mem)
        except (NoMatch, Incomplete):
            b.rewind(mark)
            continue
        try:
            _sequence(right, b, mem)
            return
        except Incomplete as e:
            b.rewind(mark)
            pending = pending or e
        except NoMatch:
            b.rewind(mark)
    try:
        _clause(text, b, mem)
    except NoMatch:
        if pending:
            raise pending
        raise


def parse(text: str, memory: AnaphoraMemory | None = None) -> dict | None:
    """
    -> {"intent":"command","steps":[...]}
     | {"intent":"clarify","question"}
     | {"intent":"refuse","message"}
     | None
    """
    b = Builder()
    mem = memory if memory is not None else AnaphoraMemory()
    normalized = normalize_spoken(text)
    try:
        _sequence(normalized, b, mem)
    except Incomplete as e:
        feedback.record(text, "clarify", {"question": e.question})
        # soft suggestion from BoW classifier (does not change control flow)
        suggestion, prob = classifier.suggest_intent(normalized)
        detail = {"question": e.question}
        if suggestion:
            detail["suggested_intent"] = suggestion
            detail["suggested_prob"] = round(prob, 3)
        return {"intent": "clarify", "question": e.question, **(
            {"suggested_intent": suggestion} if suggestion and prob >= 0.35 else {}
        )}
    except Refuse as e:
        return {"intent": "refuse", "message": e.message}
    except NoMatch:
        feedback.record(text, "none")
        return None
    return {"intent": "command", "steps": b.steps}


def looks_like_command(text: str) -> bool:
    return bool(_COMMAND_VERB.match(clean(text)))


def parse_mixed(text: str, memory: AnaphoraMemory | None = None):
    text = normalize_spoken(text)
    for m in _CONJ.finditer(text):
        left, right = text[:m.start()].strip(), text[m.end():].strip()
        if not left or not right:
            continue
        pl, pr = parse(left, memory), parse(right, memory)
        if pl and pl["intent"] == "command" and pr is None and len(right.split()) >= 2 and not looks_like_command(right):
            return pl, right, "command_first"
        if pr and pr["intent"] == "command" and pl is None and len(left.split()) >= 2 and not looks_like_command(left):
            return pr, left, "question_first"
    return None


RULES = intent_mod.INTENTS


def rule(*args, **kwargs):
    """Deprecated no-op. Skills must use @intent from commands.intents."""
    def deco(fn):
        return fn
    return deco
