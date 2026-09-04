/**
 * Metric Registry and Discovery Utilities
 * Ensures the frontend can handle any sensor data from the backend.
 */

export const METRIC_CONFIG = {
  pm1: { label: 'PM1.0', unit: 'µg/m³', color: '#ec4899', icon: '💨' },
  pm25: { label: 'PM2.5', unit: 'µg/m³', color: '#f43f5e', icon: '🌫️' },
  pm10: { label: 'PM10', unit: 'µg/m³', color: '#fbbf24', icon: '🏭' },
  co2: { label: 'CO₂', unit: 'ppm', color: '#10b981', icon: '🌱' },
  co: { label: 'CO', unit: 'ppm', color: '#f59e0b', icon: '⚠️' },
  o3: { label: 'O₃', unit: 'ppm', color: '#06b6d4', icon: '☀️' },
  temperature: { label: 'Temp', unit: '°C', color: '#3b82f6', icon: '🌡️' },
  humidity: { label: 'Humidity', unit: '%', color: '#a855f7', icon: '💧' },
  voc_index: { label: 'VOC', unit: 'Idx', color: '#8b5cf6', icon: '🧪' },
  nox_index: { label: 'NOx', unit: 'Idx', color: '#06b6d4', icon: '🚗' },
};

const NON_METRIC_KEYS = new Set([
  '_id', '__v', 'id', 'sensor_id', 'device_id', 'sensor_name', 'name',
  'status', 'timestamp', 'recorded_at', 'createdAt', 'updatedAt',
  'latitude', 'longitude', 'location', 'raw_payload', 'extra_data',
  'controller_id', 'hardware_details', 'is_online', 'last_seen'
]);

/**
 * Return numeric measurements from either supported API shape:
 * nested (`metrics`, `readings`, `last_readings`) or flattened history rows.
 */
export function extractMetrics(record) {
  if (!record || typeof record !== 'object') return {};

  const nested = [record.readings, record.metrics, record.last_readings]
    .find(value => value && typeof value === 'object' && !Array.isArray(value));
  const source = nested || record;

  return Object.fromEntries(
    Object.entries(source).filter(([key, value]) => {
      if (NON_METRIC_KEYS.has(key) || value === null || value === '') return false;
      return Number.isFinite(Number(value));
    })
  );
}

/**
 * Normalizes a metric key for display.
 * Example: 's_hydrogen_level' -> 'Hydrogen Level'
 */
export function formatMetricLabel(key) {
  if (!key) return 'Unknown';
  if (METRIC_CONFIG[key]) return METRIC_CONFIG[key].label;
  
  let label = String(key);
  // Remove 's_' prefix if present (from the Option A backend implementation)
  if (label.startsWith('s_')) label = label.slice(2);
  
  return label
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Returns the unit for a given metric key.
 */
export function getMetricUnit(key) {
  return METRIC_CONFIG[key]?.unit || '';
}

/**
 * Discovers all unique metric keys present in a set of sensor objects.
 * Returns them sorted by priority (known first, then unknown alphabetical).
 */
export function discoverMetrics(sensors) {
  if (!Array.isArray(sensors)) return [];
  
  const keys = new Set();
  sensors.forEach(sensor => {
    if (!sensor) return;
    const metrics = extractMetrics(sensor);
    Object.keys(metrics).forEach(k => {
      keys.add(k);
    });
  });

  const allKeys = Array.from(keys);
  const known = allKeys.filter(k => METRIC_CONFIG[k]);
  const unknown = allKeys.filter(k => !METRIC_CONFIG[k]).sort();
  
  return [...known, ...unknown];
}
