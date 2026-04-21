from .models import db, SensorReading
from .utils import get_eat_time
import requests
import json
from flask import current_app
from datetime import datetime

class DataService:
    @staticmethod
    def get_latest_readings(limit=100):
        return SensorReading.query.order_by(SensorReading.timestamp.desc()).limit(limit).all()

    @staticmethod
    def ingest_data(data):
        metrics = data.get('metrics', {})
        location = data.get('location', {})
        device_id = data.get('sensorId', 'unknown')
        incoming_timestamp = data.get('timestamp')

        final_timestamp = None
        if incoming_timestamp:
            try:
                final_timestamp = datetime.strptime(incoming_timestamp, '%Y-%m-%d %H:%M:%S')
            except ValueError:
                print(f"Warning: Invalid timestamp format received: {incoming_timestamp}")

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
        
        # Relay logic
        relay_url = current_app.config['DASHBOARD_URL']
        try:
            requests.post(relay_url, json=data, timeout=10)
        except Exception as e:
            print(f"Relay error: {e}")
            
        return new_reading
