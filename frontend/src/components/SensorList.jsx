import { discoverMetrics, formatMetricLabel } from '../utils/metrics';

/**
 * SensorList — displays the real sensor data from the PostgreSQL database.
 * Each sensor row shows: name, device_id, manufacturer, coordinates, status.
 * All data comes from GET /api/v1/dashboard/realtime → analytics-service → PostgreSQL.
 */
export default function SensorList({ sensors, loading, timestamp }) {
    const prevReadings = useRef({});
    
    // Discovered keys for all sensors (used for alignment)
    const activeMetricKeys = discoverMetrics(sensors);

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
                    <h3>Live Hardware Stations</h3>
                    <span className="card-badge">{onlineSensors.length} Verified</span>
                </div>
                <button
                    className="btn-export"
                    onClick={() => window.open('/api/v1/data/export/csv', '_blank')}
                    title="Download historical data as CSV"
                >
                    Export All Data
                </button>
            </div>

            {timestamp && (
                <div className="data-timestamp">
                    System Heartbeat: {new Date(timestamp).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi' })}
                </div>
            )}

            <div className="table-container">
                <div className="sensor-list">
                    {sensors.length === 0 ? (
                        <div className="empty-state">
                            <div className="forward-pulse" style={{ marginBottom: '20px' }}></div>
                            <p>Waiting for Station Heartbeat...</p>
                            <span>Ensure AQ-NODE-001 is powered and connected to GPRS.</span>
                        </div>
                    ) : (
                        sensors.map((sensor) => {
                            const readings = sensor.readings || {};
                            const currentVal = readings.pm25;
                            const status = getAQIStatus(readings.status, currentVal);

                            return (
                                <div key={sensor.id} className="sensor-item" data-id={sensor.device_id}>
                                    <div className="sensor-status online"></div>
                                    <div className="sensor-info">
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span className="sensor-name" style={{ color: 'var(--accent-3)' }}>
                                                🛡️ {sensor.name}
                                            </span>
                                            <span className={`aqi-label ${status.badge}`}>
                                                Verified Node
                                            </span>
                                        </div>
                                        <span className="sensor-meta">{sensor.device_id} • Nairobi Metropolitan Area</span>
                                        {sensor.last_seen && (
                                            <span className="last-seen">
                                                Live Update: {
                                                    (() => {
                                                        const dateStr = sensor.last_seen.endsWith('Z') ? sensor.last_seen : sensor.last_seen.replace(' ', 'T');
                                                        const correctedDate = new Date(dateStr);
                                                        let seconds = Math.floor((now - correctedDate) / 1000);
                                                        seconds = Math.max(0, seconds);
                                                        if (seconds < 60) return `${seconds}s ago`;
                                                        return `${Math.floor(seconds / 60)}m ago`;
                                                    })()
                                                }
                                            </span>
                                        )}
                                    </div>

                                    <div className="measurement-grid" style={{ 
                                      display: 'grid', 
                                      gridTemplateColumns: 'repeat(auto-fit, minmax(60px, 1fr))',
                                      flex: '1',
                                      padding: '0 20px'
                                    }}>
                                        {activeMetricKeys.map(key => (
                                          <div key={key} className="measurement-item">
                                              <span className={`m-val ${key === 'pm25' ? status.className : ''}`}>
                                                {readings[key] ?? '--'}
                                              </span>
                                              <span className="m-label">{formatMetricLabel(key)}</span>
                                          </div>
                                        ))}
                                    </div>


                                    <div className="sensor-detail" style={{ minWidth: '120px', textAlign: 'right' }}>
                                        <span className="status-badge active" style={{ background: 'rgba(34, 197, 94, 0.15)' }}>
                                            DATA STREAMING
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
