"""File/folder CRUD – slot-based."""
import re
from shared import protocol as P
from ..model import CONFIRM, Incomplete, NoMatch, SAFE
from ..intents import intent
from ..registry import device_tool

device_tool(P.CREATE_FOLDER, SAFE, "Create a folder.", {"name": "str", "parent": "str?"}, capability="files.create")
device_tool(P.CREATE_FILE, SAFE, "Create a text/code file (never executables).",
            {"name": "str", "parent": "str?", "content": "str?"}, capability="files.create")
device_tool(P.RENAME_PATH, SAFE, "Rename a file or folder.", {"path": "str", "new_name": "str"}, capability="files.rename")
device_tool(P.MOVE_PATH, SAFE, "Move a file or folder into another folder.", {"path": "str", "destination": "str"},
            capability="files.move")
device_tool(P.COPY_PATH, SAFE, "Copy a file or folder into another folder.", {"path": "str", "destination": "str"},
            capability="files.copy")
device_tool(P.DELETE_PATH, CONFIRM, "Move a file/folder to the Recycle Bin (the PC asks first).", {"path": "str"},
            capability="files.delete")
device_tool(P.READ_FILE, SAFE, "Show the text of a file.", {"path": "str"}, capability="files.read")
device_tool(P.LIST_FOLDER, SAFE, "List what is inside a folder.", {"path": "str"}, capability="files.read")

_KIND = re.compile(r"^(?:the\s+)?(?:folder|directory|project|file)\s+", re.I)

def _is_file(name: str) -> bool:
    return bool(re.search(r"\.[A-Za-z0-9]{1,5}$", name.strip()))

def _locate(b, name: str, *, folder: bool | None = None) -> str:
    name = _KIND.sub("", name.strip())
    is_file = _is_file(name) if folder is None else not folder
    sid = b.add(P.FIND_FILE if is_file else P.FIND_FOLDER, query=name)
    return b.ref(sid)

@intent("create_folder", triggers=[r"(?:create|make|add|new).{0,20}(?:folder|directory)\b"],
        slots=[], examples=("create a folder called react notes in documents",), priority=55)
def create_folder(slots, text, b, mem):
    m = re.search(r"(?:folder|directory)(?:\s+(?:called|named))?\s+(.+?)(?:\s+(?:in|inside|under|on|within|into)\s+(?:the\s+|my\s+)?(?:folder\s+)?(.+))?$", text, re.I)
    if not m:
        raise Incomplete("What should the folder be called?")
    parent = _locate(b, m.group(2), folder=True) if m.group(2) else None
    b.add(P.CREATE_FOLDER, name=m.group(1).strip(), parent=parent)

@intent("create_file", triggers=[r"(?:create|make|add|new).{0,20}file\b"],
        slots=[{"name": "file", "extractor": "file", "required": False}],
        examples=("create a file todo.txt in desktop",), priority=56)
def create_file(slots, text, b, mem):
    name = slots.get("file")
    if not name:
        m = re.search(r"file(?:\s+(?:called|named))?\s+([\w\-. ]+?)(?:\s+(?:in|inside|under)\s+|$)", text, re.I)
        name = m.group(1).strip() if m else None
    if not name:
        raise Incomplete("What should the file be called?")
    parent = None
    m = re.search(r"(?:in|inside|under)\s+(?:the\s+|my\s+)?(?:folder\s+)?(.+?)(?:\s+with|\s+containing|$)", text, re.I)
    if m:
        parent = _locate(b, m.group(1).strip(), folder=True)
    content = None
    m = re.search(r"(?:with|containing)\s+(?:the\s+)?(?:content\s+|text\s+)?(.+)$", text, re.I)
    if m:
        content = m.group(1).strip()
    b.add(P.CREATE_FILE, name=name, parent=parent, content=content)

@intent("rename_path", triggers=[r"rename\b"], slots=[], examples=("rename report.docx to final",), priority=57)
def rename_path(slots, text, b, mem):
    m = re.search(r"rename(?:\s+the)?(?:\s+(?:file|folder))?\s+(.+?)\s+to\s+(.+)", text, re.I)
    if not m:
        raise Incomplete("Rename what to what?")
    b.add(P.RENAME_PATH, path=_locate(b, m.group(1)), new_name=m.group(2).strip())

