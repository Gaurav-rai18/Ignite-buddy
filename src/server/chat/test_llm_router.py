# test_llm_router.py

from server.chat import llm_router

queries = [
    "java today",
    "where is aiml today",
    "show my timetable",
    "next class",
    "attendance policy",
    "latest python version",
]

for q in queries:
    print()
    print("=" * 60)
    print(q)
    print("=" * 60)
    print(llm_router.route(q))
