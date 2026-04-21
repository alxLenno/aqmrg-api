import sqlite3
import os

# Path to your database file
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, 'sensor_data.db')

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}. Nothing to migrate.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("Checking for missing columns...")
    
    # Get existing columns
    cursor.execute("PRAGMA table_info(sensor_reading)")
    columns = [column[1] for column in cursor.fetchall()]

    # Add latitude if missing
    if 'latitude' not in columns:
        print("Adding 'latitude' column...")
        cursor.execute("ALTER TABLE sensor_reading ADD COLUMN latitude FLOAT")
    
    # Add longitude if missing
    if 'longitude' not in columns:
        print("Adding 'longitude' column...")
        cursor.execute("ALTER TABLE sensor_reading ADD COLUMN longitude FLOAT")

    conn.commit()
    conn.close()
    print("✓ Migration complete! You can now reload your PythonAnywhere web app.")

if __name__ == "__main__":
    migrate()
