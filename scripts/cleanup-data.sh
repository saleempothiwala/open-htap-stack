#!/bin/bash
# ============================================================
# HTAP Demo — Data Cleanup Script
#
# TRUNCATES generated drone event data only.
# The restricted_zones table is NEVER touched — zones are
# static reference data and must survive a data reset.
#
# Tables truncated (generated event data):
#   demo.drone_latest_status
#   demo.drone_events_by_entity
#   demo.alerts_by_bucket
#   demo.ingestion_counts
#
# Tables preserved (reference data):
#   demo.restricted_zones   ← NEVER truncated
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env for CASSANDRA_HOST / CASSANDRA_PORT if present
if [ -f "$PROJECT_DIR/.env" ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' "$PROJECT_DIR/.env" | grep -E '^(CASSANDRA_HOST|CASSANDRA_PORT)=' | xargs)
fi

CASSANDRA_HOST="${CASSANDRA_HOST:-localhost}"
CASSANDRA_PORT="${CASSANDRA_PORT:-9042}"
CASSANDRA_CONTAINER="${CASSANDRA_CONTAINER:-cassandra}"

echo "============================================="
echo "  HTAP Demo — Drone Data Reset"
echo "============================================="
echo ""
echo "  Host    : $CASSANDRA_HOST:$CASSANDRA_PORT"
echo "  Container: $CASSANDRA_CONTAINER"
echo ""
echo "  WILL truncate:"
echo "    • demo.drone_latest_status"
echo "    • demo.drone_events_by_entity"
echo "    • demo.alerts_by_bucket"
echo "    • demo.ingestion_counts"
echo ""
echo "  WILL NOT touch:"
echo "    • demo.restricted_zones  (reference data — preserved)"
echo ""

read -p "Proceed with data reset? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

echo ""

# ─── Helper: run CQL either via container exec or direct cqlsh ───────────────
run_cql() {
  local cql="$1"
  # Try podman exec first (preferred — avoids needing local cqlsh install)
  if podman ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CASSANDRA_CONTAINER}$"; then
    podman exec -i "$CASSANDRA_CONTAINER" cqlsh "$CASSANDRA_CONTAINER" "$CASSANDRA_PORT" -e "$cql"
  elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CASSANDRA_CONTAINER}$"; then
    docker exec -i "$CASSANDRA_CONTAINER" cqlsh "$CASSANDRA_CONTAINER" "$CASSANDRA_PORT" -e "$cql"
  elif command -v cqlsh &>/dev/null; then
    cqlsh "$CASSANDRA_HOST" "$CASSANDRA_PORT" -e "$cql"
  else
    echo "ERROR: Cannot find Cassandra container '$CASSANDRA_CONTAINER' or local cqlsh."
    echo "Make sure the stack is running:  podman compose up -d cassandra"
    exit 1
  fi
}

# ─── Step 1: Stop producers so no new data arrives during reset ──────────────
echo "[1/3] Stopping data producers..."
(podman compose stop data-producer data-cassandra-sink 2>/dev/null || \
 docker compose stop data-producer data-cassandra-sink 2>/dev/null || true)
echo "  Producers stopped (or not running — that's fine)"

# ─── Step 2: TRUNCATE generated tables only ──────────────────────────────────
echo ""
echo "[2/3] Truncating generated drone event data..."

TRUNCATE_CQL="TRUNCATE demo.drone_latest_status; TRUNCATE demo.drone_events_by_entity; TRUNCATE demo.alerts_by_bucket; TRUNCATE demo.ingestion_counts;"

run_cql "$TRUNCATE_CQL"
echo "  ✓ drone_latest_status   — cleared"
echo "  ✓ drone_events_by_entity — cleared"
echo "  ✓ alerts_by_bucket       — cleared"
echo "  ✓ ingestion_counts       — cleared"
echo ""
echo "  ○ restricted_zones       — PRESERVED (skipped intentionally)"

# ─── Step 3: Optional — clear Kafka & Spark state ────────────────────────────
echo ""
echo "[3/3] Clearing Kafka and Spark cached state..."

# Kafka volume (optional — only if you want a full event replay from scratch)
read -p "    Also reset Kafka topic offsets? This clears Kafka volume. (y/N): " reset_kafka
if [[ "$reset_kafka" =~ ^[Yy]$ ]]; then
  (podman compose stop kafka 2>/dev/null || docker compose stop kafka 2>/dev/null || true)
  (podman volume rm htap-demo_kafka-data 2>/dev/null || docker volume rm htap-demo_kafka-data 2>/dev/null || \
   echo "    Kafka volume already removed or doesn't exist")
  echo "  ✓ Kafka volume cleared"
else
  echo "  ○ Kafka volume preserved"
fi

# Spark Ivy cache
if [ -d "$PROJECT_DIR/spark/ivy/cache" ]; then
  rm -rf "$PROJECT_DIR/spark/ivy/cache"
  echo "  ✓ Spark Ivy cache cleared"
else
  echo "  ○ Spark Ivy cache — not found"
fi

# Spark jobs directory
if [ -d "$PROJECT_DIR/spark/jobs" ]; then
  find "$PROJECT_DIR/spark/jobs" -mindepth 1 -delete 2>/dev/null || true
  echo "  ✓ Spark jobs cleared"
else
  echo "  ○ Spark jobs directory — not found"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "============================================="
echo "  Reset Complete!"
echo "============================================="
echo ""
echo "  Restricted zones are still in place on the map."
echo "  Restart producers when ready:"
echo ""
echo "    podman compose up -d data-producer data-cassandra-sink"
echo ""