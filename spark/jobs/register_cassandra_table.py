#!/usr/bin/env python3
"""
register_cassandra_table.py
───────────────────────────
Registers the Cassandra 'demo.drone_latest_status' table in the Spark Thrift
Server's Hive metastore using the spark-cassandra-connector.

Run this ONCE after the Spark Thrift Server is up:

  podman exec spark bash -c 'spark-submit \
    --master spark://spark:7077 \
    --packages com.datastax.spark:spark-cassandra-connector_2.12:3.5.1 \
    --conf spark.cassandra.connection.host=cassandra \
    --conf spark.cassandra.connection.port=9042 \
    /opt/spark/jobs/register_cassandra_table.py'

Or just restart the spark container — the compose healthcheck runs it on startup.
"""

from pyspark.sql import SparkSession

spark = (
    SparkSession.builder
    .appName("RegisterCassandraTable")
    .config("spark.cassandra.connection.host", "cassandra")
    .config("spark.cassandra.connection.port", "9042")
    .enableHiveSupport()
    .getOrCreate()
)

spark.sql("CREATE DATABASE IF NOT EXISTS default")
spark.sql("DROP TABLE IF EXISTS default.drone_latest_status")

# Register Cassandra table as a Spark/Hive external table
spark.sql("""
CREATE TABLE IF NOT EXISTS default.drone_latest_status
USING org.apache.spark.sql.cassandra
OPTIONS (
  table   'drone_latest_status',
  keyspace 'demo',
  cluster  'htap-demo',
  pushdown 'true'
)
""")

print("[register] Table default.drone_latest_status registered in Spark metastore.")
print("[register] Schema:")
spark.sql("DESCRIBE default.drone_latest_status").show(truncate=False)

spark.stop()
