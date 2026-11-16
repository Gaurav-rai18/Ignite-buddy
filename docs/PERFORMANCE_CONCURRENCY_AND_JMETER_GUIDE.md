# Ignite Buddy: Performance, Concurrency, Scaling & JMeter Testing Guide

This guide provides an end-to-end operational manual for configuring **Ignite Buddy** for enterprise multi-device concurrency, setting up **PostgreSQL** and **Redis**, diagnosing performance bottlenecks, running **Apache JMeter** load tests, and understanding session authentication and local database schemas.

---

## Table of Contents
1. [Session Authentication & Token Expiration Lifecycle](#1-session-authentication--token-expiration-lifecycle)
   - [Desktop WebSocket JWT vs REST SimpleJWT](#11-desktop-websocket-jwt-vs-rest-simplejwt)
   - [Auto-Logout Flow (`4401 CLOSE_UNAUTHORIZED`)](#12-auto-logout-flow-4401-close_unauthorized)
   - [In-App Re-Login Mechanism](#13-in-app-re-login-mechanism)
2. [Concurrency Bottlenecks & Why JMeter Fails at 30 Users](#2-concurrency-bottlenecks--why-jmeter-fails-at-30-users)
   - [Root Cause 1: SQLite File Locking](#21-root-cause-1-sqlite-file-locking)
   - [Root Cause 2: Synchronous PBKDF2 Password Hashing](#22-root-cause-2-synchronous-pbkdf2-password-hashing)
   - [Root Cause 3: WebSocket Handshake Timeout](#23-root-cause-3-websocket-handshake-timeout)
   - [Root Cause 4: In-Memory Channel Layer](#24-root-cause-4-in-memory-channel-layer)
3. [Production Architecture Setup: PostgreSQL & Redis](#3-production-architecture-setup-postgresql--redis)
   - [PostgreSQL Database Configuration](#31-postgresql-database-configuration)
   - [Redis Channel Layer Configuration](#32-redis-channel-layer-configuration)
   - [ASGI Multi-Worker Deployment (Gunicorn + Uvicorn)](#33-asgi-multi-worker-deployment-gunicorn--uvicorn)
   - [Nginx Reverse Proxy & WebSocket Configuration](#34-nginx-reverse-proxy--websocket-configuration)
4. [Step-by-Step JMeter Load Testing Guide](#4-step-by-step-jmeter-load-testing-guide)
   - [Test Strategy: Separating Auth from WebSocket Throughput](#41-test-strategy-separating-auth-from-websocket-throughput)
   - [Pre-Generating Test Tokens](#42-pre-generating-test-tokens)
   - [JMeter WebSocket Test Plan Configuration](#43-jmeter-websocket-test-plan-configuration)
   - [Key Metrics & Pass Criteria](#44-key-metrics--pass-criteria)
5. [Local SQLite Database & Server Store Audit](#5-local-sqlite-database--server-store-audit)
   - [Client Local Database (`~/.ignite_buddy/local.db`)](#51-client-local-database-localdb)
   - [Server Per-User Store (`data/users/<hash>/local.db`)](#52-server-per-user-store-localdb)
   - [Why No Tables Should Be Dropped](#53-why-no-tables-should-be-dropped)

---

## 1. Session Authentication & Token Expiration Lifecycle

### 1.1 Desktop WebSocket JWT vs REST SimpleJWT

Ignite Buddy maintains two distinct authentication boundaries:

| Layer | Protocol | Mechanism | Default Lifespan | Config Variable |
| :--- | :--- | :--- | :--- | :--- |
| **Desktop Client** | WSS / WS | Signed HMAC-SHA256 JWT | **7 Days** (168 hours) | `ASSISTANT_JWT_TTL_HOURS` |
| **Admin Console** | HTTPS / REST | Django REST SimpleJWT | **24 Hours** (Access) / **7 Days** (Refresh) | `SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]` |

* The desktop agent saves the signed JWT locally on the trainee's machine in `~/.ignite_buddy/auth_token` (or legacy `~/.trainee_assistant/auth_token`).
* On every connection and auto-reconnect, the agent transmits this token in the opening WebSocket handshake message:
  ```json
  { "type": "auth", "token": "<JWT_STRING>" }
  ```

### 1.2 Auto-Logout Flow (`4401 CLOSE_UNAUTHORIZED`)

When a trainee's token expires or is revoked:

```mermaid
sequenceDiagram
    autonumber
    participant UI as Desktop React UI
    participant Agent as Local Agent (server.py)
    participant Server as Central Server (AssistantConsumer)

    Agent->>Server: {"type": "auth", "token": "expired_jwt..."}
    Server->>Server: Verify token signature & expiry
    Note over Server: Expiry timestamp exceeded!
    Server-->>Agent: Close WebSocket (code: 4401 / CLOSE_UNAUTHORIZED)
    Agent->>Agent: status = "auth_failed", net._auth_failed = True
    Agent->>UI: Broadcast {"type": "auth_state", "authenticated": false}
    UI->>UI: setNeedsLogin(true)
    Note over UI: Displays "Sign in to Ignite Buddy" Modal
```

### 1.3 In-App Re-Login Mechanism

Trainees do **not** need to restart the application when their session expires:
1. The React modal (`frontend/src/components/Login.jsx`) prompts for trainee ID and password.
2. The UI sends a `login` action to the local agent (`http://127.0.0.1:8777/ws`).
3. The agent sends `POST /auth/login` to the central server, receives a new signed JWT, and updates `auth_token`.
4. The agent executes `net.reconnect()`, re-authenticating the WebSocket session and syncing current schedule and assignment data immediately.

---

## 2. Concurrency Bottlenecks & Why JMeter Fails at 30 Users

When performing load tests using Apache JMeter, hitting the server with 30 or more concurrent users under default settings often causes immediate connection drops, rate-limiting errors, or request timeouts. Below are the 4 primary bottlenecks responsible for this failure:

### 2.1 Root Cause 1: SQLite File Locking
By default, the central Django backend and per-user stores use SQLite (`data/central.db` and `data/users/<id>/local.db`).
* While SQLite allows unlimited concurrent readers, **writes require an exclusive database lock**.
* When 30 concurrent users connect, the server attempts to record connection telemetry, presence status, and initial sync cursors simultaneously.
* Threads queue for write access, exceed the SQLite busy timeout (5.0s), and raise:
  ```text
  sqlite3.OperationalError: database is locked
  ```

### 2.2 Root Cause 2: Synchronous PBKDF2 Password Hashing
Django's default password hasher is `PBKDF2PasswordHasher` with **720,000 iterations**.
* Computing a single PBKDF2 hash takes ~100–180ms of 100% CPU on a modern core.
* If JMeter executes `POST /auth/login` for 30 concurrent threads simultaneously, the server must compute **$30 \times 720,000 = 21,600,000$ hashing rounds**.
* This consumes 100% of all CPU cores for 3–5 seconds, causing the Python asyncio event loop and Daphne worker threads to starve.

### 2.3 Root Cause 3: WebSocket Handshake Timeout
In `src/server/config.py`:
```python
AUTH_TIMEOUT = _env_float("ASSISTANT_AUTH_TIMEOUT", 5.0)
```
* The server gives connecting clients exactly 5 seconds to establish the socket and send the `{"type": "auth"}` payload.
* If the event loop is blocked by database locks or PBKDF2 CPU saturation, the auth timer expires before the server processes the handshake frame.
* The server forcibly disconnects the socket with code `4401` or timeout.

### 2.4 Root Cause 4: In-Memory Channel Layer
Django Channels defaults to `InMemoryChannelLayer`:
* It cannot share state across multiple CPU processes.
* Queue buffers are limited and single-threaded. Under concurrent broadcast bursts (e.g. broadcasting a timetable update to 30+ trainees), memory queues drop packets or freeze the ASGI event loop.

---

## 3. Production Architecture Setup: PostgreSQL & Redis

To scale Ignite Buddy from a single-machine dev setup to supporting **1,000+ concurrent trainees**, configure PostgreSQL and Redis:

```mermaid
flowchart TD
    Clients["30 to 1,000+ Trainee Desktops\n(JMeter Load Test Nodes)"]
    Nginx["Nginx Reverse Proxy\nSSL Termination · WebSocket Upgrade · Rate Limiting"]
    
    subgraph AppCluster["Application Tier (ASGI)"]
        W1["Daphne / Uvicorn Worker 1\n(Port 8765)"]
        W2["Daphne / Uvicorn Worker 2\n(Port 8766)"]
        W3["Daphne / Uvicorn Worker 3\n(Port 8767)"]
        W4["Daphne / Uvicorn Worker 4\n(Port 8768)"]
    end

    Redis[("Redis Cluster / Sentinel\nChannels Layer · Presence · Pub/Sub")]
    PgBouncer["PgBouncer Connection Pool"]
    Postgres[("PostgreSQL 16\nRow-Level Locking · Partitioned Tables")]

    Clients -->|WSS / HTTPS| Nginx
    Nginx --> W1 & W2 & W3 & W4
    W1 & W2 & W3 & W4 <-->|Pub/Sub| Redis
    W1 & W2 & W3 & W4 -->|Connection Pool| PgBouncer
    PgBouncer --> Postgres
```

### 3.1 PostgreSQL Database Configuration

1. **Install PostgreSQL** (v15 or v16) and create the database:
   ```bash
   sudo -u postgres psql -c "CREATE DATABASE ignite_buddy_db;"
   sudo -u postgres psql -c "CREATE USER ignite_user WITH PASSWORD 'SecurePassword123!';"
   sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ignite_buddy_db TO ignite_user;"
   sudo -u postgres psql -c "ALTER USER ignite_user CREATEDB;"
   ```

2. **Configure Environment in `.env.server`**:
   ```ini
   DATABASE_URL=postgresql://ignite_user:SecurePassword123!@127.0.0.1:5432/ignite_buddy_db
   ```

3. **Install Python PostgreSQL Adapter**:
   ```bash
   pip install psycopg2-binary
   ```

4. **Run Django Migrations**:
   ```bash
   python manage.py migrate
   ```

### 3.2 Redis Channel Layer Configuration

1. **Install and Start Redis**:
   ```bash
   sudo apt-get install redis-server
   sudo systemctl enable --now redis-server
   ```

2. **Install `channels-redis`**:
   ```bash
   pip install channels-redis
   ```

3. **Configure Environment in `.env.server`**:
   ```ini
   REDIS_URL=redis://127.0.0.1:6379/0
   ```

4. **Verify Django Settings (`src/server/ignite_server/settings.py`)**:
   When `REDIS_URL` is set, the channel layer automatically switches from in-memory to Redis:
   ```python
   CHANNEL_LAYERS = {
       "default": {
           "BACKEND": "channels_redis.core.RedisChannelLayer",
           "CONFIG": {
               "hosts": [os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")],
               "capacity": 1500,
               "expiry": 60,
           },
       }
   }
   ```

### 3.3 ASGI Multi-Worker Deployment (Gunicorn + Uvicorn)

Run multiple ASGI worker processes across all available CPU cores:

```bash
gunicorn ignite_server.asgi:application \
    -w 4 \
    -k uvicorn.workers.UvicornWorker \
    --bind 127.0.0.1:8765 \
    --timeout 120 \
    --max-requests 5000 \
    --max-requests-jitter 500
```

### 3.4 Nginx Reverse Proxy & WebSocket Configuration

Add the following to `/etc/nginx/sites-available/ignite_buddy.conf`:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

upstream ignite_backend {
    server 127.0.0.1:8765;
    keepalive 64;
}

server {
    listen 80;
    server_name ignite-buddy.internal;

    client_max_body_size 50M;

    # REST APIs & Swagger UI
    location / {
        proxy_pass http://ignite_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Channels WebSockets (/ws/*)
    location /ws/ {
        proxy_pass http://ignite_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

---

## 4. Step-by-Step JMeter Load Testing Guide

### 4.1 Test Strategy: Separating Auth from WebSocket Throughput

Do **not** configure JMeter to invoke `POST /auth/login` on every tick of a 100-user thread group. In production, trainees log in **once a week** (168-hour JWT lifespan), while WebSocket events and commands occur continuously.

* **Test Suite A (Login Scalability):** Test `POST /auth/login` with realistic ramp-up (e.g. 50 users over 60 seconds).
* **Test Suite B (Real-Time WebSocket Concurrency):** Test 50–500 simultaneous WebSocket connections using **pre-generated JWTs**.

### 4.2 Pre-Generating Test Tokens

Use this Python script to generate signed test tokens for JMeter CSV Data Sets without hitting the PBKDF2 hasher during the test:

```python
# tools/generate_jmeter_tokens.py
import csv, jwt, time
from server import config

SECRET = config.JWT_SECRET or "dev-secret-key"
NUM_USERS = 100

with open("jmeter_users.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["user_id", "token"])
    for i in range(1, NUM_USERS + 1):
        uid = f"trainee_{i:04d}"
        payload = {
            "sub": uid,
            "name": f"Trainee {i}",
            "iat": int(time.time()),
            "exp": int(time.time()) + (168 * 3600),
        }
        token = jwt.encode(payload, SECRET, algorithm="HS256")
        writer.writerow([uid, token])

print(f"Generated {NUM_USERS} test tokens in jmeter_users.csv")
```

Run the generator:
```bash
python tools/generate_jmeter_tokens.py
```

### 4.3 JMeter WebSocket Test Plan Configuration

1. **Install JMeter WebSocket Samplers Plugin:**
   * Open JMeter $\rightarrow$ **Plugins Manager** $\rightarrow$ Search for **WebSocket Samplers by Peter Doornbosch** $\rightarrow$ Install and restart.
2. **Add a CSV Data Set Config:**
   * **Filename:** `jmeter_users.csv`
   * **Variable Names:** `USER_ID,TOKEN`
   * **Sharing Mode:** All threads
3. **Configure Thread Group:**
   * **Number of Threads (Users):** `100`
   * **Ramp-Up Period (seconds):** `30` (avoids instantaneous TCP burst)
   * **Loop Count:** `Forever`
4. **Add WebSocket Open Connection Sampler:**
   * **Server Name or IP:** `127.0.0.1` (or Nginx IP)
   * **Port Number:** `8765`
   * **Path:** `/ws/assistant/`
5. **Add WebSocket Single Write Sampler (Handshake):**
   * **Request Data:**
     ```json
     {"type": "auth", "token": "${TOKEN}"}
     ```
6. **Add WebSocket Single Read Sampler:**
   * Verify server answers with:
     ```json
     {"type": "hello_ok"}
     ```
7. **Add Periodic Heartbeat / Ping (Loop Controller or Timer):**
   * Send ping every 30 seconds:
     ```json
     {"type": "ping"}
     ```

### 4.4 Key Metrics & Pass Criteria

| Metric | Target | Failure Indicator & Action |
| :--- | :--- | :--- |
| **Error Rate** | `< 0.1%` | Connection drops $\rightarrow$ Increase worker count (`-w`) or PostgreSQL pool size |
| **Handshake Response Time** | `< 250ms` | High latency $\rightarrow$ Verify Redis connectivity and CPU utilization |
| **Active Concurrent Connections** | `100% of target` | Sockets dropping at 30 $\rightarrow$ Verify `DATABASE_URL` is PostgreSQL, not SQLite |
| **CPU Utilization** | `< 70%` | Pegged at 100% $\rightarrow$ Verify PBKDF2 hashing is separated from WebSocket test |

---

## 5. Local SQLite Database & Server Store Audit

### 5.1 Client Local Database (`~/.ignite_buddy/local.db`)

Stored on the trainee's computer and never read directly by the central server:

| Table | Purpose | Retention / Lifecycle |
| :--- | :--- | :--- |
| `chat_turns` | Stores past Q&A turns so conversational follow-ups have context. | Automatically pruned after 90 days (`CHAT_KEEP_DAYS`). |
| `audit_log` | Records device operations executed on this PC (op name, args, status). | Automatically pruned after 30 days (`AUDIT_KEEP_DAYS`). |
| `assignments` | Stores assignments published by the admin panel and trainee status (`pending`/`done`). | Kept until assignment is deleted by admin. |
| `timetable` | Stores the weekly lecture schedule pushed from the admin console. | Updated dynamically on each schedule sync. |
| `kv` | Stores sync cursor timestamps and seating metadata (`meta_home_lab`, `meta_sub_batch`, `meta_primary_ta`). | Permanent key-value configuration. |

### 5.2 Server Per-User Store (`data/users/<hash>/local.db`)

Maintained on the central server for trainee activity monitoring, privacy analytics, and vector search:

| Table | Purpose |
| :--- | :--- |
| `activity_events` | Continuous telemetry of foreground applications, window titles, and idle state. Backs the deterministic Day Summary. |
| `actions` | Server-executed commands and tool audit log. |
| `summaries` | Historical daily summaries and session recap text. |
| `notes` | Server-cached notes backup. |
| `tasks` | Server-side task snapshot. |
| `screen_history` | Redacted screenshot captures for authorized instructor assistance. |
| `chat_history` | Conversation records used by the server RAG engine for memory turns. |
| `settings` | Per-user privacy toggles (e.g. `tracking_paused_until`, `app_blocklist`). |

### 5.3 Why No Tables Should Be Dropped

* **Active Query Dependency:** Every single table listed above has active read/write call sites in the application code.
* **Failure Mode:** Removing any of these tables will cause immediate `sqlite3.OperationalError: no such table: <table_name>` exceptions during daily assistant interaction, timetable viewing, or activity sampling.
* **Storage Footprint:** The combined footprint of these tables is under 200 KB per trainee. Routine pruning of `chat_turns` and `audit_log` keeps the local databases lightweight.
