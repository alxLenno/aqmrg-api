/**
 * ForecastPanel — displays predictions from the model-serving service.
 * Data comes from GET /api/v1/predictions/forecast → model-serving-service (FastAPI).
 * When the backend is running, this shows real ML model output.
 */
export default function ForecastPanel({ forecast, comparison, loading, error }) {
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
    const compData = comparison || {};
    const predictions = compData.predictions || {};
    
    // Original API values as fallbacks or baseline
    const apiPredicted = data.prediction || 0;
    const apiActual = data.actual_pm25 || 0;
    
    // Actual PM2.5 value to use for comparison
    const actual = compData.actual_pm25 || apiActual;
    const compActual = compData.actual_pm25 || 0;
    const ensembleMedian = compData.ensemble_median || 0;

    // --- Dynamic Model Selection Logic ---
    // Create an array of all available models and their predictions
    let availableModels = [];
    
    // Add models if comparison data is available
    if (comparison && actual > 0) {
       availableModels = [
           { name: 'Ensemble', prediction: ensembleMedian },
           { name: 'GB Model', prediction: predictions.gb || 0 },
           { name: 'OLS Model', prediction: predictions.ols || 0 },
           { name: 'Existing', prediction: predictions.existing || 0 }
       ].filter(m => m.prediction > 0);
    }
    
    // Define the default/fallback model based on the standard API forecast
    const defaultModel = { 
        name: 'API Forecast', 
        prediction: apiPredicted,
        shift: data.shift || 0
    };
    
    let bestModel = defaultModel;

    // If we have comparison models, find the one with the smallest absolute error
    if (availableModels.length > 0) {
        // Calculate error for each model
        const modelsWithError = availableModels.map(model => ({
            ...model,
            shift: model.prediction - actual,
            absError: Math.abs(model.prediction - actual)
        }));
        
        // Find the index of the model with the minimum absolute error
        let bestIndex = 0;
        let minError = modelsWithError[0].absError;
        
        for (let i = 1; i < modelsWithError.length; i++) {
            if (modelsWithError[i].absError < minError) {
                minError = modelsWithError[i].absError;
                bestIndex = i;
            }
        }
        
        bestModel = modelsWithError[bestIndex];
    } else if (apiPredicted > 0 && actual > 0) {
         // Calculate shift for API forecast if comparison data isn't available but actual is
         bestModel.shift = apiPredicted - actual;
    }

    // Use the best model's values for main display
    const displayPredicted = bestModel.prediction;
    const shift = bestModel.shift;
    const absShift = Math.abs(shift);
    
    // Performance color based on the selected best model
    const shiftColor = absShift < 5 ? 'text-green-400' : absShift < 15 ? 'text-yellow-400' : 'text-red-400';
    const accuracy = actual > 0 ? Math.max(0, 100 - (absShift / actual * 100)) : 0;

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
                    <div className="stat-header">
                        <span className="stat-label">Predicted PM2.5</span>
                        {bestModel.name !== 'API Forecast' && (
                            <span className="comp-tag best-model-tag">Using: {bestModel.name}</span>
                        )}
                    </div>
                    <span className="stat-value highlight">{displayPredicted.toFixed(2)} <small>μg/m³</small></span>
                </div>
                <div className="forecast-stat-item">
                    <div className="stat-header">
                        <span className="stat-label">Actual Reading</span>
                        {compActual !== apiActual && compActual > 0 && (
                            <span className="comp-tag">Comp: {compActual}</span>
                        )}
                    </div>
                    <span className="stat-value">{actual} <small>μg/m³</small></span>
                </div>
            </div>

            <div className="accuracy-section glass-fill">
                <div className="accuracy-meta">
                    <span className="meta-label">Model Shift (Error)</span>
                    <span className={`meta-value ${shiftColor}`}>
                        {shift > 0 ? '+' : ''}{shift.toFixed(2)} μg/m³
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

            {/* Comparison Section */}
            {comparison && (
                <div className="comparison-container">
                    <div className="comparison-header">
                        <h4>Model Accuracy Comparison</h4>
                    </div>
                    <div className="comparison-grid">
                        <div className={`comparison-item ${bestModel.name === 'Ensemble' ? 'best-model' : ''}`}>
                            <span className="comp-label">Ensemble</span>
                            <span className="comp-value">{ensembleMedian}</span>
                        </div>
                        <div className={`comparison-item ${bestModel.name === 'GB Model' ? 'best-model' : ''}`}>
                            <span className="comp-label">GB Model</span>
                            <span className="comp-value">{predictions.gb}</span>
                        </div>
                        <div className={`comparison-item ${bestModel.name === 'OLS Model' ? 'best-model' : ''}`}>
                            <span className="comp-label">OLS Model</span>
                            <span className="comp-value">{predictions.ols}</span>
                        </div>
                        <div className={`comparison-item ${bestModel.name === 'Existing' ? 'best-model' : ''}`}>
                            <span className="comp-label">Existing</span>
                            <span className="comp-value">{predictions.existing}</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="forecast-location" style={{ marginTop: '16px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    Last validation: {compData.timestamp || data.timestamp ? new Date(compData.timestamp || data.timestamp).toLocaleTimeString() : 'Just now'}
                </span>
            </div>

            <style jsx>{`
                .forecast-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border);
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
                    background: var(--bg-secondary);
                    border-radius: 12px;
                    border: 1px solid var(--border);
                }
                .stat-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 8px;
                }
                .comp-tag {
                    font-size: 0.6rem;
                    background: rgba(99, 102, 241, 0.15);
                    color: var(--accent);
                    padding: 2px 6px;
                    border-radius: 4px;
                    white-space: nowrap;
                }
                .best-model-tag {
                    background: rgba(16, 185, 129, 0.15);
                    color: var(--aqi-good);
                }
                .stat-label {
                    font-size: 0.65rem;
                    text-transform: uppercase;
                    color: var(--text-secondary);
                    letter-spacing: 0.08em;
                    font-weight: 600;
                }
                .stat-value {
                    font-size: 1.4rem;
                    font-weight: 700;
                    color: var(--text-primary);
                }
                .stat-value.highlight {
                    color: var(--accent);
                }
                .stat-value small {
                    font-size: 0.7rem;
                    font-weight: 400;
                    color: var(--text-secondary);
                }
                .accuracy-section {
                    padding: 16px;
                    border-radius: 16px;
                    border: 1px solid var(--border);
                }
                .glass-fill {
                    background: var(--bg-secondary);
                }
                .accuracy-meta {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 10px;
                    font-size: 0.8rem;
                }
                .meta-label { color: var(--text-secondary); font-weight: 500; }
                .text-green-400 { color: var(--aqi-good); }
                .text-yellow-400 { color: var(--aqi-moderate); }
                .text-red-400 { color: var(--aqi-unhealthy); }
                
                .accuracy-bar-bg {
                    height: 8px;
                    background: var(--border);
                    border-radius: 4px;
                    overflow: hidden;
                    margin-bottom: 10px;
                }
                .accuracy-bar-fill {
                    height: 100%;
                    transition: width 1s cubic-bezier(0.16, 1, 0.3, 1);
                    box-shadow: 0 0 10px rgba(99, 102, 241, 0.2);
                }
                .accuracy-pct {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    display: block;
                    text-align: right;
                    font-family: 'JetBrains Mono', monospace;
                }
                
                .comparison-container {
                    margin-top: 20px;
                    padding: 12px;
                    background: var(--bg-secondary);
                    border-radius: 12px;
                    border: 1px solid var(--border);
                }
                .comparison-header h4 {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    margin-bottom: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .comparison-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 12px;
                }
                .comparison-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-bottom: 8px;
                    border-bottom: 1px solid var(--border);
                    border-radius: 4px;
                }
                .comparison-item.best-model {
                    background: rgba(16, 185, 129, 0.1);
                    padding: 4px 8px;
                    border: 1px solid rgba(16, 185, 129, 0.2);
                    box-shadow: 0 0 10px rgba(16, 185, 129, 0.1);
                }
                .comparison-item:last-child, .comparison-item:nth-last-child(2) {
                    border-bottom: none;
                    padding-bottom: 0;
                    margin-top: 4px;
                }
                .comparison-item.best-model:last-child, .comparison-item.best-model:nth-last-child(2) {
                     padding-bottom: 4px;
                     border-bottom: 1px solid rgba(16, 185, 129, 0.2);
                }
                .comp-label {
                    font-size: 0.7rem;
                    color: var(--text-secondary);
                }
                .comp-value {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    font-family: 'JetBrains Mono', monospace;
                }

                .shadow-premium {
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
                }
            `}</style>
        </div>
    );
}
