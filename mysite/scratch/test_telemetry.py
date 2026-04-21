import requests
import json
import time

BASE_URL = "http://127.0.0.1:5001"
INGEST_URL = f"{BASE_URL}/api/v1/data/ingest"
LATEST_URL = f"{BASE_URL}/api/v1/data/latest"

# Corrected payload structure matching routes.py logic
test_payload = {
    "sensorId": "SIMULATOR_TEST_002",
    "metrics": {
        "pm25": 18.2,
        "co2": 445.0,
        "methane": 14.5,
        "oxygen": 20.9, # Another new metric
        "status": "testing"
    },

    "location": {
        "latitude": -1.28,
        "longitude": 36.82
    }
}


print(f"🚀 Sending simulated telemetry from SIMULATOR_TEST_001...")
print(f"   Payload: {json.dumps(test_payload, indent=2)}")

try:
    # 2. POST to ingestion point
    response = requests.post(INGEST_URL, json=test_payload)
    print(f"📡 Ingestion Status: {response.status_code}")
    print(f"   Response: {response.json()}")

    if response.status_code == 201:
        print("\n✅ Data ingested successfully. Waiting 1s for consistency...")
        time.sleep(1)

        # 3. Verify via GET /data/latest
        print(f"🔍 Verifying visibility in the API...")
        get_res = requests.get(f"{LATEST_URL}?device_id={test_payload['sensorId']}")
        data = get_res.json()
        
        if data and len(data) > 0:
            reading = data[0]
            metrics = reading.get('metrics', {})
            print(f"✅ Found reading in API!")
            # The API extracts from JSON and uses common names (lowercase/underscored)
            m_val = metrics.get('methane')
            o_val = metrics.get('oxygen')
            print(f"   Methane: {m_val} ppm")
            print(f"   Oxygen:  {o_val} %")
            
            if m_val is not None and o_val is not None:
                print("✅ Dual-Track Verification SUCCESS: Metrics found via JSON redundancy.")

            else:
                print("❌ Dual-Track Verification FAILED: Metric missing from response.")
        else:
            print("❌ Data not found in latest readings.")


except Exception as e:
    print(f"❌ Error during simulation: {e}")
