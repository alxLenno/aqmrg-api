import requests
import time
import random

# Configuration
URL = "http://localhost:5001/api/v1/data/ingest" # Local API Gateway
INTERVAL = 3 # Seconds between batch sends

# List of sensors to simulate
SENSORS = [
    {"id": "AQM-001", "location": "Nairobi Central"},
    {"id": "AQM-002", "location": "Nairobi West"},
    {"id": "AQM-003", "location": "Nairobi East"},
    {"id": "AQM-004", "location": "Nairobi South"},
    {"id": "AQM-005", "location": "Karen"},
]

# Persistent state for drift
SENSOR_STATE = {s["id"]: {
    "pm25": random.randint(10, 30),
    "pm10": random.randint(15, 45),
    "temperature": 24.0,
    "humidity": 55.0,
    "co": 1.0,
    "co2": 500,
    "hydrogen": 0.05,
    "o3": 0.12,          # SURPRISE 1
    "radiation": 0.08,   # SURPRISE 2
    "noise": 45.0        # SURPRISE 3
} for s in SENSORS}

def simulate_data():
    print(f"🚀 Starting Autonomy Verification Test...")
    print(f"📡 Injecting: [Ozone, Radiation, Noise] into the stream...")
    while True:
        for sensor in SENSORS:
            sid = sensor["id"]
            state = SENSOR_STATE[sid]
            
            # Stochastic Drift
            state["pm25"] = max(2, min(150, state["pm25"] + random.uniform(-2, 2)))
            state["pm10"] = max(5, min(200, state["pm10"] + random.uniform(-3, 3)))
            state["temperature"] = max(15, min(35, state["temperature"] + random.uniform(-0.2, 0.2)))
            state["humidity"] = max(20, min(90, state["humidity"] + random.uniform(-0.5, 0.5)))
            state["co"] = max(0.1, min(5.0, state["co"] + random.uniform(-0.05, 0.05)))
            state["co2"] = max(350, min(1500, state["co2"] + random.randint(-5, 5)))
            state["hydrogen"] = max(0.01, min(2.0, state["hydrogen"] + random.uniform(-0.01, 0.01)))
            state["o3"] = max(0.01, min(1.0, state["o3"] + random.uniform(-0.01, 0.01)))
            state["radiation"] = max(0.01, min(0.5, state["radiation"] + random.uniform(-0.005, 0.005)))
            state["noise"] = max(30, min(100, state["noise"] + random.uniform(-1, 1)))

            payload = {
                "sensorId": sid,
                "contro`llerId": f"{sid}-CONTROLLER",
                "locati`on": {
                    "latitude": -1.28 + random.uniform(-0.02, 0.02),
                    "longitude": 36.82 + random.uniform(-0.02, 0.02)
                },
                "metrics": {
                    "pm1": round(state["pm25"] * 0.8, 1),
                    "pm25": round(state["pm25"], 1),
                    "pm10": round(state["pm10"], 1),
                    "co": round(state["co"], 2),
                    "co2": state["co2"],
                    "temperature": round(state["temperature"], 1),
                    "humidity": round(state["humidity"], 1),
                    "hydrogen": round(state["hydrogen"], 3),
                    "o3": round(state["o3"], 3),
                    "radiation": round(state["radiation"], 4),
                    "noise": round(state["noise"], 1)
                }
            }


            
            try:
                print(f"Sending data for {sid} ({sensor['location']})... PM2.5: {payload['metrics']['pm25']}")
                response = requests.post(URL, json=payload)
                # print(f"Status: {response.status_code}")
            except Exception as e:
                print(f"Error sending {sid}: {e}")
            
            time.sleep(0.2) # Faster individual send
            
        print("-" * 30)
        time.sleep(INTERVAL)

if __name__ == "__main__":
    simulate_data()


import requests
from flask import Flask, request, jsonify, render_template, Response
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
from flasgger import Swagger
import json
import os
import csv
import io

app = Flask(__name__)

# Configuration
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(BASE_DIR, 'sensor_data.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Swagger Configuration
app.config['SWAGGER'] = {
    'title': 'AQMRG Local Sensor Receiver API',
    'uiversion': 3
}
swagger = Swagger(app)

DASHBOARD_URL = "https://goshawk-possible-humpback.ngrok-free.app/api/v1/data/ingest"

db = SQLAlchemy(app)

def get_eat_time():
    return datetime.utcnow() + timedelta(hours=3)

# Data Model
class SensorReading(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(50), nullable=False)
    timestamp = db.Column(db.DateTime, default=get_eat_time)
    pm1 = db.Column(db.Float)
    pm25 = db.Column(db.Float)
    pm10 = db.Column(db.Float)
    co = db.Column(db.Float)
    co2 = db.Column(db.Float)
    temperature = db.Column(db.Float)
    humidity = db.Column(db.Float)
    voc_index = db.Column(db.Float)
    nox_index = db.Column(db.Float)
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    raw_payload = db.Column(db.Text)

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "timestamp": self.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            "location": {
                "latitude": self.latitude,
                "longitude": self.longitude
            },
            "metrics": {
                "pm1": self.pm1,
                "pm25": self.pm25,
                "pm10": self.pm10,
                "co": self.co,
                "co2": self.co2,
                "temperature": self.temperature,
                "humidity": self.humidity,
                "voc_index": self.voc_index,
                "nox_index": self.nox_index
            }
        }

    def __repr__(self):
        return f'<SensorReading {self.device_id} at {self.timestamp}>'

