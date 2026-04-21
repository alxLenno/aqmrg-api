import sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.ml import predict_all_models, ensemble_predict

pm10 = 14
co = 0.00
temperature = 24.5
humidity = 67.2

preds = predict_all_models(pm10, co, temperature, humidity)
print("Predictions:", preds)
print("Ensemble:", ensemble_predict(pm10, co, temperature, humidity))
