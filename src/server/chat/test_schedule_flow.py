# test_schedule_flow.py

from server.chat.llm_router import route
from server.chat.schedule_tool import schedule_tool

batch = "A1"

queries = [
    "java today",
    "where is aiml today",
    "show my timetable",
    "next class",
]

for q in queries:

    print("\n" + "=" * 60)
    print(q)
    print("=" * 60)

    r = route(q)

    print("ROUTER:")
    print(r)

    result = schedule_tool.execute(
        batch=batch,
        intent=r.get("intent"),
        subject=r.get("subject"),
        day=r.get("day"),
    )

    print("\nTOOL:")
    print(result)
