# from flask import Blueprint, request, jsonify, Response, render_template, current_app
# from .models import db, SensorReading, DeviceHealth, get_eat_time
# from .ml import predict_all_models, ensemble_predict, has_any_model
# from datetime import datetime
# import json
# import csv
# import io
# import requests

# api_bp = Blueprint('api', __name__)
# DASHBOARD_URL = "https://aqmrg-frontend.vercel.app/api/v1/data/ingest"

# @api_bp.route('/')
# def home():
#     return render_template('index.html')

# @api_bp.route('/health', methods=['GET'])
# def health():
#     return jsonify({"status": "healthy", "service": "local-sensor-receiver"})

# @api_bp.route('/api/v1/devices', methods=['GET'])
# def get_devices():
#     """Get a list of all distinct device IDs actively reporting to the base."""
#     # Query unique device IDs starting with 'AQ-'
#     device_ids = [r[0] for r in db.session.query(SensorReading.device_id)
#                  .filter(SensorReading.device_id.like('AQ-%'))
#                  .distinct().all()]

#     devices = []
#     for d_id in device_ids:
#         # Fetch the latest reading for coordinates
#         latest = SensorReading.query.filter_by(device_id=d_id).order_by(SensorReading.timestamp.desc()).first()
#         devices.append({
#             "device_id": d_id,
#             "name": "Nairobi Estate Station" if d_id.startswith('AQ-') else d_id,
#             "latitude": latest.latitude if latest else -1.294584,
#             "longitude": latest.longitude if latest else 36.726746,
#             "is_verified": True
#         })

#     return jsonify({"devices": devices})

# @api_bp.route('/api/v1/data/ingest', methods=['POST'])
# def ingest():
#     try:
#         data = request.get_json()
#         if not data: return jsonify({"status": "error"}), 400

#         # Strict hardware lock: Only allow 'AQ-' prefix devices
#         device_id = data.get('sensorId', data.get('device_id', 'unknown'))
#         if not device_id.startswith('AQ-'):
#             return jsonify({"status": "ignored", "message": f"Device {device_id} not whitelisted"}), 200

#         metrics = data.get('metrics', {}); loc = data.get('location', {})
#         pm10 = metrics.get('pm10', 0)
#         co = metrics.get('co', 0)
#         temperature = metrics.get('temperature', 0)
#         humidity = metrics.get('humidity', 0)

#         preds = predict_all_models(pm10, co, temperature, humidity)
#         ensemble = ensemble_predict(pm10, co, temperature, humidity)

#         new_reading = SensorReading(
#             device_id=device_id,
#             pm1=metrics.get('pm1'), pm25=metrics.get('pm25'), pm10=pm10,
#             co=co, co2=metrics.get('co2'),
#             temperature=temperature, humidity=humidity,
#             voc_index=metrics.get('voc_index'), nox_index=metrics.get('nox_index'),
#             latitude=data.get('latitude', loc.get('latitude')),
#             longitude=data.get('longitude', loc.get('longitude')),
#             raw_payload=json.dumps(data),
#             predicted_pm25=ensemble,
#             predicted_pm25_existing=preds.get('existing'),
#             predicted_pm25_gb=preds.get('gb'),
#             predicted_pm25_ols=preds.get('ols')
#         )
#         db.session.add(new_reading)

#         health_data = data.get('health')
#         if health_data:
#             new_health = DeviceHealth(
#                 device_id=device_id,
#                 uptime_minutes=health_data.get('uptime_minutes'),
#                 signal_dbm=health_data.get('signal_dbm'),
#                 gsm_reconnects=health_data.get('gsm_reconnects'),
#                 failed_requests=health_data.get('failed_requests'),
#                 last_http_status=health_data.get('last_http_status'),
#                 issues=json.dumps(health_data.get('issue_descriptions', [])),
#                 sensor_status=json.dumps(health_data.get('sensors', {}))
#             )
#             db.session.add(new_health)

#         db.session.commit()

#         try:
#             requests.post(DASHBOARD_URL, json=data, timeout=3)
#         except Exception:
#             pass

