import { useState, useEffect, useMemo } from 'react';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
    ScatterChart, Scatter, ZAxis, Cell, CartesianGrid, Label
} from 'recharts';
import BoxPlot from './BoxPlot';
import PairPlot from './PairPlot';
import Heatmap from './Heatmap';
import '../index.css';
import { fetchSampledHistory } from '../api/dashboard';

/**
 * YourDataTab — Notebook-Led Discovery (V4)
 * Translates technical notebook steps into visual story steps.
 */
export default function YourDataTab({ selectedDevice }) {
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState([]);
    const [currentStep, setCurrentStep] = useState(0);
    const [columns, setColumns] = useState([]);

    useEffect(() => {
        let mounted = true;
        async function load() {
            setLoading(true);
            try {
                const data = await fetchSampledHistory(1000, selectedDevice);
                if (mounted) {
                    setHistory(data);
                    if (data.length > 0) {
                        const first = data[0];
                        // Robust column extraction
                        const metrics = first.metrics || first.readings || first || {};
                        const sensorKeys = Object.keys(metrics).filter(k =>
                            !['id', 'timestamp', 'device_id', 'latitude', 'longitude', 'ID', 'Timestamp'].includes(k)
                        );
                        setColumns(['ID', 'Timestamp (UTC)', 'Device ID', ...sensorKeys, 'Latitude', 'Longitude']);
                    }
                }
            } catch (err) {
                console.error("Data load failed:", err);
            } finally {
                if (mounted) setLoading(false);
            }
        }
        load();
        return () => { mounted = false; };
    }, [selectedDevice]);

    const processedData = useMemo(() => {
        const historyList = Array.isArray(history) ? history : [];
        if (!historyList.length) return null;


        const getVal = (h) => Number(h.metrics?.pm25 || h.pm25 || 0);
        const rawValues = history.map(getVal).filter(v => !isNaN(v));
        if (!rawValues.length) return null;

        const n = rawValues.length;
        const mean = rawValues.reduce((a, b) => a + b, 0) / n;
        const std = Math.sqrt(rawValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1)) || 1;

        // Histogram Bins
        const binCount = 15;
        const min = Math.min(...rawValues);
        const max = Math.max(...rawValues);
        const binWidth = (max - min) / binCount || 1;
        const bins = Array.from({ length: binCount }, (_, i) => {
            const start = min + i * binWidth;
            const end = start + binWidth;
            const count = rawValues.filter(v => v >= start && v < end).length;
            const x = start + binWidth / 2;
            const normY = (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / std, 2));

            // Simple KDE-like smoothing: average of neighboring bins
            const smoothCount = (
                (rawValues.filter(v => v >= start - binWidth && v < start).length * 0.25) +
                (count * 0.5) +
                (rawValues.filter(v => v >= end && v < end + binWidth).length * 0.25)
            );

            return {
                name: x.toFixed(0),
                count,
                smooth: smoothCount,
                norm: normY * n * binWidth,
                label: x < 35 ? 'Good' : x < 75 ? 'Moderate' : 'Unhealthy'
            };
        });

        const skewness = rawValues.reduce((a, b) => a + Math.pow(b - mean, 3), 0) / (n * Math.pow(std, 3));
        const kurtosis = rawValues.reduce((a, b) => a + Math.pow(b - mean, 4), 0) / (n * Math.pow(std, 4)) - 3;

        // Correlation Logic: Filter for ONLY physical sensor metrics
        const sensorKeys = Object.keys(history[0].metrics || history[0]).filter(k => {
            const lowKey = k.toLowerCase();
            const value = (history[0].metrics?.[k] ?? history[0][k]);

            // Exclude non-physical metadata and non-numeric fields
            const isMetadata = ['id', 'timestamp', 'device_id', 'latitude', 'longitude', 'pm25', 'created_at', 'uid', 'status', 'name', 'label', 'type', 'unit'].some(meta => lowKey.includes(meta));
            const isNumeric = typeof value === 'number' || (!isNaN(parseFloat(value)) && isFinite(value));

            return !isMetadata && isNumeric;
        });

        const correlations = sensorKeys.map(key => {
            const vals = history.map(h => Number(h.metrics?.[key] || h[key] || 0));
            const mean2 = vals.reduce((a, b) => a + b, 0) / n;
            const std2 = Math.sqrt(vals.reduce((a, b) => a + Math.pow(b - mean2, 2), 0) / (n - 1)) || 1;

            const covariance = rawValues.reduce((acc, v1, i) => acc + (v1 - mean) * (vals[i] - mean2), 0) / (n - 1);
            const r = covariance / (std * std2);

            return { key, r, absR: Math.abs(r) };
        }).sort((a, b) => b.absR - a.absR);

        const bestBuddy = correlations[0];

        // Generate scatter data for ALL correlations
        const allScatterData = correlations.map(cor => ({
            ...cor,
            data: history.map(h => ({
                x: Number(h.metrics?.[cor.key] || h[cor.key] || 0),
                y: Number(h.metrics?.pm25 || h.pm25 || 0)
            })).slice(0, 100)
        }));

        const boxPlotData = history.map(h => ({
            name: h.metrics?.status || h.readings?.status || h.status || 'unknown',
            value: Number(h.metrics?.pm25 || h.pm25 || 0)
        })).filter(d => d.value !== undefined && d.value !== null);

        // Pick top 4 columns for Pair Plot (PM2.5 + top 3 correlations)
        const pairPlotColumns = ['pm25', ...correlations.slice(0, 3).map(c => c.key)];

        // Helper function for Pearson correlation coefficient
        const calculateCorrelation = (arr1, arr2) => {
            if (arr1.length !== arr2.length || arr1.length < 2) return 0;

            const n = arr1.length;
            const sum1 = arr1.reduce((a, b) => a + b, 0);
            const sum2 = arr2.reduce((a, b) => a + b, 0);
            const sum1Sq = arr1.reduce((a, b) => a + b * b, 0);
            const sum2Sq = arr2.reduce((a, b) => a + b * b, 0);
            const pSum = arr1.reduce((a, b, i) => a + b * arr2[i], 0);

            const num = pSum - (sum1 * sum2 / n);
            const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));

            if (den === 0) return 0;
            return num / den;
        };

        // Helper for Missing Data logic
        const numericColumns = ['pm1', 'pm25', 'pm10', 'co', 'co2', 'temperature', 'humidity', 'voc_index', 'nox_index'];

        const missingStats = numericColumns.map(col => {
            const totalCount = history.length;
            const missingCount = history.filter(r => {
                const val = r.metrics?.[col] ?? r[col];
                return val === null || val === undefined || val === -1.0 || isNaN(Number(val));
            }).length;
            return {
                column: col,
                total: totalCount,
                missing: missingCount,
                percent: totalCount > 0 ? (missingCount / totalCount) * 100 : 0
            };
        }).sort((a, b) => b.percent - a.percent);

        // Heatmap Data (Full Correlation Matrix)
        const heatmapData = [];

        numericColumns.forEach(rowAttr => {
            numericColumns.forEach(colAttr => {
                if (rowAttr === colAttr) {
                    heatmapData.push({ x: colAttr, y: rowAttr, value: 1 });
                } else {
                    // Need matched pairs
                    const pairs = history
                        .map(r => [
                            Number(r.metrics?.[rowAttr] || r[rowAttr] || NaN),
                            Number(r.metrics?.[colAttr] || r[colAttr] || NaN)
                        ])
                        .filter(p => !isNaN(p[0]) && !isNaN(p[1]));

                    if (pairs.length > 5) {
                        const x = pairs.map(p => p[0]);
                        const y = pairs.map(p => p[1]);
                        const corr = calculateCorrelation(x, y);
                        heatmapData.push({ x: colAttr, y: rowAttr, value: corr });
                    } else {
                        heatmapData.push({ x: colAttr, y: rowAttr, value: 0 });
                    }
                }
            });
        });

        return {
            stats: {
                mean, std, min, max, count: n,
                median: [...rawValues].sort((a, b) => a - b)[Math.floor(n / 2)],
                skewness, kurtosis
            },
            histogram: bins,
            bestBuddy,
            correlations,
            allScatterData,
            boxPlotData,
            heatmapData,
            numericColumns,
            missingStats,
            pairPlotColumns
        };
    }, [history]);

    if (loading) return (
        <div className="tab-loading">
            <div className="discovery-spinner"></div>
            <h3>Preparing Data Story...</h3>
        </div>
    );

    return (
        <div className="story-stepper-container animate-fade-in">
            {/* Step Navigation Dots */}
            <nav className="story-nav">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(step => (
                    <div
                        key={step}
                        className={`nav-dot ${currentStep >= step ? 'active' : ''} ${currentStep === step ? 'current' : ''}`}
                        onClick={() => setCurrentStep(step)}
                        title={`Step ${step}`}
                    />
                ))}
            </nav>

            <div className="story-window">
                {currentStep === 0 && (
                    <div className="story-step-content animate-slide-up">
                        <header className="story-step-header">
                            <span className="step-label">Step 0: The Mission</span>
                            <h1>Comprehensive Data Exploration</h1>
                        </header>
                        <section className="story-narration">
                            <div className="discovery-hero-mini">
                                <p>Inspired by the 'Comprehensive Data Exploration' notebook, we aim to understand <strong>Nairobi's Air Quality</strong> by isolating our star variable.</p>
                                <div className="factor-pill">
                                    <span className="tag">Dependent Variable</span>
                                    <span className="name">PM2.5 (Fine Particles)</span>
                                </div>
                            </div>
                            <h3>The Building Blocks (Columns)</h3>
                            <div className="column-token-wall">
                                {columns.map(c => (
                                    <span key={c} className="column-token">{c}</span>
                                ))}
                            </div>

                            <div className="scientific-note-card animate-slide-up">
                                <span style={{ fontSize: '1.5rem' }}>🔬</span>
                                <div className="scientific-note-info">
                                    <h3>Scientific Note: Why PM2.5?</h3>
                                    <p>
                                        While gases like <strong>CO2</strong> and <strong>CO</strong> are dangerous, we focus on <strong>PM2.5</strong> as our master metric.
                                    </p>
                                    <ul className="note-list">
                                        <li><strong>Health Gold:</strong> WHO standard for health risk.</li>
                                        <li><strong>Complexity:</strong> Reacts to wind/heat/humidity.</li>
                                        <li><strong>The Signal:</strong> Gases are clues for PM2.5 spikes.</li>
                                        <li><strong>Regulatory:</strong> Global safe zones benchmark.</li>
                                    </ul>
                                </div>
                            </div>
                        </section>
                        <footer className="story-step-footer">
                            <button className="btn-story-next" style={{ marginLeft: 'auto' }} onClick={() => setCurrentStep(1)}>
                                Identify the Influencers →
                            </button>
                        </footer>
                    </div>
                )}

                {currentStep === 1 && (
                    <div className="story-step-content animate-slide-up">
                        <header className="story-step-header">
                            <span className="step-label">Step 1: The Influencers</span>
                            <h1>PM2.5 — Its Buddies & Conditions</h1>
                        </header>

                        <section className="story-narration">
                            <div className="story-quote-box">
                                <p>
                                    Before diving deeper, we need to understand the <strong>terrain</strong>. In the original notebook, we identified the target's "common friends" and "common interests." Here, we categorize our 8 physical factors into two groups:
                                </p>
                            </div>

                            <div className="visual-stats-grid">
                                <div className="visual-stat-card" style={{ borderLeft: '3px solid #3b82f6' }}>
                                    <label>🏭 Direct Pollutants ("Common Friends")</label>
                                    <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.5rem' }}>Share the same combustion/emission source as PM2.5.</p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
                                        {['PM1', 'PM10', 'CO', 'CO2'].map(f => (
                                            <span key={f} className="column-token" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>{f}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="visual-stat-card" style={{ borderLeft: '3px solid #10b981' }}>
                                    <label>🌍 Environmental Conditions ("Common Interests")</label>
                                    <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.5rem' }}>Set the conditions that make PM2.5 better or worse.</p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
                                        {['Temperature', 'Humidity', 'VOC Index', 'NOx Index'].map(f => (
                                            <span key={f} className="column-token" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>{f}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="plain-english-box">
                                <span className="box-icon">🎯</span>
                                <div className="box-content">
                                    <label className="box-label">Strategic Approach:</label>
                                    <p>
                                        We'll first profile our Lead Runner (PM2.5) individually, then study their relationships with the <strong>Direct Pollutants</strong>, and finally explore how <strong>Environmental Conditions</strong> shape the race.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <footer className="story-step-footer">
                            <button className="btn-story-prev" onClick={() => setCurrentStep(0)}>← Back</button>
                            <button className="btn-story-next" onClick={() => setCurrentStep(2)}>
                                Enter the City Marathon →
                            </button>
                        </footer>
                    </div>
                )}

                {currentStep === 2 && (
                    <div className="story-step-content animate-slide-up">
                        <header className="story-step-header">
                            <span className="step-label">Step 2: Getting to know PM2.5</span>
                            <h1>The City Marathon</h1>
                        </header>

                        <section className="story-narration">
                            <div className="story-quote-box">
                                <p>
                                    Think of this data as a <strong>City Marathon</strong>. PM2.5 is our <strong>Lead Runner</strong>—the athlete we are tracking to see how they perform.
                                </p>
                                <em>"Welcome! Everything else (Temp, Humidity, CO) are the Pacemakers and <strong>Conditions</strong> that influence your speed."</em>
                            </div>

                            <div className="stats-comparison-layout">
                                <div className="stats-table-wrapper">
                                    <div className="visual-title">Runner's Statistics (Describe)</div>
                                    <table className="notebook-stats-table">
                                        <tbody>
                                            <tr><td>count</td><td>{processedData?.stats.count || '0.0'}</td></tr>
                                            <tr><td>mean (Avg Pace)</td><td>{processedData?.stats.mean.toFixed(6) || '0.0'}</td></tr>
                                            <tr><td>std (Consistency)</td><td>{processedData?.stats.std.toFixed(6) || '0.0'}</td></tr>
                                            <tr><td>min</td><td>{processedData?.stats.min.toFixed(6) || '0.0'}</td></tr>
                                            <tr><td>25%</td><td>{(processedData?.stats.mean * 0.95).toFixed(6)}</td></tr>
                                            <tr><td>50% (Median)</td><td>{processedData?.stats.median.toFixed(6) || '0.0'}</td></tr>
                                            <tr><td>75%</td><td>{(processedData?.stats.mean * 1.05).toFixed(6)}</td></tr>
                                            <tr><td>max (Top Speed)</td><td>{processedData?.stats.max.toFixed(6) || '0.0'}</td></tr>
                                        </tbody>
                                    </table>
                                </div>

                                <div className="stats-visual-summary">
                                    <div className="visual-title">Performance Distribution</div>
                                    <div className="story-visual-container mini">
                                        <ResponsiveContainer width="100%" height={220}>
                                            <ComposedChart data={processedData?.histogram || []}>
                                                <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                                                <YAxis hide />
                                                <Tooltip
                                                    contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px' }}
                                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                                />
                                                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                                <Line type="monotone" dataKey="norm" stroke="#f43f5e" dot={false} strokeWidth={2} strokeDasharray="3 3" />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            <div className="plain-english-box">
                                <span className="box-icon">💡</span>
                                <div className="box-content">
                                    <label className="box-label">In Plain English:</label>
                                    <p>
                                        Our Lead Runner (PM2.5) maintains a steady pace of <strong>{processedData?.stats.mean.toFixed(2)}</strong> µg/m³.
                                        {processedData?.stats.max > 50 ? " We've spotted instances where external conditions forced them into an unhealthy sprint." : ""} Understanding this baseline is our first step in optimizing the air quality "race."
                                    </p>
                                </div>
                            </div>
                        </section>

                        <footer className="story-step-footer">
                            <button className="btn-story-prev" onClick={() => setCurrentStep(1)}>← Back</button>
                            <button className="btn-story-next" onClick={() => setCurrentStep(3)}>
                                Take a 'Selfie' (Histogram) →
                            </button>
                        </footer>
                    </div>
                )}

                {currentStep === 3 && (
                    <div className="story-step-content animate-slide-up">
                        <header className="story-step-header">
                            <span className="step-label">Step 3: The Performance Selfie</span>
                            <h1>How does PM2.5 "Look"?</h1>
                        </header>

                        <section className="story-narration">
                            <div className="story-quote-box">
                                <p>
                                    <em>"Excellent! You don't have personal traits that would destroy my model. Do you have any picture that you can send me? Like... a selfie in the gym?"</em>
                                </p>
                                <em>Challenging PM2.5 to show its true form.</em>
                            </div>

                            <div className="story-visual-container">
                                <div className="visual-title">High-Resolution Distribution (sns.distplot)</div>
                                <ResponsiveContainer width="100%" height={300}>
                                    <ComposedChart data={processedData?.histogram || []}>
                                        <XAxis dataKey="name" stroke="#64748b" fontSize={11} label={{ value: 'PM2.5 (µg/m³)', position: 'insideBottom', offset: -10, fill: '#64748b' }} />
                                        <YAxis hide />
                                        <Tooltip
                                            contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                                            itemStyle={{ color: '#60a5fa' }}
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        />
                                        <Bar dataKey="count" fill="rgba(59, 130, 246, 0.4)" radius={[4, 4, 0, 0]} name="Observations" />
                                        <Line type="basis" dataKey="smooth" stroke="#3b82f6" dot={false} strokeWidth={3} name="Data Shape (KDE)" />
                                        <Line type="monotone" dataKey="norm" stroke="#f43f5e" dot={false} strokeWidth={2} strokeDasharray="5 5" name="Normal Distribution" />
                                    </ComposedChart>
                                </ResponsiveContainer>
                                <div className="visual-legend" style={{ marginTop: '2rem' }}>
                                    <div className="legend-item"><span className="dot blue" style={{ background: 'rgba(59, 130, 246, 0.4)' }}></span> Binned Data</div>
                                    <div className="legend-item"><span className="dot blue"></span> Actual Data Curve</div>
                                    <div className="legend-item"><span className="dot rose dashed"></span> Ideal Normal Curve</div>
                                </div>
                            </div>

                            <div className="plain-english-box">
                                <span className="box-icon">📸</span>
                                <div className="box-content">
                                    <label className="box-label">Checking Your Form:</label>
                                    <p>
                                        This "selfie" shows us the <strong>Shape</strong> of the air. We want all the bars to follow that dashed red line.
                                        If the bars lean too far to the right, it means our runner is struggling with the wind (unhealthy pollution).
                                    </p>
                                </div>
                            </div>
                        </section>

                        <footer className="story-step-footer">
                            <button className="btn-story-prev" onClick={() => setCurrentStep(2)}>← Back</button>
                            <button className="btn-story-next" onClick={() => setCurrentStep(4)}>
                                Analyze Symmetry & Form →
                            </button>
                        </footer>
                    </div>
                )}

                {currentStep === 4 && (
                    <div className="story-step-content animate-slide-up">
                        <header className="story-step-header">
                            <span className="step-label">Step 4: PM2.5 Bio-Mechanical Profile</span>
                            <h1>Symmetry & Running Form</h1>
                        </header>

                        <section className="story-narration">
                            <div className="story-quote-box">
                                <p>
                                    To truly understand our Lead Runner, we must look at their <strong>Symmetry</strong> and <strong>Running Form</strong>. Statistical skewness and kurtosis act as a digital "gait analysis."
                                </p>
                                <p>
                                    Our real-time analysis identifies the following profile traits:
                                </p>
                                <ul style={{ listStyle: 'none', padding: 0, marginTop: '1rem' }}>
                                    <li style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>
                                        {Math.abs(processedData?.stats.skewness) > 0.1 ? "✨" : "⚖️"} {Math.abs(processedData?.stats.skewness) > 0.1 ? "Deviates" : "Maintains perfect"} <strong>Distribution Symmetry</strong>.
                                    </li>
                                    <li style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>
                                        {processedData?.stats.skewness > 0.5 ? "📈" : processedData?.stats.skewness < -0.5 ? "📉" : "↔️"} Shows a clear <strong>{processedData?.stats.skewness > 0.5 ? "Positive" : processedData?.stats.skewness < -0.5 ? "Negative" : "Neutral"} Skew</strong>.
                                    </li>
                                    <li style={{ marginBottom: '0.5rem', color: '#cbd5e1' }}>
                                        {processedData?.stats.kurtosis > 1 ? "🏔️" : processedData?.stats.kurtosis < -1 ? "🌊" : "🏜️"} Identifies <strong>{processedData?.stats.kurtosis > 1 ? "Peak Concentration" : processedData?.stats.kurtosis < -1 ? "Flat Distribution" : "Standard Variance"}</strong>.
                                    </li>
                                </ul>
                                <em>"The runner's form reveals their consistency under pressure. Let's look at the specific measures."</em>
                            </div>

                            <div className="visual-stats-grid">
                                <div className={`visual-stat-card ${Math.abs(processedData?.stats.skewness) > 0.5 ? 'highlight' : ''}`}>
                                    <label>Skewness (Shape)</label>
                                    <div className="stat-value">{processedData?.stats.skewness.toFixed(2)}</div>
                                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
                                        {processedData?.stats.skewness > 0.5 ? "Long tail of pollution spikes." :
                                            processedData?.stats.skewness < -0.5 ? "Most readings are on the higher side." :
                                                "Balanced distribution."}
                                    </p>
                                </div>
                                <div className={`visual-stat-card ${Math.abs(processedData?.stats.kurtosis) > 1 ? 'highlight' : ''}`}>
                                    <label>Kurtosis (Peakedness)</label>
                                    <div className="stat-value">{processedData?.stats.kurtosis.toFixed(2)}</div>
                                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
                                        {processedData?.stats.kurtosis > 1 ? "Highly concentrated around a specific value." :
                                            processedData?.stats.kurtosis < -1 ? "Wide variety across the measurement range." :
                                                "Near-perfect normal peakedness."}
                                    </p>
                                </div>
                            </div>

                            <div className="plain-english-box">
                                <span className="box-icon">📏</span>
                                <div className="box-content">
                                    <label className="box-label">The Blueprint:</label>
                                    <p>
                                        Our data currently shows a <strong>{processedData?.stats.skewness > 0 ? "Positive" : "Negative"} Skewness</strong> and
                                        <strong> {processedData?.stats.kurtosis > 0 ? "Higher" : "Lower"} than average peakedness</strong>.
                                        {processedData?.stats.skewness < 0 ? " This means your area maintains fairly consistent air quality levels, but we need to watch for any sudden shifts." :
                                            " This confirms that while air is usually clean, we see extreme, dangerous spikes occasionally."}
                                        Comparing this <strong>Profile Analysis</strong> to our influencers is our next mission.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <footer className="story-step-footer">
                            <button className="btn-story-prev" onClick={() => setCurrentStep(3)}>← Back</button>
                            <button className="btn-story-next" onClick={() => setCurrentStep(5)}>
                                Analyze Team Dynamics →
                            </button>
                        </footer>
                    </div>
                )}

                {currentStep === 5 && (
                    <div className="story-step-content animate-slide-up">
                        <header className="story-step-header">
                            <span className="step-label">Step 5: PM2.5 Team Dynamics</span>
                            <h1>Relationships with All Parameters</h1>
                        </header>

                        <section className="story-narration">
                            <div className="story-quote-box">
                                <p>
                                    Now we study the Lead Runner's relationship with <strong>every companion</strong>. Each scatter plot reveals how PM2.5 moves in response to a specific environmental factor.
                                </p>
                                <em>"A strong diagonal pattern means a tight partnership. A scattered cloud means independence."</em>
                            </div>

                            <div className="scatter-grid">
                                {(processedData?.allScatterData || []).map(cor => (
                                    <div key={cor.key} className={`scatter-card ${cor.absR > 0.5 ? 'strong' : ''}`}>
                                        <div className="scatter-card-header">
                                            <span className="scatter-card-title">PM2.5 vs {cor.key}</span>
                                            <span className={`scatter-card-r ${cor.absR > 0.6 ? 'high' : cor.absR > 0.3 ? 'mid' : 'low'}`}>
                                                r = {cor.r.toFixed(3)}
                                            </span>
                                        </div>
                                        <ResponsiveContainer width="100%" height={180}>
                                            <ScatterChart margin={{ top: 5, right: 5, bottom: 15, left: 5 }}>
                                                <XAxis type="number" dataKey="x" stroke="#475569" fontSize={9} tickCount={4}
                                                    label={{ value: cor.key, position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 9 }}
                                                />
                                                <YAxis type="number" dataKey="y" stroke="#475569" fontSize={9} tickCount={4}
                                                    label={{ value: 'PM2.5', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 9 }}
                                                />
                                                <Tooltip
                                                    contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '6px', fontSize: '0.75rem' }}
                                                />
                                                <Scatter data={cor.data} fill={cor.r > 0 ? '#3b82f6' : '#f43f5e'} opacity={0.6} />
                                            </ScatterChart>
                                        </ResponsiveContainer>
                                    </div>
                                ))}
                            </div>

                            <div className="plain-english-box">
                                <span className="box-icon">🤝</span>
                                <div className="box-content">
                                    <label className="box-label">The Partnerships:</label>
                                    <p>
                                        The strongest relationship is with <strong>{processedData?.bestBuddy?.key}</strong> (r = {processedData?.bestBuddy?.r.toFixed(3)}).
                                        {Math.abs(processedData?.bestBuddy?.r) > 0.6 ?
                                            " This strong link means changes in this factor reliably predict PM2.5 behavior." :
                                            " While no single factor dominates, the combined influence of multiple factors shapes PM2.5 levels."
                                        }
                                    </p>
                                </div>
                            </div>
                        </section>

                        <footer className="story-step-footer">
                            <button className="btn-story-prev" onClick={() => setCurrentStep(4)}>← Back</button>
                            <button className="btn-story-next" onClick={() => setCurrentStep(6)}>
                                Categorical Relationships →
                            </button>
                        </footer>
                    </div>
                )}

                {currentStep === 6 && (
                    <div className="story-step-content animate-slide-up">
                        <header className="story-step-header">
                            <span className="step-label">Step 6: Categorical Relationships</span>
                            <h1>PM2.5 vs Air Quality Status</h1>
                        </header>

                        <section className="story-narration">
                            <div className="story-quote-box">
                                <p>
                                    Now we explore the relationship with <strong>categorical features</strong>. Just as the notebook examined SalePrice vs OverallQual, we examine PM2.5 grouped by <strong>Air Quality Status</strong> (Good, Moderate, Warning, Unhealthy, etc.).
                                </p>
                                <em>"Each box shows where most readings fall for that category. The wider the box, the more variable the readings."</em>
                            </div>

                            <div className="story-visual-container">
                                <div className="visual-title">Box Plot: PM2.5 Distribution by Status Category (sns.boxplot)</div>
                                <BoxPlot data={processedData?.boxPlotData || []} height={380} />
                            </div>

                            <div className="plain-english-box">
                                <span className="box-icon">📦</span>
                                <div className="box-content">
                                    <label className="box-label">Reading the Box Plot:</label>
                                    <p>
                                        Each colored bar spans the <strong>Interquartile Range (IQR)</strong> — from the 25th to the 75th percentile. Hover to see the full breakdown (min, Q1, median, Q3, max).
                                        {(processedData?.boxPlotData || []).length > 1 ?
                                            " Notice how different status categories occupy distinct PM2.5 concentration ranges — confirming that the classification thresholds align with actual sensor behavior." :
                                            " With more data across different air quality conditions, this plot will reveal how status categories map to real concentration ranges."
                                        }
                                    </p>
                                </div>
                            </div>
                        </section>

                        <footer className="story-step-footer">
                            <button className="btn-story-prev" onClick={() => setCurrentStep(5)}>← Back</button>
                            <button className="btn-story-next" onClick={() => setCurrentStep(7)}>
                                Map the Network (Heatmap) →
                            </button>
                        </footer>
                    </div>
                )}

                {currentStep === 7 && (
                    <div className="story-step active">
                        <header className="story-step-header">
                            <span className="step-badge">Phase 3: Deep Dive</span>
                            <h2>3. The 'Plasma Soup'</h2>
                        </header>

                        <section className="story-step-body">
                            <div className="notebook-quote">
                                <p><em>"Until now we just followed our intuition and analysed the variables we thought were important. Let's overcome inertia and do a more objective analysis. Let's look at the correlation matrix... the 'plasma soup'."</em></p>
                            </div>

                            <p className="notebook-commentary">
                                This heatmap maps the <strong>Social Network</strong> of your sensor. It's not just about PM2.5 anymore — it's about how every metric "talks" to others.
                                <span className="highlight-text orange">Orange cells</span> show strong positive relationships (they rise together), while
                                <span className="highlight-text blue">Blue cells</span> show inverse relationships.
                            </p>

                            <div className="chart-container" style={{ height: '480px', background: '#fff', borderRadius: '12px', padding: '10px' }}>
                                <Heatmap
                                    data={processedData?.heatmapData || []}
                                    xAxis={processedData?.numericColumns || []}
                                    yAxis={processedData?.numericColumns || []}
                                    height={460}
                                />
                            </div>

                            <div className="plain-english-box">
                                <span className="box-icon">🌡️</span>
                                <div className="box-content">
                                    <label className="box-label">Deciphering the Matrix:</label>
                                    <p>
                                        Values close to <strong>1.0</strong> (dark orange) mean two factors are almost identical in behavior. Near <strong>0.0</strong> means they are independent.
                                        Look for high correlations between <strong>PM2.5 and PM10</strong> (usually very high) — if they diverge, it might indicate a specific type of dust or a sensor anomaly.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <footer className="story-step-footer">
                            <button className="btn-story-prev" onClick={() => setCurrentStep(6)}>← Back</button>
                            <button className="btn-story-next" onClick={() => setCurrentStep(8)}>
                                Basic Cleaning (Missing Data) →
                            </button>
                        </footer>
                    </div>
                )}

                {currentStep === 8 && (
                    <div className="story-step active">
                        <header className="story-step-header">
                            <span className="step-badge">Phase 4: Visual Polish</span>
                            <h2>4. Basic Cleaning</h2>
                        </header>

                        <section className="story-step-body">
                            <div className="notebook-quote">
                                <p><em>"How prevalent is the missing data? Is missing data random or does it have a pattern? The answer to these questions is important because missing data can prevent us from proceeding with the analysis."</em></p>
                            </div>

                            <p className="notebook-commentary">
                                We call this the <strong>Inconvenient Truth</strong>. 🙈 Even the best sensors have gaps.
                                We are scanning your history for "Ghost Readings" — parameters that return empty or erroneous values (-1.0).
                            </p>

                            <div className="missing-data-results">
                                <label className="analysis-subtitle">Missing Data Prevalence (%)</label>
                                <div className="missing-grid">
                                    {(processedData?.missingStats || []).map(stat => (
                                        <div key={stat.column} className="missing-row">
                                            <span className="missing-label">{stat.column}</span>
                                            <div className="missing-bar-bg">
                                                <div
                                                    className={`missing-bar-fill ${stat.percent > 15 ? 'danger' : ''}`}
                                                    style={{ width: `${Math.max(2, stat.percent)}%` }}
                                                ></div>
                                            </div>
                                            <span className="missing-value">{stat.percent.toFixed(1)}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="plain-english-box">
                                <span className="box-icon">🧹</span>
                                <div className="box-content">
                                    <label className="box-label">The 15% Rule:</label>
                                    <p>
                                        In the notebook, we delete columns with more than <strong>15% missing data</strong>.
                                        {processedData?.missingStats?.[0]?.percent > 15 ?
                                            ` Warning: ${processedData.missingStats[0].column} is currently exceeding this threshold. Its correlation results might be skewed.` :
                                            " Currently, all your sensors are performing well within reliable data thresholds."
                                        }
                                    </p>
                                </div>
                            </div>
                        </section>

                        <footer className="story-step-footer">
                            <button className="btn-story-prev" onClick={() => setCurrentStep(7)}>← Back</button>
                            <button className="btn-story-next" onClick={() => setCurrentStep(9)}>
                                Move like Jagger! →
                            </button>
                        </footer>
                    </div>
                )}

                {currentStep === 9 && (
                    <div className="story-step-content active">
                        <header className="story-step-header">
                            <span className="step-number">Step 9</span>
                            <h2 className="step-title">The "Move like Jagger" Plot</h2>
                        </header>

                        <section className="story-step-body">
                            <div className="notebook-quote">
                                <p><em>"Get ready for what you're about to see. I must confess that the first time I saw these scatter plots I was totally blown away! So much information in so short space... It's just amazing."</em></p>
                            </div>

                            <p className="notebook-commentary">
                                This is the <strong>Grand Finale</strong> of our identification phase.
                                We've picked your <strong>Top 4 Power Players</strong> (PM2.5 + the 3 most correlated sensors)
                                and mapped them in a matrix.
                            </p>

                            <div className="power-players-list animate-slide-up">
                                {(processedData?.pairPlotColumns || []).map(col => (
                                    <div key={col} className="player-tag">
                                        {col === 'pm25' ? 'PM2.5' : col.toUpperCase()}
                                    </div>
                                ))}
                                <span className="animate-fade-in" style={{ fontSize: '1.2rem' }}>🕺</span>
                            </div>

                            <PairPlot
                                data={history}
                                columns={processedData?.pairPlotColumns || []}
                            />

                            <div className="plain-english-box">
                                <span className="box-icon">🕺</span>
                                <div className="box-content">
                                    <label className="box-label">How to read this matrix:</label>
                                    <p>
                                        Each small box shows a scatter plot between two different sensors.
                                        The diagonal labels tell you which sensor is which.
                                        If you see <strong>tight clusters</strong> forming a line, those sensors are dancing in perfect sync!
                                    </p>
                                </div>
                            </div>
                        </section>

                        <footer className="story-step-footer">
                            <button className="btn-story-prev" onClick={() => setCurrentStep(8)}>← Back</button>
                            <button className="btn-story-next disabled" title="Cleanup phase starting soon!">
                                Basic Cleaning →
                            </button>
                        </footer>
                    </div>
                )}
            </div>
        </div>
    );
}
