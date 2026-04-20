import os
import joblib
import pandas as pd
import numpy as np

# Use __file__ relative navigation:
# mysite/app/ml.py -> mysite/
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ------------------ Load All Models & Transformers ------------------ #
# Existing model
MODEL_PATH = os.path.join(BASE_DIR, '_Desktop_pm25_model.pkl')
ml_model = None
try:
    if os.path.exists(MODEL_PATH):
        ml_model = joblib.load(MODEL_PATH)
        print("✓ Existing Model Loaded")
except Exception as e:
    print(f"Existing Model Load Fail: {e}")

# Gradient Boost model
GB_MODEL_PATH = os.path.join(BASE_DIR, '_Desktop_pm25_model_gboost.pkl')
gb_model = None
try:
    if os.path.exists(GB_MODEL_PATH):
        gb_model = joblib.load(GB_MODEL_PATH)
        print("✓ Gradient Boost Model Loaded")
except Exception as e:
    print(f"GB Model Load Fail: {e}")

# OLS model and its transformer
OLS_MODEL_PATH = os.path.join(BASE_DIR, '_Desktop_pm25_model_ols.pkl')
QT_PATH = os.path.join(BASE_DIR, '_Desktop_qt_temp.pkl')
ols_model = None
qt_temp = None
try:
    if os.path.exists(OLS_MODEL_PATH):
        ols_model = joblib.load(OLS_MODEL_PATH)
        print("✓ OLS Model Loaded")
    if os.path.exists(QT_PATH):
        qt_temp = joblib.load(QT_PATH)
        print("✓ Quantile Transformer Loaded")
except Exception as e:
    print(f"OLS/Load Fail: {e}")

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
            ols_input['PM10'] = np.log(ols_input['PM10'])
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
    return any([ml_model, gb_model, ols_model])