#         return jsonify({"status": "success", "id": new_reading.id}), 201
#     except Exception as e:
#         return jsonify({"status": "error", "message": str(e)}), 500

# @api_bp.route('/api/v1/forecast/realtime', methods=['GET'])
# def get_prediction():
#     if not has_any_model():
#         return jsonify({"status": "error", "message": "No models loaded"}), 500

#     latest = SensorReading.query.order_by(SensorReading.timestamp.desc()).first()
#     if not latest:
#         return jsonify({"status": "error", "message": "No sensor data found"}), 404

#     try:
#         pred = ensemble_predict(
#             latest.pm10 or 0,
#             latest.co or 0,
#             latest.temperature or 0,
#             latest.humidity or 0
#         )
#         if pred is None:
#             return jsonify({"status": "error", "message": "All models failed"}), 500

#         return jsonify({
#             "prediction": pred,
#             "actual_pm25": latest.pm25,
#             "shift": round(latest.pm25 - pred, 2),
#             "timestamp": latest.timestamp.strftime('%Y-%m-%d %H:%M:%S')
#         })
#     except Exception as e:
#         return jsonify({"status": "error", "message": str(e)}), 500

# @api_bp.route('/api/v1/forecast/comparison', methods=['GET'])
# def get_model_comparison():
#     if not has_any_model():
#         return jsonify({"status": "error", "message": "No models loaded"}), 500

#     latest = SensorReading.query.order_by(SensorReading.timestamp.desc()).first()
#     if not latest:
#         return jsonify({"status": "error", "message": "No sensor data found"}), 404

#     if latest.predicted_pm25_gb is not None and latest.predicted_pm25_ols is not None:
#         preds = {
#             'existing': latest.predicted_pm25_existing,
#             'gb': latest.predicted_pm25_gb,
#             'ols': latest.predicted_pm25_ols
#         }
#     else:
#         preds = predict_all_models(
#             latest.pm10 or 0,
#             latest.co or 0,
#             latest.temperature or 0,
#             latest.humidity or 0
#         )

#     import numpy as np
#     valid_preds = [v for v in preds.values() if v is not None]
#     ensemble_median = round(float(np.median(valid_preds)), 2) if valid_preds else None

#     return jsonify({
#         "timestamp": latest.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
#         "actual_pm25": latest.pm25,
#         "predictions": preds,
#         "ensemble_median": ensemble_median
#     })

# @api_bp.route('/api/v1/data/latest', methods=['GET'])
# def get_latest():
#     device_id = request.args.get('device_id')
#     query = SensorReading.query
#     if device_id:
#         query = query.filter_by(device_id=device_id)
#     readings = query.order_by(SensorReading.timestamp.desc()).limit(100).all()
#     return jsonify([r.to_dict() for r in readings])

# @api_bp.route('/api/v1/history/all', methods=['GET'])
# def get_all_history():
#     device_id = request.args.get('device_id')
#     query = SensorReading.query
#     if device_id:
#         query = query.filter_by(device_id=device_id)
#     readings = query.order_by(SensorReading.timestamp.desc()).all()
#     return jsonify({"readings": [r.to_dict() for r in readings]})

# @api_bp.route('/api/v1/health/latest', methods=['GET'])
# def get_latest_health():
#     device_id = request.args.get('device_id')
#     query = DeviceHealth.query
#     if device_id:
#         query = query.filter_by(device_id=device_id)
#     else:
#         # Filter for all verified node health
#         query = query.filter(DeviceHealth.device_id.like('AQ-%'))

#     health_logs = query.order_by(DeviceHealth.timestamp.desc()).limit(100).all()
#     return jsonify([h.to_dict() for h in health_logs])

# @api_bp.route('/api/v1/data/export/csv', methods=['GET'])
# def export_csv():
#     try:
#         device_id = request.args.get('device_id')
#         query = SensorReading.query
#         if device_id:
#             query = query.filter_by(device_id=device_id)

#         readings = query.order_by(SensorReading.timestamp.desc()).all()

#         output = io.StringIO()
#         writer = csv.writer(output)

