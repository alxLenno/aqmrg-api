/**
 * StatsGrid — displays summary statistics derived from real sensor data.
 * All values come from the analytics-service /dashboard/realtime response.
 */
export default function StatsGrid({ sensors, loading }) {
    if (loading) {
        return (
            <section className="stats-grid">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="stat-card skeleton">
                        <div className="skeleton-line wide"></div>
                        <div className="skeleton-line narrow"></div>
                    </div>
                ))}
            </section>
        );
    }

    const totalSensors = sensors.length;
    const onlineSensors = sensors.filter((s) => s.is_online).length;
    const manufacturers = [...new Set(sensors.map((s) => s.manufacturer))];
    const avgPm25 = sensors.length > 0
        ? (sensors.reduce((acc, s) => acc + (s.readings?.pm25 || 0), 0) / sensors.length).toFixed(1)
        : '--';

    return (
        <section className="stats-grid">
            {/* Active Sensors */}
            <div className="stat-card stat-sensors">
                <div className="stat-header">
                    <span className="stat-label">Online Sensors</span>
                    <div className={`stat-trend ${onlineSensors === totalSensors ? 'trend-good' : 'trend-warning'}`}>
                        <span>{onlineSensors === totalSensors ? 'All Online' : `${totalSensors - onlineSensors} Offline`}</span>
                    </div>
                </div>
                <div className="stat-value">
                    {onlineSensors}<span className="stat-unit">/ {totalSensors}</span>
                </div>
                <div className={`stat-quality ${onlineSensors === totalSensors ? 'good' : 'warning'}`}>
                    {onlineSensors === totalSensors ? 'Fully Operational' : 'Degraded'}
                </div>
                <div className="stat-bar">
                    <div
                        className="stat-bar-fill"
                        style={{ width: `${(onlineSensors / Math.max(totalSensors, 1)) * 100}%` }}
                    ></div>
                </div>
            </div>

            {/* Average PM2.5 */}
            <div className="stat-card stat-aqi">
                <div className="stat-header">
                    <span className="stat-label">Avg. PM2.5</span>
                    <div className="stat-trend trend-neutral">
                        <span>Nairobi Area</span>
                    </div>
                </div>
                <div className="stat-value">
                    {avgPm25}
                    <span className="stat-unit">μg/m³</span>
                </div>
                <div className="aqi-indicator">
                    Live from {sensors.length} stations
                </div>
            </div>

            {/* Manufacturers */}
            <div className="stat-card stat-manufacturers">
                <div className="stat-header">
                    <span className="stat-label">Manufacturers</span>
                    <div className="stat-trend trend-neutral">
                        <span>{manufacturers.length} Provider{manufacturers.length !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                <div className="stat-value">{manufacturers.length}</div>
                <div className="manufacturer-tags">
                    {manufacturers.map((m) => (
                        <span key={m} className="tag">{m}</span>
                    ))}
                </div>
            </div>
        </section>
    );
}
