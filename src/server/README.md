# Ignite Buddy Backend & Database Architecture Guide

Welcome to the **Ignite Buddy Backend**. This guide provides an in-depth walkthrough of the server architecture, database schemas, real-time communication channels, AI/RAG engine, and developer workflows for engineers contributing to the platform.

---

## Table of Contents
1. [System Architecture Overview](#1-system-architecture-overview)
2. [Database Architecture & Data Models](#2-database-architecture--data-models)
   - [Central Database (PostgreSQL / SQLite)](#21-central-database-postgresql--sqlite)
   - [Entity-Relationship Diagram (ERD)](#22-entity-relationship-diagram-erd)
   - [App-by-App Data Model Breakdown](#23-app-by-app-data-model-breakdown)
   - [Vector Store Architecture (ChromaDB / SQLite HNSW)](#24-vector-store-architecture-chromadb--sqlite-hnsw)
   - [Client PC Local Database (`local.db`)](#25-client-pc-local-database-localdb)
   - [Client Markdown Vault (`Tasks.md` & Notes)](#26-client-markdown-vault-tasksmd--notes)
   - [Local Database & Server Store Audit (Zero Redundant Tables)](#27-local-database--server-store-audit-zero-redundant-tables)
3. [Service Layer & Engine Pipelines](#3-service-layer--engine-pipelines)
   - [Real-Time WebSocket Engine (`AssistantConsumer`)](#31-real-time-websocket-engine-assistantconsumer)
   - [Deterministic Command Parser & Execution Engine](#32-deterministic-command-parser--execution-engine)
   - [RAG & Conversational Memory Pipeline](#33-rag--conversational-memory-pipeline)
   - [Server-Side Speech-to-Text (STT) Engine](#34-server-side-speech-to-text-stt-engine)
   - [Exam Mode & Hierarchical Buddy Controller](#35-exam-mode--hierarchical-buddy-controller)
   - [Assignment Broadcast & Task Sync Pipeline](#36-assignment-broadcast--task-sync-pipeline)
   - [On-Device Privacy-Friendly Day Summary Pipeline](#37-on-device-privacy-friendly-day-summary-pipeline)
4. [REST API Architecture & Authentication](#4-rest-api-architecture--authentication)
   - [Authentication & Permissions](#41-authentication--permissions)
   - [OpenAPI 3.0 & Swagger UI (DRF Spectacular)](#42-openapi-30--swagger-ui-drf-spectacular)
   - [Core API Routes](#43-core-api-routes)
5. [New Developer Onboarding & Development Guide](#5-new-developer-onboarding--development-guide)
   - [Local Environment Setup](#51-local-environment-setup)
   - [Configuration Reference (`.env`)](#52-configuration-reference-env)
   - [Starting the Services](#53-starting-the-services)
   - [How-To: Add a New REST API Endpoint](#54-how-to-add-a-new-rest-api-endpoint)
   - [How-To: Add a New Deterministic Assistant Command](#55-how-to-add-a-new-deterministic-assistant-command)
   - [How-To: Database Migrations](#56-how-to-database-migrations)
   - [Running the Test Suite](#57-running-the-test-suite)
   - [Performance, Concurrency & JMeter Testing](#58-performance-concurrency--jmeter-testing)

---

## 1. System Architecture Overview

Ignite Buddy uses an **asynchronous, multi-protocol backend** built on Python 3.12+, **Django 5.x**, **Django REST Framework (DRF)**, and **Django Channels 4** hosted via **Daphne (ASGI)**.

```mermaid
flowchart TD
    subgraph Clients["Clients & Frontends"]
        AdminUI["Admin Console (React 18 / Vite)\nPort 5174"]
        ClientApp["Trainee Desktop Client\nAgent / PySide6 / Electron"]
    end

    subgraph Server["Ignite Buddy Unified Server (src/server) - Port 8765"]
        Daphne["Daphne ASGI Gateway"]
        
        subgraph HTTP["HTTP Request Handling"]
            DRF["Django REST Framework\nREST APIs (/api/*)"]
            Swagger["OpenAPI / Swagger UI\n(/api/docs/)"]
            Health["Health & Auth Probe\n(/health, /auth/login)"]
        end

        subgraph WS["Channels WebSocket Layer"]
            Consumer["AssistantConsumer (/ws/assistant/)"]
            ChannelLayer["Channel Layer (InMemory / Redis)"]
        end

        subgraph CoreEngines["Core Processing Engines"]
            Router["Domain Request Router\n(router.py)"]
            CommandEngine["Deterministic Grammar Parser\n(commands/skills/*)"]
            ChatEngine["RAG & Chat Service\n(chat/service.py)"]
            STTEngine["STT Audio Transcriber\n(Google / Whisper / Vosk)"]
            LLMGateway["Ollama LLM Gateway\n(gpt-oss:20b / qwen2.5)"]
        end
    end

    subgraph StorageLayer["Data & Persistence Layer"]
        CentralDB[("Central Database\nPostgreSQL (Prod) / SQLite (Dev)")]
        VectorDB[("Vector Knowledge Base\nChromaDB / SQLite HNSW")]
        LocalPCDB[("Trainee PC Local DB\n~/.trainee_assistant/local.db")]
        TasksVault[("Trainee Tasks Vault\nDocuments/TraineeAssistant/Tasks.md")]
    end

    AdminUI -->|REST JSON + JWT| DRF
    ClientApp -->|WebSocket (WSS)| Consumer
    ClientApp -->|HTTP Audio Upload| Consumer
    
    Daphne --> HTTP
    Daphne --> WS
    
    DRF --> CentralDB
    Consumer --> ChannelLayer
    Consumer --> STTEngine
    Consumer --> Router
    
    Router -->|Rule Matched| CommandEngine
    Router -->|Conversational / Policy| ChatEngine
    
    ChatEngine --> LLMGateway
    ChatEngine --> VectorDB
    ChatEngine <-->|Hydrate History| LocalPCDB
    
    Consumer -->|Sync & Notifications| TasksVault
    DRF -.->|Broadcast Event| ChannelLayer
    ChannelLayer -.->|Push Message| Consumer
```

---

## 2. Database Architecture & Data Models

### 2.1 Central Database (PostgreSQL / SQLite)
The central server supports **dual database engines** configured via `src/server/ignite_server/settings.py`:
- **Development & Offline Pilots**: Embedded SQLite database (`data/ignite_buddy.sqlite3`). Requires zero installation. Suitable for single-user testing or development.
- **Production & Staging**: Enterprise PostgreSQL (version 15+) using `psycopg` (v3). Selected when `DATABASE_URL` starts with `postgres://` or `DJANGO_DB_ENGINE=postgresql`.

> [!IMPORTANT]
> **Why SQLite Fails Under Multi-Device Concurrency (e.g. JMeter 30 Users)**:
> SQLite enforces an exclusive file-level write lock. When 30+ trainees connect simultaneously and write telemetry (`ActivityEvent`, `ChatLog`), write queues saturate the 5.0s busy timeout, causing `sqlite3.OperationalError: database is locked`.
> For campus-scale deployments (30 to 1,000+ trainees), PostgreSQL with row-level locking (MVCC) and a Redis channel layer (`REDIS_URL`) are mandatory. See the **[Performance, Concurrency & Scaling Guide](file:///c:/Users/Vigil/Desktop/Ignite_Buddy/README_PERFORMANCE_AND_SCALING.md)**.

### 2.2 Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    Cohort ||--o{ Batch : "has sections"
    Batch ||--o{ SubBatch : "has lab groups"
    Lab ||--o{ SubBatch : "home lab for"
    Cohort ||--o{ Schedule : "governed by"
    Cohort ||--o{ User : "intake for"
    SubBatch ||--o{ User : "contains trainees"
    Stream ||--o{ User : "elects (Month 4)"
    
    User ||--o{ NotificationRecipient : "receives"
    Notification ||--o{ NotificationRecipient : "delivered to"
    
    Subject ||--o{ Assignment : "categorized by"
    User ||--o{ Assignment : "created by"
    Cohort ||--o{ Assignment : "targeted to"
    
    Schedule ||--o{ TimetableSlot : "contains"
    SubBatch ||--o{ TimetableSlot : "scheduled for"
    Stream ||--o{ TimetableSlot : "stream scheduled"
    Lab ||--o{ TimetableSlot : "hosted in"
    Subject ||--o{ TimetableSlot : "teaches"
    User ||--o{ TimetableSlot : "evaluated by"
    
    Cohort ||--o{ KnowledgeDocument : "scoped to"
    Batch ||--o{ KnowledgeDocument : "scoped to"
    User ||--o{ KnowledgeDocument : "uploaded by"
    
    User ||--o{ ChatLog : "records"
    User ||--o{ ActivityEvent : "tracks"
    User ||--o{ ActivitySummary : "aggregates"
    
    Cohort {
        string code PK "e.g. B50"
        string name "Ignite Batch 50"
        date start_date
        date end_date
        bool is_active
    }
    Batch {
        int id PK
        string name "A, B, C"
        int cohort_id FK
    }
    SubBatch {
        int id PK
        string name "A1, A2, B1"
        int batch_id FK
        int home_lab_id FK
    }
    Lab {
        int id PK
        string code "LAB-1, WA"
        string name "Lab 1"
        int capacity
    }
    Stream {
        int id PK
        string code "AI_ENG, SPRINGBOOT"
        string name "AI Engineering"
    }
    Subject {
        int id PK
        string code "INCUBATOR, BIZSKILL"
        string name "Incubator"
    }
    User {
        int id PK
        string email UK
        string username
        string role "ADMIN | TRAINEE | TA | FACULTY"
        string employee_id "7-digit"
        int sub_batch_id FK
        int stream_id FK
    }
    Assignment {
        int id PK
        string topic
        date deadline
        string status "PUBLISHED | ARCHIVED"
        string recipient_mode "ALL | COHORT | BATCH | SUB_BATCH | STREAM"
        int created_by_id FK
    }
    Schedule {
        int id PK
        string title
        string phase "FOUNDATION | SPECIALIZATION"
        date effective_from
        date effective_until
        bool is_active
    }
    TimetableSlot {
        int id PK
        int schedule_id FK
        int day_of_week "0=Mon..6=Sun"
        time start_time
        time end_time
        bool is_assessment
        int lab_id FK
        int subject_id FK
    }
    Notification {
        int id PK
        string title
        string message
        string category "GENERAL | TIMETABLE | ASSIGNMENT"
        string recipient_type "ALL | COHORT | BATCH | SUB_BATCH | ROLE"
    }
    KnowledgeDocument {
        int id PK
        string title
        string space "general | ignite"
        string file_name
        string status "Ready | Processing | Failed"
        string vector_doc_id
    }
```

---

### 2.3 App-by-App Data Model Breakdown

#### 1. `server.apps.accounts` (Campus Hierarchy & Identity)
- **`Cohort`**: Top-level trainee intake batches (e.g. `B49`, `B50`).
- **`Batch`**: Major curriculum streams/sections (e.g. `A`, `B`, `C`).
- **`SubBatch`**: Practical lab pods of 20–35 trainees (e.g. `A1` to `A4`, `B1` to `B4`), mapped to a default physical `home_lab`.
- **`Lab`**: Physical computer lab rooms (e.g. `Lab 1`, `WA` - Work Area, `TS` - Training Suite).
- **`Stream`**: Elective technical specialization tracks for Month 4 (e.g. `AI Engineering`, `Springboot`, `DevOps`).
- **`Subject`**: Curriculum courses across Phase 1 Core (`Incubator`, `BizSkill`) and Phase 2 Specializations.
- **`User`**: Custom user extending `AbstractUser`. Uses `email` as `USERNAME_FIELD`, validates 7-digit `employee_id`, stores Accops VDI identifier, and handles RBAC roles (`ADMIN`, `TRAINEE`, `TA`, `FACULTY`, `OWNER`, `HR`, `MANAGER`).
- **`SubBatchStaff`**: Assigns Primary TA, Backup TA, and Batch Lead to a sub-batch.
- **`StreamFaculty`**: Allocates primary and backup instructors to elective streams.

#### 2. `server.apps.assignments` (Tasks & Project Assessments)
- **`Assignment`**: Assignments published by instructors. Features multi-level scoping (`ALL`, `COHORT`, `BATCH`, `SUB_BATCH`, `STREAM`), `start_date`, `deadline`, and URL links.
- **Real-Time Integration**: On creation or update, `_broadcast_assignment_event` dispatches real-time WebSocket events to connected trainees, automatically syncing items into the client's `Tasks.md`.

#### 3. `server.apps.buddy_controller` (Exam Mode & Lockdown)
- **`SystemSetting`**: Thread-safe key-value store for global runtime flags (`buddy_enabled`, `exam_mode_reason`, etc.).
- **`LabWorkstation`**: Inventory of physical workstations and VDI terminals.
- **Blackout Engine**: During assessments (+/- 15 minutes around test slots), `buddy_controller` dynamically disables assistant features across targeted nodes.

#### 4. `server.apps.documents` (RAG Knowledge Ingestion)
- **`KnowledgeDocument`**: Admin-uploaded corporate and program policy documents (PDF, DOCX, TXT).
- **Vector Ingestion**: Automatically extracted and chunked using MD5-hashing; embedded vectors are stored in ChromaDB or SQLite HNSW.
- **Deletion Hook**: Deleting a document model triggers automated vector purge from the underlying embedding store.

#### 5. `server.apps.notifications` (Broadcast Announcements)
- **`Notification`**: Master announcement record with hierarchical scoping filters (`target_cohort`, `target_batch`, `target_sub_batch`, `target_stream`, `target_role`).
- **`NotificationRecipient`**: Individual delivery and read receipts per trainee.

#### 6. `server.apps.schedules` (Normalized 1NF Timetables)
- **`Schedule`**: Schedule header defining validity dates, active status, and program phase (`FOUNDATION` vs `SPECIALIZATION`).
- **`TimetableSlot`**: Fully normalized 1NF lecture and practical sessions with `day_of_week` (0=Mon to 6=Sun), `start_time`, `end_time`, `lab`, `subject`, and `is_assessment` blackout flags.
- **`grid_data`**: Dynamic property that compiles the relational slots into structured JSON for frontend grid rendering.

#### 7. `server.apps.telemetry` (Audit & Productivity Logging)
- **`ChatLog`**: Centralized audit trail of trainee queries and assistant answers.
- **`ActivityEvent`**: Window focus and application usage samples captured from client sensors.
- **`ActivitySummary`**: Aggregated daily/weekly time tracking summaries.

---

### 2.4 Vector Store Architecture (ChromaDB / SQLite HNSW)

Ignite Buddy implements a dual vector store backend under `src/server/knowledge/`:
1. **ChromaDB**: Production vector database with persistent collections partitioned into two main spaces:
   - `ignite`: Space rules, lab guidelines, attendance, cafeteria timings, Accops VDI procedures.
   - `general`: Company-wide HR policies, IT security standards, leave policies.
2. **SQLite HNSW Fallback**: In lightweight environments without native C++ compilation tools, vectors fall back to an internal cosine-similarity SQLite vector table.

Documents are chunked into 500-token segments with 50-token overlap, using `nomic-embed-text` embeddings generated through the Ollama gateway.

---

### 2.5 Client PC Local Database (`local.db`)

Every trainee PC maintains its own private, client-side SQLite database at:
```text
C:\Users\<username>\.ignite_buddy\local.db
(Backward-compatible fallback: C:\Users\<username>\.trainee_assistant\local.db)
```
Configured in `src/client/config.py` and managed by `src/client/localdb.py`.

```sql
CREATE TABLE IF NOT EXISTS chat_turns(
    id INTEGER PRIMARY KEY,
    ts REAL,
    question TEXT,
    answer TEXT
);

CREATE TABLE IF NOT EXISTS audit_log(
    id INTEGER PRIMARY KEY,
    ts REAL,
    op TEXT,
    args TEXT,
    status TEXT,
    detail TEXT
);

CREATE TABLE IF NOT EXISTS assignments(
    id TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    due_ts REAL,
    status TEXT DEFAULT 'pending',
    updated_ts REAL
);

CREATE TABLE IF NOT EXISTS timetable(
    id TEXT PRIMARY KEY,
    weekday INTEGER,
    start TEXT,
    end TEXT,
    title TEXT,
    location TEXT
);

CREATE TABLE IF NOT EXISTS kv(
    key TEXT PRIMARY KEY,
    value TEXT
);
```

> [!IMPORTANT]
> **Privacy Architecture**: The trainee's full chat history remains stored locally in `chat_turns`. When a new query is answered via RAG, the server queries the trainee's local PC via the `chat_context` device call (`P.CHAT_CONTEXT`), hydrates the last $N$ turns into memory for context, and generates the response without storing permanent conversation logs on the central server.

---

### 2.6 Client Markdown Vault (`Tasks.md` & Notes)

Trainee workflow tasks are managed via a **local-first Markdown file**:
```text
%USERPROFILE%\Documents\IgniteBuddy\Tasks.md
(Backward-compatible fallback: %USERPROFILE%\Documents\TraineeAssistant\Tasks.md)
```
Managed by `src/client/device/vault.py`.

Tasks are saved in standard Markdown checklist format with embedded metadata tags:
```markdown
# Tasks

- [ ] [Assignment] Django REST API Lab @due(2026-11-20) @aid(asg-101)
- [ ] Review Accops VDI security guidelines @due(2026-11-15)
- [x] Submit attendance timesheet
```

- **`@due(YYYY-MM-DD)`**: Due date tag parsed at load time.
- **`@aid(<id>)`**: Unique assignment ID matching the central Django database.
- **Dynamic Rollover**: Tasks with due dates before `datetime.date.today()` that are not marked `[x]` are dynamically evaluated as **Rolled Over from Yesterday** and rendered with amber warning badges in the UI.
- **Idempotent Sync**: Incoming assignment notifications automatically update or insert tasks in `Tasks.md` without creating duplicates.

---

### 2.7 Local Database & Server Store Audit (Zero Redundant Tables)

Both the trainee PC and the central server maintain lightweight SQLite databases for distinct operations. A comprehensive audit confirms that **zero tables are unnecessary**:

#### Client Local Database (`~/.ignite_buddy/local.db`)
- `chat_turns`: Local context for conversational follow-ups. Automatically pruned after 90 days.
- `audit_log`: Record of local file and script operations. Automatically pruned after 30 days.
- `assignments`: Local cache of instructor-dispatched assignments.
- `timetable`: Pushed weekly class schedule for offline display.
- `kv`: Sync timestamps and trainee seating metadata (`meta_home_lab`, `meta_sub_batch`).

#### Server Per-User Store (`data/users/<hash>/local.db`)
- `activity_events`: Telemetry of active window titles, application usage, and idle time. **Directly powers the deterministic on-device Day Summary.**
- `actions`: Server-executed actions audit trail.
- `summaries`: Historical session recaps.
- `notes`: Server-side notes backup.
- `tasks`: Server-side snapshot of trainee tasks.
- `screen_history`: Redacted screen captures for authorized TA remote assistance.
- `chat_history`: Conversation turns for server RAG memory.
- `settings`: Per-user privacy toggles (`tracking_paused_until`, `app_blocklist`).

> [!WARNING]
> **Do not delete any of these tables.** Every table has active read/write call sites in runtime code. Deleting any table will trigger `sqlite3.OperationalError: no such table` exceptions. Their combined storage footprint is under 200 KB per trainee.

---

## 3. Service Layer & Engine Pipelines

### 3.1 Real-Time WebSocket Engine (`AssistantConsumer`)

Defined in `src/server/realtime/consumer.py`. Handles the complete lifecycle of a trainee workstation connection over `/ws/assistant/`:

```mermaid
sequenceDiagram
    autonumber
    actor Trainee as Trainee Client (Agent)
    participant WS as AssistantConsumer
    participant Auth as Auth & Presence
    participant Chan as Channel Layer Groups
    participant Sync as Central DB

    Trainee->>WS: Connect WebSocket
    WS->>WS: Start 5-second auth timeout
    Trainee->>WS: {"type": "auth", "token": "<jwt>", "device_id": "WS-01"}
    WS->>Auth: Verify JWT & resolve Cohort/Batch/Lab
    Auth-->>WS: User Account (e.g. B50-A1, Lab 1)
    WS->>Chan: Join groups: POLICY, user_<id>, batch_A, ALL
    WS->>Sync: Fetch changes since sync_cursor
    WS-->>Trainee: {"type": "hello_ok", "user": {...}, "trainee_meta": {...}}
    WS-->>Trainee: {"type": "policy", "blocked": false}
    WS-->>Trainee: {"type": "sync", "assignments": [...], "timetable": [...]}
```

---

### 3.2 Deterministic Command Parser & Execution Engine

Requests are first evaluated through `src/server/commands/parser.py` and `src/server/commands/skills/*`:

1. **Deterministic Rule Matching**: Regular expressions and clause parsers match intents like:
   - *"open react notes in VS Code"* -> `launch_app("code", path)`
   - *"set a timer for 15 minutes"* -> `set_timer(900)`
   - *"show tasks"* -> `list_tasks()`
2. **Zero Hallucination**: If a command matches a grammar rule, it executes directly without invoking an LLM.
3. **Execution Routing**:
   - **Server Tools**: Timers, reminders, and activity queries execute directly on the server.
   - **Device Tools**: File operations, folder listings, volume changes, and app launches are dispatched to the client agent as `device_call` packets and await `device_result`.

---

### 3.3 RAG & Conversational Memory Pipeline

When a user query is not a deterministic command, it routes to `src/server/chat/service.py`:

```mermaid
flowchart TD
    Q[User Question] --> Hydrate[1. Hydrate Local Memory\nP.CHAT_CONTEXT from Trainee PC]
    Hydrate --> CheckMem{2. Query in recent memory?}
    CheckMem -->|Yes| Prompt[4. Assemble RAG Prompt]
    CheckMem -->|No| Search[3. Hybrid Document Retrieval]
    
    subgraph Retrieval["Hybrid Retrieval"]
        Search --> KW[Keyword Search across KB spaces]
        Search --> Vector[HNSW Vector Search in ChromaDB]
        Search --> Personal[Personal Docs Search]
    end

    Retrieval --> Dedupe[Deduplicate & Rank Top-K Passages]
    Dedupe --> Prompt
    
    Prompt --> LLM[5. Stream Tokens from Ollama\nModel: gpt-oss:20b / qwen2.5:7b]
    LLM --> StreamOut[Stream Tokens to Client UI]
    StreamOut --> SaveLocal[6. Persist Turn in Trainee PC local.db]
```

1. **Hydration**: Queries the trainee PC's `local.db` via `P.CHAT_CONTEXT` to load earlier turns into `session.history`.
2. **Condensation**: For follow-ups (e.g., *"where is it located?"*), the fast model (`qwen2.5:3b`) rewrites the query into a standalone search query using conversational context.
3. **Retrieval**: Executes hybrid keyword + vector retrieval against indexed policy documents.
4. **Synthesis**: Injects retrieved passages into the system prompt for `gpt-oss:20b` (128K context window).
5. **Streaming**: Tokens stream via WebSocket to the client. Upon completion, the client agent records the turn into `chat_turns` in `local.db`.

---

### 3.4 Server-Side Speech-to-Text (STT) Engine

Implemented in `src/server/stt/transcriber.py`:
- Trainee laptops capture 16 kHz mono PCM audio chunks using a Web Audio / VAD recorder.
- Audio packets are sent in one shot over HTTP (`/api/stt/transcribe/`) or directly over WebSocket.
- The server processes audio centrally through **Vosk**, **Faster-Whisper**, or **Google SpeechRecognition**, configured with corporate Zscaler proxy bypass (`STT_PROXY`).
- **Advantage**: Zero heavyweight ML models or GPU requirements on trainee virtual desktops.

---

### 3.5 Exam Mode & Hierarchical Buddy Controller

Managed via `src/server/apps/buddy_controller/`:
- **Hierarchical Scoping**: Lockdowns can be applied globally, per-cohort, per-batch, per-sub-batch, or per-lab.
- **Timetable Blackouts**: Automatically disables Buddy during scheduled assessment slots (+/- 15 minutes buffer).
- **Enforcement**: When blocked, `AssistantConsumer` sends `{"type": "blocked", "reason": "Exam in session"}` and clears active client sessions.

---

### 3.6 Assignment Broadcast & Task Sync Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Instructor / Admin
    participant View as AssignmentViewSet
    participant Chan as Channel Layer
    participant WS as AssistantConsumer
    participant Agent as Trainee Agent (server.py)
    participant Vault as Vault (vault.py)

    Admin->>View: POST /api/assignments/ (New Assignment)
    View->>View: Save Assignment to Central DB
    View->>Chan: group_send("b_<batch>", "trainee.notification")
    Chan->>WS: Dispatch trainee_notification event
    WS-->>Agent: {"type": "notification", "kind": "assignment", ...}
    Agent->>Vault: auto_add_assignment(title, due_date, aid)
    Vault->>Vault: Idempotently update Documents/IgniteBuddy/Tasks.md
    Vault-->>Agent: Tasks updated
    Agent-->>WS: Broadcast vault_data to UI
```

---

### 3.7 On-Device Privacy-Friendly Day Summary Pipeline

When a trainee asks to *"summarize my day"*, *"recap today"*, or requests a *"daily summary"*, Ignite Buddy computes the entire summary **100% on-device** using local data:

```mermaid
flowchart TD
    UserQuery["Trainee: 'Summarize my day'"] --> LocalAgent["Local Agent (_from_ui in server.py)"]
    LocalAgent --> CheckQuery{"Day Summary Intent?"}
    
    CheckQuery -->|Yes (Zero LLM)| LocalOps["LocalOps.op_summarize_day (executor.py)"]
    CheckQuery -->|No| ServerWS["Forward to Server WebSocket (/ws/assistant/)"]
    
    subgraph OnDeviceProcessing["100% On-Device Privacy Boundary"]
        LocalOps --> Tasks["Vault.list_tasks (Tasks.md)\nCompleted vs Remaining"]
        LocalOps --> Schedule["Timetable Table (local.db)\nToday's Lectures & Room"]
        LocalOps --> Seating["KV Table (local.db)\nAssigned Lab & Pod"]
        LocalOps --> AppUsage["Activity Events (local.db)\nActive Time & Top Apps"]
    end
    
    OnDeviceProcessing --> FormatMD["Format GitHub Markdown\nGFM Task Lists & Lucide Icon Classes"]
    FormatMD --> UI["AnswerModal in React UI\nOpens Answer Tab (Not Tasks Tab)"]
```

1. **Zero LLM Leakage**: Personal productivity data, window titles, and task details are never uploaded to remote or external LLMs.
2. **Deterministic Output**: Uses exact counts of completed tasks, due today, overdue, and upcoming tasks.
3. **Application Usage Metrics**: Reads foreground application samples from `activity_events` in the local DB, aggregating total active time, top used applications, and productivity categories (e.g. Development, Collaboration, Browsing).
4. **Rich Lucide Markdown**: The formatted markdown uses GFM checklists (`- [x]`, `- [ ]`) and icon classes, rendered cleanly with `lucide-react` in `frontend/src/components/AnswerModal.jsx`.

---

## 4. REST API Architecture & Authentication

### 4.1 Authentication & Permissions
The backend uses **Django REST Framework** with dual authentication:
1. **JWT Bearer Authentication** (`SimpleJWT`): Used by the Admin Console (`frontend-admin`) and Trainee Desktop Client.
   - Access Token Lifetime: 24 hours
   - Refresh Token Lifetime: 7 days (with rotation and blacklisting)
2. **Django Session Authentication**: Used for standard browser logins and `/admin/`.

#### Role-Based Access Control (RBAC)
Configured in `src/server/apps/accounts/permissions.py`:
- `IsAdmin`: Only users with `is_staff`, `is_superuser`, or `role="ADMIN"`.
- `IsInstructorOrAdmin`: Instructors, Faculty, and Admins.
- `IsTrainee`: Authenticated trainees.

---

### 4.2 OpenAPI 3.0 & Swagger UI (DRF Spectacular)

Interactive API documentation is generated dynamically via **DRF Spectacular**:
- **Swagger UI**: [http://localhost:8765/api/docs/](http://localhost:8765/api/docs/)
- **Redoc**: [http://localhost:8765/api/docs/redoc/](http://localhost:8765/api/docs/redoc/)
- **OpenAPI Schema**: [http://localhost:8765/api/schema/](http://localhost:8765/api/schema/)

> [!NOTE]
> Access to `/api/docs/` is restricted to Django Administrators. Authenticate by logging into `/admin/` first, or supply a JWT token via the **Authorize 🔓** button.

---

### 4.3 Core API Routes

| Endpoint | Method | Permission | Description |
| :--- | :---: | :---: | :--- |
| `/health` | `GET` | AllowAny | Health check probe |
| `/auth/login` | `POST` | AllowAny | Desktop client authentication (returns JWT & trainee metadata) |
| `/api/accounts/login/` | `POST` | AllowAny | Admin Console login (returns access & refresh JWT) |
| `/api/accounts/users/` | `GET/POST` | IsAdmin | User management |
| `/api/accounts/users/bulk-upload/` | `POST` | IsAdmin | Bulk trainee onboarding from Excel files |
| `/api/accounts/cohorts/` | `GET/POST` | IsAdmin | Cohort management (`B49`, `B50`) |
| `/api/accounts/batches/` | `GET/POST` | IsAdmin | Major section management (`A`, `B`, `C`) |
| `/api/accounts/sub-batches/` | `GET/POST` | IsAdmin | Lab pod management (`A1`, `B2`) |
| `/api/accounts/labs/` | `GET/POST` | IsAdmin | Physical lab rooms |
| `/api/assignments/` | `GET/POST` | IsInstructorOrAdmin | Assignment CRUD & broadcast dispatch |
| `/api/settings/buddy/` | `GET/PATCH` | IsAdmin | Global Buddy toggle & exam lock |
| `/api/notifications/broadcast/` | `POST` | IsAdmin | Target announcement dispatch |
| `/api/notifications/broadcast/history/` | `GET` | IsAdmin | Announcement history |
| `/api/schedules/` | `GET/POST` | IsAdmin | Timetable schedule management |
| `/api/documents/` | `GET/POST` | IsAdmin | RAG Knowledge document upload (PDF/TXT) |
| `/api/documents/<id>/` | `DELETE` | IsAdmin | Delete document and purge vectors |
| `/api/dashboard/` | `GET` | IsAdmin | Live dashboard statistics & trainee counts |

---

## 5. New Developer Onboarding & Development Guide

### 5.1 Local Environment Setup

#### Prerequisites
- **Python**: 3.12 or 3.14 recommended.
- **Node.js**: v18+ (for admin and client UI builds).
- **Ollama**: Running locally or accessible over the network (with `gpt-oss:20b`, `qwen2.5:7b`, and `nomic-embed-text` pulled).

#### Setup Steps

**Windows (PowerShell / CMD):**
```powershell
# 1. Clone repository
git clone https://github.com/your-org/Ignite_Buddy.git
cd Ignite_Buddy

# 2. Create virtual environment
python -m venv .venv
.venv\Scripts\activate

# 3. Install dependencies in editable mode
pip install -e .
```

---

### 5.2 Configuration Reference (`.env`)

Create a `.env` file in the project root:

```env
# Django & Server Core
DJANGO_SECRET_KEY=dev-secret-key-at-least-32-characters-long!
ASSISTANT_HOST=127.0.0.1
ASSISTANT_PORT=8765
ASSISTANT_DEBUG=1
DJANGO_DEBUG=True

# Database (Leave empty for default SQLite: data/ignite_buddy.sqlite3)
# For PostgreSQL:
# DATABASE_URL=postgresql://ignite_user:YourSecurePassword123!@127.0.0.1:5432/ignite_buddy_db

# Channel Layer (Leave empty for InMemoryChannelLayer)
# For Multi-Device Production Redis:
# REDIS_URL=redis://127.0.0.1:6379/0

# Desktop Assistant JWT Configuration
ASSISTANT_JWT_SECRET=ignite-buddy-jwt-secret-key-32chars-min!!
ASSISTANT_JWT_TTL_HOURS=168

# LLM Gateway (Ollama)
OLLAMA_BASE_URL=http://localhost:11434
CHAT_MODEL=gpt-oss:20b
FAST_MODEL=qwen2.5:3b
EMBED_MODEL=nomic-embed-text

# Server-Side STT (google | whisper | vosk)
STT_ENGINE=google
```

---

### 5.3 Starting the Services

#### 1. Apply Migrations & Create Superuser
```powershell
python manage.py migrate
python manage.py createsuperuser
```

#### 2. Start Daphne ASGI Server
```powershell
# Using the CLI shortcut:
ignite-server

# Or using manage.py:
python manage.py runserver 127.0.0.1:8765
```

#### 3. Start Admin Console (`frontend-admin`)
```powershell
cd frontend-admin
npm install
npm run dev
# Accessible at http://localhost:5174
```

---

### 5.4 How-To: Add a New REST API Endpoint

1. **Define the Model** (in `src/server/apps/<app>/models.py`):
   ```python
   class CampusEvent(models.Model):
       title = models.CharField(max_length=200)
       date = models.DateField()
   ```

2. **Create a Serializer** (in `src/server/apps/<app>/serializers.py`):
   ```python
   from rest_framework import serializers
   from .models import CampusEvent

   class CampusEventSerializer(serializers.ModelSerializer):
       class Meta:
           model = CampusEvent
           fields = "__all__"
   ```

3. **Create the ViewSet** (in `src/server/apps/<app>/views.py`):
   ```python
   from rest_framework import viewsets
   from server.apps.accounts.permissions import IsAdmin
   from .models import CampusEvent
   from .serializers import CampusEventSerializer

   class CampusEventViewSet(viewsets.ModelViewSet):
       queryset = CampusEvent.objects.all()
       serializer_class = CampusEventSerializer
       permission_classes = [IsAdmin]
   ```

4. **Register the URL** (in `src/server/apps/<app>/urls.py`):
   ```python
   from rest_framework.routers import DefaultRouter
   from .views import CampusEventViewSet

   router = DefaultRouter()
   router.register(r"events", CampusEventViewSet, basename="campus-events")
   urlpatterns = router.urls
   ```

The new endpoint automatically appears in Swagger UI at `/api/docs/`.

---

### 5.5 How-To: Add a New Deterministic Assistant Command

1. Open `src/server/commands/skills/` and create or edit a skill module (e.g. `workspace.py`):
   ```python
   from server.commands.registry import tool, rule, SAFE

   @tool("clean_temp", SAFE, "Clear temporary workspace cache.", {})
   def clean_temp(session):
       # Server execution logic
       return {"msg": "Workspace temporary cache cleared."}

   @rule(r"(?:clear|clean) (?:my )?temp(?:orary)? cache", examples=("clean temp cache",))
   def _clean_temp_rule(match, builder):
       builder.add("clean_temp")
   ```

2. Register the module in `src/server/commands/skills/__init__.py`.
3. If the command runs on the trainee's local PC, register it as a `device_tool` and implement `op_<name>` in `src/client/device/executor.py`.

---

### 5.6 How-To: Database Migrations

Whenever models are modified:
```powershell
# 1. Generate migrations
python manage.py makemigrations

# 2. Review the generated migration file in src/server/apps/<app>/migrations/

# 3. Apply migrations
python manage.py migrate
```

---

### 5.7 Running the Test Suite

The test suite is powered by **pytest**:

```powershell
# Run all server tests
pytest tests/server/

# Run specific functional test suites
pytest tests/server/test_rag_and_chat.py
pytest tests/server/test_parser.py
pytest tests/server/test_broadcast.py

# Run client vault & tasks tests
pytest tests/client/test_vault_files_native.py -k tasks
```

---

### 5.8 Performance, Concurrency & JMeter Testing

When testing the server under concurrent load from multiple trainee workstations:
1. **Never load-test against SQLite or in-memory Channels**: Set `DATABASE_URL` to PostgreSQL and `REDIS_URL` to Redis.
2. **Pre-generate test JWTs**: Avoid calling `POST /auth/login` concurrently with 100 threads, which saturates CPU on PBKDF2 password hashing. Generate pre-signed test tokens using:
   ```powershell
   python tools/generate_jmeter_tokens.py --count 100 --out jmeter_users.csv
   ```
3. **Execute JMeter WebSocket Samplers**: Follow the full configuration steps in **[Performance, Concurrency & JMeter Guide](file:///c:/Users/Vigil/Desktop/Ignite_Buddy/README_PERFORMANCE_AND_SCALING.md)**.


