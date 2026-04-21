import io
import csv
import json
import requests
from flask import Blueprint, request, jsonify, Response, current_app
from ..models import db, SensorReading
from ..utils import get_eat_time
from datetime import datetime

api_bp = Blueprint('api', __name__)

@api_bp.route('/health', methods=['GET'])
def health():
    """
    Check the health of the Local Sensor Receiver.
    ---
    responses:
      200:
        description: Service is healthy
    """
    return jsonify({"status": "healthy", "service": "local-sensor-receiver"})

@api_bp.route('/data/latest', methods=['GET'])
def get_latest_data():
    """
    Get the latest sensor readings.
    ---
    responses:
      200:
        description: A list of the latest 100 sensor readings
    """
    readings = SensorReading.query.order_by(SensorReading.timestamp.desc()).limit(100).all()
    return jsonify([r.to_dict() for r in readings])

@api_bp.route('/data/export/csv', methods=['GET'])
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
        current_app.logger.error(f"Export Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@api_bp.route('/data/ingest', methods=['POST'])
def ingest():
    """
    Ingest sensor data and relay to the main dashboard.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "No JSON payload received"}), 400

        print(f"\n--- [{datetime.now().strftime('%H:%M:%S')}] RAW DATA RECEIVED ---")
        
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
        relay_url = current_app.config['DASHBOARD_URL']
        print(f"Attempting to relay data to dashboard: {relay_url}")
        try:
            relay_response = requests.post(
                relay_url,
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