#         writer.writerow([
#             'ID', 'Timestamp (EAT)', 'Device ID',
#             'PM1', 'PM2.5', 'PM10',
#             'CO', 'CO2', 'Temperature', 'Humidity',
#             'VOC Index', 'NOx Index', 'Latitude', 'Longitude', 'Predicted PM2.5 (Ensemble)',
#             'Predicted Existing', 'Predicted GB', 'Predicted OLS'
#         ])

#         for r in readings:
#             writer.writerow([
#                 r.id, r.timestamp.strftime('%Y-%m-%d %H:%M:%S'), r.device_id,
#                 r.pm1, r.pm25, r.pm10,
#                 r.co, r.co2, r.temperature, r.humidity,
#                 r.voc_index, r.nox_index, r.latitude, r.longitude,
#                 r.predicted_pm25,
#                 r.predicted_pm25_existing, r.predicted_pm25_gb, r.predicted_pm25_ols
#             ])

#         output.seek(0)
#         prefix = f"{device_id}_" if device_id else ""
#         filename = f"{prefix}aqmrg_relay_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

#         return Response(output.getvalue(), mimetype="text/csv", headers={"Content-disposition": f"attachment; filename={filename}"})
#     except Exception as e:
#         return jsonify({"status": "error", "message": str(e)}), 500

# @api_bp.route('/api/v1/health/export/csv', methods=['GET'])
# def export_health_csv():
#     try:
#         device_id = request.args.get('device_id')
#         query = DeviceHealth.query
#         if device_id:
#             query = query.filter_by(device_id=device_id)

#         health_logs = query.order_by(DeviceHealth.timestamp.desc()).all()

#         output = io.StringIO()
#         writer = csv.writer(output)

#         writer.writerow([
#             'ID', 'Timestamp (EAT)', 'Device ID',
#             'Uptime (Mins)', 'Signal (dBm)', 'GSM Reconnects',
#             'Failed Requests', 'Last HTTP Status', 'Sensor Statuses', 'Diagnostic Issues'
#         ])

#         for h in health_logs:
#             writer.writerow([
#                 h.id, h.timestamp.strftime('%Y-%m-%d %H:%M:%S'), h.device_id,
#                 h.uptime_minutes, h.signal_dbm, h.gsm_reconnects,
#                 h.failed_requests, h.last_http_status,
#                 h.sensor_status, h.issues
#             ])

#         output.seek(0)
#         prefix = f"{device_id}_" if device_id else ""
#         filename = f"{prefix}aqmrg_health_diagnostics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

#         return Response(output.getvalue(), mimetype="text/csv", headers={"Content-disposition": f"attachment; filename={filename}"})
#     except Exception as e:
#         return jsonify({"status": "error", "message": str(e)}), 500





from flask import Blueprint, request, jsonify, Response, render_template, current_app
from .models import db, SensorReading, DeviceHealth, get_eat_time
from .ml import predict_all_models, ensemble_predict, has_any_model, get_model_status
from datetime import datetime, timedelta
import json
import csv
import io
import requests

import re
import sqlalchemy
from sqlalchemy import inspect, text

api_bp = Blueprint('api', __name__)
DASHBOARD_URL = "https://aqmrg-frontend.vercel.app/api/v1/data/ingest"

# ----------------------
# DYNAMIC SCHEMA UTILITIES
# ----------------------

def sanitize_sensor_key(key):
    """Sanitizes a hardware key into a safe SQL column name with 's_' prefix."""
    # 1. Lowercase and replace spaces/hyphens with underscore
    clean = key.lower().strip().replace(' ', '_').replace('-', '_')
    # 2. Remove all non-alphanumeric characters except underscore
    clean = re.sub(r'[^a-z0-9_]', '', clean)
    # 3. Truncate to avoid database issues
    if len(clean) > 28: clean = clean[:28]
    return f"s_{clean}"

_known_dynamic_cols = set()

