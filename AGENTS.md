# Open HTAP Stack — Application Context for AI Agents

> This document provides a complete, structured overview of the Open HTAP Stack project so that any AI engine can understand what the application does, how it works, its benefits, and what the demo demonstrates.

---

## 1. What Is This Application?

**Open HTAP Stack** is a **vendor-neutral, open-source Hybrid Transactional/Analytical Processing (HTAP) data platform** delivered as a proof-of-concept. It demonstrates that a single, unified data platform — built entirely from commoditised open-source software — can serve OLTP (application/transactional), OLAP (analytics), and AI workloads simultaneously, **without duplicating data or maintaining ETL pipelines**.

The project ships with a themed demo application called **"HTAP Mission Control"** (also branded **"Kermit"** in the UI logo). The demo simulates a **drone fleet telemetry and airspace-management system** operating over the Oslo, Norway area. It is designed to be presented in under 4 minutes at C-level and technical stakeholder meetings.

---

## 2. Core Thesis & Benefits

| Benefit | Description |
|---|---|
| **Single Record of Truth** | One database holds all data — application state, analytics, and AI vectors. No copies, no ETL sync lag. |
| **80%+ Lower TCO** | Eliminates the sprawl of OLTP DB + ETL pipelines + data lake/warehouse + separate AI vector DB. See `docs/TCO-Comparisons.md` for detailed comparisons. |
| **OLAP Without Data Duplication** | Spark and Presto/Trino read directly from Cassandra's on-disk SSTables (via Sidecar), or through CQL — no data copy required. |
| **Strict Serializability (ACID)** | Uses the Accord protocol (CEP-15) for strict-serializable transactions — the strongest isolation level — while remaining leaderless and linearly scalable. |
| **Resource Isolation** | OLTP queries use the normal CQL request path; OLAP reads use snapshot-based persisted-structure reads (bulk SSTable access via Sidecar). Neither impacts the other's latencies. |
| **AI-Ready** | Built-in vector similarity search (ANN) using Cassandra SAI (Storage Attached Indexes) with 1536-dimension embeddings. Supports OpenAI and OpenRouter embedding APIs. |
| **Freedom to Operate** | Every component is open source and can run anywhere — on-prem, any cloud, edge. No vendor lock-in. |
| **Multiple SQL Interfaces** | CQL for OLTP, SparkSQL and Presto/Trino SQL for OLAP, and a prototype Postgres wire-protocol adapter. |

---

## 3. Technology Stack

### Infrastructure (Containerised via Podman Compose)

| Service | Technology | Role |
|---|---|---|
| **cassandra** | Apache Cassandra (custom build with MCK patches + Sidecar) | Primary datastore — OLTP, OLAP source-of-truth, vector index (SAI) |
| **kafka** | Apache Kafka 4.1.1 (KRaft mode, no ZooKeeper) | Event streaming / ingestion bus |
| **spark** | Apache Spark 3.5.8 (with Thrift Server + Cassandra connectors) | Batch/analytical SQL engine (SparkSQL) |
| **presto** | Trino 451 | Interactive analytical SQL engine (federated queries over Cassandra) |
| **data-producer** | Python (Kafka producer) | Generates synthetic drone telemetry events at configurable throughput |
| **data-cassandra-sink** | Python (Kafka consumer) | Consumes events, writes to Cassandra tables, derives flight metrics, generates alerts |

### Application Layer

| Component | Technology | Role |
|---|---|---|
| **Backend** | Python / FastAPI | REST API — serves dashboard data, executes queries, manages demo settings, vector search |
| **Frontend** | React 19 / TypeScript / Vite / TailwindCSS 4 | "Mission Control" dashboard UI with live map, KPIs, alerts, SQL explorer, health monitoring |

### Key Libraries

- **Backend**: `scylla-driver` (Cassandra client), `trino` (Presto client), `pyhive` (Spark Thrift), `httpx` (async HTTP for embeddings), `numpy`, `pydantic-settings`
- **Frontend**: `react-router-dom`, `@tanstack/react-query`, `leaflet` / `react-leaflet` (interactive map), `recharts` (charts), `zustand` (state management)

### Observability (Optional)

- Prometheus + Grafana stack (under `observability/` directory)

---

## 4. Architecture & Data Flow

