import os
import joblib
import pandas as pd
import numpy as np

# Use __file__ relative navigation:
# mysite/app/ml.py -> mysite/
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Detailed status for diagnostics
MODEL_LOAD_STATUS = {
    "existing": {"loaded": False, "error": None, "path": None},
    "gb": {"loaded": False, "error": None, "path": None},
    "ols": {"loaded": False, "error": None, "path": None},
    "qt": {"loaded": False, "error": None, "path": None},
    "search_paths": [BASE_DIR, os.getcwd(), os.path.dirname(os.path.abspath(__file__))]
}

def load_model_robust(filename, model_key):
    """Try to load a model file from multiple possible directories."""
    last_error = "File not found in any search path"
    for path in MODEL_LOAD_STATUS["search_paths"]:
        full_path = os.path.join(path, filename)
        if os.path.exists(full_path):
            try:
                model = joblib.load(full_path)
                MODEL_LOAD_STATUS[model_key] = {"loaded": True, "error": None, "path": full_path}
                print(f"✓ {model_key.upper()} Model Loaded from {full_path}")
                return model
            except Exception as e:
                last_error = str(e)
                MODEL_LOAD_STATUS[model_key] = {"loaded": False, "error": last_error, "path": full_path}
                print(f"FAILED to load {model_key} from {full_path}: {e}")
    
    if not MODEL_LOAD_STATUS[model_key]["loaded"]:
         MODEL_LOAD_STATUS[model_key]["error"] = last_error
    return None

# ------------------ Load All Models & Transformers ------------------ #
ml_model = load_model_robust('_Desktop_pm25_model.pkl', 'existing')
gb_model = load_model_robust('_Desktop_pm25_model_gboost.pkl', 'gb')
ols_model = load_model_robust('_Desktop_pm25_model_ols.pkl', 'ols')
qt_temp = load_model_robust('_Desktop_qt_temp.pkl', 'qt')

# ------------------ Helper: Get predictions from all models ------------------ #
def predict_all_models(pm10, co, temperature, humidity):
    """Return dict with predictions from all loaded models."""
    preds = {}
    features = pd.DataFrame([[pm10, co, temperature, humidity]],
                            columns=['PM10', 'CO', 'Temperature', 'Humidity'])

    # Existing model
    if ml_model is not None:
        try:
            if hasattr(ml_model, 'feature_names_in_'):
                features_exist = features[ml_model.feature_names_in_]
            else:
                features_exist = features
            preds['existing'] = round(float(ml_model.predict(features_exist)[0]), 2)
        except Exception as e:
            preds['existing'] = None
    else:
        preds['existing'] = None

    # Gradient Boost
    if gb_model is not None:
        try:
            if hasattr(gb_model, 'feature_names_in_'):
                features_gb = features[gb_model.feature_names_in_]
            else:
                features_gb = features
            preds['gb'] = round(float(gb_model.predict(features_gb)[0]), 2)
        except Exception as e:
            preds['gb'] = None
    else:
        preds['gb'] = None

    # OLS
    if ols_model is not None and qt_temp is not None:
        try:
            ols_input = features.copy()
            # Handle potential log(0)
            pm10_val = max(1e-6, ols_input['PM10'].values[0])
            ols_input['PM10'] = np.log(pm10_val)
            ols_input['Temperature'] = qt_temp.transform(ols_input[['Temperature']])
            if hasattr(ols_model, 'feature_names_in_'):
                ols_input = ols_input[ols_model.feature_names_in_]
            pred_log = ols_model.predict(ols_input)
            preds['ols'] = round(float(np.exp(pred_log)[0]), 2)
        except Exception as e:
            preds['ols'] = None
    else:
        preds['ols'] = None

    return preds

# ------------------ Ensemble Prediction Helper (median) ------------------ #
def ensemble_predict(pm10, co, temperature, humidity):
    """Compute median of all available model predictions."""
    preds_dict = predict_all_models(pm10, co, temperature, humidity)
    valid_preds = [v for v in preds_dict.values() if v is not None]
    if not valid_preds:
        return None
    return round(float(np.median(valid_preds)), 2)

def has_any_model():
    return any([ml_model is not None, gb_model is not None, ols_model is not None])

def get_model_status():
    """Return status for API consumption."""
    return {
        "has_models": has_any_model(),
        "details": {k: v for k, v in MODEL_LOAD_STATUS.items() if k != "search_paths"},
        "system": {
            "search_paths": MODEL_LOAD_STATUS["search_paths"],
            "cwd": os.getcwd()
        }
    }
