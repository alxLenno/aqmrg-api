import { useMemo, useRef, useEffect, useState } from 'react';

const MARGIN = { top: 40, right: 20, bottom: 60, left: 80 };

/**
 * Heatmap — Color-coded grid for correlation matrices
 */
export default function Heatmap({ data, xAxis, yAxis, height = 450 }) {
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

    // Scales
    const xScale = (index) => (index * boundsWidth) / xAxis.length;
    const yScale = (index) => (index * boundsHeight) / yAxis.length;
    const cellWidth = boundsWidth / xAxis.length;
    const cellHeight = boundsHeight / yAxis.length;

    // Color helper (Red for negative, Blue for positive, White for 0)
    // Actually using a standard heatmap scale: 
    // -1 (Dark Blue) -> 0 (White/Light) -> 1 (Dark Orange/Red)
    const getColor = (val) => {
        if (val === null || val === undefined) return '#f1f5f9';
        const alpha = Math.abs(val);
        if (val > 0) {
            // Pos correlations (Orange-ish)
            return `rgba(234, 88, 12, ${alpha})`;
        } else {
            // Neg correlations (Blue-ish)
            return `rgba(37, 99, 235, ${alpha})`;
        }
    };

    return (
        <div ref={containerRef} style={{ width: '100%', overflow: 'hidden' }}>
            <svg width={width} height={height}>
                <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                    {/* Cells */}
                    {data.map((d, i) => {
                        const xIdx = xAxis.indexOf(d.x);
                        const yIdx = yAxis.indexOf(d.y);
                        if (xIdx === -1 || yIdx === -1) return null;

                        return (
                            <g key={`${d.x}-${d.y}`} transform={`translate(${xScale(xIdx)}, ${yScale(yIdx)})`}>
                                <rect
                                    width={cellWidth - 1}
                                    height={cellHeight - 1}
                                    fill={getColor(d.value)}
                                    stroke="#fff"
                                    strokeWidth={0.5}
                                />
                                {cellWidth > 40 && (
                                    <text
                                        x={cellWidth / 2}
                                        y={cellHeight / 2}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        style={{
                                            fontSize: '10px',
                                            fill: Math.abs(d.value) > 0.4 ? '#fff' : '#94a3b8',
                                            fontWeight: 'bold',
                                            pointerEvents: 'none'
                                        }}
                                    >
                                        {d.value?.toFixed(2)}
                                    </text>
                                )}
                                <title>{`${d.x} vs ${d.y}: ${d.value?.toFixed(3)}`}</title>
                            </g>
                        );
                    })}

                    {/* X-Axis Labels */}
                    {xAxis.map((label, i) => (
                        <text
                            key={label}
                            x={xScale(i) + cellWidth / 2}
                            y={boundsHeight + 15}
                            textAnchor="end"
                            transform={`rotate(-45, ${xScale(i) + cellWidth / 2}, ${boundsHeight + 15})`}
                            style={{ fontSize: '10px', fill: '#cbd5e1', fontWeight: '500' }}
                        >
                            {label}
                        </text>
                    ))}

                    {/* Y-Axis Labels */}
                    {yAxis.map((label, i) => (
                        <text
                            key={label}
                            x={-10}
                            y={yScale(i) + cellHeight / 2}
                            textAnchor="end"
                            dominantBaseline="middle"
                            style={{ fontSize: '10px', fill: '#cbd5e1', fontWeight: '500' }}
                        >
                            {label}
                        </text>
                    ))}
                </g>
            </svg>
        </div>
    );
}
