# Ignite Buddy

An enterprise desktop assistant and campus management platform for the **TCS Ignite Program**, combining an AI-powered desktop companion for trainees with a central administration console for staff, teaching assistants, HR, and managers.

```
                           Ignite Buddy Architecture

  ┌────────────────────────────────────────────────────────────────────────────┐
  │                    Admin Console (frontend-admin)                      │
  │        React 18 · Vite · Lucide React · JWT Auth · Tailwind/CSS        │
  │   Dashboard · Buddy Control · Broadcasts · Schedules · RAG · Users     │
  └───────────────────────────────────────┬────────────────────────────────────┘
                                      │ REST API (JSON)
                                      ▼
  ┌────────────────────────────────────────────────────────────────────────────┐
  │                   Ignite Buddy Server (src/server)                     │
  │               Django 5 · Channels 4 · ASGI (Daphne)                    │
  │                                                                        │
  │  REST APIs (DRF)                 Real-time & AI Engine                 │
  │  ├── accounts (RBAC, hierarchy)  ├── WebSocket consumer & presence     │
  │  ├── buddy_controller (exams)    ├── Deterministic command parser      │
  │  ├── notifications (broadcasts)  ├── Policy & RAG knowledge base       │
  │  ├── schedules (timetables)      ├── Server-side STT (Vosk/Whisper/G)  │
  │  ├── documents (vector ingest)   └── Ollama LLM gateway (no client key)│
  │  └── telemetry (chat/activity)                                         │
  │                                                                        │
  │  Database (Dual Support): SQLite (dev) / PostgreSQL (production)       │
  └───────────────────────────────────────▲────────────────────────────────────┘
                                      │ WebSocket (WSS) + HTTP STT
                                      │
  ┌───────────────────────────────────────┴────────────────────────────────────┐
  │                 Trainee Desktop Client (src/client)                    │
  │  Frontend: React 18 · Three.js 3D Avatar · Bubble UI · Lucide React    │
  │  Agent: Local Python executor · One-shot audio recorder (no local STT) │
  │  Shell: Auto-selects Electron or PySide6 overlay window                │
  │  DeviceExecutor: Local file finder · app launcher · script runner      │
  └────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Capabilities

1. **TCS Ignite Program Hierarchy**:
   - **Cohort Level** (e.g. `B49`, `B50`): Top-level intakes of 300–500 trainees.
   - **Major Batch Level** (e.g. `A`, `B`, `C`): Lecture sections and curriculum technology tracks.
   - **Sub-Batch Level** (e.g. `A1` to `A4`, `B1` to `B4`): Practical lab groups of 20–30 trainees seated together.
   - **Physical Labs** (e.g. `Lab 1`, `Lab 2`): Room and machine assignment mapping.
2. **Deterministic Command Execution**:
   - Trainee queries like *"open the react assignment in VS Code"* or *"start a 15-minute timer"* are parsed by code grammar rules. **Zero LLM hallucinations** and instantaneous response times.
3. **Internal Policy & Knowledge Base (RAG)**:
   - Administrators upload internal policy manuals and space rules through the Admin Console. Documents are parsed, chunked, and ingested into a local vector store. The assistant answers trainee questions using verified company context.
4. **Server-Side Speech-to-Text (STT)**:
   - Trainee laptops do not install heavy ML models. Audio is captured in one shot and transcribed on the server via Vosk, Faster-Whisper, or Google SpeechRecognition, fully compatible with corporate Zscaler proxies.
5. **Exam Mode & Instant Buddy Control**:
   - During Project Readiness Assessments (PRA) or exams, instructors can disable Buddy assistants campus-wide, per-cohort, per-batch, or per-lab via the Admin Console or REST APIs.
6. **Corporate Accops VDI Ready**:
   - Engineered for Windows enterprise virtual desktop environments with network proxy awareness and no administrator privilege requirements on trainee nodes.
7. **Privacy-Friendly On-Device Day Summary**:
   - Trainee daily recap (completed/pending tasks, lecture timetable, designated seating, and application usage statistics) is processed **100% on-device** using local SQLite data without transmitting personal activity to any LLM. Rendered with clean GitHub Flavored Markdown and `lucide-react` icons.
8. **Enterprise Concurrency & Scalability (PostgreSQL + Redis)**:
   - Built to handle hundreds of concurrent trainee connections using PostgreSQL row-level locking, Redis Channels layer, and multi-worker Daphne/Uvicorn deployments. Includes automated JMeter test plans and pre-signed token generators.

---

## Project Structure

```text
Ignite_Buddy/
├── frontend/                     # Trainee Assistant UI (React 18 + Vite)
│   ├── src/
│   │   ├── components/           # Avatar3D, Bubble, AnswerModal, Icons
│   │   ├── hooks/                # useAgent, useVoice, useAudioRecorder
│   │   ├── lib/                  # state, vad, speech
│   │   └── App.jsx
│   └── vite.config.js            # Builds directly into src/client/agent/static/
├── frontend-admin/               # Admin Console UI (React 18 + Vite + Lucide)
│   ├── src/
│   │   ├── components/           # Layout, Dashboard, Buddy, Broadcast, Schedule, Users, Docs
│   │   ├── pages/                # Login, Dashboard, BuddyControl, Broadcast, Schedule, Users, Docs
│   │   ├── services/             # apiClient, authService, buddyService, etc.
│   │   └── App.jsx
│   └── vite.config.js            # Dev proxy to Django backend on port 8765
├── desktop-electron/             # Optional Electron overlay container
├── src/
│   ├── shared/                   # Wire protocols, dataclasses, and screen redaction
│   │   ├── protocol.py           # Client-server WebSocket action contracts
│   │   ├── codectx.py            # Code context extraction
│   │   └── redaction.py          # Screen & sensitive text masking
│   ├── server/                   # Central Django + Channels backend
│   │   ├── apps/
│   │   │   ├── accounts/         # User auth, RBAC, Cohort/Batch/SubBatch/Lab models, bulk upload
│   │   │   ├── buddy_controller/ # Exam mode, device status, SystemSetting key-value store
│   │   │   ├── notifications/    # Broadcasts, scoped targeting, recipient inbox tracking
│   │   │   ├── schedules/        # Timetables, OneDrive schedule links
│   │   │   ├── documents/        # KnowledgeDocument model, PDF/TXT chunking, RAG vector store
│   │   │   ├── dashboard/        # Summary analytics and live trainee counts
│   │   │   └── telemetry/        # Central ChatLog and ActivityEvent auditing
│   │   ├── chat/                 # RAG prompt pipelines, contextual policy answering
│   │   ├── commands/             # Deterministic grammar parser & tool executors
│   │   ├── knowledge/            # Chunking, embeddings, and vector store (ChromaDB / SQLite)
│   │   ├── realtime/             # Channels WebSocket consumers & push dispatchers
│   │   ├── stt/                  # Server-side speech-to-text engines
│   │   ├── ignite_server/        # Django settings, ASGI routing, WSGI
│   │   └── run.py                # Server launcher (Daphne CLI runner)
│   └── client/                   # Trainee desktop agent & device executor
│       ├── agent/                # Local aiohttp server & static UI bundle host
│       ├── desktop/              # Launcher (auto: Electron or PySide6 overlay)
│       ├── device/               # DeviceExecutor (files, applications, scripts, vault)
│       └── sensors/              # Window focus and idle state sampler
├── data/                         # Local SQLite databases, media files, knowledge base docs
├── docs/                         # Architectural specs, guides, and performance manuals
│   ├── PERFORMANCE_CONCURRENCY_AND_JMETER_GUIDE.md  # Multi-device scaling & load testing
│   ├── BACKEND_AND_DATABASE_GUIDE.md # Exhaustive Django models and schemas
│   └── ARCHITECTURE.md           # Core request execution constraints
├── tools/                        # Test helpers & JMeter token generator (generate_jmeter_tokens.py)
├── tests/                        # Pytest suite for server, client, STT, and integration
├── README_PERFORMANCE_AND_SCALING.md # Questions guide: Concurrency, JMeter, DB & Redis
├── manage.py                     # Django management CLI
└── pyproject.toml                # Unified package configuration & CLI entry points
```

---

## Quick Start

### 1. Environment Setup

**Bash (Git Bash):**
```bash
python -m venv .venv
source .venv/Scripts/activate
pip install -e .
```

**Windows Command Prompt (CMD):**
```cmd
python -m venv .venv
.venv\Scripts\activate.bat
pip install -e .
```

### 2. Configure Environment (`.env`)

Create a `.env` file in the project root:

```env
# Server settings
DJANGO_SECRET_KEY=ignite-buddy-dev-secret-key-32chars-min!!
ASSISTANT_HOST=127.0.0.1
ASSISTANT_PORT=8765
ASSISTANT_DEBUG=1

