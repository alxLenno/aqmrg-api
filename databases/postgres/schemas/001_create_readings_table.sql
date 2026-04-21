-- Migration: Create readings table for historical data storage
CREATE TABLE IF NOT EXISTS readings (
    id SERIAL PRIMARY KEY,
    sensor_id INTEGER REFERENCES sensors(id) ON DELETE CASCADE,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    pm1 DECIMAL(10, 2),
    pm25 DECIMAL(10, 2),
    pm10 DECIMAL(10, 2),
    co DECIMAL(10, 2),
    co2 DECIMAL(10, 2),
    temperature DECIMAL(10, 2),
    humidity DECIMAL(10, 2),
    voc_index DECIMAL(10, 2),
    nox_index DECIMAL(10, 2)
);

CREATE INDEX IF NOT EXISTS idx_readings_sensor_time ON readings(sensor_id, recorded_at);
