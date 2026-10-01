const API_BASE = '/api';

/**
 * Fetch real-time dashboard data from the analytics service.
 * Endpoint: GET /api/v1/data/latest
 * Source: PythonAnywhere backend
 *
 * Returns: { timestamp, sensorsCount, sensors[] }
 */
export async function fetchDashboardData(deviceId = '') {
    const response = await fetch(`${API_BASE}/v1/data/latest?per_node=true${deviceId ? '&device_id=' + encodeURIComponent(deviceId) : ''}`);
    if (!response.ok) {
        throw new Error(`Dashboard API error: ${response.status}`);
    }
    const data = await response.json();

    // Support both raw array (PythonAnywhere) and object with sensors (Analytics Service)
    const rawData = Array.isArray(data) ? data : (data.sensors || []);
    const serverTimestamp = rawData.map(r => r.timestamp || r.last_seen || r.recorded_at).filter(Boolean).sort().at(-1) || null;

    // Transform the list of readings into the format expected by the dashboard
    const sensors = rawData.map(reading => {
        const dId = reading.device_id || 'UNKNOWN';
        const metrics = reading.metrics || reading.readings || reading.last_readings || {};
        const lastSeen = reading.timestamp || reading.last_seen || reading.recorded_at || null;

        return {
            id: reading.id || dId,
            device_id: dId,
            controller_id: `CTRL-${dId.slice(-4)}`,
            name: reading.name || reading.sensor_name || `Station ${dId.slice(-4) || '??'}`,
            manufacturer: reading.manufacturer || 'Custom',
            is_online: reading.status === 'online' ? true : reading.status === 'offline' ? false : reading.is_online,
            last_seen_seconds: reading.last_seen_seconds,
            last_seen: lastSeen,
            location_name: reading.location_name || (reading.location ? 'Nairobi' : 'Unknown'),
            latitude: reading.latitude !== undefined ? reading.latitude : (reading.location ? reading.location.latitude : 0),
            longitude: reading.longitude !== undefined ? reading.longitude : (reading.location ? reading.location.longitude : 0),
            hardware_details: {
                controller: 'Arduino Due R3',
                sensors: ['PMS5003', 'MH-Z19C', 'SGP41', 'MQ-7', 'DHT11']
            },
            readings: {
                ...metrics,
                status: metrics.status || 'unknown'
            },

            last_readings: metrics
        };
    });

    // De-duplicate sensors by device_id (showing only the latest reading per device)
    const uniqueSensorsMap = new Map();
    sensors.forEach(sensor => {
        if (!uniqueSensorsMap.has(sensor.device_id)) {
            uniqueSensorsMap.set(sensor.device_id, sensor);
        }
    });

    const uniqueSensors = Array.from(uniqueSensorsMap.values()).map(sensor => {
        // Robust online check: ensure we have a string before replacing
        const rawDate = sensor.last_seen || "invalid";
        const dateStr = typeof rawDate === 'string' ? (/Z$|[+-]\d{2}:\d{2}$/.test(rawDate) ? rawDate : rawDate.replace(' ', 'T') + '+03:00') : rawDate;
        const lastSeenDate = new Date(dateStr);

        // 10 minute threshold for online
        const diffMs = new Date() - lastSeenDate;
        const isOnline = diffMs >= 0 && diffMs <= 5 * 60 * 1000;

        // Use API status if available, fallback to calculated
        return {
            ...sensor,
            is_online: sensor.is_online !== undefined ? sensor.is_online : isOnline
        };
    });

    // Sort: Latest updated first (descending by timestamp)
    uniqueSensors.sort((a, b) => {
        const dateA = new Date(typeof a.last_seen === 'string' ? a.last_seen.replace(' ', 'T') : a.last_seen);
        const dateB = new Date(typeof b.last_seen === 'string' ? b.last_seen.replace(' ', 'T') : b.last_seen);
        return dateB - dateA;
    });

    return {
        timestamp: serverTimestamp,
        sensorsCount: uniqueSensors.length,
        sensors: uniqueSensors
    };
}

/**
 * Fetch air quality forecast from the model-serving service.
 * Endpoint: GET /api/v1/predictions/forecast?location=...&hours=...
 * Source: model-serving-service (Python/FastAPI)
 *
 * Returns: { location, forecast[], model }
 */
export async function fetchForecast(deviceId = '') {
    const response = await fetch(`${API_BASE}/v1/forecast/realtime${deviceId ? '?device_id=' + encodeURIComponent(deviceId) : ''}`);
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Forecast API error: ${response.status}`);
    }
    return response.json();
}

/**
 * Fetch forecast comparison data from the PythonAnywhere backend.
 * Endpoint: GET /api/v1/forecast/comparison
 */
export async function fetchForecastComparison(deviceId = '') {
    const response = await fetch(`${API_BASE}/v1/forecast/comparison${deviceId ? '?device_id=' + encodeURIComponent(deviceId) : ''}`);
    if (!response.ok) {
        throw new Error(`Comparison API error: ${response.status}`);
    }
    return response.json();
}

/**
 * Fetch global historical data for EDA.
 * Endpoint: GET /api/v1/history/all
 */
export async function fetchAllHistory(limit = 5000, deviceId = '') {
    const params = deviceId ? `&device_id=${deviceId}` : '';
    const response = await fetch(`${API_BASE}/v1/history/all?limit=${limit}${params}`);
    if (!response.ok) {
        throw new Error(`History API error: ${response.status}`);
    }
    const data = await response.json();
    if (Array.isArray(data)) return data;
    return Array.isArray(data.readings) ? data.readings : [];
}

/**
 * Fetch pre-calculated statistics for EDA.
 * Endpoint: GET /api/stats/summary
 */
export async function fetchDataSummary() {
    const response = await fetch(`${API_BASE}/stats/summary`);
    if (!response.ok) {
        throw new Error(`Stats summary API error: ${response.status}`);
    }
    return response.json();
}

/**
 * Fetch a sampled subset of historical data for efficient charting.
 */
export async function fetchSampledHistory(limit = 200, deviceId = '') {
    // For now, we reuse fetchAllHistory with a smaller limit
    // In a production app, this would be a specialized aggregation endpoint
    return fetchAllHistory(limit, deviceId);
}

/**
 * Check API gateway health.
 * Endpoint: GET /health
 */
export async function checkHealth() {
    const response = await fetch(`/health`);
    if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
    }
    return response.json();
}
/**
 * Fetch the list of all known device IDs.
 * Endpoint: GET /api/v1/devices (proxied through PythonAnywhere)
 */
export async function fetchDevices() {
    try {
        const response = await fetch(`${API_BASE}/v1/devices`);
        if (!response.ok) throw new Error(`Devices API: ${response.status}`);
        const data = await response.json();
        return Array.isArray(data.devices) ? data.devices : [];
    } catch (err) {
        console.error('Failed to fetch device list:', err);
        return [];
    }
}

/**
 * Fetch device health diagnostics.
 * Endpoint: GET /api/v1/health/latest
 */
export async function fetchHealthData(deviceId = '') {
    const params = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
    const response = await fetch(`${API_BASE}/v1/health/latest${params}`);
    if (!response.ok) {
        throw new Error(`Health API error: ${response.status}`);
    }
    return response.json();
}

/**
 * Build the CSV export URL for health data.
 */
export function getHealthExportUrl(deviceId = '') {
    const params = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
    return `${API_BASE}/v1/health/export/csv${params}`;
}

/**
 * Build the CSV export URL for sensor data.
 */
export function getDataExportUrl(deviceId = '') {
    const params = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
    return `${API_BASE}/v1/data/export/csv${params}`;
}
