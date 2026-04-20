from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy
import json

db = SQLAlchemy()

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
    extra_data = db.Column(db.Text) 
    predicted_pm25 = db.Column(db.Float)
    predicted_pm25_existing = db.Column(db.Float)
    predicted_pm25_gb = db.Column(db.Float)
    predicted_pm25_ols = db.Column(db.Float)

    def to_dict(self):
        # 1. Start with core columns
        metrics = {
            "pm1": self.pm1, "pm25": self.pm25, "pm10": self.pm10, 
            "co": self.co, "co2": self.co2,
            "temperature": self.temperature, "humidity": self.humidity, 
            "voc_index": self.voc_index, "nox_index": self.nox_index,
            "predicted_pm25": self.predicted_pm25
        }
        
        # 2. Dynamic Discovery (Dual-Track: using raw_payload for the API)
        # This ensures all sensors are visible even if columns haven't been 'reflected' in memory yet.
        if self.raw_payload:
            try:
                payload = json.loads(self.raw_payload)
                dynamic_metrics = payload.get('metrics', {})
                for k, v in dynamic_metrics.items():
                    # Sanitize key for consistent API presentation
                    clean_key = k.lower().replace('-', '_').replace(' ', '_')
                    if clean_key not in metrics:
                        metrics[clean_key] = v
            except Exception:
                pass

        return {
            "id": self.id, 
            "device_id": self.device_id, 
            "timestamp": self.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            "location": {"latitude": self.latitude, "longitude": self.longitude},
            "metrics": metrics
        }




class DeviceHealth(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(50), nullable=False)
    timestamp = db.Column(db.DateTime, default=get_eat_time)
    uptime_minutes = db.Column(db.Integer)
    signal_dbm = db.Column(db.Integer)
    gsm_reconnects = db.Column(db.Integer)
    failed_requests = db.Column(db.Integer)
    last_http_status = db.Column(db.Integer)
    issues = db.Column(db.Text)
    sensor_status = db.Column(db.Text)
    
    def to_dict(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "timestamp": self.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            "uptime_minutes": self.uptime_minutes,
            "signal_dbm": self.signal_dbm,
            "gsm_reconnects": self.gsm_reconnects,
            "failed_requests": self.failed_requests,
            "last_http_status": self.last_http_status,
            "issues": json.loads(self.issues) if self.issues else [],
            "sensors": json.loads(self.sensor_status) if self.sensor_status else {}
        }