# Database: leave empty for local SQLite (data/ignite_buddy.sqlite3)
# Or set for production PostgreSQL:
# DATABASE_URL=postgresql://postgres:root@localhost:5432/ignite_buddy_db

# Channel Layer: leave empty for InMemoryChannelLayer (dev)
# Or set for multi-device production Redis:
# REDIS_URL=redis://127.0.0.1:6379/0

# JWT Authentication
ASSISTANT_JWT_SECRET=ignite-buddy-jwt-secret-key-32chars-min!!
ASSISTANT_JWT_TTL_HOURS=168

# LLM Gateway (Organisation Ollama or compatible API)
OLLAMA_BASE_URL=http://localhost:11434
CHAT_MODEL=qwen2.5:7b
FAST_MODEL=qwen2.5:3b
EMBED_MODEL=nomic-embed-text

# Server Speech-to-Text engine (google | whisper | vosk)
STT_ENGINE=google
```

### 3. Initialize Database

**Bash / CMD:**
```bash
# Verify system configuration
python manage.py check

# Apply migrations
python manage.py migrate

# Create initial admin account
python manage.py createsuperuser
```

---

## Running the Applications

### 1. Start the Central Backend Server

**Bash / CMD:**
```bash
# Starts Daphne ASGI server listening on port 8765:
ignite-server

