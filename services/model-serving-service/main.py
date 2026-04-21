from fastapi import FastAPI
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="AQMRG Model Serving Service")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "model-serving-service", "timestamp": datetime.now().isoformat()}

@app.get("/forecast")
async def get_forecast(location: str, hours: int = 24):
    # Placeholder for ML inference
    return {
        "location": location,
        "forecast": [
            {"time": datetime.now().isoformat(), "pm25": 25.5},
            {"time": datetime.now().isoformat(), "pm25": 28.2}
        ],
        "model": "random-forest-v1"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
