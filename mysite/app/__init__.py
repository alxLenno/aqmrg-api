from flask import Flask
from flasgger import Swagger
import os

from .models import db

def create_app():
    app = Flask(__name__, template_folder='../templates')
    
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(BASE_DIR, 'sensor_data.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    app.config['SWAGGER'] = {'title': 'AQMRG Intelligence Relay', 'uiversion': 3}
    
    db.init_app(app)
    
    # Stability fix for PythonAnywhere NFS/Distributed Filesystem
    # Force journal_mode=DELETE to prevent typical SQLite I/O errors on PA
    from sqlalchemy import event
    with app.app_context():
        @event.listens_for(db.engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=DELETE")
            cursor.close()
            
    Swagger(app)
    
    with app.app_context():
        from . import routes
        app.register_blueprint(routes.api_bp)
        db.create_all()
        
    return app