def ensure_col_exists(col_name):
    """Checks if a column exists in SensorReading and adds it if missing.
    Uses an in-memory cache so the DB is only inspected once per column."""
    if col_name in _known_dynamic_cols:
        return False

    with db.engine.connect() as conn:
        inspector = inspect(db.engine)
        existing_cols = [c['name'] for c in inspector.get_columns('sensor_reading')]
        
        if col_name in existing_cols:
            _known_dynamic_cols.add(col_name)
            return False

        print(f"!!! DISCOVERED NEW SENSOR: {col_name}. Altering database...")
        try:
            conn.execute(text(f"ALTER TABLE sensor_reading ADD COLUMN {col_name} FLOAT"))
            conn.commit()
            _known_dynamic_cols.add(col_name)
            return True
        except Exception as e:
            print(f"Error adding column {col_name}: {e}")
    return False

# ----------------------

@api_bp.route('/')
def home():
    return render_template('index.html')

@api_bp.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "service": "local-sensor-receiver"})

def active_node_ids():
    """Activity uses server receipt time, stored in EAT by SensorReading."""
    cutoff = get_eat_time() - timedelta(minutes=current_app.config.get('ACTIVE_NODE_MINUTES', 15))
    return db.session.query(SensorReading.device_id).filter(
        SensorReading.timestamp >= cutoff,
        SensorReading.device_id != 'unknown'
    ).distinct()


@api_bp.route('/api/v1/devices', methods=['GET'])
def get_devices():
    return jsonify({'devices': [r[0] for r in active_node_ids().order_by(SensorReading.device_id).all()]})

