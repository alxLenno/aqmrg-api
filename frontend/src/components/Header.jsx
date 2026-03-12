import { useState, useEffect } from 'react';

export default function Header({ apiStatus, sensorsCount, lastUpdate }) {
    const [time, setTime] = useState(new Date());
    const [syncCountdown, setSyncCountdown] = useState(null);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            setTime(now);

            if (lastUpdate) {
                const lastDate = new Date(lastUpdate);
                // Data arrives approximately every 5 minutes (300 seconds)
                const nextExpected = new Date(lastDate.getTime() + 5 * 60 * 1000);
                const diff = Math.floor((nextExpected - now) / 1000);

                if (diff > 0) {
                    const m = Math.floor(diff / 60);
                    const s = diff % 60;
                    setSyncCountdown(`${m}m ${s}s`);
                } else {
                    // If diff is negative, we're waiting for data (overdue)
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
            </div>
        </header>
    );
}
