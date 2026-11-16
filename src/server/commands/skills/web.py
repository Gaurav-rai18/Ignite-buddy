"""Web search – slot-based."""
import re

from shared import protocol as P
from ..intents import intent
from ..model import NoMatch

@intent("web_search",
        triggers=[r"(?:search|google|look up|lookup|web search)\b"],
        slots=[], examples=("search django channels tutorial", "google python decorators"), priority=48)
def web_search(slots, text, b, mem):
    # avoid "search my notes"
    if re.search(r"\b(?:my|the)\s+(?:notes?|documents?|docs|files?|pdfs?|folders?)\b", text, re.I):
        raise NoMatch
    m = re.search(r"(?:search|google|look up|lookup|web search)(?:\s+(?:the web|online|the internet|google))?(?:\s+for)?\s+(.+)", text, re.I)
    if not m:
        raise NoMatch
    b.add(P.WEB_SEARCH, query=m.group(1).strip())