```
┌─────────────────┐     Kafka topic      ┌──────────────────────┐
│  data-producer   │ ──── demo-events ───▶│  data-cassandra-sink │
│  (Python)        │                      │  (Python)            │
│                  │                      │                      │
│  Generates       │                      │  • Writes raw events │
│  synthetic drone │                      │  • Upserts latest    │
│  telemetry at    │                      │    drone status      │
│  N events/sec    │                      │  • Derives speed,    │
│                  │                      │    heading, flight   │
│  Oslo, Norway    │                      │  • Zone proximity    │
│  area coords     │                      │    checks + alerts   │
└─────────────────┘                      └──────────┬───────────┘
                                                    │
                                                    ▼
                                         ┌──────────────────────┐
                                         │  Apache Cassandra    │
                                         │                      │
                                         │  Tables:             │
                                         │  • events            │
                                         │  • drone_latest_     │
                                         │    status            │
                                         │  • drone_events_     │
                                         │    by_entity         │
                                         │  • alerts_by_bucket  │
                                         │  • restricted_zones  │
                                         │  • ingestion_counts  │
                                         │                      │
                                         │  SAI Vector Index:   │
                                         │  • payload_vector    │
                                         │    (1536-dim)        │
                                         └──────────┬───────────┘
                                                    │
                          ┌─────────────────────────┼──────────────────────────┐
                          │                         │                          │
                          ▼                         ▼                          ▼
                   ┌──────────────┐         ┌──────────────┐          ┌──────────────┐
                   │ CQL (OLTP)   │         │ Presto/Trino │          │ Spark (batch)│
                   │ Direct reads │         │ Federated    │          │ Bulk SSTable │
                   │ & writes     │         │ SQL queries  │          │ reads via    │
                   │              │         │ over Cass.   │          │ Sidecar      │
                   └──────┬───────┘         └──────┬───────┘          └──────┬───────┘
                          │                         │                          │
                          └─────────────────────────┼──────────────────────────┘
                                                    │
                                                    ▼
                                         ┌──────────────────────┐
                                         │  FastAPI Backend     │
                                         │  (Python)            │
                                         │                      │
                                         │  REST API on :8000   │
                                         └──────────┬───────────┘
                                                    │
                                                    ▼
                                         ┌──────────────────────┐
                                         │  React Frontend      │
                                         │  "Mission Control"   │
                                         │                      │
                                         │  Vite dev on :4000   │
                                         └──────────────────────┘
```

### Data Model (Cassandra Keyspace: `demo`)

| Table | Purpose | Key Design |
|---|---|---|
| `events` | Raw event log (immutable append) | Partitioned by `entity_id`, clustered by `event_time DESC` |
| `drone_latest_status` | Current state of every drone (upserted on each event) | Single partition per `entity_id` (PRIMARY KEY). Includes `payload_vector` for ANN search |
| `drone_events_by_entity` | Historical time-series per drone | Partitioned by `entity_id`, clustered by `event_time DESC` |
| `alerts_by_bucket` | Incident alerts, bucketed by hour | Partitioned by `bucket` (e.g. `2026-08-17T20`), clustered by `alert_time DESC` |
| `restricted_zones` | No-fly / restricted airspace polygons | Keyed by `zone_id`. Polygon stored as WKT |
| `ingestion_counts` | Ingestion volume counters (30-min buckets) | Counter table, keyed by `bucket` |

---

## 5. The Demo Scenario

### Theme: Drone Fleet Airspace Management

The demo simulates a **fleet of autonomous drones** operating over Oslo, Norway. It is purpose-built for quick, impactful demonstrations.

### What Happens When You Run `podman compose up`

1. **Kafka** starts in KRaft mode (no ZooKeeper dependency).
2. **Cassandra** starts, the Sidecar initialises, and the schema (tables + SAI vector index) is auto-created via `init-mission-control.cql`. Three seed restricted zones near Oslo are inserted.
3. **Spark** starts with the Cassandra connector and Thrift Server, enabling SparkSQL.
4. **Presto/Trino** starts with a Cassandra catalog connector.
5. **data-producer** generates synthetic drone telemetry at configurable throughput (default: 5,000 events/sec for 100 drones). Each event includes: GPS coordinates, altitude, temperature (internal + external), flight status, optional text payload (sampled from Wikipedia), and a TimeUUID event ID.
6. **data-cassandra-sink** consumes from Kafka, writes to Cassandra, derives speed/heading/flight-state, checks zone proximity, and generates alerts for zone breaches.

