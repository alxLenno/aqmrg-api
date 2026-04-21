const fs = require('fs');
const uniqueSensorsMap = new Map();

// Mock the exact structure from the App.jsx and dashboard.js mapping
const sensors = [
  { device_id: 'offline-001', last_seen: '2020-03-08 19:00:00' },
  { device_id: '868428040514113', last_seen: '2026-03-08 20:29:43' },
  { device_id: 'offline-002', last_seen: '2020-03-08 18:00:00' }
];

sensors.forEach(sensor => {
    if (!uniqueSensorsMap.has(sensor.device_id)) {
        uniqueSensorsMap.set(sensor.device_id, sensor);
    }
});
const uniqueSensors = Array.from(uniqueSensorsMap.values());

uniqueSensors.sort((a, b) => {
    return new Date(b.last_seen.replace(' ', 'T')) - new Date(a.last_seen.replace(' ', 'T'));
});

console.log(JSON.stringify(uniqueSensors, null, 2));
