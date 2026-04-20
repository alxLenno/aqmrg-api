import { METRIC_CONFIG, formatMetricLabel, getMetricUnit, discoverMetrics } from '../utils/metrics';

/**
 * RawAnalysisTab — Deep-dive time-series exploration.
 * Supports Hourly, Daily, Weekly, Monthly, Yearly granularities.
 */
export default function RawAnalysisTab({ selectedDevice }) {
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState([]);
    const [activeBuckets, setActiveBuckets] = useState('daily'); // hourly, daily, weekly, monthly, yearly

    // Discovered keys for the charts
    const activeMetricKeys = useMemo(() => discoverMetrics(history), [history]);

    const parameters = useMemo(() => {
        return activeMetricKeys.map(key => ({
            key,
            label: formatMetricLabel(key),
            unit: getMetricUnit(key),
            color: METRIC_CONFIG[key]?.color || `hsl(${Math.random() * 360}, 70%, 50%)`
        }));
    }, [activeMetricKeys]);
    
    // Selectors state
    const [selectedDate, setSelectedDate] = useState(() => {
        // Find most recent date in history if possible, else today
        return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    });

    const [selectedHour, setSelectedHour] = useState(new Date().getHours());
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [selectedWeek, setSelectedWeek] = useState(() => {
        const d = new Date();
        const year = d.getFullYear();
        const firstDayOfYear = new Date(year, 0, 1);
        const pastDaysOfYear = (d - firstDayOfYear) / 86400000;
        const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
        return `${year}-W${weekNum < 10 ? '0' + weekNum : weekNum}`;
    });
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
            try {
                const data = await fetchSampledHistory(3000, selectedDevice);
                if (mounted && data.length > 0) {
                    setHistory(data);
                    // Proactively set the selected date to the most recent record's date
                    const latest = data.reduce((a, b) => {
                        const dateA = new Date(a.recorded_at || a.timestamp);
                        const dateB = new Date(b.recorded_at || b.timestamp);
                        return dateA > dateB ? a : b;
                    });
                    setSelectedDate(new Date(latest.recorded_at || latest.timestamp).toLocaleDateString('en-CA'));
                }
            } catch (err) {
                console.error("Analysis data fetch failed:", err);
            } finally {
                if (mounted) setLoading(false);
            }
        }
        load();
        return () => { mounted = false; };
    }, [selectedDevice]);

    const aggregatedData = useMemo(() => {
        if (!history.length) return [];

        let rawData = [...history].map(item => ({
            ...item,
            _date: new Date(item.recorded_at || item.timestamp),
            _localDate: new Date(item.recorded_at || item.timestamp).toLocaleDateString('en-CA') // YYYY-MM-DD
        }));

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
            filtered = rawData.filter(d => {
                const date = d._date;
                const year = date.getFullYear();
                const firstDayOfYear = new Date(year, 0, 1);
                const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
                const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
                const weekStr = `${year}-W${weekNum < 10 ? '0' + weekNum : weekNum}`;
                return weekStr === selectedWeek;
            });
        } else if (activeBuckets === 'monthly') {
            filtered = rawData.filter(d => d._localDate.slice(0, 7) === selectedMonth);
        } else if (activeBuckets === 'yearly') {
            filtered = rawData.filter(d => d._date.getFullYear() === Number(selectedYear));
        }

        filtered.sort((a, b) => a._date - b._date);

        // 2. AGGREGATING
        if (activeBuckets === 'hourly') {
            // Show data as is
            return filtered.map((d, i) => {
                const m = d.metrics || d;
                const entry = {
                  name: d._date.toLocaleTimeString([], {minute:'2-digit', second:'2-digit'})
                };
                activeMetricKeys.forEach(k => {
                  entry[k] = m[k] ?? 0;
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
            const m = item.metrics || item;
            
            activeMetricKeys.forEach(k => {
              const val = m[k];
              if (val !== undefined && val !== null) {
                groups[key][k].push(Number(val));
              }
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
              entry[k] = list.length ? (list.reduce((a,b)=>a+b,0)/list.length).toFixed(precision) : 0;
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
            
            <style jsx>{`
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
                }
            `}</style>
        </div>
    );
}
