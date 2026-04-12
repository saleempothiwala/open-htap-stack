import sys
import os
from cassandra.cluster import Cluster

def test_connection():
    try:
        print("Attempting to connect to Cassandra at 127.0.0.1:9042...")
        cluster = Cluster(["127.0.0.1"], port=9042)
        session = cluster.connect()
        print("Successfully connected to Cassandra!")
        
        # Check keyspace
        print("Checking for 'demo' keyspace...")
        rows = session.execute("SELECT keyspace_name FROM system_schema.keyspaces")
        keyspaces = [row.keyspace_name for row in rows]
        print(f"Available keyspaces: {keyspaces}")
        
        if 'demo' in keyspaces:
            print("'demo' keyspace exists.")
            session.set_keyspace('demo')
            print("Switched to 'demo' keyspace.")
            
            # Check tables
            rows = session.execute("SELECT table_name FROM system_schema.tables WHERE keyspace_name='demo'")
            tables = [row.table_name for row in rows]
            print(f"Tables in 'demo': {tables}")
        else:
            print("'demo' keyspace DOES NOT exist.")
            
        cluster.shutdown()
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    test_connection()
