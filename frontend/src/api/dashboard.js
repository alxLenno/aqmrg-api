const API_BASE = '/api';

/**
 * Fetch real-time dashboard data from the analytics service.
 * Endpoint: GET /api/v1/data/latest
 * Source: PythonAnywhere backend
 *
 * Returns: { timestamp, sensorsCount, sensors[] }
 */
export async function fetchDashboardData() {
    const response = await fetch(`${API_BASE}/v1/data/latest`);
    if (!response.ok) {
        throw new Error(`Dashboard API error: ${response.status}`);
    }
    const data = await response.json();

    // Support both raw array (PythonAnywhere) and object with sensors (Analytics Service)
    const rawData = Array.isArray(data) ? data : (data.sensors || []);
    const serverTimestamp = data.timestamp || (rawData.length > 0 ? rawData[0].timestamp : new Date().toISOString());

    // Transform the list of readings into the format expected by the dashboard
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

    // De-duplicate sensors by device_id (showing only the latest reading per device)
    const uniqueSensorsMap = new Map();
    sensors.forEach(sensor => {
        if (!uniqueSensorsMap.has(sensor.device_id)) {
            uniqueSensorsMap.set(sensor.device_id, sensor);
        }
    });

    const uniqueSensors = Array.from(uniqueSensorsMap.values()).map(sensor => {
        // Robust online check: ensure we have a string before replacing
        const rawDate = sensor.last_seen || new Date().toISOString();
        const dateStr = typeof rawDate === 'string' ? rawDate.replace(' ', 'T') : rawDate;
        const lastSeenDate = new Date(dateStr);

        // 10 minute threshold for online
        const diffMs = new Date() - lastSeenDate;
        const isOnline = diffMs > 0 && diffMs < 10 * 60 * 1000;

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
export async function fetchForecast(location = 'Nairobi', hours = 4) {
    const response = await fetch(
        `${API_BASE}/v1/forecast/realtime`
    );
    if (!response.ok) {
        throw new Error(`Forecast API error: ${response.status}`);
    }
    return response.json();
}

/**
 * Fetch global historical data for EDA.
 * Endpoint: GET /api/v1/history/all
 */
export async function fetchAllHistory(limit = 5000) {
    const response = await fetch(`${API_BASE}/v1/history/all?limit=${limit}`);
    if (!response.ok) {
        throw new Error(`History API error: ${response.status}`);
    }
    const data = await response.json();
    return data.readings || [];
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
export async function fetchSampledHistory(limit = 200) {
    // For now, we reuse fetchAllHistory with a smaller limit
    // In a production app, this would be a specialized aggregation endpoint
    return fetchAllHistory(limit);
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