@intent("move_path", triggers=[r"move\b"], slots=[], examples=("move report.docx to desktop",), priority=58)
def move_path(slots, text, b, mem):
    m = re.search(r"move(?:\s+the)?(?:\s+(?:file|folder))?\s+(.+?)\s+(?:to|into|in)\s+(?:the\s+)?(?:folder\s+)?(.+)", text, re.I)
    if not m:
        raise Incomplete("Move what where?")
    b.add(P.MOVE_PATH, path=_locate(b, m.group(1)), destination=_locate(b, m.group(2), folder=True))

@intent("copy_path", triggers=[r"(?:copy|duplicate)\b"], slots=[], examples=("copy report.docx to downloads",), priority=59)
def copy_path(slots, text, b, mem):
    m = re.search(r"(?:copy|duplicate)(?:\s+the)?(?:\s+(?:file|folder))?\s+(.+?)\s+(?:to|into|in)\s+(?:the\s+)?(?:folder\s+)?(.+)", text, re.I)
    if not m:
        raise Incomplete("Copy what where?")
    b.add(P.COPY_PATH, path=_locate(b, m.group(1)), destination=_locate(b, m.group(2), folder=True))

@intent("delete_path", triggers=[r"(?:delete|remove|trash).{0,20}(?:file|folder|directory)\b",
                                r"(?:delete|remove|trash)\s+[\w\-.]+\.[A-Za-z0-9]{1,5}\b"],
        slots=[{"name": "file", "extractor": "file", "required": False}],
        examples=("delete the file old-notes.txt",), priority=60)
def delete_path(slots, text, b, mem):
    q = slots.get("file")
    kind = None
    if not q:
        m = re.search(r"(?:delete|remove|trash)(?:\s+(?:the|my))?\s+(?:(?P<k>file|folder|directory)\s+)?(?P<q>.+?)(?:\s+(?P<k2>file|folder|directory))?$", text, re.I)
        if not m:
            raise Incomplete("What should I delete?")
        q, kind = m.group("q").strip(), (m.group("k") or m.group("k2") or "").lower()
    if not kind and not _is_file(q):
        raise NoMatch  # let other skills (timer, reminder, note) claim it
    b.add(P.DELETE_PATH, path=_locate(b, q, folder=True if kind in ("folder", "directory") else (False if kind == "file" else None)))

@intent("read_file", triggers=[r"(?:read|show|display|cat|view).{0,20}(?:file\b|[\w\-.]+\.[A-Za-z0-9]{1,5}\b)"],
        slots=[{"name": "file", "extractor": "file", "required": False}],
        examples=("read notes.txt",), priority=61)
def read_file(slots, text, b, mem):
    q = slots.get("file")
    if not q:
        m = re.search(r"([\w\-. ]+?\.[A-Za-z0-9]{1,5})", text)
        q = m.group(1) if m else None
    if not q:
        raise Incomplete("Which file?")
    b.add(P.READ_FILE, path=_locate(b, q, folder=False))

@intent("list_folder", triggers=[r"(?:list|show).{0,25}(?:files|contents|items).{0,15}(?:in|inside|of)\b", r"what'?s in\b", r"^ls\b"],
        slots=[], examples=("list files in downloads",), priority=62)
def list_folder(slots, text, b, mem):
    m = re.search(r"(?:in|inside|of)\s+(?:the\s+|my\s+)?(?:folder\s+)?(.+)$", text, re.I)
    if not m:
        m = re.search(r"what'?s\s+in\s+(?:the\s+|my\s+)?(?:folder\s+)?(.+)$", text, re.I)
    if not m:
        m = re.search(r"^ls\s+(.+)$", text, re.I)
    if not m:
        raise Incomplete("Which folder?")
    b.add(P.LIST_FOLDER, path=_locate(b, m.group(1).strip(), folder=True))
