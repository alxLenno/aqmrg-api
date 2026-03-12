import React from 'react';

/**
 * SensorDetailTab — A technical view for developers to see hardware specs and raw JSON data.
 */
export default function SensorDetailTab({ sensors, loading }) {
    if (loading) {
        return (
            <div className="sensor-detail-tab">
                <div className="technical-card skeleton">
                    <div className="skeleton-line wide"></div>
                    <div className="skeleton-line"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="sensor-detail-tab">
            <header className="tab-header">
                <h2>Sensor Inventory & Technical Details</h2>
                <p>Verifying hardware configurations and raw data streams.</p>
            </header>

            <div className="technical-grid">
                {sensors.map((sensor) => (
                    <div key={sensor.id} className={`technical-card ${!sensor.is_online ? 'offline' : ''}`}>
                        <div className="tech-card-header">
                            <div className="tech-title">
                                <span className={`status-dot ${sensor.is_online ? 'online' : 'offline'}`}></span>
                                <h3>{sensor.name}</h3>
                            </div>
                            <span className="tech-id">{sensor.device_id}</span>
                        </div>

                        <div className="tech-meta-row">
                            <div className="tech-meta-item">
                                <span className="tech-label">Controller ID</span>
                                <span className="tech-value monospace">{sensor.controller_id || `CTRL-${sensor.device_id?.slice(-4) || 'DUE'}`}</span>
                            </div>
                            <div className="tech-meta-item">
                                <span className="tech-label">Framework</span>
                                <span className="tech-value">{sensor.hardware_details?.controller || 'Arduino Due'}</span>
                            </div>
                        </div>

                        <div className="tech-section">
                            <span className="tech-label">Hardware Stack (Modules)</span>
                            <div className="hardware-tags">
                                {(sensor.hardware_details?.sensors && sensor.hardware_details.sensors.length > 0) ? (
                                    sensor.hardware_details.sensors.map((s, idx) => (
                                        <span key={idx} className="tech-tag">{s}</span>
                                    ))
                                ) : (
                                    <>
                                        <span className="tech-tag">PMS5003</span>
                                        <span className="tech-tag">MH-Z19C</span>
                                        <span className="tech-tag">SGP41</span>
                                        <span className="tech-tag">MQ-7</span>
                                        <span className="tech-tag">DHT11</span>
                                        <span className="tech-tag">SIM800L</span>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="tech-section">
                            <span className="tech-label">Raw JSON Stream (Last Readings)</span>
                            <pre className="json-block">
                                {JSON.stringify(sensor.last_readings || {}, null, 2)}
                            </pre>
                        </div>

                        <div className="tech-footer">
                            <span>Last Pulse: {sensor.last_seen ? new Date(sensor.last_seen).toLocaleString() : 'Never'}</span>
                            <span className="tech-status-label">{sensor.is_online ? 'CONNECTED' : 'STANDBY'}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
