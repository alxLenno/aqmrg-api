import os
import sys

# Add the directory containing 'app' to the path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.ml import has_any_model, ml_model, gb_model, ols_model, get_model_status

print(f"Has any model: {has_any_model()}")
print(f"Model Status: {get_model_status()}")

