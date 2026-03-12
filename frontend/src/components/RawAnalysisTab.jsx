import { useState, useEffect, useMemo } from 'react';
import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Area
} from 'recharts';
import { fetchSampledHistory } from '../api/dashboard';

/**
 * RawAnalysisTab — Deep-dive time-series exploration.
 * Supports Hourly, Daily, Weekly, Monthly, Yearly granularities.
 */
export default function RawAnalysisTab() {
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState([]);
    const [activeBuckets, setActiveBuckets] = useState('daily'); // hourly, daily, weekly, monthly, yearly
    
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
                const data = await fetchSampledHistory(3000);
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
    }, []);

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
                return {
                    name: d._date.toLocaleTimeString([], {minute:'2-digit', second:'2-digit'}),
                    pm1: m.pm1 ?? m.pm1_0 ?? m.pm10_0 ?? 0,
                    pm25: m.pm25 ?? m.pm2_5 ?? 0,
                    pm10: m.pm10 ?? 0,
                    co2: m.co2 ?? 0,
                    co: m.co ?? 0,
                    temp: m.temperature ?? m.temp ?? 0,
                    hum: m.humidity ?? m.hum ?? 0,
                    voc: m.voc_index ?? m.voc ?? 0,
                    nox: m.nox_index ?? m.nox ?? 0
                };
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
                groups[key] = { 
                    name: key, 
                    pm1: [], pm25:[], pm10:[], 
                    co2:[], co:[], temp:[], hum:[], 
                    voc:[], nox:[],
                    sortKey: activeBuckets === 'monthly' ? dayOfMonth : 0 
                };
            }
            const m = item.metrics || item;
            
            const v_pm1 = m.pm1 ?? m.pm1_0 ?? m.pm10_0;
            const v_pm25 = m.pm25 ?? m.pm2_5;
            const v_pm10 = m.pm10;
            const v_co2 = m.co2;
            const v_co = m.co;
            const v_temp = m.temperature ?? m.temp;
            const v_hum = m.humidity ?? m.hum;
            const v_voc = m.voc_index ?? m.voc;
            const v_nox = m.nox_index ?? m.nox;

            if (v_pm1 !== undefined && v_pm1 !== null) groups[key].pm1.push(Number(v_pm1));
            if (v_pm25 !== undefined && v_pm25 !== null) groups[key].pm25.push(Number(v_pm25));
            if (v_pm10 !== undefined && v_pm10 !== null) groups[key].pm10.push(Number(v_pm10));
            if (v_co2 !== undefined && v_co2 !== null) groups[key].co2.push(Number(v_co2));
            if (v_co !== undefined && v_co !== null) groups[key].co.push(Number(v_co));
            if (v_temp !== undefined && v_temp !== null) groups[key].temp.push(Number(v_temp));
            if (v_hum !== undefined && v_hum !== null) groups[key].hum.push(Number(v_hum));
            if (v_voc !== undefined && v_voc !== null) groups[key].voc.push(Number(v_voc));
            if (v_nox !== undefined && v_nox !== null) groups[key].nox.push(Number(v_nox));
        });

        const result = Object.values(groups).map(g => ({
            name: g.name,
            sortKey: g.sortKey,
            pm1: g.pm1.length ? (g.pm1.reduce((a,b)=>a+b,0)/g.pm1.length).toFixed(1) : 0,
            pm25: g.pm25.length ? (g.pm25.reduce((a,b)=>a+b,0)/g.pm25.length).toFixed(1) : 0,
            pm10: g.pm10.length ? (g.pm10.reduce((a,b)=>a+b,0)/g.pm10.length).toFixed(1) : 0,
            co2: g.co2.length ? (g.co2.reduce((a,b)=>a+b,0)/g.co2.length).toFixed(0) : 0,
            co: g.co.length ? (g.co.reduce((a,b)=>a+b,0)/g.co.length).toFixed(2) : 0,
            temp: g.temp.length ? (g.temp.reduce((a,b)=>a+b,0)/g.temp.length).toFixed(1) : 0,
            hum: g.hum.length ? (g.hum.reduce((a,b)=>a+b,0)/g.hum.length).toFixed(1) : 0,
            voc: g.voc.length ? (g.voc.reduce((a,b)=>a+b,0)/g.voc.length).toFixed(0) : 0,
            nox: g.nox.length ? (g.nox.reduce((a,b)=>a+b,0)/g.nox.length).toFixed(0) : 0,
        }));

        if (activeBuckets === 'monthly') {
            result.sort((a, b) => a.sortKey - b.sortKey);
        }

        return result;
    }, [history, activeBuckets, selectedDate, selectedHour, selectedWeek, selectedMonth, selectedYear]);

    const parameters = [
        { key: 'pm1', label: 'PM1.0 (Ultrafine)', unit: 'µg/m³', color: '#ec4899' },
        { key: 'pm25', label: 'PM2.5 (Fine Particles)', unit: 'µg/m³', color: '#f43f5e' },
        { key: 'pm10', label: 'PM10 (Coarse Particles)', unit: 'µg/m³', color: '#fbbf24' },
        { key: 'co2', label: 'Carbon Dioxide (CO2)', unit: 'ppm', color: '#10b981' },
        { key: 'co', label: 'Carbon Monoxide (CO)', unit: 'ppm', color: '#f59e0b' },
        { key: 'temp', label: 'Temperature', unit: '°C', color: '#3b82f6' },
        { key: 'hum', label: 'Humidity', unit: '%', color: '#a855f7' },
        { key: 'voc', label: 'VOC Index', unit: 'index', color: '#8b5cf6' },
        { key: 'nox', label: 'NOx Index', unit: 'index', color: '#06b6d4' }
    ];

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
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .date-input {
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 8px;
                    color: #fff;
                    padding: 6px 12px;
                    font-size: 0.85rem;
                    outline: none;
                }
                .date-input::-webkit-calendar-picker-indicator {
                    filter: invert(1);
                    cursor: pointer;
                }
                .title-group h1 {
                    font-size: 1.8rem;
                    background: linear-gradient(135deg, #fff 0%, #94a3b8 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .title-group p {
                    color: #94a3b8;
                    font-size: 0.9rem;
                }
                .bucket-nav {
                    display: flex;
                    background: rgba(255,255,255,0.03);
                    padding: 4px;
                    border-radius: 12px;
                    border: 1px solid rgba(255,255,255,0.05);
                }
                .bucket-btn {
                    padding: 8px 16px;
                    border-radius: 8px;
                    border: none;
                    background: transparent;
                    color: #94a3b8;
                    cursor: pointer;
                    font-size: 0.85rem;
                    transition: all 0.2s ease;
                }
                .bucket-btn:hover {
                    color: #fff;
                    background: rgba(255,255,255,0.05);
                }
                .bucket-btn.active {
                    background: #3b82f6;
                    color: #fff;
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
                }
                .analysis-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 24px;
                }
                .analysis-card {
                    background: rgba(30, 41, 59, 0.5);
                    border: 1px solid rgba(255,255,255,0.05);
                    border-radius: 20px;
                    padding: 24px;
                    backdrop-filter: blur(10px);
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
                    color: #f8fafc;
                }
                .unit-tag {
                    font-size: 0.75rem;
                    background: rgba(255,255,255,0.05);
                    padding: 4px 10px;
                    border-radius: 6px;
                    color: #94a3b8;
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
                    color: #64748b;
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
