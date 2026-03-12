import { useRef, useState, useEffect } from 'react';

/**
 * SensorList — displays the real sensor data from the PostgreSQL database.
 * Each sensor row shows: name, device_id, manufacturer, coordinates, status.
 * All data comes from GET /api/v1/dashboard/realtime → analytics-service → PostgreSQL.
 */
export default function SensorList({ sensors, loading, timestamp }) {
    const prevReadings = useRef({});
    
    // Force re-render every second for the live timer
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const getAQIStatus = (backendStatus, pm25) => {
        if (backendStatus) {
            return {
                label: backendStatus,
                className: `status-${backendStatus.toLowerCase()}`,
                badge: backendStatus.toLowerCase()
            };
        }
        if (!pm25 && pm25 !== 0) return { label: 'Unknown', className: '' };
        if (pm25 <= 35) return { label: 'Good', className: 'status-good', badge: 'good' };
        if (pm25 <= 55) return { label: 'Moderate', className: 'status-moderate', badge: 'moderate' };
        if (pm25 <= 75) return { label: 'Warning', className: 'status-warning', badge: 'warning' };
        return { label: 'Danger', className: 'status-danger', badge: 'danger' };
    };

    if (loading) {
        return (
            <div className="card sensor-list-card">
                <div className="card-header">
                    <h3>Sensor Stations</h3>
                    <span className="card-badge loading-badge">Loading...</span>
                </div>
                <div className="sensor-list">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="sensor-item skeleton">
                            <div className="skeleton-dot"></div>
                            <div className="skeleton-lines">
                                <div className="skeleton-line wide"></div>
                                <div className="skeleton-line narrow"></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const onlineSensors = sensors.filter((s) => s.is_online);

    return (
        <div className="card sensor-list-card">
            <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h3>Sensor Stations</h3>
                    <span className="card-badge">{onlineSensors.length} Online</span>
                </div>
                <button
                    className="btn-export"
                    onClick={() => window.open('/api/v1/data/export/csv', '_blank')}
                    title="Download historical data as CSV"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Export CSV
                </button>
            </div>

            {timestamp && (
                <div className="data-timestamp">
                    Last updated: {new Date(timestamp).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi' })}
                </div>
            )}

            <div className="table-container">
                <div className="sensor-list">
                    {sensors.length === 0 ? (
                        <div className="empty-state">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <p>No sensors found in the database.</p>
                            <span>Run <code>make seed</code> to add sensor data.</span>
                        </div>
                    ) : (
                        sensors.map((sensor) => {
                            const readings = sensor.readings || {};
                            const currentVal = readings.pm25;

                            const hasChanged = prevReadings.current[sensor.device_id] !== undefined &&
                                (prevReadings.current[sensor.device_id]?.pm25 !== readings.pm25 ||
                                    prevReadings.current[sensor.device_id]?.co2 !== readings.co2);

                            if (readings.pm25 !== undefined) {
                                prevReadings.current[sensor.device_id] = { pm25: readings.pm25, co2: readings.co2 };
                            }

                            const status = getAQIStatus(readings.status, currentVal);

                            return (
                                <div key={sensor.id} className={`sensor-item ${!sensor.is_online ? 'offline-mod' : ''}`} data-id={sensor.device_id}>
                                    <div className={`sensor-status ${sensor.is_online ? 'online' : 'offline'}`}></div>
                                    <div className="sensor-info">
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span className="sensor-name">{sensor.name}</span>
                                            <span className={`aqi-label ${status.badge}`}>
                                                {sensor.hardware_details?.controller || status.label}
                                            </span>
                                        </div>
                                        <span className="sensor-meta">{sensor.device_id}</span>
                                        {sensor.last_seen && (
                                            <span className="last-seen">
                                                Last updated: {
                                                    (() => {
                                                        const dateStr = sensor.last_seen.endsWith('Z') ? sensor.last_seen : sensor.last_seen.replace(' ', 'T');
                                                        const correctedDate = new Date(dateStr);
                                                        let seconds = Math.floor((now - correctedDate) / 1000);
                                                        seconds = Math.max(0, seconds);
                                                        if (seconds < 60) return `${seconds} sec ago`;
                                                        const minutes = Math.floor(seconds / 60);
                                                        if (minutes < 60) return `${minutes} min ago`;
                                                        const hours = Math.floor(minutes / 60);
                                                        if (hours < 24) return `${hours} hr ago`;
                                                        return "Today";
                                                    })()
                                                }
                                            </span>
                                        )}
                                    </div>

                                    <div className="measurement-grid">
                                        <div className={`measurement-item ${hasChanged ? 'pulse-update' : ''}`} key={`${sensor.device_id}-pm1-${readings.pm1}`}>
                                            <span className="m-val">{readings.pm1 !== undefined ? readings.pm1 : '--'}</span>
                                            <span className="m-unit">μg/m³</span>
                                            <span className="m-label">PM1.0</span>
                                        </div>
                                        <div className={`measurement-item ${hasChanged ? 'pulse-update' : ''}`} key={`${sensor.device_id}-pm25-${readings.pm25}`}>
                                            <span className={`m-val ${status.className}`}>{readings.pm25 !== undefined ? readings.pm25 : '--'}</span>
                                            <span className="m-unit">μg/m³</span>
                                            <span className="m-label">PM2.5</span>
                                        </div>
                                        <div className={`measurement-item ${hasChanged ? 'pulse-update' : ''}`} key={`${sensor.device_id}-pm10-${readings.pm10}`}>
                                            <span className="m-val">{readings.pm10 !== undefined ? readings.pm10 : '--'}</span>
                                            <span className="m-unit">μg/m³</span>
                                            <span className="m-label">PM10</span>
                                        </div>
                                        <div className={`measurement-item ${hasChanged ? 'pulse-update' : ''}`} key={`${sensor.device_id}-co-${readings.co}`}>
                                            <span className="m-val">{readings.co !== undefined ? readings.co : '--'}</span>
                                            <span className="m-unit">ppm</span>
                                            <span className="m-label">CO</span>
                                        </div>
                                        <div className={`measurement-item ${hasChanged ? 'pulse-update' : ''}`} key={`${sensor.device_id}-co2-${readings.co2}`}>
                                            <span className="m-val">{readings.co2 !== undefined ? readings.co2 : '--'}</span>
                                            <span className="m-unit">ppm</span>
                                            <span className="m-label">CO₂</span>
                                        </div>
                                        <div className={`measurement-item ${hasChanged ? 'pulse-update' : ''}`} key={`${sensor.device_id}-temp-${readings.temperature}`}>
                                            <span className="m-val">{readings.temperature !== undefined ? readings.temperature : '--'}</span>
                                            <span className="m-unit">°C</span>
                                            <span className="m-label">Temp</span>
                                        </div>
                                    </div>

                                    <div className="sensor-detail">
                                        <span className="detail-label">Location / Coordinates</span>
                                        <span className="detail-value">{sensor.location_name}</span>
                                        <span className="detail-value" style={{ fontSize: '10px', opacity: 0.7 }}>
                                            {Number(sensor.latitude).toFixed(4)}, {Number(sensor.longitude).toFixed(4)}
                                        </span>
                                    </div>

                                    <div className="sensor-detail" style={{ minWidth: '80px', textAlign: 'right' }}>
                                        <span className={`status-badge ${sensor.is_online ? 'active' : 'inactive'}`}>
                                            {sensor.is_online ? 'Online' : 'Offline'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
