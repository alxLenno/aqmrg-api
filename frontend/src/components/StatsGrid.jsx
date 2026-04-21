import { discoverMetrics, formatMetricLabel, getMetricUnit } from '../utils/metrics';

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

    const sensorsList = Array.isArray(sensors) ? sensors : [];
    const totalSensors = sensorsList.length;
    const onlineSensors = sensorsList.filter((s) => s?.is_online).length;
    const manufacturers = [...new Set(sensorsList.map((s) => s?.manufacturer).filter(Boolean))];
    
    // Discovery of all metrics for summary
    const activeMetricKeys = discoverMetrics(sensorsList);
    const primaryKeys = ['pm25', 'co2', 'temperature'];
    const secondaryKeys = activeMetricKeys.filter(k => !primaryKeys.includes(k));

    const getAverage = (key) => {
      if (totalSensors === 0) return '--';
      const validReadings = sensorsList
        .map(s => (s?.readings || {})[key])
        .filter(v => v !== undefined && v !== null);
      
      if (validReadings.length === 0) return '--';
      const sum = validReadings.reduce((acc, v) => acc + Number(v), 0);
      const avg = sum / validReadings.length;
      return avg.toFixed(key === 'co' || key === 'o3' ? 2 : 1);
    };


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

            {/* Average PM2.5 (Core Highlight) */}
            <div className="stat-card stat-aqi">
                <div className="stat-header">
                    <span className="stat-label">Avg. PM2.5</span>
                    <div className="stat-trend trend-neutral">
                        <span>City Average</span>
                    </div>
                </div>
                <div className="stat-value">
                    {getAverage('pm25')}
                    <span className="stat-unit">µg/m³</span>
                </div>
                <div className="aqi-indicator">
                    Live from {sensors.length} stations
                </div>
            </div>

            {/* Dynamic Secondary Stats */}
            <div className="stat-card stat-secondary">
                <div className="stat-header">
                    <span className="stat-label">Environmental Metrics</span>
                    <div className="stat-trend trend-neutral">
                        <span>{secondaryKeys.length} Dynamic Parameters</span>
                    </div>
                </div>
                <div className="secondary-metrics-list">
                    {secondaryKeys.slice(0, 4).map(key => (
                      <div key={key} className="sec-metric">
                        <span className="sec-label">{formatMetricLabel(key)}</span>
                        <span className="sec-val">{getAverage(key)} {getMetricUnit(key)}</span>
                      </div>
                    ))}
                    {secondaryKeys.length === 0 && (
                      <div className="sec-empty">Waiting for telemetry...</div>
                    )}
                </div>
                <style jsx>{`
                  .secondary-metrics-list {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    margin-top: 15px;
                  }
                  .sec-metric {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    padding-left: 8px;
                    border-left: 2px solid var(--accent-3);
                  }
                  .sec-label {
                    font-size: 0.65rem;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                  }
                  .sec-val {
                    font-size: 1rem;
                    font-weight: 600;
                    color: var(--text-primary);
                  }
                  .sec-empty {
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    font-style: italic;
                    grid-column: span 2;
                  }
                `}</style>
            </div>
        </section>
    );
}
