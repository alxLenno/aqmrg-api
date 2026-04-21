import sqlite3
import os

DB_PATH = "sensor_data.db"

print(f"🧹 Starting cleanup of simulated data...")

if not os.path.exists(DB_PATH):
    # Try different location relative to root
    DB_PATH = "mysite/sensor_data.db"

try:
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. Count rows to be deleted
    cursor.execute("SELECT COUNT(*) FROM sensor_reading WHERE device_id = 'SIMULATOR_TEST_001'")
    count = cursor.fetchone()[0]

    if count > 0:
        # 2. Delete the rows
        cursor.execute("DELETE FROM sensor_reading WHERE device_id = 'SIMULATOR_TEST_001'")
        conn.commit()
        print(f"✅ Successfully deleted {count} rows from SIMULATOR_TEST_001.")
    else:
        print("ℹ️ No rows found for SIMULATOR_TEST_001.")

    conn.close()

except Exception as e:
    print(f"❌ Error during cleanup: {e}")