# Or using manage.py:
python manage.py runserver 127.0.0.1:8765
```

### 2. Run the Admin Console (`frontend-admin`)

**Bash / CMD:**
```bash
# In a separate terminal:
cd frontend-admin
npm install
npm run dev
# Opens at http://localhost:5174 (proxies /api requests to :8765)
```

To build production assets:
```bash
cd frontend-admin
npm run build
```

### 3. Run the Trainee Assistant UI (`frontend`)

**Bash / CMD:**
```bash
# Build the React trainee bundle into the Python client:
cd frontend
npm install
npm run build
cd ..

# Start the trainee agent (headless browser mode for development):
ignite-client

# Or start the native desktop overlay (PySide6 or Electron):
ignite-desktop
```

---

## API Summary

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `/health` | `GET` | Health check probe |
| `/auth/login` | `POST` | Trainee desktop authentication (returns JWT & cohort/batch mapping) |
| `/api/accounts/login/` | `POST` | Admin console login (issues JWT access & refresh tokens) |
| `/api/accounts/users/` | `GET/POST` | List and create campus users |
| `/api/accounts/users/bulk-upload/` | `POST` | Bulk onboard trainees from Excel spreadsheets |
| `/api/accounts/cohorts/` | `GET` | List TCS Ignite cohorts (`B49`, `B50`, etc.) |
| `/api/accounts/batches/` | `GET` | List major sections (`A`, `B`, `C`) |
| `/api/accounts/sub-batches/` | `GET` | List lab groups (`A1`, `A2`, `B1`, etc.) |
| `/api/accounts/labs/` | `GET` | List physical computer training labs |
| `/api/settings/buddy/` | `GET/PATCH` | Global Buddy availability toggle & exam-mode lock |
| `/api/notifications/broadcast/` | `POST` | Create announcement scoped to Cohort, Batch, Sub-Batch, Role, or All |
| `/api/notifications/broadcast/history/` | `GET` | View historical announcements |
| `/api/schedules/` | `GET/POST` | View and schedule OneDrive timetable resources |
| `/api/documents/` | `GET/POST` | Upload and list RAG knowledge documents (PDF/TXT) |
| `/api/documents/<id>/` | `DELETE` | Delete knowledge document and purge its vectors from ChromaDB |
| `/api/dashboard/` | `GET` | Real-time campus metrics and trainee counts |
| `/api/schema/` | `GET` | OpenAPI 3.0 schema (YAML/JSON) (Admin only) |
| `/api/docs/` | `GET` | Interactive Swagger UI API documentation (Admin only) |
| `/api/docs/redoc/` | `GET` | Redoc interactive API documentation (Admin only) |

---

## Interactive API Documentation (DRF Spectacular)

The Ignite Buddy Unified Backend provides automated OpenAPI 3.0 documentation powered by **DRF Spectacular**.

### Access URLs
- **Swagger UI (Interactive API Explorer)**: [http://localhost:8765/api/docs/](http://localhost:8765/api/docs/)
- **Redoc (Alternative Clean Docs)**: [http://localhost:8765/api/docs/redoc/](http://localhost:8765/api/docs/redoc/)
- **Raw OpenAPI Schema**: [http://localhost:8765/api/schema/](http://localhost:8765/api/schema/) (Supports `?format=json` or default YAML)

### Access Control & Permissions
> [!IMPORTANT]
> Access to the API documentation and schema endpoints is strictly restricted to **Django Administrators** (`is_staff=True`, `is_superuser=True`, or `role="ADMIN"`). Unauthenticated requests and non-admin users (such as trainees) are blocked with `401 Unauthorized` or `403 Forbidden`.

### How to Authenticate

You can authenticate using either of the following two methods:

#### Method 1: Django Admin Session (Recommended for Browsers)
1. Open [http://localhost:8765/admin/](http://localhost:8765/admin/) and log in with your Django superuser / staff account.
2. In the same browser, navigate to [http://localhost:8765/api/docs/](http://localhost:8765/api/docs/).
3. The session cookie is automatically passed, giving you full interactive access to test and execute API calls.

#### Method 2: JWT Bearer Token
1. Generate an access token by POSTing your admin credentials to `/api/accounts/login/`:
   ```bash
   curl -X POST http://localhost:8765/api/accounts/login/ \
     -H "Content-Type: application/json" \
     -d '{"email": "admin@tcs.com", "password": "YourPassword123"}'
   ```
2. Copy the returned `"access"` token.
3. Open [http://localhost:8765/api/docs/](http://localhost:8765/api/docs/), click the **Authorize** button at the top right, and paste your token under `jwtAuth`:
   ```text
   Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
