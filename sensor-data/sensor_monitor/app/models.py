from flask_sqlalchemy import SQLAlchemy
from .utils import get_eat_time

# We initialize SQLAlchemy here. It will be bound to the app in the factory function.
db = SQLAlchemy()

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
