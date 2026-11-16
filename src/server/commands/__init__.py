"""Command engine public surface."""
from .parser import parse, parse_mixed, looks_like_command, RULES
from .model import Incomplete, NoMatch, Refuse, PlanError, SAFE, CONFIRM, BLOCKED
from .validate import validate
from .executor import run_plan
from .registry import REGISTRY
from . import intents
from . import feedback
from . import classifier
from . import skills  # noqa: F401  – registers tools + intents

__all__ = [
    "parse", "parse_mixed", "looks_like_command", "RULES",
    "validate", "PlanError", "run_plan", "REGISTRY",
    "Incomplete", "NoMatch", "Refuse",
    "SAFE", "CONFIRM", "BLOCKED"
]
