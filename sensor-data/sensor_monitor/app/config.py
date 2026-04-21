import os

class Config:
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    PARENT_DIR = os.path.abspath(os.path.join(BASE_DIR, os.pardir))
    
    SQLALCHEMY_DATABASE_URI = 'sqlite:///' + os.path.join(PARENT_DIR, 'relay_sensor_data.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Swagger Configuration
    SWAGGER = {
        'title': 'AQMRG Local Sensor Receiver API',
        'uiversion': 3
    }
    
    # Dashboard Relay Configuration
    DASHBOARD_URL = "https://goshawk-possible-humpback.ngrok-free.app/api/v1/data/ingest"
