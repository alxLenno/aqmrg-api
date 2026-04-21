import os
import io
import csv
import json
import joblib
import pandas as pd
import requests
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, Response, render_template
from flask_sqlalchemy import SQLAlchemy
from flasgger import Swagger

app = Flask(__name__)

# --- CONFIGURATION ---
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(BASE_DIR, 'sensor_data.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Swagger Configuration
app.config['SWAGGER'] = {
    'title': 'AQMRG Intelligence Relay',
    'uiversion': 3,
    'specs_route': '/apidocs/',
    'definitions': {
        'SensorReading': {
            'type': 'object',
            'properties': {
                'id': {'type': 'integer', 'example': 1},
                'device_id': {'type': 'string', 'example': "868428040514113"},
                'timestamp': {'type': 'string', 'example': "2026-03-12 15:25:17"},
                'location': {
                    'type': 'object',
                    'properties': {
                        'latitude': {'type': 'number', 'example': -1.2833},
                        'longitude': {'type': 'number', 'example': 36.8167}
                    }
                },
                'metrics': {
                    'type': 'object',
                    'properties': {
                        'pm1': {'type': 'number', 'example': 33.0},
                        'pm25': {'type': 'number', 'example': 50.0},
                        'pm10': {'type': 'number', 'example': 60.0},
                        'co': {'type': 'number', 'example': 1.94},
                        'co2': {'type': 'number', 'example': 450},
                        'temperature': {'type': 'number', 'example': 32.6},
                        'humidity': {'type': 'number', 'example': 47.6},
                        'voc_index': {'type': 'number', 'example': 100},
                        'nox_index': {'type': 'number', 'example': 1},
                        'predicted_pm25': {'type': 'number', 'example': 52.4}
                    }
                }
            }
        }
    }
}
swagger = Swagger(app)

DASHBOARD_URL = "https://aqmrg-frontend.vercel.app/api/v1/data/ingest"
db = SQLAlchemy(app)

# Load Model
MODEL_PATH = os.path.join(BASE_DIR, '_Desktop_pm25_model.pkl')
ml_model = None
try:
    if os.path.exists(MODEL_PATH):
        ml_model = joblib.load(MODEL_PATH)
        print("✓ Model Loaded")
except Exception as e:
    print(f"Model Load Fail: {e}")

def get_eat_time():
    return datetime.utcnow() + timedelta(hours=3)

class SensorReading(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(50), nullable=False)
    timestamp = db.Column(db.DateTime, default=get_eat_time)
    pm1 = db.Column(db.Float); pm25 = db.Column(db.Float); pm10 = db.Column(db.Float)
    co = db.Column(db.Float); co2 = db.Column(db.Float); temperature = db.Column(db.Float)
    humidity = db.Column(db.Float); voc_index = db.Column(db.Float); nox_index = db.Column(db.Float)
    latitude = db.Column(db.Float); longitude = db.Column(db.Float); raw_payload = db.Column(db.Text)
    predicted_pm25 = db.Column(db.Float)

    def to_dict(self):
        return {
            "id": self.id, "device_id": self.device_id, "timestamp": self.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            "location": {"latitude": self.latitude, "longitude": self.longitude},
            "metrics": {
                "pm1": self.pm1, "pm25": self.pm25, "pm10": self.pm10, "co": self.co, "co2": self.co2,
                "temperature": self.temperature, "humidity": self.humidity, "voc_index": self.voc_index, "nox_index": self.nox_index,
                "predicted_pm25": self.predicted_pm25
            }
        }

@app.route('/')
def home():
    # FIXED: Flask automatically looks inside 'templates'
    # Do NOT use 'templates/index.html' here
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

@app.route('/api/v1/data/ingest', methods=['POST'])
def ingest():
    """
    Ingest new sensor data, predict PM2.5, and relay to dashboard.
    ---
    parameters:
      - name: body
        in: body
        required: true
        schema:
          properties:
            sensorId:
              type: string
              example: "868428040514113"
            location:
              type: object
              properties:
                latitude: {type: number, example: -1.2833}
                longitude: {type: number, example: 36.8167}
            metrics:
              type: object
              properties:
                pm1: {type: number, example: 33.0}
                pm25: {type: number, example: 50.0}
                pm10: {type: number, example: 60.0}
                co: {type: number, example: 1.94}
                co2: {type: number, example: 450}
                temperature: {type: number, example: 32.6}
                humidity: {type: number, example: 47.6}
                voc_index: {type: number, example: 100}
                nox_index: {type: number, example: 1}
    responses:
      201:
        description: Data ingested successfully
      400:
        description: Invalid JSON or empty body
    """
    try:
        data = request.get_json()
        if not data: return jsonify({"status": "error"}), 400
        metrics = data.get('metrics', {}); loc = data.get('location', {})

        # 1. ALWAYS SAVE LOCALLY (This will work even if proxy fails)
        new_reading = SensorReading(
            device_id=data.get('sensorId', 'unknown'),
            pm1=metrics.get('pm1'), pm25=metrics.get('pm25'), pm10=metrics.get('pm10'),
            co=metrics.get('co'), co2=metrics.get('co2'),
            temperature=metrics.get('temperature'), humidity=metrics.get('humidity'),
            voc_index=metrics.get('voc_index'), nox_index=metrics.get('nox_index'),
            latitude=loc.get('latitude'), longitude=loc.get('longitude'),
            raw_payload=json.dumps(data)
        )

        # 2. PERFORM PREDICTION
        if ml_model:
            try:
                features = pd.DataFrame([[
                    metrics.get('pm10', 0), metrics.get('co', 0), 
                    metrics.get('temperature', 0), metrics.get('humidity', 0)
                ]], columns=['PM10', 'CO', 'Temperature', 'Humidity'])
                # Explicit float cast to satisfy linter
                prediction_val = float(ml_model.predict(features)[0])
                new_reading.predicted_pm25 = float(f"{prediction_val:.2f}")
            except Exception as e:
                print(f"Prediction Error: {e}")

        db.session.add(new_reading); db.session.commit()

        # 3. RELAY TO VERCEL (Handled safely with Proxy/Whitelist check)
        try:
            # We use a try-except here so ProxyError doesn't crash the whole ingest
            requests.post(DASHBOARD_URL, json=data, timeout=3)
        except Exception:
            # Silent fail for the relay - data is still safe in your SQLite db
            pass

        return jsonify({"status": "success", "id": new_reading.id}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/v1/forecast/realtime', methods=['GET'])
def get_prediction():
    """
    Get the latest PM2.5 prediction based on the most recent sensor reading.
    ---
    responses:
      200:
        description: Prediction calculated successfully
        schema:
          properties:
            prediction: {type: number, example: 52.4}
            actual_pm25: {type: number, example: 50.0}
            shift: {type: number, example: -2.4}
            timestamp: {type: string, example: "2026-03-12 15:25:17"}
      404:
        description: No sensor data found
      500:
        description: ML Model not loaded
    """
    if not ml_model: return jsonify({"status": "error"}), 500
    latest = SensorReading.query.order_by(SensorReading.timestamp.desc()).first()
    if not latest: return jsonify({"status": "error"}), 404
    try:
        features = pd.DataFrame([[latest.pm10 or 0, latest.co or 0, latest.temperature or 0, latest.humidity or 0]],
                             columns=['PM10', 'CO', 'Temperature', 'Humidity'])
        prediction_raw = float(ml_model.predict(features)[0])
        pred = float(f"{prediction_raw:.2f}")
        shift_val = float(latest.pm25 - pred)
        return jsonify({"prediction": pred, "actual_pm25": latest.pm25, "shift": float(f"{shift_val:.2f}"),
                        "timestamp": latest.timestamp.strftime('%Y-%m-%d %H:%M:%S')})
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/v1/data/latest', methods=['GET'])
def get_latest():
    """
    Get the 100 most recent sensor readings.
    ---
    responses:
      200:
        description: List of sensor readings
        schema:
          type: array
          items:
            $ref: '#/definitions/SensorReading'
    """
    readings = SensorReading.query.order_by(SensorReading.timestamp.desc()).limit(100).all()
    return jsonify([r.to_dict() for r in readings])

@app.route('/api/v1/history/all', methods=['GET'])
def get_all_history():
    """
    Get all stored sensor readings.
    ---
    responses:
      200:
        description: Complete historical record
        schema:
          properties:
            readings:
              type: array
              items:
                $ref: '#/definitions/SensorReading'
    """
    readings = SensorReading.query.order_by(SensorReading.timestamp.desc()).all()
    return jsonify({"readings": [r.to_dict() for r in readings]})

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
            'VOC Index', 'NOx Index', 'Latitude', 'Longitude', 'Predicted PM2.5'
        ])

        for r in readings:
            writer.writerow([
                r.id, r.timestamp.strftime('%Y-%m-%d %H:%M:%S'), r.device_id,
                r.pm1, r.pm25, r.pm10,
                r.co, r.co2, r.temperature, r.humidity,
                r.voc_index, r.nox_index, r.latitude, r.longitude,
                r.predicted_pm25
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

if __name__ == '__main__':
    with app.app_context(): db.create_all()
    app.run(host='0.0.0.0', port=5001)
