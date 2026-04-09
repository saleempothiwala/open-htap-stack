import sys
import os

# Add the parent directory to sys.path so we can import app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.db.cassandra_client import cassandra_client
from app.config import settings

def enable_vector():
    print("Checking Cassandra connection...")
    # Override host for local running if needed, or rely on .env
    cassandra_client.connect()
    
    if not cassandra_client.connected:
        print("Failed to connect to Cassandra")
        return

    print("Adding payload_vector column to demo.drone_latest_status...")
    try:
        cassandra_client._session.execute("ALTER TABLE demo.drone_latest_status ADD payload_vector vector<float, 1536>;")
        print("Column added successfully.")
    except Exception as e:
        if "already exists" in str(e).lower():
            print("Column already exists.")
        else:
            print(f"Error adding column: {e}")

    print("Creating SAI index on payload_vector...")
    try:
        cassandra_client._session.execute("CREATE CUSTOM INDEX IF NOT EXISTS payload_vector_idx ON demo.drone_latest_status (payload_vector) USING 'org.apache.cassandra.index.sai.StorageAttachedIndex';")
        print("Index created successfully.")
    except Exception as e:
        print(f"Error creating index: {e}")

    print("Vector Search Enabled!")

if __name__ == "__main__":
    enable_vector()
