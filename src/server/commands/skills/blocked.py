"""Policy refusals – slot-based triggers."""
from ..model import Refuse
from ..intents import intent

_MSG = "I'm not allowed to format disks, install software or edit the registry."

@intent("refuse_mass_delete",
        triggers=[r"(?:delete|remove|erase|wipe)\s+(?:(?:all|every|of|the|my)\s+)+(?:files|folders|directories)\b",
                  r"(?:delete|remove|erase|wipe)\s+(?:files|folders)\b"],
        slots=[], examples=("delete all my files",), priority=1)
def refuse_mass_delete(slots, text, b, mem):
    raise Refuse("I won't delete files or folders in bulk. Name one file or folder if your administrator allows deleting.")

@intent("refuse_format", triggers=[r"format\s+(?:the\s+|my\s+)?(?:disk|drive|hard drive|c:)"],
        slots=[], priority=2)
def refuse_format(slots, text, b, mem):
    raise Refuse(_MSG)

@intent("refuse_install", triggers=[r"(?:install|uninstall)\s+(?:the\s+|a\s+|an\s+)?(?:software|app|application|program)\b"],
        slots=[], priority=3)
def refuse_install(slots, text, b, mem):
    raise Refuse(_MSG)

@intent("refuse_registry", triggers=[r"(?:edit|change|modify|open)\s+(?:the\s+|my\s+)?registry"],
        slots=[], priority=4)
def refuse_registry(slots, text, b, mem):
    raise Refuse(_MSG)
