"""Slot-based intent registry. Pure deterministic – no LLM."""
from __future__ import annotations
import re
from dataclasses import dataclass
from typing import Callable

from .builder import Builder
from .memory import AnaphoraMemory
from .model import Incomplete, NoMatch, Refuse
from .slots import Span, EXTRACTORS, best_non_overlapping


@dataclass
class SlotSpec:
    name: str
    extractor: str | Callable[[str], list[Span]]
    required: bool = True
    resolve_anaphora: bool = False


@dataclass
class Intent:
    name: str
    group: str
    triggers: list[re.Pattern]
    slots: list[SlotSpec]
    build: Callable  # (slots: dict, text: str, b: Builder, mem: AnaphoraMemory) -> None
    examples: tuple[str, ...] = ()
    priority: int = 100
    # optional: if trigger matched but slots missing, use this question
    clarify: str | None = None


INTENTS: list[Intent] = []


def intent(
    name: str,
    *,
    triggers: list[str],
    slots: list[dict] | None = None,
    group: str = "",
    examples: tuple[str, ...] = (),
    priority: int = 100,
    clarify: str | None = None,
):
    compiled = [re.compile(t, re.I) for t in triggers]
    specs = [
        SlotSpec(
            name=s["name"],
            extractor=s.get("extractor", s["name"]),
            required=s.get("required", True),
            resolve_anaphora=s.get("resolve_anaphora", False),
        )
        for s in (slots or [])
    ]

    def deco(fn):
        INTENTS.append(Intent(
            name=name, group=group or (fn.__module__ or "").rsplit(".", 1)[-1],
            triggers=compiled, slots=specs, build=fn,
            examples=tuple(examples), priority=priority, clarify=clarify,
        ))
        INTENTS.sort(key=lambda i: i.priority)
        return fn
    return deco


def _fill(text: str, specs: list[SlotSpec], mem: AnaphoraMemory) -> dict[str, str] | None:
    all_spans: list[Span] = []
    for spec in specs:
        ext = spec.extractor
        fn = EXTRACTORS.get(ext) if isinstance(ext, str) else ext
        if not fn:
            continue
        for sp in fn(text):
            all_spans.append(Span(sp.start, sp.end, sp.value, sp.confidence, spec.name))

    chosen = best_non_overlapping(all_spans)
    filled: dict[str, str] = {}
    used = set()
    for sp in chosen:
        if sp.kind in used:
            continue
        filled[sp.kind] = sp.value
        used.add(sp.kind)

    for spec in specs:
        if spec.resolve_anaphora:
            if spec.name not in filled:
                for sp in EXTRACTORS.get("pronoun", lambda t: [])(text):
                    ent = mem.resolve_pronoun(sp.value)
                    if ent:
                        filled[spec.name] = ent.value
                        break
            elif spec.name in filled:
                ent = mem.resolve_pronoun(filled[spec.name])
                if ent:
                    filled[spec.name] = ent.value
                else:
                    del filled[spec.name]

    for spec in specs:
        if spec.required and spec.name not in filled:
            return None
    return filled


def try_intents(text: str, b: Builder, mem: AnaphoraMemory) -> None:
    """
    Match clause against registered intents (priority order).
    Raises NoMatch if nothing matched, Incomplete/Refuse as appropriate.
    """
    text = text.strip()
    if not text:
        raise NoMatch

    for it in INTENTS:
        if not any(t.search(text) for t in it.triggers):
            continue
        filled = _fill(text, it.slots, mem)
        if filled is None:
            if it.clarify:
                raise Incomplete(it.clarify)
            missing = [s.name for s in it.slots if s.required]
            if "duration" in missing:
                raise Incomplete("For how long? For example: '10 minutes' or '1 hour'.")
            if "when" in missing:
                raise Incomplete("When? For example: 'tomorrow at 5pm' or 'in 20 minutes'.")
            if any(x in missing for x in ("query", "file", "target", "text")):
                raise Incomplete("I need more detail – what should I act on?")
            raise Incomplete(f"I need more detail for that command.")
        try:
            it.build(filled, text, b, mem)
            return
        except NoMatch:
            continue
        # Incomplete / Refuse propagate
    raise NoMatch
