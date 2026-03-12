import fs from 'fs';
import path from 'path';

const mockData = [
  {
    "device_id": "868428040514113",
    "id": 2216,
    "location": {
      "latitude": -1.2833,
      "longitude": 36.8167
    },
    "metrics": {
      "co": 0.0,
      "co2": -1.0,
      "humidity": 47.6,
      "nox_index": 1.0,
      "pm1": 32.0,
      "pm10": 57.0,
      "pm25": 47.0,
      "temperature": 32.5,
      "voc_index": 100.0
    },
    "timestamp": "2026-03-12 15:01:15"
  }
];

// simulate fetchDashboardData processing
const rawData = mockData;
const serverTimestamp = rawData.length > 0 ? rawData[0].timestamp : new Date().toISOString();

const sensors = rawData.map(reading => {
    const metrics = reading.metrics || reading.readings || reading.last_readings || {};
    const lastSeen = reading.timestamp || reading.last_seen || reading.recorded_at || new Date().toISOString();

    return {
        id: reading.id,
        device_id: reading.device_id,
        controller_id: `CTRL-${reading.device_id.slice(-4)}`,
        name: reading.name || reading.sensor_name || `Node ${reading.device_id.slice(-4)}`,
        manufacturer: reading.manufacturer || 'Custom',
        is_online: reading.is_online !== undefined ? reading.is_online : true,
        last_seen: lastSeen,
        location_name: reading.location_name || (reading.location ? 'Nairobi' : 'Unknown'),
        latitude: reading.latitude !== undefined ? reading.latitude : (reading.location ? reading.location.latitude : 0),
        longitude: reading.longitude !== undefined ? reading.longitude : (reading.location ? reading.location.longitude : 0),
        hardware_details: {
            controller: 'Arduino Due R3',
            sensors: ['PMS5003', 'MH-Z19C', 'SGP41', 'MQ-7', 'DHT11']
        },
        readings: {
            pm1: metrics.pm1 ?? 0,
            pm25: metrics.pm25 ?? 0,
            pm10: metrics.pm10 ?? 0,
            co: metrics.co ?? 0,
            co2: metrics.co2 ?? 0,
            temperature: metrics.temperature ?? 0,
            humidity: metrics.humidity ?? 0,
            voc_index: metrics.voc_index ?? 0,
            nox_index: metrics.nox_index ?? 0,
            status: metrics.status || 'unknown'
        },
        last_readings: metrics
    };
});

const uniqueSensorsMap = new Map();
sensors.forEach(sensor => {
    if (!uniqueSensorsMap.has(sensor.device_id)) {
        uniqueSensorsMap.set(sensor.device_id, sensor);
    }
});

const uniqueSensors = Array.from(uniqueSensorsMap.values()).map(sensor => {
    const rawDate = sensor.last_seen || new Date().toISOString();
    const dateStr = typeof rawDate === 'string' ? rawDate.replace(' ', 'T') : rawDate;
    const lastSeenDate = new Date(dateStr);
    const diffMs = new Date() - lastSeenDate;
    const isOnline = diffMs > 0 && diffMs < 10 * 60 * 1000;
console.log(`Date debug: ${dateStr} -> ${lastSeenDate}, diffMs: ${diffMs}`);
    return {
        ...sensor,
        is_online: sensor.is_online !== undefined ? sensor.is_online : isOnline
    };
});

uniqueSensors.sort((a, b) => {
    const dateA = new Date(typeof a.last_seen === 'string' ? a.last_seen.replace(' ', 'T') : a.last_seen);
    const dateB = new Date(typeof b.last_seen === 'string' ? b.last_seen.replace(' ', 'T') : b.last_seen);
    return dateB - dateA;
});

console.log(JSON.stringify({
    timestamp: serverTimestamp,
    sensorsCount: uniqueSensors.length,
    sensors: uniqueSensors
}, null, 2));
