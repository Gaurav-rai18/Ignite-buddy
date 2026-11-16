from server.chat.schedule_tool import schedule_tool

BATCH = "A1"   # replace with a real batch

print("=" * 50)
print("TODAY SCHEDULE")
print("=" * 50)

print(
    schedule_tool.execute(
        batch=BATCH,
        intent="today_schedule",
    )
)

print("\n")

print("=" * 50)
print("NEXT CLASS")
print("=" * 50)

print(
    schedule_tool.execute(
        batch=BATCH,
        intent="next_class",
    )
)
