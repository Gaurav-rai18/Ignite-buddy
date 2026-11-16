# Tests

| Folder | Scope |
|--------|-------|
| `server/` | Unit tests for parser, commands, KB, LLM layer, storage, policy |
| `client/` | Device executor, shell, STT, vault, agent |
| `integration/` | End-to-end over Channels + Admin API sync to PCs |
| `tools/` | Helpers for the suites |

## Running Tests

**Bash / CMD:**
```bash
pytest
```

Async tests use `pytest-asyncio` (mode=auto). To run specific test suites:

**Bash / CMD:**
```bash
pytest tests/server/
pytest tests/client/
pytest tests/integration/
```

## Load & Concurrency Testing (Apache JMeter)

For testing multi-device concurrent connections (30 to 1,000+ users) and resolving SQLite/PBKDF2 bottlenecks, see the **[Performance, Concurrency & Scaling Guide](file:///c:/Users/Vigil/Desktop/Ignite_Buddy/README_PERFORMANCE_AND_SCALING.md)**. Pre-generate test tokens with:
```bash
python tools/generate_jmeter_tokens.py --count 100 --out jmeter_users.csv
```