@api_bp.route('/api/v1/data/ingest', methods=['POST'])
def ingest():
    try:
        data = request.get_json()
        if not data: return jsonify({"status": "error"}), 400
        device_id = data.get('sensorId') or data.get('device_id')
        if not isinstance(device_id, str) or not device_id.strip():
            return jsonify({'status': 'error', 'message': 'A non-empty sensorId or device_id is required'}), 400
        device_id = device_id.strip()
        metrics = data.get('metrics', {}); loc = data.get('location', {})

        # 1. Map Core Metrics (Fixed Columns)
        pm1 = metrics.get('pm1'); pm25 = metrics.get('pm25'); pm10 = metrics.get('pm10')
        co = metrics.get('co'); co2 = metrics.get('co2')
        temperature = metrics.get('temperature'); humidity = metrics.get('humidity')
        voc_index = metrics.get('voc_index'); nox_index = metrics.get('nox_index')

        # 2. Extract & Auto-Migrate Dynamic Metrics
        core_keys = {'pm1', 'pm25', 'pm10', 'co', 'co2', 'temperature', 'humidity', 'voc_index', 'nox_index'}
        dynamic_payload = {} # Will hold {sanitized_col_name: value}
        
        for k, v in metrics.items():
            if k not in core_keys:
                s_key = sanitize_sensor_key(k)
                ensure_col_exists(s_key)
                dynamic_payload[s_key] = v


        # 3. ML Predictions
        preds = predict_all_models(pm10 or 0, co or 0, temperature or 0, humidity or 0)
        ensemble = ensemble_predict(pm10 or 0, co or 0, temperature or 0, humidity or 0)

        # 4. Phase 1: Save Core Data via SQLAlchemy
        new_reading = SensorReading(
            device_id=device_id,
            pm1=pm1, pm25=pm25, pm10=pm10,
            co=co, co2=co2,
            temperature=temperature, humidity=humidity,
            voc_index=voc_index, nox_index=nox_index,
            latitude=loc.get('latitude'), longitude=loc.get('longitude'),
            raw_payload=json.dumps(data),
            predicted_pm25=ensemble,
            predicted_pm25_existing=preds.get('existing'),
            predicted_pm25_gb=preds.get('gb'),
            predicted_pm25_ols=preds.get('ols')
        )
        db.session.add(new_reading)
        
        # We also save to DeviceHealth if present
        health_data = data.get('health')
        if health_data:
            new_health = DeviceHealth(
                device_id=device_id,
                uptime_minutes=health_data.get('uptime_minutes'),
                signal_dbm=health_data.get('signal_dbm'),
                gsm_reconnects=health_data.get('gsm_reconnects'),
                failed_requests=health_data.get('failed_requests'),
                last_http_status=health_data.get('last_http_status'),
                issues=json.dumps(health_data.get('issue_descriptions', [])),
                sensor_status=json.dumps(health_data.get('sensors', {}))
            )
            db.session.add(new_health)

        db.session.commit()

        # 5. Phase 2: Save Dynamic Data via Raw SQL 
        # (Since model isn't aware of new cols until reload)
        if dynamic_payload:
            cols = ", ".join([f"{k} = :{k}" for k in dynamic_payload.keys()])
            sql = text(f"UPDATE sensor_reading SET {cols} WHERE id = :id")
            dynamic_payload['id'] = new_reading.id
            with db.engine.connect() as conn:
                conn.execute(sql, dynamic_payload)
                conn.commit()



        try:
            requests.post(DASHBOARD_URL, json=data, timeout=3)
        except Exception:
            pass

        return jsonify({"status": "success", "id": new_reading.id}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

def latest_per_node(model):
    """Return one latest record per node, with stable ordering for equal timestamps."""
    ranked = db.session.query(
        model.id.label('id'),
        sqlalchemy.func.row_number().over(
            partition_by=model.device_id,
            order_by=(model.timestamp.desc(), model.id.desc())
        ).label('rank')
    ).subquery()
    query = model.query.join(ranked, model.id == ranked.c.id).filter(
        ranked.c.rank == 1, model.device_id.in_(active_node_ids())
    )
    device_id = request.args.get('device_id')
    if device_id:
        query = query.filter(model.device_id == device_id)
    return query.order_by(model.device_id).all()


@api_bp.route('/api/v1/forecast/realtime', methods=['GET'])
def get_prediction():
    status = get_model_status()
    if not status['has_models']:
        return jsonify({'status': 'error', 'message': 'No models loaded on server'}), 500
    readings = latest_per_node(SensorReading)
    if not readings:
        return jsonify({'status': 'error', 'message': 'No sensor data found'}), 404
    results = []
    for latest in readings:
        pred = ensemble_predict(latest.pm10 or 0, latest.co or 0,
                                latest.temperature or 0, latest.humidity or 0)
        results.append({
            'device_id': latest.device_id,
            'prediction': pred,
            'actual_pm25': latest.pm25,
            'shift': round(latest.pm25 - pred, 2) if latest.pm25 is not None and pred is not None else None,
            'timestamp': latest.timestamp.strftime('%Y-%m-%d %H:%M:%S')
        })
    return jsonify(results[0] if request.args.get('device_id') else {'nodes': results})


@api_bp.route('/api/v1/forecast/comparison', methods=['GET'])
def get_model_comparison():
    status = get_model_status()
    if not status['has_models']:
        return jsonify({'status': 'error', 'message': 'No models loaded on server'}), 500
    readings = latest_per_node(SensorReading)
    if not readings:
        return jsonify({'status': 'error', 'message': 'No sensor data found'}), 404
    import numpy as np
    results = []
    for latest in readings:
        if latest.predicted_pm25_gb is not None and latest.predicted_pm25_ols is not None:
            preds = {'existing': latest.predicted_pm25_existing,
                     'gb': latest.predicted_pm25_gb, 'ols': latest.predicted_pm25_ols}
        else:
            preds = predict_all_models(latest.pm10 or 0, latest.co or 0,
                                       latest.temperature or 0, latest.humidity or 0)
        valid = [v for v in preds.values() if v is not None]
        results.append({
            'device_id': latest.device_id,
            'timestamp': latest.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            'actual_pm25': latest.pm25, 'predictions': preds,
            'ensemble_median': round(float(np.median(valid)), 2) if valid else None
        })
    return jsonify(results[0] if request.args.get('device_id') else {'nodes': results})

@api_bp.route('/api/v1/forecast/debug', methods=['GET'])
def debug_forecast():
    """Diagnostic endpoint to check model loading state."""
    return jsonify(get_model_status())

@api_bp.route('/api/v1/data/latest', methods=['GET'])
def get_latest():
    device_id = request.args.get('device_id')
    query = SensorReading.query.filter(SensorReading.device_id.in_(active_node_ids()))
    if device_id:
        query = query.filter_by(device_id=device_id)
    if request.args.get('per_node') == 'true':
        readings = latest_per_node(SensorReading)
    else:
        readings = query.order_by(SensorReading.timestamp.desc()).limit(100).all()
    now = get_eat_time()
    online_seconds = current_app.config.get('NODE_ONLINE_MINUTES', 5) * 60
    results = []
    for reading in readings:
        item = reading.to_dict()
        age = max(0, int((now - reading.timestamp).total_seconds()))
        item['status'] = 'online' if age <= online_seconds else 'offline'
        item['last_seen_seconds'] = age
        results.append(item)
    return jsonify(results)

@api_bp.route('/api/v1/history/all', methods=['GET'])
def get_all_history():
    device_id = request.args.get('device_id')
    try:
        limit = int(request.args.get('limit', 5000))
    except ValueError:
        limit = 5000

    query = SensorReading.query
    if device_id:
        query = query.filter_by(device_id=device_id)
    readings = query.order_by(SensorReading.timestamp.desc()).limit(limit).all()
    return jsonify({"readings": [r.to_dict() for r in readings]})

@api_bp.route('/api/v1/health/latest', methods=['GET'])
def get_latest_health():
    device_id = request.args.get('device_id')
    query = DeviceHealth.query
    if device_id:
        query = query.filter_by(device_id=device_id)
    health_logs = latest_per_node(DeviceHealth)
    return jsonify([h.to_dict() for h in health_logs])

@api_bp.route('/api/v1/data/export/csv', methods=['GET'])
def export_csv():
    try:
        device_id = request.args.get('device_id')
        query = SensorReading.query
        if device_id:
            query = query.filter_by(device_id=device_id)

        readings = query.order_by(SensorReading.timestamp.desc()).all()

        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            'ID', 'Timestamp (EAT)', 'Device ID',
            'PM1', 'PM2.5', 'PM10',
            'CO', 'CO2', 'Temperature', 'Humidity',
            'VOC Index', 'NOx Index', 'Latitude', 'Longitude', 'Predicted PM2.5 (Ensemble)',
            'Predicted Existing', 'Predicted GB', 'Predicted OLS'
        ])

        for r in readings:
            writer.writerow([
                r.id, r.timestamp.strftime('%Y-%m-%d %H:%M:%S'), r.device_id,
                r.pm1, r.pm25, r.pm10,
                r.co, r.co2, r.temperature, r.humidity,
                r.voc_index, r.nox_index, r.latitude, r.longitude,
                r.predicted_pm25,
                r.predicted_pm25_existing, r.predicted_pm25_gb, r.predicted_pm25_ols
            ])

        output.seek(0)
        prefix = f"{device_id}_" if device_id else ""
        filename = f"{prefix}aqmrg_relay_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

        return Response(output.getvalue(), mimetype="text/csv", headers={"Content-disposition": f"attachment; filename={filename}"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@api_bp.route('/api/v1/health/export/csv', methods=['GET'])
def export_health_csv():
    try:
        device_id = request.args.get('device_id')
        query = DeviceHealth.query
        if device_id:
            query = query.filter_by(device_id=device_id)

        health_logs = query.order_by(DeviceHealth.timestamp.desc()).all()

        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow([
            'ID', 'Timestamp (EAT)', 'Device ID',
            'Uptime (Mins)', 'Signal (dBm)', 'GSM Reconnects',
            'Failed Requests', 'Last HTTP Status', 'Sensor Statuses', 'Diagnostic Issues'
        ])

        for h in health_logs:
            writer.writerow([
                h.id, h.timestamp.strftime('%Y-%m-%d %H:%M:%S'), h.device_id,
                h.uptime_minutes, h.signal_dbm, h.gsm_reconnects,
                h.failed_requests, h.last_http_status,
                h.sensor_status, h.issues
            ])

        output.seek(0)
        prefix = f"{device_id}_" if device_id else ""
        filename = f"{prefix}aqmrg_health_diagnostics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

        return Response(output.getvalue(), mimetype="text/csv", headers={"Content-disposition": f"attachment; filename={filename}"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
