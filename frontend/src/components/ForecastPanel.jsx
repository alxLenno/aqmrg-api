/**
 * ForecastPanel — displays predictions from the model-serving service.
 * Data comes from GET /api/v1/predictions/forecast → model-serving-service (FastAPI).
 * When the backend is running, this shows real ML model output.
 */
export default function ForecastPanel({ forecast, loading, error }) {
    if (loading) {
        return (
            <div className="card forecast-card">
                <div className="card-header">
                    <h3>Air Quality Forecast</h3>
                    <span className="card-badge model-badge">Loading...</span>
                </div>
                <div className="forecast-grid">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="forecast-item skeleton">
                            <div className="skeleton-line narrow"></div>
                            <div className="skeleton-line wide"></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="card forecast-card">
                <div className="card-header">
                    <h3>Air Quality Forecast</h3>
                    <span className="card-badge error-badge">Error</span>
                </div>
                <div className="forecast-error">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <p>Could not load forecast data.</p>
                    <span className="error-hint">Make sure the model-serving service is running on port 8003.</span>
                </div>
            </div>
        );
    }

    const data = forecast || {};
    const predicted = data.prediction || 0;
    const actual = data.actual_pm25 || 0;
    const shift = data.shift || 0;
    const absShift = Math.abs(shift);
    
    // Performance color
    const shiftColor = absShift < 5 ? 'text-green-400' : absShift < 15 ? 'text-yellow-400' : 'text-red-400';
    const accuracy = Math.max(0, 100 - (absShift / (actual || 1) * 100));

    return (
        <div className="card forecast-card animate-fade-in shadow-premium">
            <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="intelligence-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                            <path d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h7" />
                            <path d="M16 5V3M8 5V3M3 9h16M15 15l2 2 4-4" />
                        </svg>
                    </div>
                    <h3>Intelligence Monitor</h3>
                </div>
                <span className="card-badge model-badge">ML Core v2.4</span>
            </div>

            <div className="forecast-stats">
                <div className="forecast-stat-item">
                    <span className="stat-label">Predicted PM2.5</span>
                    <span className="stat-value highlight">{predicted} <small>μg/m³</small></span>
                </div>
                <div className="forecast-stat-item">
                    <span className="stat-label">Actual Reading</span>
                    <span className="stat-value">{actual} <small>μg/m³</small></span>
                </div>
            </div>

            <div className="accuracy-section glass-fill">
                <div className="accuracy-meta">
                    <span className="meta-label">Model Shift (Error)</span>
                    <span className={`meta-value ${shiftColor}`}>
                        {shift >= 0 ? '+' : ''}{shift} μg/m³
                    </span>
                </div>
                <div className="accuracy-bar-bg">
                    <div 
                        className="accuracy-bar-fill" 
                        style={{ 
                            width: `${accuracy}%`,
                            background: absShift < 10 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #f59e0b, #fbbf24)' 
                        }}
                    ></div>
                </div>
                <span className="accuracy-pct">{accuracy.toFixed(1)}% Alignment Confidence</span>
            </div>

            <div className="forecast-location" style={{ marginTop: '16px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    Last validation: {data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : 'Just now'}
                </span>
            </div>

            <style jsx>{`
                .forecast-card {
                    background: rgba(15, 23, 42, 0.4);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255,255,255,0.08);
                }
                .intelligence-icon {
                    background: rgba(99, 102, 241, 0.1);
                    padding: 6px;
                    border-radius: 8px;
                    display: flex;
                }
                .forecast-stats {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                    margin: 20px 0;
                }
                .forecast-stat-item {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    padding: 12px;
                    background: rgba(255,255,255,0.02);
                    border-radius: 12px;
                    border: 1px solid rgba(255,255,255,0.03);
                }
                .stat-label {
                    font-size: 0.65rem;
                    text-transform: uppercase;
                    color: #64748b;
                    letter-spacing: 0.08em;
                    font-weight: 600;
                }
                .stat-value {
                    font-size: 1.4rem;
                    font-weight: 700;
                    color: #f8fafc;
                }
                .stat-value.highlight {
                    color: #818cf8;
                }
                .stat-value small {
                    font-size: 0.7rem;
                    font-weight: 400;
                    color: #64748b;
                }
                .accuracy-section {
                    padding: 16px;
                    border-radius: 16px;
                    border: 1px solid rgba(255,255,255,0.06);
                }
                .glass-fill {
                    background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
                }
                .accuracy-meta {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 10px;
                    font-size: 0.8rem;
                }
                .meta-label { color: #94a3b8; font-weight: 500; }
                .text-green-400 { color: #34d399; }
                .text-yellow-400 { color: #fbbf24; }
                .text-red-400 { color: #f87171; }
                
                .accuracy-bar-bg {
                    height: 8px;
                    background: rgba(0,0,0,0.2);
                    border-radius: 4px;
                    overflow: hidden;
                    margin-bottom: 10px;
                    box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
                }
                .accuracy-bar-fill {
                    height: 100%;
                    transition: width 1s cubic-bezier(0.16, 1, 0.3, 1);
                    box-shadow: 0 0 10px rgba(99, 102, 241, 0.2);
                }
                .accuracy-pct {
                    font-size: 0.75rem;
                    color: #94a3b8;
                    display: block;
                    text-align: right;
                    font-family: 'JetBrains Mono', monospace;
                }
                .shadow-premium {
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
                }
            `}</style>
        </div>
    );
}
