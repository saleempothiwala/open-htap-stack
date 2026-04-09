-- HTAP Mission Control: Additional tables for drone telemetry, alerts, and zones
-- Run this after the existing demo keyspace is created

-- ============================================================
-- Table 1: drone_latest_status
-- Purpose: Fast live map and current fleet KPIs
-- Updated on every new event; always holds the most recent state per drone
-- ============================================================
CREATE TABLE IF NOT EXISTS demo.drone_latest_status (
  entity_id text PRIMARY KEY,
  event_id timeuuid,
  event_time timestamp,
  event_type text,
  observer_id text,
  latitude double,
  longitude double,
  altitude_m float,
  temp_external_c float,
  temp_internal_c float,
  speed_mps double,
  heading_deg double,
  is_flying boolean,
  telemetry_age_s int,
  near_restricted_zone boolean,
  predicted_zone_breach boolean,
  risk_score double,
  text_payload text,
  payload_vector vector<float, 1536>,
  updated_at timestamp
);

-- Ensure columns exist if table was already created
ALTER TABLE demo.drone_latest_status ADD IF NOT EXISTS text_payload text;
ALTER TABLE demo.drone_latest_status ADD IF NOT EXISTS payload_vector vector<float, 1536>;

CREATE CUSTOM INDEX IF NOT EXISTS payload_vector_idx ON demo.drone_latest_status (payload_vector) 
USING 'org.apache.cassandra.index.sai.StorageAttachedIndex';

-- ============================================================
-- Table 2: drone_events_by_entity
-- Purpose: Historical playback, per-drone analysis, forecasting
-- Partitioned by entity_id, clustered by event_time descending
-- ============================================================
CREATE TABLE IF NOT EXISTS demo.drone_events_by_entity (
  entity_id text,
  event_time timestamp,
  event_id timeuuid,
  event_type text,
  observer_id text,
  latitude double,
  longitude double,
  altitude_m float,
  temp_external_c float,
  temp_internal_c float,
  speed_mps double,
  heading_deg double,
  zone_id text,
  text_payload text,
  PRIMARY KEY ((entity_id), event_time, event_id)
) WITH CLUSTERING ORDER BY (event_time DESC, event_id DESC);

-- ============================================================
-- Table 3: restricted_zones
-- Purpose: Define no-fly / restricted airspace zones
-- ============================================================
CREATE TABLE IF NOT EXISTS demo.restricted_zones (
  zone_id text PRIMARY KEY,
  zone_name text,
  polygon_wkt text,
  severity text,
  enabled boolean,
  updated_at timestamp
);

-- ============================================================
-- Table 4: alerts_by_bucket
-- Purpose: Current and recent incident alerts, bucketed by hour
-- ============================================================
CREATE TABLE IF NOT EXISTS demo.alerts_by_bucket (
  bucket text,
  alert_time timestamp,
  entity_id text,
  alert_id timeuuid,
  alert_type text,
  severity text,
  zone_id text,
  latitude double,
  longitude double,
  altitude_m float,
  message text,
  risk_score double,
  PRIMARY KEY ((bucket), alert_time, entity_id, alert_id)
) WITH CLUSTERING ORDER BY (alert_time DESC, entity_id ASC, alert_id DESC);

-- ============================================================
-- Table 5: ingestion_counts
-- Purpose: Track ingestion volume in 30-minute buckets for dashboard charts
-- ============================================================
CREATE TABLE IF NOT EXISTS demo.ingestion_counts (
  bucket text PRIMARY KEY,
  record_count counter
);

-- ============================================================
-- Seed Data: Demo Restricted Zones (Oslo, Norway area)
-- Using IF NOT EXISTS so this block is safe to re-run on
-- container rebuilds without duplicating or overwriting data.
-- These zones are NEVER cleared by the cleanup-data.sh script.
-- ============================================================

-- Zone 1: Oslo Airport Gardermoen (critical aviation zone)
INSERT INTO demo.restricted_zones (zone_id, zone_name, polygon_wkt, severity, enabled, updated_at)
VALUES (
  'zone-oslo-airport',
  'Oslo Lufthavn Gardermoen',
  'POLYGON((11.05 60.18, 11.15 60.18, 11.15 60.22, 11.05 60.22, 11.05 60.18))',
  'critical',
  true,
  toTimestamp(now())
) IF NOT EXISTS;

-- Zone 2: Royal Palace / Government Quarter
INSERT INTO demo.restricted_zones (zone_id, zone_name, polygon_wkt, severity, enabled, updated_at)
VALUES (
  'zone-royal-palace',
  'Det Kongelige Slott',
  'POLYGON((10.72 59.91, 10.74 59.91, 10.74 59.92, 10.72 59.92, 10.72 59.91))',
  'critical',
  true,
  toTimestamp(now())
) IF NOT EXISTS;

-- Zone 3: Fornebu / tech park area
INSERT INTO demo.restricted_zones (zone_id, zone_name, polygon_wkt, severity, enabled, updated_at)
VALUES (
  'zone-fornebu',
  'Fornebu Tech Park',
  'POLYGON((10.62 59.88, 10.66 59.88, 10.66 59.90, 10.62 59.90, 10.62 59.88))',
  'warning',
  true,
  toTimestamp(now())
) IF NOT EXISTS;