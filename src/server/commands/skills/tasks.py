"""To-do list – slot-based."""
import re
from shared import protocol as P
from ..model import SAFE, Incomplete
from ..intents import intent
from ..registry import device_tool

device_tool(P.ADD_TASK, SAFE, "Add a to-do item.", {"text": "str"})
device_tool(P.LIST_TASKS, SAFE, "Show the to-do list.", {})
device_tool(P.COMPLETE_TASK, SAFE, "Tick off a to-do item.", {"query": "str"})
device_tool(P.DELETE_TASK, SAFE, "Remove a to-do item.", {"query": "str"})

@intent("add_task", triggers=[r"(?:add|create|new).{0,15}(?:task|todo|to-do)\b", r"add\s+.+\s+to\s+my\s+(?:to-?do|tasks?)"],
        slots=[], examples=("add a task finish the react assignment",), priority=23)
def add_task(slots, text, b, mem):
    m = re.search(r"(?:add|create|new)(?:\s+a)?\s+(?:task|todo|to-do)(?:\s+to)?\s*[:,\-]?\s*(.+)", text, re.I)
    if not m:
        m = re.search(r"add\s+(.+?)\s+to\s+my\s+(?:to-?do(?:\s+list)?|tasks?(?:\s+list)?)", text, re.I)
    if not m:
        raise Incomplete("What task should I add?")
    b.add(P.ADD_TASK, text=m.group(1).strip())

@intent("list_tasks", triggers=[r"(?:list|show|what are|what's on).{0,20}(?:tasks|todos|to-dos|to-?do list)"],
        slots=[], examples=("show my tasks",), priority=35)
def list_tasks(slots, text, b, mem):
    b.add(P.LIST_TASKS)

@intent("complete_task", triggers=[r"(?:complete|finish|check off|tick off).{0,15}task\b", r"mark.{0,20}task.{0,15}(?:done|complete)"],
        slots=[], examples=("complete task react assignment",), priority=36)
def complete_task(slots, text, b, mem):
    m = re.search(r"(?:complete|finish|check off|tick off)(?:\s+the)?\s+task\s+(.+)", text, re.I)
    if not m:
        m = re.search(r"mark(?:\s+the)?(?:\s+task)?\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed)", text, re.I)
    if not m:
        raise Incomplete("Which task?")
    b.add(P.COMPLETE_TASK, query=re.sub(r"\s+task$", "", m.group(1).strip(), flags=re.I))

@intent("delete_task", triggers=[r"(?:delete|remove).{0,15}task\b", r"remove\s+.+\s+from\s+my\s+(?:to-?do|tasks?)"],
        slots=[], examples=("delete task notebook",), priority=37)
def delete_task(slots, text, b, mem):
    m = re.search(r"(?:delete|remove)(?:\s+the)?\s+task\s+(.+)", text, re.I)
    if not m:
        m = re.search(r"remove\s+(.+?)\s+from\s+my\s+(?:to-?do(?:\s+list)?|tasks?(?:\s+list)?)", text, re.I)
    if not m:
        raise Incomplete("Which task?")
    b.add(P.DELETE_TASK, query=m.group(1).strip())
