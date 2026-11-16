"""Computer actions (device tools). Slot-based intents only."""
import re
from shared import protocol as P
from ..model import CONFIRM, Incomplete, NoMatch, SAFE
from ..intents import intent
from ..registry import device_tool
from ..slots import extract_free_after
from ..builder import Builder
from ..memory import AnaphoraMemory

device_tool(P.FIND_FOLDER, SAFE, "Find a folder by fuzzy name. Returns path.", {"query": "str"})
device_tool(P.FIND_FILE, SAFE, "Find a file by fuzzy name. Returns path, parent, name.", {"query": "str"})
device_tool(P.OPEN_APP, SAFE, "Launch an installed application by name.", {"name": "str"})
device_tool(P.OPEN_IN_APP, SAFE, "Open a path in an editor app (vs code, notepad).", {"app": "str", "path": "str"})
device_tool(P.OPEN_FOLDER, SAFE, "Open a folder in the file manager.", {"path": "str"})
device_tool(P.OPEN_FILE, SAFE, "Open a document with its default program (not scripts).", {"path": "str"})
device_tool(P.OPEN_TARGET, SAFE, "Open whatever best matches: an app, then a folder, then a file.", {"query": "str"})
device_tool(P.OPEN_URL, SAFE, "Open an https URL in the default browser.", {"url": "str"})
device_tool(P.WEB_SEARCH, SAFE, "Search the web in the default browser.", {"query": "str"})
device_tool(P.RUN_FILE, CONFIRM, "Run a .bat/.cmd/.sh/.py file; the client asks the user to approve first.",
            {"file": "str", "cwd": "str"})

_STRIP = re.compile(r"^(?:the\s+)?(?:folder|directory|project|file)\s+", re.I)


def _find(b: Builder, query: str, *, folder: bool | None = None) -> int:
    query = _STRIP.sub("", query.strip())
    is_file = bool(re.search(r"\.[A-Za-z0-9]{1,5}$", query)) if folder is None else not folder
    sid = b.add(P.FIND_FILE if is_file else P.FIND_FOLDER, query=query)
    if not is_file:
        b.last_folder = sid
    return sid


@intent("open_in_editor",
        triggers=[r"^open.{0,50}(?:in|with|using)\s+(?:vs\s*code|vscode|code|notepad|visual\s+studio)"],
        slots=[{"name": "app", "extractor": "editor", "required": True}],
        examples=("open the react assignment 3 in vs code",), priority=10)
def open_in_editor(slots, text, b, mem):
    qs = extract_free_after(r"open|launch", text, stop_words=r"in|with|using")
    query = qs[0].value if qs else None
    if not query:
        ent = mem.resolve_pronoun("it") or mem.last("folder") or mem.last("file")
        if not ent:
            raise Incomplete("What should I open?")
        query = ent.value
    query = re.sub(r"\s+(?:in|with|using)\s+.+$", "", query, flags=re.I).strip()
    sid = _find(b, query)
    b.add(P.OPEN_IN_APP, app=slots["app"], path=b.ref(sid))


@intent("open_url",
        triggers=[r"^(?:open|go to|visit|browse to).{0,20}(?:https?://|www\.|\w+\.(?:com|org|net|io|dev|in))"],
        slots=[{"name": "url", "extractor": "url", "required": True}],
        examples=("open github.com",), priority=12)
def open_url(slots, text, b, mem):
    b.add(P.OPEN_URL, url=slots["url"])


@intent("open_folder",
        triggers=[r"^open.{0,40}(?:folder|directory)"],
        slots=[], examples=("open the react assignment 3 folder",), priority=15)
def open_folder(slots, text, b, mem):
    qs = extract_free_after(r"open", text)
    query = qs[0].value if qs else None
    if not query:
        ent = mem.last("folder")
        if not ent:
            raise Incomplete("Which folder?")
        query = ent.value
    query = re.sub(r"\s+(?:folder|directory)\s*$", "", query, flags=re.I).strip()
    sid = _find(b, query, folder=True)
    b.add(P.OPEN_FOLDER, path=b.ref(sid))


