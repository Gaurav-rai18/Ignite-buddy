from server.domain import router

tests = [
    "open vscode",
    "java today",
    "where is aiml today",
    "attendance policy",
    "latest python version",
]

for t in tests:
    r = router.route(t)

    print("\n" + "=" * 50)
    print(t)
    print("=" * 50)

    print("kind =", r.kind)
    print("extra =", r.extra)
