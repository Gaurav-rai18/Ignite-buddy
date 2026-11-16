# Developer & Performance Testing Tools

- **`generate_jmeter_tokens.py`**: Generates pre-signed HS256 JWT tokens for multi-device JMeter load and concurrency testing without incurring PBKDF2 password hashing CPU overhead. Outputs CSV files compatible with JMeter's CSV Data Set Config.
  ```bash
  python tools/generate_jmeter_tokens.py --count 100 --out jmeter_users.csv
  ```
- **`mock_gateway.py`**: Fake Ollama-compatible HTTP endpoint for offline tests so the LLM layer can be exercised without a real model server.
