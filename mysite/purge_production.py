import os
import sys
sys.path.append(os.getcwd())
from app import create_app, db
from app.models import SensorReading, DeviceHealth

app = create_app()
with app.app_context():
    print("Purging synthetic data...")
    r1 = SensorReading.query.filter(SensorReading.device_id != 'AQ-NODE-001').delete()
    r2 = DeviceHealth.query.filter(DeviceHealth.device_id != 'AQ-NODE-001').delete()
    db.session.commit()
    print(f"DONE! Purged {r1} readings and {r2} health logs.")
