# Ignite Buddy: Concurrency, Database, Redis & JMeter Testing Guide

This guide answers key operational and architecture questions regarding **session token lifetimes**, **concurrency limits**, **handling multiple connected trainee devices**, **setting up PostgreSQL & Redis**, **performing load testing with Apache JMeter**, and **auditing local database tables**.

---

## Table of Contents
1. [Session Authentication & Token Expiration Lifecycle](#1-session-authentication--token-expiration-lifecycle)
   - [Desktop WebSocket JWT vs Admin REST SimpleJWT](#11-desktop-websocket-jwt-vs-admin-rest-simplejwt)
   - [Auto-Logout Flow (`4401 CLOSE_UNAUTHORIZED`)](#12-auto-logout-flow-4401-close_unauthorized)
   - [In-App Re-Login Mechanism](#13-in-app-re-login-mechanism)
2. [Handling Multiple Devices & Resolving JMeter Concurrency Bottlenecks (Rate Limit 30)](#2-handling-multiple-devices--resolving-jmeter-concurrency-bottlenecks-rate-limit-30)
   - [Why JMeter Fails at 30 Concurrent Users Under Default Settings](#21-why-jmeter-fails-at-30-concurrent-users-under-default-settings)
   - [The 4 Bottlenecks Analyzed](#22-the-4-bottlenecks-analyzed)
3. [Production Database Setup: PostgreSQL](#3-production-database-setup-postgresql)
   - [Why SQLite Locks Under Concurrency](#31-why-sqlite-locks-under-concurrency)
   - [Step-by-Step PostgreSQL Installation & Configuration](#32-step-by-step-postgresql-installation--configuration)
   - [Configuring Connection Pooling (PgBouncer)](#33-configuring-connection-pooling-pgbouncer)
4. [Production Channel Layer Setup: Redis](#4-production-channel-layer-setup-redis)
   - [Why InMemoryChannelLayer Fails Under Multi-Device Concurrency](#41-why-inmemorychannellayer-fails-under-multi-device-concurrency)
   - [Step-by-Step Redis Installation & Configuration](#42-step-by-step-redis-installation--configuration)
   - [Enabling Multi-Worker ASGI (Daphne / Gunicorn + Uvicorn)](#43-enabling-multi-worker-asgi-daphne--gunicorn--uvicorn)
   - [Nginx Reverse Proxy & WebSocket Upgrades](#44-nginx-reverse-proxy--websocket-upgrades)
5. [Step-by-Step JMeter Load Testing Execution](#5-step-by-step-jmeter-load-testing-execution)
   - [Testing Strategy: Separating Auth from WebSocket Concurrency](#51-testing-strategy-separating-auth-from-websocket-concurrency)
   - [Pre-Generating Test Tokens with `generate_jmeter_tokens.py`](#52-pre-generating-test-tokens-with-generate_jmeter_tokenspy)
   - [Configuring the JMeter WebSocket Test Plan](#53-configuring-the-jmeter-websocket-test-plan)
   - [Key Target Metrics & Pass Criteria](#54-key-target-metrics--pass-criteria)
6. [Local Database Audit: Are There Unnecessary Tables?](#6-local-database-audit-are-there-unnecessary-tables)
   - [Client Local Database (`~/.ignite_buddy/local.db`)](#61-client-local-database-localdb)
   - [Server Per-User Database (`data/users/<hash>/local.db`)](#62-server-per-user-database-localdb)
   - [Verdict: Should Any Table Be Removed?](#63-verdict-should-any-table-be-removed)

---

## 1. Session Authentication & Token Expiration Lifecycle

### 1.1 Desktop WebSocket JWT vs Admin REST SimpleJWT

Ignite Buddy maintains two distinct authentication mechanisms depending on the client interface:

| Attribute | Desktop Trainee Client (`src/client`) | Admin Management Console (`frontend-admin`) |
| :--- | :--- | :--- |
| **Protocol** | WebSockets (WSS/WS) on `/ws/assistant/` | HTTPS REST APIs on `/api/*` |
| **Token Format** | Signed HMAC-SHA256 JWT | Django REST SimpleJWT (Access + Refresh) |
| **Default Lifetime** | **7 Days** (168 hours) | **24 Hours** (Access) / **7 Days** (Refresh) |
| **Configuration** | `ASSISTANT_JWT_TTL_HOURS` in `.env` | `SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"]` |
| **Storage Location** | `~/.ignite_buddy/auth_token` | Browser `localStorage` / `sessionStorage` |

* When the trainee desktop agent launches, it reads the saved token from `~/.ignite_buddy/auth_token` (with backward fallback to legacy `~/.trainee_assistant/auth_token`).
* On connecting to the central server, it transmits the token in the opening handshake frame:
  ```json
  { "type": "auth", "token": "<JWT_STRING>" }
  ```

### 1.2 Auto-Logout Flow (`4401 CLOSE_UNAUTHORIZED`)

When an access token reaches its expiration timestamp (or if an administrator revokes the user's session):

```mermaid
sequenceDiagram
    autonumber
    participant UI as Desktop React UI
    participant Agent as Trainee Client Agent (server.py)
    participant Server as Central Server (AssistantConsumer)

    Agent->>Server: {"type": "auth", "token": "expired_jwt..."}
    Server->>Server: Verify token signature & expiry timestamp
    Note over Server: Current time > payload.exp
    Server-->>Agent: Close WebSocket with code 4401 (CLOSE_UNAUTHORIZED)
    Agent->>Agent: status = "auth_failed", net._auth_failed = True
    Agent->>UI: Broadcast {"type": "auth_state", "authenticated": false}
    UI->>UI: setNeedsLogin(true)
    Note over UI: Auto-logout triggered! Modal appears.
```

1. The central server validates the token in `src/server/realtime/assistant.py`. If `payload["exp"] < time.time()`, the server immediately terminates the WebSocket connection with custom close code `4401` (`CLOSE_UNAUTHORIZED`).
2. The local client agent marks `net._auth_failed = True` to halt automatic reconnection loops with an invalid token.
3. The agent dispatches `auth_state: { authenticated: false }` to the local React frontend.
4. The React desktop overlay automatically sets `needsLogin = true`, displaying the **"Sign in to Ignite Buddy"** modal.

### 1.3 In-App Re-Login Mechanism

The trainee **does not** need to restart the application or open a browser:
1. The trainee enters their username / employee ID and password in the in-app modal (`frontend/src/components/Login.jsx`).
2. The UI sends a `login` command to the local agent (`http://127.0.0.1:8777/ws`).
3. The agent calls `POST /auth/login` on the central server.
4. Upon successful validation, the server returns a new signed 7-day JWT along with the trainee's cohort, batch, and name.
5. The agent persists the new token in `~/.ignite_buddy/auth_token` and calls `net.reconnect()`.
6. The WebSocket connection reconnects, syncs any pending assignments or timetable changes, and dismisses the login dialog.

---

## 2. Handling Multiple Devices & Resolving JMeter Concurrency Bottlenecks (Rate Limit 30)

### 2.1 Why JMeter Fails at 30 Concurrent Users Under Default Settings

When running Apache JMeter tests against a fresh installation with 30 concurrent virtual users, the test typically fails with connection resets, timeouts, or 429/500 errors.

This is **not** caused by network bandwidth limits or application logic errors; it is caused by running development-mode defaults under production load.

```
+-------------------------------------------------------------------------+
|                  Default Dev Stack Bottleneck at 30 Users               |
|                                                                         |
|  30 JMeter Threads                                                      |
|       │                                                                 |
|       ├──► POST /auth/login ──► PBKDF2 (720,000 rounds x 30 = 21.6M!)  ──► CPU 100% Saturation
|       │                                                                 |
|       ├──► WS Handshake ─────► 5.0s Timeout Exceeded ──────────────────► Sockets Dropped
|       │                                                                 |
|       ├──► Concurrent Telemetry► SQLite Exclusive Write Lock ───────────► OperationalError: locked
|       │                                                                 |
|       └──► Broadcast Sync ────► InMemoryChannelLayer Buffer Full ───────► Event Loop Frozen
+-------------------------------------------------------------------------+
```

### 2.2 The 4 Bottlenecks Analyzed

#### Bottleneck 1: SQLite Exclusive Write Locking
* SQLite allows multiple simultaneous readers, but **only one single writer at any microsecond**.
* When 30 devices connect simultaneously, each connection triggers telemetry writes (`ActivityEvent`, `ChatLog`, connection audit).
* The threads queue waiting for the file write lock. Once the SQLite busy timeout (5.0s) is exceeded, connections fail with:
  ```text
  sqlite3.OperationalError: database is locked
  ```

#### Bottleneck 2: Synchronous PBKDF2 Password Hashing
* Django's default hasher is `PBKDF2PasswordHasher` configured for **720,000 iterations**.
* Verifying a single password consumes ~120–180ms of 100% CPU on an Intel/AMD core.
* If JMeter executes 30 concurrent login requests simultaneously, the CPU must compute **21,600,000 hashing rounds**, pinning all CPU cores at 100% for several seconds.
* This starves Daphne's asyncio event loop, causing incoming network packets to queue and drop.

#### Bottleneck 3: WebSocket Handshake Timeout (`ASSISTANT_AUTH_TIMEOUT`)
* `src/server/config.py` specifies:
  ```python
  AUTH_TIMEOUT = _env_float("ASSISTANT_AUTH_TIMEOUT", 5.0)
  ```
* Once a WebSocket opens, the client has 5.0 seconds to send the `auth` frame.
* When the CPU is pegged by PBKDF2 hashing or SQLite locking, the server cannot process the handshake frame within 5 seconds, and forcibly closes the connection with code `4401`.

#### Bottleneck 4: InMemoryChannelLayer
* Django Channels defaults to `InMemoryChannelLayer`.
* It cannot distribute load across multiple worker processes or CPU cores.
* Broadcast events to 30+ clients trigger queue buffer backpressure that blocks asynchronous message handling.

---

## 3. Production Database Setup: PostgreSQL

### 3.1 Why SQLite Locks Under Concurrency
SQLite uses file-level locking (`PRAGMA locking_mode`). In an enterprise deployment with hundreds of trainees streaming telemetry and querying timetables, a client-server relational database with **row-level locking** (MVCC - Multi-Version Concurrency Control) is mandatory.

### 3.2 Step-by-Step PostgreSQL Installation & Configuration

#### Step 1: Install PostgreSQL
**Ubuntu / Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib libpq-dev
sudo systemctl enable --now postgresql
```

**Windows:**
Download and run the official installer from [postgresql.org](https://www.postgresql.org/download/windows/).

#### Step 2: Create Database & User
```bash
sudo -u postgres psql
```
Execute the SQL commands:
```sql
CREATE DATABASE ignite_buddy_db;
CREATE USER ignite_user WITH ENCRYPTED PASSWORD 'YourSecurePassword123!';
GRANT ALL PRIVILEGES ON DATABASE ignite_buddy_db TO ignite_user;
ALTER USER ignite_user CREATEDB;
\q
```

#### Step 3: Install Python PostgreSQL Driver
Install `psycopg` (v3) or `psycopg2-binary`:
```bash
pip install psycopg2-binary
```

#### Step 4: Configure `.env` in Project Root
Add the `DATABASE_URL` string to `.env` (or `.env.server`):
```env
# PostgreSQL connection string: postgresql://<user>:<password>@<host>:<port>/<dbname>
DATABASE_URL=postgresql://ignite_user:YourSecurePassword123!@127.0.0.1:5432/ignite_buddy_db
```

#### Step 5: Run Database Migrations
```bash
python manage.py check
python manage.py migrate
python manage.py createsuperuser
```

### 3.3 Configuring Connection Pooling (PgBouncer)
For 100 to 1,000+ concurrent trainee connections, place **PgBouncer** in front of PostgreSQL to pool database connections and avoid thread exhaustion:
```ini
# /etc/pgbouncer/pgbouncer.ini
[databases]
ignite_buddy_db = host=127.0.0.1 port=5432 dbname=ignite_buddy_db

[pgbouncer]
listen_port = 6432
listen_addr = 127.0.0.1
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 2000
default_pool_size = 50
reserve_pool_size = 10
```
Then point `DATABASE_URL` to port `6432`:
```env
DATABASE_URL=postgresql://ignite_user:YourSecurePassword123!@127.0.0.1:6432/ignite_buddy_db
```

---

## 4. Production Channel Layer Setup: Redis

### 4.1 Why InMemoryChannelLayer Fails Under Multi-Device Concurrency
`InMemoryChannelLayer` stores message queues inside a single Python process memory space. It:
1. Cannot communicate across multiple Daphne or Uvicorn worker processes.
2. Loses all pending notifications if the process restarts.
3. Degrades significantly under concurrent broadcast fan-outs.

### 4.2 Step-by-Step Redis Installation & Configuration

#### Step 1: Install and Start Redis
**Ubuntu / Debian:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl enable --now redis-server
```

**Windows:**
Use [Redis for Windows](https://github.com/microsoftarchive/redis/releases) or run Redis in Docker / WSL2:
```bash
docker run -d --name ignite-redis -p 6379:6379 redis:7-alpine
```

Verify Redis is running:
```bash
redis-cli ping
# Returns: PONG
```

#### Step 2: Install `channels-redis`
```bash
pip install channels-redis
```

#### Step 3: Configure `.env`
Add `REDIS_URL` to your `.env`:
```env
REDIS_URL=redis://127.0.0.1:6379/0
```

`src/server/ignite_server/settings.py` automatically detects `REDIS_URL` and switches `CHANNEL_LAYERS` to `channels_redis.core.RedisChannelLayer`:
```python
if REDIS_URL:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [REDIS_URL],
                "capacity": 2000,
                "expiry": 60,
            },
        }
    }
```

### 4.3 Enabling Multi-Worker ASGI (Daphne / Gunicorn + Uvicorn)

To utilize all CPU cores, run Daphne or Gunicorn with multiple worker processes behind a load balancer:

```bash
# Production ASGI runner using Gunicorn + Uvicorn workers:
gunicorn ignite_server.asgi:application \
    -w 4 \
    -k uvicorn.workers.UvicornWorker \
    --bind 127.0.0.1:8765 \
    --timeout 120 \
    --max-requests 5000 \
    --max-requests-jitter 500
```

### 4.4 Nginx Reverse Proxy & WebSocket Upgrades

Place Nginx in front of the ASGI cluster to terminate SSL, handle WebSocket upgrades, and serve static assets:

```nginx
# /etc/nginx/sites-available/ignite_buddy.conf
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

    # REST APIs & Swagger UI Docs
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

## 5. Step-by-Step JMeter Load Testing Execution

### 5.1 Testing Strategy: Separating Auth from WebSocket Concurrency

A common mistake in performance testing is hammering `POST /auth/login` simultaneously with 100 threads in a tight loop.

* In production, **login happens only once every 7 days** per trainee.
* Running 100 concurrent logins benchmarks PBKDF2 password hashing (CPU performance), not system concurrency or WebSocket throughput!
* **Correct Practice:**
  - **Suite 1 (Auth Scalability):** Test `POST /auth/login` with a realistic ramp-up (e.g. 50 logins over 60 seconds).
  - **Suite 2 (Real-Time WebSocket Concurrency):** Test 50 to 500 simultaneous WebSocket connections using **pre-generated JWTs**.

### 5.2 Pre-Generating Test Tokens with `generate_jmeter_tokens.py`

Use the included token generator to create signed test tokens without incurring PBKDF2 CPU overhead during testing:

```bash
# Generate 100 test user tokens into jmeter_users.csv:
python tools/generate_jmeter_tokens.py --count 100 --out jmeter_users.csv
```

This generates `jmeter_users.csv` with columns:
```csv
user_id,name,batch,token
trainee_0001,Trainee 0001,B50-A1,eyJhbGciOi...
trainee_0002,Trainee 0002,B50-A2,eyJhbGciOi...
```

### 5.3 Configuring the JMeter WebSocket Test Plan

1. **Install WebSocket Plugin**:
   - Open JMeter $\rightarrow$ **Plugins Manager** $\rightarrow$ Search for **WebSocket Samplers by Peter Doornbosch** $\rightarrow$ Click **Apply Changes and Restart JMeter**.
2. **Add CSV Data Set Config**:
   - Right-click **Test Plan** $\rightarrow$ **Add** $\rightarrow$ **Config Element** $\rightarrow$ **CSV Data Set Config**.
   - **Filename**: `jmeter_users.csv`
   - **Variable Names**: `USER_ID,NAME,BATCH,TOKEN`
   - **Delimiter**: `,`
3. **Configure Thread Group**:
   - **Number of Threads (Users)**: `100`
   - **Ramp-Up Period (seconds)**: `30` (connects ~3 users per second)
   - **Loop Count**: `Forever` (or specified duration)
4. **Add WebSocket Open Connection**:
   - **Server Name or IP**: `127.0.0.1` (or Nginx IP)
   - **Port Number**: `8765`
   - **Path**: `/ws/assistant/`
5. **Add WebSocket Single Write Sampler (Handshake)**:
   - **Request Data**:
     ```json
     {"type": "auth", "token": "${TOKEN}"}
     ```
6. **Add WebSocket Single Read Sampler**:
   - Expected response contains:
     ```json
     {"type": "hello_ok"}
     ```
7. **Add Periodic Ping Timer**:
   - Send `{"type": "ping"}` every 30 seconds to maintain persistent keep-alive.

### 5.4 Key Target Metrics & Pass Criteria

| Metric | Target | Failure Indicator & Fix |
| :--- | :--- | :--- |
| **Error Rate** | `< 0.1%` | Connections failing $\rightarrow$ Check `DATABASE_URL` is PostgreSQL, not SQLite. |
| **Handshake Latency** | `< 250ms` | Latency spikes $\rightarrow$ Increase ASGI workers (`-w 4` or `-w 8`). |
| **Concurrent Connections** | `100% connected` | Stalling at 30 $\rightarrow$ Enable `channels-redis` and verify `REDIS_URL`. |
| **CPU Utilization** | `< 70%` | Pegged at 100% $\rightarrow$ Ensure pre-generated tokens are used in CSV. |

---

## 6. Local Database Audit: Are There Unnecessary Tables?

Both the trainee PC and the central server maintain lightweight SQLite databases for distinct purposes.

### 6.1 Client Local Database (`~/.ignite_buddy/local.db`)

Located on the trainee's computer (never directly accessed by the central server):

| Table Name | Active Code Call Sites | Purpose | Retention / Auto-Pruning |
| :--- | :--- | :--- | :--- |
| `chat_turns` | `src/client/device/vault.py` | Caches recent Q&A turns so conversational follow-ups have context on-device. | Automatically pruned after 90 days (`CHAT_KEEP_DAYS`). |
| `audit_log` | `src/client/device/executor.py` | Logs every device tool executed locally (e.g. app launched, file opened, timer set). | Automatically pruned after 30 days (`AUDIT_KEEP_DAYS`). |
| `assignments` | `src/client/agent/server.py` | Stores assignments dispatched from the admin panel, including trainee completion status. | Retained until assignment is removed by instructor. |
| `timetable` | `src/client/device/localops.py` | Stores the weekly lecture schedule pushed from the admin console. | Dynamically refreshed on schedule sync. |
| `kv` | `src/client/device/winnative.py` | Stores sync cursor timestamps and seating metadata (`meta_home_lab`, `meta_sub_batch`). | Key-value store (under 50 rows). |

### 6.2 Server Per-User Database (`data/users/<hash>/local.db`)

Maintained on the central server for trainee activity monitoring, privacy analytics, and vector search:

| Table Name | Active Code Call Sites | Purpose |
| :--- | :--- | :--- |
| `activity_events` | `src/server/features/activity.py` | Continuous telemetry of foreground applications, active window titles, and idle state. **Powers the deterministic Day Summary.** |
| `actions` | `src/server/domain/orchestrator.py` | Audit log of actions executed by the assistant on behalf of the trainee. |
| `summaries` | `src/server/features/summaries.py` | Historical daily summaries and activity recap text. |
| `notes` | `src/server/features/notes.py` | Server-cached trainee notes backup. |
| `tasks` | `src/server/features/tasks.py` | Snapshot of synced tasks. |
| `screen_history`| `src/server/features/screen.py` | Redacted screenshot captures for authorized instructor assistance. |
| `chat_history`  | `src/server/chat/service.py` | Conversation history used by RAG memory turns. |
| `settings`      | `src/server/features/personal.py`| User privacy toggles (e.g. `tracking_paused_until`, `app_blocklist`). |

### 6.3 Verdict: Should Any Table Be Removed?

> [!IMPORTANT]
> **No tables should be removed.**
>
> 1. **Zero Redundancy:** Every table listed above is actively queried by runtime code. Deleting any table will cause immediate `sqlite3.OperationalError: no such table` runtime crashes.
> 2. **Negligible Storage:** The entire local database consumes **less than 200 KB** per trainee.
> 3. **Automatic Pruning:** Tables with continuous writes (`chat_turns`, `audit_log`) have built-in rolling retention limits that automatically delete old rows.
