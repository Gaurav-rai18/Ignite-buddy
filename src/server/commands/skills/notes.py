"""Notes – slot-based."""
import re

from shared import protocol as P
from ..model import CONFIRM, Incomplete, NoMatch, SAFE
from ..intents import intent
from ..registry import device_tool

device_tool(P.ADD_NOTE, SAFE, "Save a note as a file on the PC.", {"text": "str"})
device_tool(P.LIST_NOTES, SAFE, "List the most recent notes.", {})
device_tool(P.SEARCH_NOTES, SAFE, "Search notes by words.", {"query": "str"})
device_tool(P.READ_NOTE, SAFE, "Show one note.", {"query": "str"})
device_tool(P.APPEND_NOTE, SAFE, "Add a line to an existing note.", {"query": "str", "text": "str"})
device_tool(P.UPDATE_NOTE, SAFE, "Replace the text of a note.", {"query": "str", "text": "str"})
device_tool(P.DELETE_NOTE, CONFIRM, "Delete a note (moved to .trash; the PC asks first).", {"query": "str"})
device_tool(P.OPEN_NOTES, SAFE, "Open the notes folder.", {})

_FILLER = {"my", "the", "a", "an", "that", "this"}

def _q(q: str) -> str:
    q = (q or "").strip()
    if not q or q.lower() in _FILLER:
        raise NoMatch
    return q

@intent("note_add", triggers=[r"(?:take|make|add|write|save|jot).{0,15}note\b", r"^note(?:\s+down)?\b", r"(?:remember|don't forget|dont forget)\s+that\b"],
        slots=[], examples=("take a note buy milk", "note: viva is on Friday"), priority=22)
def note_add(slots, text, b, mem):
    m = re.search(r"(?:take|make|add|write|save|jot)(?:\s+down)?(?:\s+(?:a|an))?\s+note(?:\s+that|\s+to self)?\s*[:,\-]?\s*(.+)", text, re.I)
    if not m:
        m = re.search(r"note(?:\s+down)?(?:\s*[:,\-]\s*|\s+that\s+)(.+)", text, re.I)
    if not m:
        m = re.search(r"(?:remember|don't forget|dont forget)\s+that\s+(.+)", text, re.I)
    if not m:
        raise Incomplete("What should I note down?")
    b.add(P.ADD_NOTE, text=m.group(1).strip())

@intent("notes_folder", triggers=[r"open.{0,15}notes", r"where are my notes"], slots=[], examples=("open my notes folder",), priority=28)
def notes_folder(slots, text, b, mem):
    b.add(P.OPEN_NOTES)

@intent("notes_list", triggers=[r"(?:list|show|display|what are).{0,20}notes"], slots=[], examples=("show my notes",), priority=33)
def notes_list(slots, text, b, mem):
    b.add(P.LIST_NOTES)

@intent("notes_search", triggers=[r"(?:search|find|look).{0,20}notes", r"what (?:did|do) i (?:note|write)", r"notes? (?:about|on|regarding)\b"],
        slots=[], examples=("what did I note about the viva", "search my notes for deadline"), priority=24)
def notes_search(slots, text, b, mem):
    m = re.search(r"(?:about|on|regarding|for)\s+(.+)$", text, re.I)
    if not m:
        raise Incomplete("What should I search notes for?")
    b.add(P.SEARCH_NOTES, query=m.group(1).strip())

@intent("note_read", triggers=[r"(?:read|show|open|display).{0,15}note\b"],
        slots=[], examples=("read the viva note",), priority=27)
def note_read(slots, text, b, mem):
    m = re.search(r"note\s+(?:about|on|called|named|with)?\s*(.+)$", text, re.I)
    if not m:
        m = re.search(r"(?:read|show|open|display)(?:\s+me)?(?:\s+(?:my|the))?\s+(.+?)\s+note", text, re.I)
    if not m:
        ent = mem.last("note")
        if ent:
            b.add(P.READ_NOTE, query=ent.value); return
        raise Incomplete("Which note?")
    b.add(P.READ_NOTE, query=_q(m.group(1)))

@intent("note_append", triggers=[r"(?:add|append).{0,20}note\b"], slots=[], examples=("add to my viva note: bring your ID",), priority=29)
def note_append(slots, text, b, mem):
    m = re.search(r"(?:add|append)(?:\s+this)?\s+to(?:\s+(?:my|the))?\s+(.+?)\s+note\s*[:,\-]?\s*(.+)", text, re.I)
    if not m:
        m = re.search(r"append\s+(.+?)\s+to(?:\s+(?:my|the))?\s+(.+?)\s+note", text, re.I)
        if m:
            b.add(P.APPEND_NOTE, query=_q(m.group(2)), text=m.group(1).strip()); return
        raise Incomplete("Which note and what text?")
    b.add(P.APPEND_NOTE, query=_q(m.group(1)), text=m.group(2).strip())

@intent("note_update", triggers=[r"(?:update|change|edit|rewrite).{0,15}note\b"], slots=[], examples=("update the viva note to say moved to Monday",), priority=31)
def note_update(slots, text, b, mem):
    m = re.search(r"(?:update|change|edit|rewrite)(?:\s+(?:my|the))?\s+(.+?)\s+note\s+(?:to say|to read|to|with|:)\s*(.+)", text, re.I)
    if not m:
        raise Incomplete("Which note and what should it say?")
    b.add(P.UPDATE_NOTE, query=_q(m.group(1)), text=m.group(2).strip())

@intent("note_delete", triggers=[r"(?:delete|remove|erase).{0,15}note\b"],
        slots=[{"name": "pronoun", "extractor": "pronoun", "required": False, "resolve_anaphora": True}],
        examples=("delete the note about the viva",), priority=34)
def note_delete(slots, text, b, mem):
    q = slots.get("pronoun")
    if not q:
        m = re.search(r"note(?:\s+(?:about|on|regarding|with|called))?\s+(.+)$", text, re.I)
        if m: q = m.group(1)
        else:
            m = re.search(r"(?:delete|remove|erase)(?:\s+(?:my|the))?\s+(.+?)\s+note", text, re.I)
            if m: q = m.group(1)
    if not q:
        ent = mem.last("note"); q = ent.value if ent else None
    if not q:
        raise Incomplete("Which note should I delete?")
    b.add(P.DELETE_NOTE, query=_q(q))
