import { useState, useEffect } from 'react';

export default function Header({ apiStatus, sensorsCount, lastUpdate, devices = [], selectedDevice = '', onDeviceChange }) {
    const [time, setTime] = useState(new Date());
    const [syncCountdown, setSyncCountdown] = useState(null);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            setTime(now);

            if (lastUpdate) {
                const lastDate = new Date(lastUpdate);
                const nextExpected = new Date(lastDate.getTime() + 5 * 60 * 1000);
                const diff = Math.floor((nextExpected - now) / 1000);

                if (diff > 0) {
                    const m = Math.floor(diff / 60);
                    const s = diff % 60;
                    setSyncCountdown(`${m}m ${s}s`);
                } else {
                    setSyncCountdown('Waiting for data...');
                }
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [lastUpdate]);

    const formattedTime = time.toLocaleString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Africa/Nairobi',
    });

    return (
        <header className="topbar">
            <div className="topbar-left">
                <h1 className="page-title">Real-Time Dashboard</h1>
                <span className="page-subtitle">
                    Air quality monitoring across Nairobi metropolitan area
                </span>
            </div>
            <div className="topbar-right">
                <div className="device-picker-container">
                    <span className="picker-label">Sensor Node:</span>
                    <select
                        className="device-select"
                        value={selectedDevice}
                        onChange={(e) => onDeviceChange(e.target.value)}
                    >
                        <option value="">All Sensors (Fleet)</option>
                        {devices.map(d => (
                            <option key={d.device_id || d} value={d.device_id || d}>
                                {d.name || d.device_id || d}
                            </option>
                        ))}
                    </select>
                </div>
                {syncCountdown && (
                    <div className="sync-timer-badge">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                            <path d="M21 2v6h-6" />
                            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                            <path d="M3 22v-6h6" />
                            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                        </svg>
                        <span>Sync: {syncCountdown}</span>
                    </div>
                )}
                <div className={`live-indicator ${apiStatus === 'connected' ? '' : 'disconnected'}`}>
                    <span className="live-dot"></span>
                    <span>{apiStatus === 'connected' ? 'Live' : 'Offline'}</span>
                </div>
                {sensorsCount !== null && (
                    <div className="sensor-count-badge">
                        {sensorsCount} sensor{sensorsCount !== 1 ? 's' : ''}
                    </div>
                )}
                <div className="time-display">{formattedTime}</div>
                <div className="export-container">
                    <button className="export-toggle-btn" title="Export Station Data">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span>Export</span>
                    </button>
                    <div className="export-dropdown">
                        <a 
                            href={`/api/v1/data/export/csv${selectedDevice ? '?device_id=' + selectedDevice : ''}`} 
                            className="export-item"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                            </svg>
                            Sensor Data (CSV)
                        </a>
                        <a 
                            href={`/api/v1/health/export/csv${selectedDevice ? '?device_id=' + selectedDevice : ''}`} 
                            className="export-item"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                            </svg>
                            Health Logs (CSV)
                        </a>
                    </div>
                </div>
            </div>
        </header>
    );
}
