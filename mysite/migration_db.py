import os
import sys
from flask import Flask
from sqlalchemy import inspect, text

# Add the current directory to path so we can import flask_app
sys.path.insert(0, os.path.dirname(__file__))
from flask_app import app
from app.models import db, SensorReading

def migrate():
    with app.app_context():
        # Get the actual table name from the model
        table_name = SensorReading.__tablename__
        inspector = inspect(db.engine)

        # Get existing columns in the database
        existing_columns = [col['name'] for col in inspector.get_columns(table_name)]

        # Get all column names defined in the SQLAlchemy model
        model_columns = SensorReading.__table__.columns.keys()

        # Find which model columns are missing from the database
        missing_columns = [col for col in model_columns if col not in existing_columns]

        if not missing_columns:
            print("✓ Database schema is up to date. No missing columns.")
            return

        print(f"Missing columns: {missing_columns}")
        # Add each missing column using ALTER TABLE
        with db.engine.connect() as conn:
            for col_name in missing_columns:
                # Get the column type from the model definition
                col_type = SensorReading.__table__.columns[col_name].type
                # SQLite uses the same type names as the model (e.g., FLOAT, TEXT)
                type_str = str(col_type.compile(dialect=db.engine.dialect))
                print(f"Adding column '{col_name}' with type {type_str}...")
                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {type_str}"))
                conn.commit()
        print("✓ Migration complete!")

if __name__ == "__main__":
    migrate()