# Create database tables
with app.app_context():
    db.create_all()

@app.route('/')
def index():
    """
    Home page - Real-time Dashboard
    """
    return render_template('index.html')

@app.route('/health', methods=['GET'])
def health():
    """
    Check the health of the Local Sensor Receiver.
    ---
    responses:
      200:
        description: Service is healthy
        schema:
          properties:
            status:
              type: string
              example: healthy
            service:
              type: string
              example: local-sensor-receiver
    """
    return jsonify({"status": "healthy", "service": "local-sensor-receiver"})

@app.route('/api/v1/data/latest', methods=['GET'])
def get_latest_data():
    """
    Get the latest sensor readings.
    ---
    responses:
      200:
        description: A list of the latest 10 sensor readings
    """
    readings = SensorReading.query.order_by(SensorReading.timestamp.desc()).limit(10).all()
    return jsonify([r.to_dict() for r in readings])

@app.route('/api/v1/data/export/csv', methods=['GET'])
def export_csv():
    """
    Export all sensor readings as a CSV file.
    ---
    responses:
      200:
        description: A CSV file containing all sensor data
    """
    try:
        readings = SensorReading.query.order_by(SensorReading.timestamp.desc()).all()

        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow([
            'ID', 'Timestamp (EAT)', 'Device ID',
            'PM1', 'PM2.5', 'PM10',
            'CO', 'CO2', 'Temperature', 'Humidity',
            'VOC Index', 'NOx Index', 'Latitude', 'Longitude'
        ])

        for r in readings:
            writer.writerow([
                r.id, r.timestamp.strftime('%Y-%m-%d %H:%M:%S'), r.device_id,
                r.pm1, r.pm25, r.pm10,
                r.co, r.co2, r.temperature, r.humidity,
                r.voc_index, r.nox_index, r.latitude, r.longitude
            ])

        output.seek(0)

        filename = f"aqmrg_relay_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        print(f"Export Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/v1/data/ingest', methods=['POST'])
def ingest():
    """
    Ingest sensor data and relay to the main dashboard.
    ---
    parameters:
      - name: body
        in: body
        required: true
        schema:
          type: object
          properties:
            sensorId:
              type: string
              example: "868428040514113"
            metrics:
              type: object
              properties:
                pm1: {type: number}
                pm25: {type: number}
                pm10: {type: number}
                co: {type: number}
                co2: {type: number}
                temperature: {type: number}
                humidity: {type: number}
                voc_index: {type: number}
                nox_index: {type: number}
    responses:
      201:
        description: Data saved locally and relay attempted
      400:
        description: Invalid JSON or malformed request
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "No JSON payload received"}), 400

        print(f"\n--- [{datetime.now().strftime('%H:%M:%S')}] RAW DATA RECEIVED ---")
        print(json.dumps(data, indent=2))

        # Extract metrics, location, and optional timestamp
        metrics = data.get('metrics', {})
        location = data.get('location', {})
        device_id = data.get('sensorId', 'unknown')
        incoming_timestamp = data.get('timestamp')

        # Parse timestamp string if provided
        final_timestamp = None
        if incoming_timestamp:
            try:
                final_timestamp = datetime.strptime(incoming_timestamp, '%Y-%m-%d %H:%M:%S')
            except ValueError:
                print(f"Warning: Invalid timestamp format received: {incoming_timestamp}")

        # Create new reading
        new_reading = SensorReading(
            device_id=device_id,
            timestamp=final_timestamp or get_eat_time(),
            pm1=metrics.get('pm1'),
            pm25=metrics.get('pm25'),
            pm10=metrics.get('pm10'),
            co=metrics.get('co'),
            co2=metrics.get('co2'),
            temperature=metrics.get('temperature'),
            humidity=metrics.get('humidity'),
            voc_index=metrics.get('voc_index'),
            nox_index=metrics.get('nox_index'),
            latitude=location.get('latitude'),
            longitude=location.get('longitude'),
            raw_payload=json.dumps(data)
        )

        db.session.add(new_reading)
        db.session.commit()
        print(f"Successfully saved reading locally for device: {device_id}")

        # --- RELAY LOGIC ---
        print(f"Attempting to relay data to dashboard: {DASHBOARD_URL}")
        try:
            relay_response = requests.post(
                DASHBOARD_URL,
                json=data,
                timeout=10,
                headers={'Content-Type': 'application/json'}
            )
            if relay_response.status_code in [200, 201, 202]:
                print(f"✓ Relay Successful: {relay_response.status_code}")
            else:
                print(f"✗ Relay Failed: {relay_response.status_code} - {relay_response.text}")
        except Exception as relay_err:
            print(f"✗ Relay Error: {relay_err}")

        return jsonify({
            "status": "success",
            "message": "Data saved locally and relay attempted",
            "device_id": device_id
        }), 201

    except Exception as e:
        print(f"Error processing request: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    # Running on port 5001 to avoid common conflicts
    print(f"Local Sensor Receiver starting on port 5001...")
    print(f"Relaying to: {DASHBOARD_URL}")
    print(f"Swagger UI available at: http://localhost:5001/apidocs")
    print(f"Database file: {os.path.join(BASE_DIR, 'sensor_data.db')}")
    app.run(host='0.0.0.0', port=5001, debug=True)
