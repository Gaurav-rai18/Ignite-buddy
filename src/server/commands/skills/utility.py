"""Everyday helpers – calculator, time, alarm, pomodoro, system open. Slot-based."""
import ast
import operator
import re

from shared import protocol as P
from server.util import timeparse
from ..model import CONFIRM, Incomplete, NoMatch, SAFE, ToolError
from ..intents import intent
from ..registry import device_tool, tool

device_tool(P.OPEN_SYSTEM, SAFE, "Open a built-in Windows app, Settings page or well-known folder.", {"target": "str"},
            capability="system.open")
device_tool(P.LOCK_SCREEN, SAFE, "Lock the computer.", {}, capability="system.lock")
device_tool(P.CLIPBOARD_SET, SAFE, "Put text on the clipboard.", {"text": "str"}, capability="clipboard.write")
device_tool(P.GET_TIME, SAFE, "Say the current date and time on the PC.", {})

_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod, ast.Pow: operator.pow}

def _eval(node, depth=0):
    if depth > 20:
        raise ValueError("too deep")
    if isinstance(node, ast.Expression):
        return _eval(node.body, depth + 1)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        return node.value
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        v = _eval(node.operand, depth + 1)
        return -v if isinstance(node.op, ast.USub) else v
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        a, b = _eval(node.left, depth + 1), _eval(node.right, depth + 1)
        if isinstance(node.op, ast.Pow) and (abs(b) > 100 or abs(a) > 1e6):
            raise ValueError("too large")
        return _OPS[type(node.op)](a, b)
    raise ValueError("unsupported")

_WORDS = [(r"\bto the power of\b", "**"), (r"\bmultiplied by\b|\btimes\b|×", "*"), (r"\bdivided by\b|\bover\b|÷", "/"),
          (r"\bplus\b", "+"), (r"\bminus\b", "-"), (r"\bmod(?:ulo)?\b", "%"), (r"\^", "**"), (r"(?<=\d)\s*x\s*(?=\d)", "*")]

def to_expression(text: str) -> str:
    t = text.lower().replace(",", "")
    t = re.sub(r"(\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(\d+(?:\.\d+)?)", r"(\1/100*\2)", t)
    for pat, rep in _WORDS:
        t = re.sub(pat, rep, t)
    t = t.strip()
    if not re.fullmatch(r"[\d\s.+\-*/()%]+", t) or not re.search(r"\d", t) or not re.search(r"[+\-*/%]", t.lstrip("-+ ")):
        raise NoMatch
    return t

def _fmt(v) -> str:
    if isinstance(v, float) and v.is_integer() and abs(v) < 1e15:
        v = int(v)
    return f"{v:,}" if isinstance(v, int) else f"{v:,.6g}"

@tool("calculate", SAFE, "Evaluate an arithmetic expression (no model).", {"expression": "str"})
def calculate(s, expression):
    try:
        tree = ast.parse(expression, mode="eval")
        return {"msg": f"{expression.strip()} = {_fmt(_eval(tree))}"}
    except ZeroDivisionError:
        raise ToolError("That divides by zero.")
    except (ValueError, SyntaxError, OverflowError, RecursionError):
        raise ToolError("I couldn't calculate that.")

@intent("calculate", triggers=[r"(?:calculate|compute|calc|solve|what(?:'s| is)|how much is|whats)\s+"],
        slots=[], examples=("what is 15% of 240", "calculate 12 * (3 + 4)"), priority=70)
def calc_intent(slots, text, b, mem):
    m = re.search(r"(?:calculate|compute|calc|solve|what(?:'s| is)|how much is|whats)\s+(.+)", text, re.I)
    if not m:
        raise NoMatch
    b.add("calculate", expression=to_expression(m.group(1)))

@intent("get_time", triggers=[r"what(?:'s| is)? (?:the )?(?:current )?(?:time|date)", r"what time is it", r"what day is", r"current (?:time|date)"],
        slots=[], examples=("what time is it",), priority=71)
def get_time(slots, text, b, mem):
    b.add(P.GET_TIME)

@intent("set_alarm", triggers=[r"(?:set|create|add)(?:\s+an?)?\s+alarm\b"],
        slots=[], examples=("set an alarm for 7am",), priority=18)
def set_alarm(slots, text, b, mem):
    m = re.search(r"alarm(?:\s+(?:for|at|to ring at))?\s+(.+)", text, re.I)
    if not m:
        raise Incomplete("What time should the alarm ring? For example 'set an alarm for 7am'.")
    try:
        _, when, repeat = timeparse.split_when("Alarm " + m.group(1))
    except ValueError:
        raise Incomplete("What time should the alarm ring? For example 'set an alarm for 7am'.")
    kwargs = {"text": "Alarm", "when": when}
    if repeat:
        kwargs["repeat"] = repeat
    b.add("set_reminder", **kwargs)

@intent("pomodoro", triggers=[r"(?:start|set|begin)(?:\s+a)?\s+pomodoro"],
        slots=[], examples=("start a pomodoro",), priority=19)
def pomodoro(slots, text, b, mem):
    b.add("set_timer", duration="25 minutes", label="Pomodoro: focus time is over, take a 5 minute break")
    b.add("set_timer", duration="30 minutes", label="Pomodoro: break is over, back to work")

@intent("lock_screen", triggers=[r"^lock(?:\s+(?:my|the))?(?:\s+(?:computer|pc|laptop|screen|workstation))?$"],
        slots=[], examples=("lock my computer", "lock the screen"), priority=73)
def lock_screen(slots, text, b, mem):
    b.add(P.LOCK_SCREEN)

@intent("open_system", triggers=[r"open (?:settings|control panel|task manager|file explorer)"],
        slots=[], examples=("open settings",), priority=74)
def open_system(slots, text, b, mem):
    m = re.search(r"open\s+(.+)", text, re.I)
    b.add(P.OPEN_SYSTEM, target=(m.group(1).strip() if m else "settings"))