@intent("open_file",
        triggers=[r"^open.{0,40}\bfile\b", r"^open\s+[\w\-.]+\.[A-Za-z0-9]{1,5}\b"],
        slots=[{"name": "file", "extractor": "file", "required": False}],
        examples=("open resume.pdf",), priority=16)
def open_file(slots, text, b, mem):
    query = slots.get("file")
    if not query:
        qs = extract_free_after(r"open", text)
        query = qs[0].value if qs else None
    if not query:
        raise Incomplete("Which file?")
    query = re.sub(r"\s+file\s*$", "", query, flags=re.I).strip()
    sid = _find(b, query, folder=False)
    b.add(P.OPEN_FILE, path=b.ref(sid))


@intent("open_app",
        triggers=[r"(?:launch|start)\b", r"open.{0,20}(?:app|application|program)\b"],
        slots=[{"name": "app", "extractor": "app", "required": False}],
        examples=("launch chrome",), priority=20)
def open_app(slots, text, b, mem):
    name = slots.get("app")
    if not name:
        qs = extract_free_after(r"launch|start|open", text)
        name = qs[0].value if qs else None
        if name:
            name = re.sub(r"\s+(?:app|application|program)\s*$", "", name, flags=re.I).strip()
    if not name:
        raise NoMatch
    b.add(P.OPEN_APP, name=name)


@intent("run_file",
        triggers=[r"^(?:run|execute)\b"],
        slots=[{"name": "file", "extractor": "file", "required": False},
               {"name": "pronoun", "extractor": "pronoun", "required": False, "resolve_anaphora": True}],
        examples=("run install.bat", "run install.bat in react assignment 3"),
        priority=14, clarify="Which file should I run?")
def run_file(slots, text, b, mem):
    f = slots.get("file") or slots.get("pronoun")
    if not f:
        ent = mem.last("file")
        f = ent.value if ent else None
    if not f:
        raise Incomplete("Which file should I run, and in which folder? For example: 'run install.bat in react assignment 3'.")
    # optional "in <folder>"
    m = re.search(r"\b(?:in|from|inside|under)\s+(?:the\s+|my\s+)?(?:folder\s+|directory\s+|project\s+)?(.+)$", text, re.I)
    if m:
        cwd = b.ref(_find(b, m.group(1).strip(), folder=True))
        b.add(P.RUN_FILE, file=f, cwd=cwd)
    elif b.last_folder:
        b.add(P.RUN_FILE, file=f, cwd=b.ref(b.last_folder))
    else:
        sid = b.add(P.FIND_FILE, query=f)
        b.add(P.RUN_FILE, file=b.ref(sid, "name"), cwd=b.ref(sid, "parent"))


@intent("find_path",
        triggers=[r"^(?:find|locate)\b"],
        slots=[], examples=("find my resume.pdf",), priority=25)
def find_path(slots, text, b, mem):
    qs = extract_free_after(r"find|locate", text)
    if not qs:
        raise NoMatch
    q = qs[0].value
    if len(q.split()) > 6 or re.match(r"(?:out|a |an |some |how|why|what)\b", q, re.I):
        raise NoMatch
    kind = None
    if re.search(r"\bfolder|directory\b", text, re.I):
        kind = True
    elif re.search(r"\bfile\b", text, re.I):
        kind = False
    _find(b, q, folder=kind)


@intent("open_target",
        triggers=[r"^open\b"],
        slots=[{"name": "app", "extractor": "app", "required": False},
               {"name": "file", "extractor": "file", "required": False},
               {"name": "pronoun", "extractor": "pronoun", "required": False, "resolve_anaphora": True}],
        examples=("open chrome", "open the react assignment", "open it"), priority=40)
def open_target(slots, text, b, mem):
    query = slots.get("file") or slots.get("app") or slots.get("pronoun")
    if not query:
        qs = extract_free_after(r"open", text)
        query = qs[0].value if qs else None
    if not query:
        ent = mem.resolve_pronoun("it") or mem.last()
        query = ent.value if ent else None
    if not query:
        raise Incomplete("What should I open?")
    if re.search(r"^open[\s-]source\b", text, re.I) or len(query.split()) > 5:
        raise NoMatch
    query = _STRIP.sub("", re.sub(r"^(?:the|my)\s+", "", query, flags=re.I))
    b.add(P.OPEN_TARGET, query=query)
