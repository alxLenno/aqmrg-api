import { useMemo, useRef, useEffect, useState } from 'react';

const MARGIN = { top: 20, right: 20, bottom: 50, left: 55 };
const STROKE_WIDTH = 1.5;

// Pure math helpers — no d3 dependency needed
function quantile(sorted, q) {
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    const frac = pos - lo;
    if (hi >= sorted.length) return sorted[lo];
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * VerticalBox — Draws a single box (whisker + rect + median line)
 */
function VerticalBox({ min, q1, median, q3, max, width, stroke, fill }) {
    return (
        <>
            {/* Vertical whisker line (min to max) */}
            <line
                x1={width / 2} x2={width / 2}
                y1={min} y2={max}
                stroke={stroke} strokeWidth={STROKE_WIDTH}
            />
            {/* Min whisker cap */}
            <line
                x1={width * 0.25} x2={width * 0.75}
                y1={min} y2={min}
                stroke={stroke} strokeWidth={STROKE_WIDTH}
            />
            {/* Max whisker cap */}
            <line
                x1={width * 0.25} x2={width * 0.75}
                y1={max} y2={max}
                stroke={stroke} strokeWidth={STROKE_WIDTH}
            />
            {/* IQR Box (Q1 to Q3) */}
            <rect
                x={0} y={q3}
                width={width}
                height={q1 - q3}
                stroke={stroke}
                fill={fill}
                rx={4}
                fillOpacity={0.85}
                strokeWidth={STROKE_WIDTH}
            />
            {/* Median line */}
            <line
                x1={0} x2={width}
                y1={median} y2={median}
                stroke="#fff" strokeWidth={2}
            />
        </>
    );
}

/**
 * BoxPlot — Pure React/SVG box plot (no d3 dependency)
 * Follows: https://www.react-graph-gallery.com/boxplot
 */
export default function BoxPlot({ data, height = 360 }) {
    const containerRef = useRef(null);
    const [width, setWidth] = useState(500);

    // Responsive width
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                setWidth(entry.contentRect.width);
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const boundsWidth = width - MARGIN.left - MARGIN.right;
    const boundsHeight = height - MARGIN.top - MARGIN.bottom;

    // Compute summary stats per group
    const summaries = useMemo(() => {
        if (!data || data.length === 0) return [];

        // Group values by name
        const groups = {};
        data.forEach(d => {
            if (!groups[d.name]) groups[d.name] = [];
            groups[d.name].push(d.value);
        });

        const statusOrder = [
            'Good', 'Moderate', 'Warning',
            'Unhealthy for Sensitive', 'Unhealthy',
            'Very Unhealthy', 'Danger', 'Hazardous',
            'unknown', 'Unknown'
        ];
        const statusColors = {
            'Good': '#22c55e',
            'Moderate': '#eab308',
            'Warning': '#f97316',
            'Unhealthy for Sensitive': '#f97316',
            'Unhealthy': '#ef4444',
            'Very Unhealthy': '#a855f7',
            'Danger': '#ef4444',
            'Hazardous': '#7f1d1d',
            'unknown': '#64748b',
            'Unknown': '#64748b'
        };

        return Object.entries(groups)
            .map(([name, values]) => {
                const sorted = [...values].sort((a, b) => a - b);
                const q1 = quantile(sorted, 0.25);
                const med = quantile(sorted, 0.5);
                const q3 = quantile(sorted, 0.75);

                const iqr = q3 - q1;
                const minWhisker = Math.max(sorted[0], q1 - 1.5 * iqr);
                const maxWhisker = Math.min(sorted[sorted.length - 1], q3 + 1.5 * iqr);

                return {
                    name,
                    q1, median: med, q3,
                    min: minWhisker,
                    max: maxWhisker,
                    count: values.length,
                    fill: statusColors[name] || '#3b82f6'
                };
            })
            .sort((a, b) => {
                const ai = statusOrder.findIndex(s => a.name.startsWith(s));
                const bi = statusOrder.findIndex(s => b.name.startsWith(s));
                return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
            });
    }, [data]);

    // Y scale (linear)
    const yDomain = useMemo(() => {
        const allValues = data?.map(d => d.value) || [0];
        return [0, Math.max(...allValues) * 1.1];
    }, [data]);

    const yScale = (val) => boundsHeight - (val - yDomain[0]) / (yDomain[1] - yDomain[0]) * boundsHeight;

    // X scale (band)
    const groupNames = summaries.map(s => s.name);
    const bandWidth = boundsWidth / (groupNames.length || 1);
    const padding = bandWidth * 0.3;
    const boxWidth = bandWidth - padding * 2;
    const xScale = (name) => groupNames.indexOf(name) * bandWidth + padding;

    // Y-axis ticks
    const yTicks = useMemo(() => {
        const step = (yDomain[1] - yDomain[0]) / 5;
        const ticks = [];
        for (let i = 0; i <= 5; i++) {
            const value = yDomain[0] + step * i;
            ticks.push({ value: Math.round(value), yOffset: yScale(value) });
        }
        return ticks;
    }, [yDomain, boundsHeight]);

    if (!summaries.length) {
        return <div style={{ color: '#64748b', padding: '2rem', textAlign: 'center' }}>No categorical data available yet.</div>;
    }

    return (
        <div ref={containerRef} style={{ width: '100%' }}>
            <svg width={width} height={height}>
                <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                    {/* Y Axis */}
                    {yTicks.map(({ value, yOffset }) => (
                        <g key={value} transform={`translate(0, ${yOffset})`}>
                            <line x1={0} x2={boundsWidth} stroke="#1e293b" strokeWidth={0.5} />
                            <text
                                x={-10}
                                textAnchor="end"
                                dominantBaseline="middle"
                                style={{ fontSize: '10px', fill: '#cbd5e1', fontWeight: '600' }}
                            >
                                {value}
                            </text>
                        </g>
                    ))}
                    {/* Y Axis label */}
                    <text
                        transform={`translate(-40, ${boundsHeight / 2}) rotate(-90)`}
                        textAnchor="middle"
                        style={{ fontSize: '11px', fill: '#f8fafc', fontWeight: '700' }}
                    >
                        PM2.5 (µg/m³)
                    </text>

                    {/* Boxes */}
                    {summaries.map(s => (
                        <g key={s.name} transform={`translate(${xScale(s.name)}, 0)`}>
                            <VerticalBox
                                min={yScale(s.min)}
                                q1={yScale(s.q1)}
                                median={yScale(s.median)}
                                q3={yScale(s.q3)}
                                max={yScale(s.max)}
                                width={boxWidth}
                                stroke={s.fill}
                                fill={s.fill}
                            />
                            {/* Count label */}
                            <text
                                x={boxWidth / 2}
                                y={yScale(s.max) - 8}
                                textAnchor="middle"
                                style={{ fontSize: '9px', fill: '#94a3b8' }}
                            >
                                n={s.count}
                            </text>
                        </g>
                    ))}

                    {/* X Axis */}
                    {summaries.map(s => (
                        <text
                            key={s.name}
                            x={xScale(s.name) + boxWidth / 2}
                            y={boundsHeight + 20}
                            textAnchor="middle"
                            style={{ fontSize: '10px', fill: '#cbd5e1', fontWeight: '600' }}
                        >
                            {s.name.length > 14 ? s.name.substring(0, 14) + '…' : s.name}
                        </text>
                    ))}
                </g>
            </svg>
        </div>
    );
}
