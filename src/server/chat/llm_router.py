from server import llm


SYSTEM_PROMPT = """
You are the routing engine for Ignite Buddy.

Return ONLY JSON.

Available kinds:

1. schedule
2. rag
3. chat
4. browser

SCHEDULE:
Questions about:
- timetable
- classes
- schedule
- next class
- venue
- room
- lab
- where is
- when is
- today's class
- tomorrow's class

Examples:

java today

{
  "kind":"schedule",
  "intent":"subject_time",
  "subject":"Java",
  "day":"today"
}

where is aiml today

{
  "kind":"schedule",
  "intent":"subject_venue",
  "subject":"AIML",
  "day":"today"
}

show my timetable

{
  "kind":"schedule",
  "intent":"today_schedule"
}

next class

{
  "kind":"schedule",
  "intent":"next_class"
}

when is sql this week

{
  "kind":"schedule",
  "intent":"subject_week",
  "subject":"SQL"
}

RAG:
Questions about:
- policy
- policies
- attendance
- leave
- onboarding
- process
- documents
- ignite programme rules

Example:

attendance policy

{
  "kind":"rag",
  "question":"attendance policy"
}

CHAT:
Technical learning questions, programming concepts, explanations, general questions.

Example:

what is Java Stream API

{
  "kind":"chat",
  "question":"what is Java Stream API"
}

BROWSER:
Queries asking to search the web, check latest web information, or browse online.

Example:

latest python version

{
  "kind":"browser",
  "query":"latest python version"
}

Return JSON only.
"""


def route(query: str) -> dict:

    try:

        result = llm.chat_json(
            SYSTEM_PROMPT,
            query,
        )

        kind = result.get("kind")

        if kind in {"schedule", "rag", "chat", "browser"}:
            return result

    except Exception as e:
        print("LLM ROUTER ERROR:", repr(e))

    return {
        "kind": "chat",
        "question": query,
    }
