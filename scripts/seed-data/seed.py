import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def seed():
    conn = psycopg2.connect(
        host=os.getenv('DATABASE_HOST', 'localhost'),
        port=os.getenv('DATABASE_PORT', '5432'),
        database=os.getenv('DATABASE_NAME', 'aqmrg'),
        user=os.getenv('DATABASE_USER', 'aqmrg'),
        password=os.getenv('DATABASE_PASSWORD', 'aqmrg_password')
    )
    cur = conn.cursor()

    # Seed sensors
    sensors = [
        ('S001', 'Kampala Central', 'Kampala', 0.3476, 32.5825, 'AirQo'),
        ('S002', 'Nakawa', 'Kampala', 0.3348, 32.6141, 'AirQo'),
        ('S003', 'Entebbe', 'Entebbe', 0.0511, 32.4435, 'PurpleAir'),
    ]

    for sensor in sensors:
        cur.execute(
            "INSERT INTO sensors (device_id, name, location_name, latitude, longitude, manufacturer) VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (device_id) DO NOTHING",
            sensor
        )

    conn.commit()
    cur.close()
    conn.close()
    print("Seeding complete")

if __name__ == "__main__":
    seed()
