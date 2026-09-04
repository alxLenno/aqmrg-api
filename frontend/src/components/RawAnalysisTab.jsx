import React, { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Area, Bar } from 'recharts';
import { fetchSampledHistory } from '../api/dashboard';
import { METRIC_CONFIG, formatMetricLabel, getMetricUnit, discoverMetrics, extractMetrics } from '../utils/metrics';

const LOCAL_GRAFANA_DASHBOARD = 'http://localhost:3000/d/air_quality_dash/air-quality-real-time-monitor?orgId=1&kiosk';
const GRAFANA_BASE_URL = (() => {
    try {
        const raw = import.meta.env.VITE_GRAFANA_DASHBOARD_URL || (import.meta.env.DEV ? LOCAL_GRAFANA_DASHBOARD : '');
        return new URL(raw.trim()).origin;
    } catch { return 'http://localhost:3000'; }
})();
const GRAFANA_DASHBOARD_URL = (
    import.meta.env.VITE_GRAFANA_DASHBOARD_URL || (import.meta.env.DEV ? LOCAL_GRAFANA_DASHBOARD : '')
).trim();

function parseReadingDate(value) {
    const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateISO(date) {
    if (!date || Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatISOWeek(date) {
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
    return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getISOWeekStart(weekValue) {
    const match = /^(\d{4})-W(\d{2})$/.exec(weekValue);
    if (!match) return null;
    const year = Number(match[1]);
    const week = Number(match[2]);
    const januaryFourth = new Date(year, 0, 4);
    const mondayOffset = (januaryFourth.getDay() + 6) % 7;
    const monday = new Date(year, 0, 4 - mondayOffset + ((week - 1) * 7));
    monday.setHours(0, 0, 0, 0);
    return monday;
}

function getGrafanaTimeRange(bucket, values) {
    let start;
    let end;

    if (bucket === 'hourly') {
        start = new Date(`${values.date}T00:00:00`);
        start.setHours(Number(values.hour), 0, 0, 0);
        end = new Date(start);
        end.setHours(end.getHours() + 1);
    } else if (bucket === 'daily') {
        start = new Date(`${values.date}T00:00:00`);
        end = new Date(start);
        end.setDate(end.getDate() + 1);
    } else if (bucket === 'weekly') {
        start = getISOWeekStart(values.week);
        end = start ? new Date(start) : null;
        end?.setDate(end.getDate() + 7);
    } else if (bucket === 'monthly') {
        const [year, month] = values.month.split('-').map(Number);
        start = new Date(year, month - 1, 1);
        end = new Date(year, month, 1);
    } else {
        start = new Date(Number(values.year), 0, 1);
        end = new Date(Number(values.year) + 1, 0, 1);
    }

    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return { from: start.getTime(), to: end.getTime() };
}

function fallbackMetricColor(key) {
    const hue = [...key].reduce((total, character) => total + character.charCodeAt(0), 0) % 360;
    return `hsl(${hue}, 70%, 50%)`;
}

/**
 * RawAnalysisTab — Deep-dive time-series exploration.
 * Supports Hourly, Daily, Weekly, Monthly, Yearly granularities.
 */
export default function RawAnalysisTab({ selectedDevice }) {
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState([]);
    const [error, setError] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);
    const [viewMode, setViewMode] = useState('charts');
    const [activeBuckets, setActiveBuckets] = useState('daily'); // hourly, daily, weekly, monthly, yearly
    // Grafana iframe state: 'loading' | 'loaded' | 'error' | 'blocked'
    const [iframeStatus, setIframeStatus] = useState('loading');
    const [iframeRetryKey, setIframeRetryKey] = useState(0);

    // Allow custom live production Grafana URL override
    const [customGrafanaUrl, setCustomGrafanaUrl] = useState(() => {
        try {
            return localStorage.getItem('aqmrg_custom_grafana_url') || '';
        } catch { return ''; }
    });
    const [urlInput, setUrlInput] = useState('');

    const effectiveBaseDashboardUrl = (customGrafanaUrl || GRAFANA_DASHBOARD_URL).trim();

    const isMixedContentBlocked = useMemo(() => {
        if (typeof window === 'undefined') return false;
        if (window.location.protocol !== 'https:') return false;
        try {
            const u = new URL(effectiveBaseDashboardUrl);
            return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
        } catch {
            return false;
        }
    }, [effectiveBaseDashboardUrl]);

    // Liveness probe: verify Grafana port is reachable via no-cors fetch (avoids CORS block)
    useEffect(() => {
        if (viewMode !== 'grafana' || !effectiveBaseDashboardUrl) return;
        if (isMixedContentBlocked) {
            setIframeStatus('blocked');
            return;
        }

        let cancelled = false;
        setIframeStatus('loading');

        const probe = async () => {
            try {
                let baseUrl = 'http://localhost:3000';
                try { baseUrl = new URL(effectiveBaseDashboardUrl).origin; } catch {}
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 4000);
                await fetch(`${baseUrl}/api/health`, {
                    mode: 'no-cors',
                    signal: controller.signal,
                    cache: 'no-store'
                });
                clearTimeout(timer);
            } catch (err) {
                if (!cancelled) {
                    console.warn('[Grafana unreachable]', err);
                    setIframeStatus('error');
                }
            }
        };

        probe();
        return () => { cancelled = true; };
    }, [viewMode, iframeRetryKey, effectiveBaseDashboardUrl, isMixedContentBlocked]);

    // Discovered keys for the charts
    const activeMetricKeys = useMemo(() => {
        const hList = Array.isArray(history) ? history : [];
        return discoverMetrics(hList);
    }, [history]);

    const parameters = useMemo(() => {
        return activeMetricKeys.map(key => ({
            key,
            label: formatMetricLabel(key),
            unit: getMetricUnit(key),
            color: METRIC_CONFIG[key]?.color || fallbackMetricColor(key)
        }));
    }, [activeMetricKeys]);

    // Selectors state
    const [selectedDate, setSelectedDate] = useState(() => {
        return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    });

    const [selectedHour, setSelectedHour] = useState(new Date().getHours());
    const [selectedMonth, setSelectedMonth] = useState(() => formatDateISO(new Date()).slice(0, 7)); // YYYY-MM
    const [selectedWeek, setSelectedWeek] = useState(() => formatISOWeek(new Date()));
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    
    // Sub-navigation for granularity
    const granularities = [
        { id: 'hourly', label: 'Hourly' },
        { id: 'daily', label: 'Daily' },
        { id: 'weekly', label: 'Weekly' },
        { id: 'monthly', label: 'Monthly' },
        { id: 'yearly', label: 'Yearly' }
    ];

    useEffect(() => {
        let mounted = true;
        async function load() {
            setLoading(true);
            setError('');
            try {
                const data = await fetchSampledHistory(3000, selectedDevice);
                if (!mounted) return;

                const historyList = Array.isArray(data) ? data : [];
                setHistory(historyList);

                const dates = historyList
                    .map(record => parseReadingDate(record.recorded_at || record.timestamp))
                    .filter(Boolean);
                if (dates.length > 0) {
                    const latestDate = new Date(Math.max(...dates.map(date => date.getTime())));
                    const localDate = formatDateISO(latestDate);
                    setSelectedDate(localDate);
                    setSelectedHour(latestDate.getHours());
                    setSelectedWeek(formatISOWeek(latestDate));
                    setSelectedMonth(localDate.slice(0, 7));
                    setSelectedYear(latestDate.getFullYear());
                }
            } catch (err) {
                console.error("Analysis data fetch failed:", err);
                if (mounted) {
                    setHistory([]);
                    setError(err instanceof Error ? err.message : 'Unable to load historical readings.');
                }
            } finally {
                if (mounted) setLoading(false);
            }
        }
        load();
        return () => { mounted = false; };
    }, [selectedDevice, refreshKey]);

    const grafanaDashboardUrl = useMemo(() => {
        if (!effectiveBaseDashboardUrl) return '';
        const range = getGrafanaTimeRange(activeBuckets, {
            date: selectedDate,
            hour: selectedHour,
            week: selectedWeek,
            month: selectedMonth,
            year: selectedYear
        });

        try {
            const url = new URL(effectiveBaseDashboardUrl);
            if (range) {
                url.searchParams.set('from', String(range.from));
                url.searchParams.set('to', String(range.to));
            }
            if (selectedDevice) url.searchParams.set('var-sensor_id', selectedDevice);
            return url.toString();
        } catch {
            return effectiveBaseDashboardUrl;
        }
    }, [effectiveBaseDashboardUrl, activeBuckets, selectedDate, selectedHour, selectedWeek, selectedMonth, selectedYear, selectedDevice]);

    const aggregatedData = useMemo(() => {
        const historyList = Array.isArray(history) ? history : [];
        if (historyList.length === 0) return [];

        let rawData = historyList.map(item => {
            const rawStr = item.recorded_at || item.timestamp;
            const d = parseReadingDate(rawStr);
            return {
                ...item,
                _date: d,
                _localDate: formatDateISO(d)
            };
        }).filter(item => item._date);

        // 1. FILTERING
        let filtered = rawData;
        if (activeBuckets === 'hourly') {
            filtered = rawData.filter(d => 
                d._localDate === selectedDate && 
                d._date.getHours() === Number(selectedHour)
            );
        } else if (activeBuckets === 'daily') {
            filtered = rawData.filter(d => d._localDate === selectedDate);
        } else if (activeBuckets === 'weekly') {
            filtered = rawData.filter(d => formatISOWeek(d._date) === selectedWeek);
        } else if (activeBuckets === 'monthly') {
            filtered = rawData.filter(d => d._localDate.slice(0, 7) === selectedMonth);
        } else if (activeBuckets === 'yearly') {
            filtered = rawData.filter(d => d._date.getFullYear() === Number(selectedYear));
        }

        filtered.sort((a, b) => a._date - b._date);

        // 2. AGGREGATING
        if (activeBuckets === 'hourly') {
            // Show data as is
            return filtered.map(d => {
                const metrics = extractMetrics(d);
                const entry = {
                  name: d._date.toLocaleTimeString([], {minute:'2-digit', second:'2-digit'})
                };
                activeMetricKeys.forEach(k => {
                  const value = Number(metrics[k]);
                  entry[k] = Number.isFinite(value) ? value : null;
                });
                return entry;
            });
        }

        const groups = {};
        filtered.forEach(item => {
            const date = item._date;
            const dayOfMonth = date.getDate();
            let key = '';
            
            if (activeBuckets === 'daily') {
                key = `${date.getHours()}:00`; 
            } else if (activeBuckets === 'weekly') {
                key = date.toLocaleDateString([], {day:'numeric', month:'short'}); 
            } else if (activeBuckets === 'monthly') {
                const weekInMonth = Math.ceil(dayOfMonth / 7);
                key = `Week ${weekInMonth}`;
            } else if (activeBuckets === 'yearly') {
                key = date.toLocaleDateString([], {month:'short'}); 
            }

            if (!groups[key]) {
                const group = { 
                    name: key, 
                    sortKey: activeBuckets === 'monthly' ? dayOfMonth : 0 
                };
                activeMetricKeys.forEach(k => { group[k] = []; });
                groups[key] = group;
            }
            const metrics = extractMetrics(item);
            
            activeMetricKeys.forEach(k => {
              const value = Number(metrics[k]);
              if (Number.isFinite(value)) groups[key][k].push(value);
            });
        });

        const result = Object.values(groups).map(g => {
            const entry = {
              name: g.name,
              sortKey: g.sortKey
            };
            activeMetricKeys.forEach(k => {
              const list = g[k];
              const precision = (k === 'co' || k === 'o3') ? 2 : 1;
              entry[k] = list.length
                ? Number((list.reduce((a,b)=>a+b,0)/list.length).toFixed(precision))
                : null;
            });
            return entry;
        });

        if (activeBuckets === 'monthly') {
            result.sort((a, b) => a.sortKey - b.sortKey);
        }

        return result;
    }, [history, activeBuckets, selectedDate, selectedHour, selectedWeek, selectedMonth, selectedYear, activeMetricKeys]);


    if (loading) {
        return (
            <div className="tab-loading">
                <div className="discovery-spinner"></div>
                <h3>Processing Time-Series Aggregates...</h3>
            </div>
        );
    }

    return (
        <div className="raw-analysis-tab animate-fade-in">
            <header className="analysis-header">
                <div className="title-group">
                    <h1>Raw Parameter Analysis</h1>
                    <p>Time-bucketed aggregation for historical trend discovery.</p>
                    {GRAFANA_DASHBOARD_URL && (
                        <div className="view-switch" aria-label="Analysis view">
                            <button
                                type="button"
                                className={viewMode === 'charts' ? 'active' : ''}
                                onClick={() => setViewMode('charts')}
                            >
                                Built-in charts
                            </button>
                            <button
                                type="button"
                                className={viewMode === 'grafana' ? 'active' : ''}
                                onClick={() => setViewMode('grafana')}
                            >
                                Grafana
                            </button>
                        </div>
                    )}
                </div>
                
                <div className="filter-controls">
                    {/* Granular Selectors */}
                    {activeBuckets === 'hourly' && (
                        <>
                            <div className="date-picker-wrapper animate-slide-right">
                                <label>Date</label>
                                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="date-input" />
                            </div>
                            <div className="date-picker-wrapper animate-slide-right">
                                <label>Hour</label>
                                <select value={selectedHour} onChange={(e) => setSelectedHour(e.target.value)} className="date-input">
                                    {Array.from({length:24}, (_,i) => <option key={i} value={i}>{i}:00</option>)}
                                </select>
                            </div>
                        </>
                    )}
                    
                    {activeBuckets === 'daily' && (
                        <div className="date-picker-wrapper animate-slide-right">
                            <label>Pick a Day</label>
                            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="date-input" />
                        </div>
                    )}

                    {activeBuckets === 'weekly' && (
                        <div className="date-picker-wrapper animate-slide-right">
                            <label>Pick a Week</label>
                            <input type="week" value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)} className="date-input" />
                        </div>
                    )}

                    {activeBuckets === 'monthly' && (
                        <div className="date-picker-wrapper animate-slide-right">
                            <label>Pick a Month</label>
                            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="date-input" />
                        </div>
                    )}

                    {activeBuckets === 'yearly' && (
                        <div className="date-picker-wrapper animate-slide-right">
                            <label>Pick a Year</label>
                            <input 
                                type="number" 
                                min="2020" max="2100" 
                                value={selectedYear} 
                                onChange={(e) => setSelectedYear(e.target.value)} 
                                className="date-input"
                                style={{ width: '80px' }}
                            />
                        </div>
                    )}
                    
                    <nav className="bucket-nav">
                        {granularities.map(g => (
                            <button 
                                key={g.id} 
                                className={`bucket-btn ${activeBuckets === g.id ? 'active' : ''}`}
                                onClick={() => setActiveBuckets(g.id)}
                            >
                                {g.label}
                            </button>
                        ))}
                    </nav>
                </div>
            </header>

            {viewMode === 'grafana' && effectiveBaseDashboardUrl ? (
                <section className="grafana-card">
                    <div className="grafana-toolbar">
                        <div>
                            <h2>Grafana analysis</h2>
                            <p>The selected period and device are passed to the provisioned InfluxDB dashboard.</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {customGrafanaUrl && (
                                <button
                                    type="button"
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem',
                                        textDecoration: 'underline'
                                    }}
                                    onClick={() => {
                                        try { localStorage.removeItem('aqmrg_custom_grafana_url'); } catch {}
                                        setCustomGrafanaUrl('');
                                        setIframeStatus('loading');
                                        setIframeRetryKey(k => k + 1);
                                    }}
                                >
                                    Reset Custom URL
                                </button>
                            )}
                            <a href={grafanaDashboardUrl} target="_blank" rel="noreferrer">Open full screen ↗</a>
                        </div>
                    </div>

                    <div className="grafana-frame-wrapper" style={{ position: 'relative', width: '100%', minHeight: '750px' }}>
                        {isMixedContentBlocked && (
                            <div className="grafana-status grafana-error" style={{ padding: '36px 24px', maxWidth: '640px', margin: '0 auto' }}>
                                <div className="grafana-error-icon">
                                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5"/>
                                        <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                    </svg>
                                </div>
                                <h3>Production Grafana Instance Required</h3>
                                <p>
                                    You are viewing the live website on <code>{typeof window !== 'undefined' ? window.location.origin : ''}</code> (HTTPS), but Grafana is set to a local Docker address (<code>{effectiveBaseDashboardUrl}</code>).
                                    Browsers block insecure local HTTP connections from live HTTPS websites.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', marginTop: '12px' }}>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            type="url"
                                            placeholder="Paste Production Grafana URL (e.g. https://...)"
                                            value={urlInput}
                                            onChange={(e) => setUrlInput(e.target.value)}
                                            className="date-input"
                                            style={{ flex: 1, padding: '10px 14px', fontSize: '0.85rem' }}
                                        />
                                        <button
                                            type="button"
                                            style={{
                                                padding: '10px 18px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: 'var(--accent)',
                                                color: '#fff',
                                                fontWeight: 500,
                                                cursor: 'pointer'
                                            }}
                                            onClick={() => {
                                                if (urlInput.trim()) {
                                                    try {
                                                        localStorage.setItem('aqmrg_custom_grafana_url', urlInput.trim());
                                                    } catch {}
                                                    setCustomGrafanaUrl(urlInput.trim());
                                                    setIframeStatus('loading');
                                                    setIframeRetryKey(k => k + 1);
                                                }
                                            }}
                                        >
                                            Connect
                                        </button>
                                    </div>

                                    <div className="grafana-action-btns">
                                        <button
                                            type="button"
                                            onClick={() => setViewMode('charts')}
                                        >
                                            📊 Switch to Built-in Charts (Live Data)
                                        </button>
                                        <a
                                            href="https://dashboard.render.com/blueprints"
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            🚀 Deploy to Render Blueprint ↗
                                        </a>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!isMixedContentBlocked && iframeStatus === 'loading' && (
                            <div className="grafana-status grafana-loading" style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'var(--bg-card)' }}>
                                <div className="grafana-spinner">
                                    <svg viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="25" cy="25" r="20" stroke="var(--border)" strokeWidth="4"/>
                                        <path d="M25 5 A20 20 0 0 1 45 25" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round"/>
                                    </svg>
                                </div>
                                <p>Loading Grafana dashboard…</p>
                                <span>Connected to <code>{effectiveBaseDashboardUrl}</code></span>
                            </div>
                        )}

                        {!isMixedContentBlocked && iframeStatus === 'error' && (
                            <div className="grafana-status grafana-error">
                                <div className="grafana-error-icon">
                                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
                                        <path d="M12 7v5M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                    </svg>
                                </div>
                                <h3>Grafana is not reachable</h3>
                                <p>
                                    The dashboard at <code>{effectiveBaseDashboardUrl}</code> refused to connect.
                                    Grafana runs as a Docker service — make sure the stack is up.
                                </p>
                                <div className="grafana-error-actions">
                                    <div className="grafana-cmd">
                                        <code>docker compose up -d grafana</code>
                                    </div>
                                    <div className="grafana-action-btns">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIframeStatus('loading');
                                                setIframeRetryKey(k => k + 1);
                                            }}
                                        >
                                            ↺ Retry
                                        </button>
                                        <a href={grafanaDashboardUrl} target="_blank" rel="noreferrer">
                                            Open in new tab ↗
                                        </a>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!isMixedContentBlocked && iframeStatus !== 'error' && (
                            <iframe
                                key={iframeRetryKey}
                                title="AQMRG Grafana raw analysis"
                                src={grafanaDashboardUrl}
                                allowFullScreen
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    minHeight: '750px',
                                    border: 0,
                                    borderRadius: '12px',
                                    visibility: iframeStatus === 'loaded' ? 'visible' : 'hidden'
                                }}
                                onLoad={() => setIframeStatus('loaded')}
                                onError={() => setIframeStatus('error')}
                            />
                        )}
                    </div>
                </section>
            ) : (
                <>
                    {error && (
                        <div className="analysis-message error-message" role="alert">
                            <div>
                                <h2>Historical data could not be loaded</h2>
                                <p>{error}</p>
                            </div>
                            <button type="button" onClick={() => setRefreshKey(key => key + 1)}>Try again</button>
                        </div>
                    )}

                    {!error && history.length === 0 && (
                        <div className="analysis-message">
                            <h2>No historical readings yet</h2>
                            <p>Once the selected device reports data, its measurements will appear here.</p>
                        </div>
                    )}

                    {!error && history.length > 0 && parameters.length === 0 && (
                        <div className="analysis-message">
                            <h2>No numeric measurements found</h2>
                            <p>The history endpoint responded, but its rows did not contain chartable metric values.</p>
                        </div>
                    )}

                    {!error && parameters.length > 0 && aggregatedData.length === 0 && (
                        <div className="analysis-message">
                            <h2>No readings in this period</h2>
                            <p>Choose another {activeBuckets === 'daily' ? 'day' : activeBuckets.slice(0, -2)} to view available measurements.</p>
                        </div>
                    )}

                    {aggregatedData.length > 0 && (
                        <div className="analysis-grid">
                            {parameters.map(param => (
                                <div key={param.key} className="analysis-card">
                                    <div className="card-top">
                                        <h3>{param.label}</h3>
                                        <span className="unit-tag">{param.unit}</span>
                                    </div>

                                    <div className="chart-pair">
                                        <div className="analysis-chart-container">
                                            <label>Trend (Line)</label>
                                            <ResponsiveContainer width="100%" height={200}>
                                                <ComposedChart data={aggregatedData}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                                    <XAxis dataKey="name" hide />
                                                    <YAxis stroke="#64748b" fontSize={10} />
                                                    <Tooltip
                                                        contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                                    />
                                                    <Area type="monotone" dataKey={param.key} fill={`${param.color}20`} stroke={param.color} strokeWidth={2} />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>

                                        <div className="analysis-chart-container">
                                            <label>Distribution (Bar)</label>
                                            <ResponsiveContainer width="100%" height={200}>
                                                <ComposedChart data={aggregatedData}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                                    <XAxis dataKey="name" hide />
                                                    <YAxis stroke="#64748b" fontSize={10} />
                                                    <Tooltip
                                                        contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                                    />
                                                    <Bar dataKey={param.key} fill={param.color} radius={[4, 4, 0, 0]} />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
            
            <style>{`
                .raw-analysis-tab {
                    padding: 24px;
                    display: flex;
                    flex-direction: column;
                    gap: 32px;
                }
                .analysis-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 20px;
                }
                .filter-controls {
                    display: flex;
                    align-items: center;
                    gap: 24px;
                }
                .date-picker-wrapper {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .date-picker-wrapper label {
                    font-size: 0.7rem;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .date-input {
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    color: var(--text-primary);
                    padding: 6px 12px;
                    font-size: 0.85rem;
                    outline: none;
                }
                .title-group h1 {
                    font-size: 1.8rem;
                    background: linear-gradient(135deg, var(--text-primary) 0%, var(--text-secondary) 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .title-group p {
                    color: var(--text-secondary);
                    font-size: 0.9rem;
                }
                .view-switch {
                    display: inline-flex;
                    gap: 4px;
                    margin-top: 14px;
                    padding: 4px;
                    border: 1px solid var(--border);
                    border-radius: 10px;
                    background: var(--bg-card);
                }
                .view-switch button {
                    padding: 7px 12px;
                    border: 0;
                    border-radius: 7px;
                    background: transparent;
                    color: var(--text-secondary);
                    cursor: pointer;
                }
                .view-switch button.active {
                    background: var(--accent);
                    color: #fff;
                }
                .bucket-nav {
                    display: flex;
                    background: var(--bg-card);
                    padding: 4px;
                    border-radius: 12px;
                    border: 1px solid var(--border);
                }
                .bucket-btn {
                    padding: 8px 16px;
                    border-radius: 8px;
                    border: none;
                    background: transparent;
                    color: var(--text-secondary);
                    cursor: pointer;
                    font-size: 0.85rem;
                    transition: all 0.2s ease;
                }
                .bucket-btn:hover {
                    color: var(--text-primary);
                    background: var(--bg-card-hover);
                }
                .bucket-btn.active {
                    background: var(--accent);
                    color: #fff;
                    box-shadow: 0 4px 12px var(--accent-glow);
                }
                .analysis-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 24px;
                }
                .analysis-message,
                .grafana-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    border-radius: 20px;
                    padding: 24px;
                    color: var(--text-primary);
                }
                .analysis-message {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 24px;
                }
                .analysis-message h2,
                .grafana-toolbar h2 {
                    margin: 0 0 6px;
                    font-size: 1rem;
                }
                .analysis-message p,
                .grafana-toolbar p {
                    margin: 0;
                    color: var(--text-secondary);
                    font-size: 0.85rem;
                }
                .analysis-message button,
                .grafana-toolbar a {
                    flex: 0 0 auto;
                    padding: 8px 12px;
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    background: var(--accent);
                    color: #fff;
                    text-decoration: none;
                    cursor: pointer;
                }
                .error-message {
                    border-color: rgba(239, 68, 68, 0.45);
                }
                .grafana-card {
                    padding: 16px;
                }
                .grafana-toolbar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 24px;
                    padding: 4px 4px 16px;
                }
                .grafana-card iframe {
                    display: block;
                    width: 100%;
                    min-height: 720px;
                    border: 0;
                    border-radius: 12px;
                    background: #111827;
                }
                /* Grafana iframe states */
                .grafana-status {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    min-height: 380px;
                    border-radius: 14px;
                    text-align: center;
                    padding: 40px 24px;
                }
                .grafana-loading {
                    background: linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(139,92,246,0.06) 100%);
                    border: 1px dashed var(--border);
                }
                .grafana-loading p {
                    margin: 0;
                    font-size: 1rem;
                    font-weight: 500;
                    color: var(--text-primary);
                }
                .grafana-loading span {
                    font-size: 0.78rem;
                    color: var(--text-secondary);
                }
                .grafana-loading span code {
                    background: var(--bg-secondary);
                    border-radius: 4px;
                    padding: 2px 6px;
                    font-family: monospace;
                    color: var(--accent);
                }
                .grafana-spinner {
                    width: 52px;
                    height: 52px;
                }
                .grafana-spinner svg {
                    width: 100%;
                    height: 100%;
                    animation: grafana-spin 1s linear infinite;
                }
                @keyframes grafana-spin {
                    to { transform: rotate(360deg); }
                }
                .grafana-error {
                    background: linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(220,38,38,0.04) 100%);
                    border: 1px dashed rgba(239,68,68,0.35);
                    gap: 10px;
                }
                .grafana-error-icon {
                    width: 48px;
                    height: 48px;
                    color: rgba(239,68,68,0.7);
                }
                .grafana-error-icon svg {
                    width: 100%;
                    height: 100%;
                }
                .grafana-error h3 {
                    margin: 0;
                    font-size: 1.05rem;
                    font-weight: 600;
                    color: var(--text-primary);
                }
                .grafana-error p {
                    margin: 0;
                    font-size: 0.82rem;
                    color: var(--text-secondary);
                    max-width: 480px;
                    line-height: 1.6;
                }
                .grafana-error p code {
                    font-size: 0.78rem;
                    background: var(--bg-secondary);
                    border-radius: 4px;
                    padding: 1px 5px;
                    color: rgba(239,68,68,0.85);
                    word-break: break-all;
                }
                .grafana-error-actions {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 12px;
                    margin-top: 8px;
                }
                .grafana-cmd {
                    background: #0d1117;
                    border: 1px solid var(--border);
                    border-radius: 10px;
                    padding: 10px 20px;
                }
                .grafana-cmd code {
                    font-family: monospace;
                    font-size: 0.85rem;
                    color: #7dd3fc;
                    letter-spacing: 0.02em;
                }
                .grafana-action-btns {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                    justify-content: center;
                }
                .grafana-action-btns button,
                .grafana-action-btns a {
                    padding: 9px 18px;
                    border-radius: 9px;
                    font-size: 0.85rem;
                    font-weight: 500;
                    cursor: pointer;
                    text-decoration: none;
                    transition: opacity 0.15s;
                }
                .grafana-action-btns button:hover,
                .grafana-action-btns a:hover { opacity: 0.8; }
                .grafana-action-btns button {
                    background: var(--accent);
                    color: #fff;
                    border: none;
                }
                .grafana-action-btns a {
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                    border: 1px solid var(--border);
                }
                .analysis-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border);
                    border-radius: 20px;
                    padding: 24px;
                }
                .card-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 24px;
                }
                .card-top h3 {
                    font-size: 1.1rem;
                    font-weight: 500;
                    color: var(--text-primary);
                }
                .unit-tag {
                    font-size: 0.75rem;
                    background: var(--bg-secondary);
                    padding: 4px 10px;
                    border-radius: 6px;
                    color: var(--text-secondary);
                }
                .chart-pair {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 32px;
                }
                .analysis-chart-container {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .analysis-chart-container label {
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-secondary);
                }
                @media (max-width: 1024px) {
                    .chart-pair {
                        grid-template-columns: 1fr;
                    }
                    .filter-controls,
                    .bucket-nav {
                        flex-wrap: wrap;
                    }
                    .grafana-card iframe {
                        min-height: 600px;
                    }
                }
                @media (max-width: 640px) {
                    .raw-analysis-tab {
                        padding: 16px;
                    }
                    .filter-controls {
                        align-items: flex-start;
                        gap: 12px;
                    }
                    .bucket-btn {
                        padding: 7px 10px;
                    }
                    .analysis-message,
                    .grafana-toolbar {
                        align-items: flex-start;
                        flex-direction: column;
                    }
                }
            `}</style>
        </div>
    );
}