4. Click **Authorize** and **Close**. You can now execute API calls directly within Swagger UI.

---

## Developer Documentation & Architecture Guides

For detailed engineering guides, schemas, and developer onboarding instructions, see:
- **[Performance, Concurrency & JMeter Testing Guide](file:///c:/Users/Vigil/Desktop/Ignite_Buddy/README_PERFORMANCE_AND_SCALING.md)**: Operational guide answering multi-device concurrency, token auto-logout & re-login flows, fixing the JMeter rate-limit 30 bottleneck, setting up PostgreSQL & Redis, and auditing local database tables.
- **[Backend & Database Architecture Guide](file:///c:/Users/Vigil/Desktop/Ignite_Buddy/src/server/README.md)**: Exhaustive documentation covering the Django 5 architecture, ERD diagrams, normalized models, vector store indexing, real-time WebSocket protocol, and how-to guides.
- **[Docs: Performance & Scaling Manual](file:///c:/Users/Vigil/Desktop/Ignite_Buddy/docs/PERFORMANCE_CONCURRENCY_AND_JMETER_GUIDE.md)**: Detailed JMeter configuration, Nginx configs, and benchmark metrics in the `docs/` folder.
- **[Docs: Backend & Database Guide](file:///c:/Users/Vigil/Desktop/Ignite_Buddy/docs/BACKEND_AND_DATABASE_GUIDE.md)**: The permanent system documentation in the `docs/` directory.
- **[Docs: High-Level Architecture](file:///c:/Users/Vigil/Desktop/Ignite_Buddy/docs/ARCHITECTURE.md)**: Core request routing and execution constraints.
- **[Docs: Desktop Shells](file:///c:/Users/Vigil/Desktop/Ignite_Buddy/docs/DESKTOP_SHELLS.md)**: PySide6 and Electron desktop window overlay integration.
- **[Docs: Local Memory](file:///c:/Users/Vigil/Desktop/Ignite_Buddy/docs/MEMORY.md)**: Details on trainee PC local SQLite storage and privacy boundaries.

---

## Testing

The project ships **two independent suites**: a Python backend suite (`pytest` for the engine + Django `manage.py test` for the REST apps) and a Vitest suite for the Admin Console. All tests run against **isolated test databases / mocked network layers and never touch real user data**.

> Always run backend commands with the project virtualenv (`.venv`), otherwise Django plugins such as `django_extensions` will not resolve.

### 1. Backend — Django REST apps (accounts, RBAC, schedules, documents, notifications, legacy Admin API)

**Windows (PowerShell):**
```powershell
.venv\Scripts\python.exe manage.py test server.apps server.api
```

**Bash / CMD:**
```bash
.venv/Scripts/python.exe manage.py test server.apps server.api
```

Run a single app or test case:
```powershell
.venv\Scripts\python.exe manage.py test server.apps.accounts
.venv\Scripts\python.exe manage.py test server.apps.accounts.tests.AccountsApiTests.test_admin_can_create_user
```

### 2. Backend — Engine suite (parser, STT, RAG, client, integration)

```bash
# Run the whole engine suite
pytest

# Run a single module / test
pytest tests/server/test_parser.py
pytest tests/server/test_parser.py -q
```

### 3. Admin Console (`frontend-admin`) — Vitest

```bash
cd frontend-admin
npm install            # first run only
npm test               # runs the full Vitest suite once (vitest run)
```

Run a single test file or a filtered subset:
```bash
cd frontend-admin
npx vitest run src/test/pages1.test.jsx
npx vitest run -t "Login"
npx vitest            # watch mode
```

### 4. Coverage

```powershell
# Backend coverage — Django apps + legacy Admin API
.venv\Scripts\python.exe -m coverage run --source=src/server/apps,src/server/api manage.py test server.apps server.api
.venv\Scripts\python.exe -m coverage report -m
```

```bash
# Admin Console coverage (requires @vitest/coverage-v8)
cd frontend-admin
npx vitest run --coverage
```

### 5. Apache JMeter Concurrency & Load Testing

To simulate multiple concurrent trainee devices without hitting password hashing CPU bottlenecks, pre-generate signed test JWTs:

```bash
# Generate 100 test user tokens into jmeter_users.csv:
python tools/generate_jmeter_tokens.py --count 100 --out jmeter_users.csv
```

Import `jmeter_users.csv` into JMeter's **CSV Data Set Config** and execute the WebSocket test plan as described in the **[Performance & Scaling Guide](file:///c:/Users/Vigil/Desktop/Ignite_Buddy/README_PERFORMANCE_AND_SCALING.md)**.

### Test suite map

**Backend**
- `src/server/api/tests.py`: Legacy Admin API (`admin-api/*`) — auth token gating, CRUD.
- `src/server/apps/accounts/test_management.py`: Users, hierarchy (Cohort/Batch/SubBatch), RBAC, preferences.
- `src/server/apps/*/test_*.py`: Per-app API/permission tests (schedules, documents, notifications, buddy_controller, dashboard).
- `tests/server/*`, `tests/client/*`: Engine parser, server-side STT, RAG/chat, and device-executor tests (pytest).

**Admin Console (`frontend-admin/src/test/`)**
- `apiClient.test.js`: Axios interceptors, error mapping, 401 handling, cancellation.
- `authAndError.test.js`: Auth service (login/logout, Zero-Trust session), error utilities.
- `validation.test.js`: Form validation rules (broadcast, schedule, assignment, buddy).
- `services.test.js`: Every service module's API contract.
- `hooks.test.jsx`: All custom hooks + `utils/date.js`.
- `components.test.jsx` / `uiLayout.test.jsx` / `featureComponentsA.test.jsx` / `featureComponentsB.test.jsx`: Components, UI primitives, layout, and feature modals/lists.
- `pages1.test.jsx` / `pages2.test.jsx` / `appRouting.test.jsx`: Pages and the route table / guards.
- `utils.test.js`, `timetableGridEditor.test.jsx`: Utilities and the timetable grid editor.
