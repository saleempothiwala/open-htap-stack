#!/bin/bash
# Cleanup script for HTAP Demo data
# This script stops all containers, removes volumes, and clears local data directories

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================="
echo "  HTAP Demo Data Cleanup Script"
echo "========================================="
echo ""

# Confirm action
read -p "This will delete ALL data (Cassandra, Kafka, Spark cache). Continue? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "[1/5] Stopping all containers..."
cd "$PROJECT_DIR"
podman compose down 2>/dev/null || true

echo ""
echo "[2/5] Removing Kafka named volume..."
podman volume rm htap-demo_kafka-data 2>/dev/null || echo "  Kafka volume already removed or doesn't exist"

echo ""
echo "[3/5] Clearing Cassandra data directory..."
if [ -d "$PROJECT_DIR/cassandra-data" ]; then
    rm -rf "$PROJECT_DIR/cassandra-data"
    mkdir -p "$PROJECT_DIR/cassandra-data"
    echo "  Cassandra data cleared"
else
    echo "  Cassandra data directory doesn't exist"
fi

echo ""
echo "[4/5] Clearing Spark Ivy cache..."
if [ -d "$PROJECT_DIR/spark/ivy/cache" ]; then
    rm -rf "$PROJECT_DIR/spark/ivy/cache"
    echo "  Spark Ivy cache cleared"
else
    echo "  Spark Ivy cache doesn't exist"
fi

echo ""
echo "[5/5] Clearing Spark jobs directory..."
if [ -d "$PROJECT_DIR/spark/jobs" ]; then
    find "$PROJECT_DIR/spark/jobs" -mindepth 1 -delete 2>/dev/null || true
    echo "  Spark jobs cleared"
else
    echo "  Spark jobs directory doesn't exist"
fi

echo ""
echo "========================================="
echo "  Cleanup Complete!"
echo "========================================="
echo ""
echo "To restart fresh:"
echo "  podman compose up -d cassandra kafka"
echo "  sleep 30  # wait for Cassandra to initialize"
echo "  podman compose up -d data-producer data-cassandra-sink"
echo ""