### Frontend Dashboard Pages

| Page | What It Shows |
|---|---|
| **Overview** | Live KPIs: active drones, speed/altitude stats, ingestion rate, health score, latest alerts, ingestion volume chart |
| **Map** | Interactive Leaflet map with live drone positions, restricted zone polygons, drone detail popover, polygon-area analytics, vector similarity search panel |
| **Alerts** | Real-time alert feed with severity filtering, alert acknowledgement, zone-breach scenario trigger |
| **Explore** | Multi-engine SQL explorer: run queries against Cassandra (OLTP), Presto/Trino (OLAP), and Spark (batch) simultaneously and compare latencies. Includes natural-language-to-SQL powered by LLM (OpenRouter/OpenAI) |
| **Health** | Platform health: per-service status (Cassandra, Kafka, Spark, Presto), ingestion throughput, Kafka consumer lag, Trino active queries |
| **Settings** | Demo controls: adjust drone fleet size, events/sec, outlier percentage, pause/resume data generation, trigger breach scenarios, cleanup stale data |

### Key Demo Interactions

- **Latency Compass** (always visible in the top bar): Shows real-time measured latencies for OLTP write (Cassandra), OLAP query (Trino), and Vector ANN search — demonstrating all three access patterns hitting the same data store.
- **HTAP Benchmark** (Explore page): Run the same SQL query against all three engines (Cassandra, Presto, Spark) simultaneously and compare row counts and query times.
- **Zone Breach Scenario** (Settings/Alerts): Injects a synthetic zone-breach alert into a randomly selected flying drone — the map flies to the drone, alerts light up, demonstrating real-time event processing.
- **AI Vector Search** (Map page): Semantic search over drone text payloads using 1536-dimension embeddings stored in Cassandra SAI, with measured ANN query latency.
- **Natural Language Queries** (Explore page): Type plain English (e.g. "show drones flying above 200m") and get SQL generated + executed via LLM or pattern matching.

---

## 6. API Surface (Backend)

The FastAPI backend serves endpoints under `/api/`. Key route groups:

| Prefix | File | Purpose |
|---|---|---|
| `/api/health` | `routes/health.py` | Platform service health checks |
| `/api/overview` | `routes/overview.py` | KPIs, trends, ingestion stats for the dashboard |
| `/api/map` | `routes/map.py` | Live drone positions, drone detail, polygon-area stats, nearby drone search |
| `/api/alerts` | `routes/alerts.py` | Alert feed with severity/time filtering |
| `/api/query` | `routes/query.py` | SQL execution (Cassandra/Trino/Spark), HTAP benchmark, NL-to-SQL |
| `/api/zones` | `routes/zones.py` | Restricted zone CRUD, what-if analysis |
| `/api/vector` | `routes/vector.py` | Vector similarity search, bulk embedding indexer |
| `/api/settings` | `routes/settings.py` | Demo settings (fleet size, throughput, pause/resume) |
| `/api/demo` | `routes/demo.py` | Breach scenario trigger, latency compass, alert acknowledgement |

---

## 7. Configuration

Configuration flows through:

1. **`.env`** file at project root — sets Cassandra/Presto/Spark connection details, API keys, fleet size, throughput defaults.
2. **`backend/app/config.py`** — `pydantic-settings` model that reads from `.env` and environment variables.
3. **`settings-cache/demo-settings.json`** — shared file written by the backend and polled by the data-producer. Allows live runtime adjustment of fleet size and throughput via the Settings page without restarting containers.

### Key Environment Variables

| Variable | Default | Description |
|---|---|---|
| `N_ENTITIES` | 100 | Number of simulated drones |
| `MAX_ENTITIES` | 2000 | Maximum drones allowed |
| `EVENTS_PER_SEC` | 5000 | Target event generation throughput |
| `OUTLIER_PERCENT` | 5.0 | Percentage of events with anomalous temperatures |
| `CASSANDRA_HOST` | localhost | Cassandra contact point |
| `PRESTO_HOST` | localhost | Trino/Presto host |
| `OPENROUTER_API_KEY` | — | API key for LLM-powered NL-to-SQL and embeddings |
| `OPENROUTER_MODEL` | openai/gpt-4o-mini | Model used for NL-to-SQL generation |

