import os
from flask import Flask
from flasgger import Swagger
from .models import db
from .config import Config

def create_app(config_class=Config):
    # Determine template and static folders relative to this file
    app_dir = os.path.dirname(os.path.abspath(__file__))
    template_dir = os.path.join(app_dir, 'templates')
    static_dir = os.path.join(app_dir, 'static')
    
    app = Flask(__name__, 
                template_folder=template_dir,
                static_folder=static_dir)
    
    app.config.from_object(config_class)
    
    # Initialize extensions
    db.init_app(app)
    Swagger(app)
    
    # Register blueprints
    from .api.routes import api_bp
    from .main.routes import main_bp
    
    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp, url_prefix='/api/v1')
    
    # Create database tables if they don't exist
    with app.app_context():
        db.create_all()
        
    return app
