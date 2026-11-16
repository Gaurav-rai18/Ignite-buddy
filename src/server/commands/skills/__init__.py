"""Importing this package registers every skill (tools + slot-based intents).

IMPORT ORDER influences intent priority only indirectly (explicit priority= on
@intent is authoritative). Blocked refusals load first conceptually via low priority numbers.
"""
from . import blocked, timers, reminders, trainee, notes, tasks, activity, privacy, utility, files, system, web, help  # noqa: F401