---

## 8. How to Run

```bash
# Prerequisites: Podman with ≥12 GB memory allocated
podman machine inspect --format "{{.Resources.Memory}}"

# Start the full stack (infrastructure + demo services)
podman compose -f podman-compose.yml up

# Start the backend (for local development)
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Start the frontend (for local development)
cd frontend && npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:4000 |
| Backend API | http://localhost:8000 |
| Presto UI | http://localhost:8088/ui/ |
| Spark Master UI | http://localhost:8082 |
| Spark App UI | http://localhost:4040 |

---

## 9. Directory Structure

```
open-htap-stack/
├── backend/                    # FastAPI Python backend
│   ├── app/
│   │   ├── main.py             # App factory, CORS, lifespan, route registration
│   │   ├── config.py           # pydantic-settings configuration
│   │   ├── models.py           # Pydantic request/response models
│   │   ├── routes/             # API route modules (overview, map, alerts, query, etc.)
│   │   ├── db/                 # Database clients (Cassandra, Trino, Spark)
│   │   ├── services/           # Business logic services
│   │   └── utils/              # Utility functions
│   └── requirements.txt        # Python dependencies
├── frontend/                   # React/TypeScript Vite frontend
│   ├── src/
│   │   ├── App.tsx             # Root layout: sidebar, top bar, routing
│   │   ├── pages/              # Page components (Overview, Map, Alerts, Explore, Health, Settings)
│   │   ├── index.css           # Global styles
│   │   └── main.tsx            # Entry point
│   └── package.json            # Node dependencies
├── cassandra/                  # Cassandra Docker build + config
│   ├── Dockerfile              # Custom Cassandra image (with Sidecar)
│   ├── entrypoint.sh           # Startup script
│   ├── init-mission-control.cql # Schema DDL + seed data
│   ├── sidecar.yaml            # Cassandra Sidecar configuration
│   └── sidecar-logback.xml     # Sidecar logging config
├── ingress/
│   ├── producer/               # Kafka event producer (synthetic drone telemetry)
│   │   └── producer.py         # Stateful fleet simulator with numpy-backed motion
│   └── consumer/               # Kafka consumer → Cassandra writer
│       └── consumer.py         # Writes events, derives metrics, zone checks, alerts
├── spark/                      # Spark configuration and jobs
│   └── conf/                   # spark-defaults.conf, ivysettings.xml
├── presto/                     # Trino/Presto configuration
│   └── etc/                    # Catalog configs (cassandra connector)
├── observability/              # Prometheus + Grafana stack
├── docs/                       # Documentation (TCO comparisons, troubleshooting)
├── scripts/                    # Utility scripts (cleanup-data.sh)
├── podman-compose.yml          # Full stack compose definition
├── .env                        # Environment variable defaults
└── README.md                   # Primary project documentation
```

---

## 10. What Makes This Platform Unique (Summary for AI Reasoning)

1. **One database, three access paths**: The same data in Cassandra is queried via CQL (OLTP, sub-5ms writes), Presto/Trino SQL (interactive OLAP), and SparkSQL (batch OLAP) — plus ANN vector search. No ETL, no copies.

2. **The demo is a working proof**: It is not slides or architecture diagrams. The entire stack runs locally with `podman compose up` and processes thousands of events per second with a live dashboard.

3. **AI-native**: Vector embeddings are stored alongside transactional data in Cassandra SAI. The same database that handles OLTP also serves semantic similarity search — no separate vector database.

4. **Strict serializability at scale**: Using the Accord protocol (CEP-15), the platform provides the strongest possible transaction isolation without sacrificing horizontal scalability or introducing a single leader bottleneck.

5. **The demo domain (drone telemetry) is a proxy**: The architecture applies to any high-throughput, mixed-workload scenario — IoT, financial transactions, logistics, healthcare telemetry, etc.

---

## 11. Current Status

- **Stage**: Proof of Concept — not GA / production-hardened
- **Working**: Full data pipeline (producer → Kafka → consumer → Cassandra), all three query engines, vector search, live dashboard with 6 pages, demo scenario triggers, HTAP benchmark
- **In Progress / TODO**: CDC to Kafka (Sidecar-based), Accord transaction demos, Postgres wire-protocol SQL adapter, Parquet bulk import (serialisation issue), full observability integration
