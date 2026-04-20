import React, { useMemo } from 'react';

const PairPlot = ({ data, columns }) => {
    const size = 150;
    const padding = 20;
    const totalSize = size * columns.length;

    // Pre-calculate scales for each column
    const ranges = useMemo(() => {
        const stats = {};
        columns.forEach(col => {
            const vals = data.map(d => Number(d.metrics?.[col] || d[col] || 0)).filter(v => v !== -1);
            stats[col] = {
                min: Math.min(...vals),
                max: Math.max(...vals)
            };
        });
        return stats;
    }, [data, columns]);

    const renderPlot = (xCol, yCol, i, j) => {
        const isDiagonal = xCol === yCol;
        const xRange = ranges[xCol];
        const yRange = ranges[yCol];

        const xPos = j * size;
        const yPos = i * size;

        if (isDiagonal) {
            // Simple histogram/density for diagonal
            return (
                <g key={`${i}-${j}`} transform={`translate(${xPos + padding}, ${yPos + padding})`}>
                    <rect width={size - 2 * padding} height={size - 2 * padding} className="plot-bg plot-diag" rx="8" />
                    <text
                        x={(size - 2 * padding) / 2}
                        y={(size - 2 * padding) / 2}
                        textAnchor="middle"
                        className="plot-text"
                        style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '0.05em' }}
                    >
                        {xCol === 'pm25' ? 'PM2.5' : xCol.toUpperCase()}
                    </text>
                </g>
            );
        }

        // Scatter plot for off-diagonal
        const points = data.slice(0, 50).map((d, idx) => {
            const xVal = Number(d.metrics?.[xCol] || d[xCol] || 0);
            const yVal = Number(d.metrics?.[yCol] || d[yCol] || 0);

            if (xVal === -1 || yVal === -1) return null;

            const xCoord = ((xVal - xRange.min) / (xRange.max - xRange.min)) * (size - 2 * padding);
            const yCoord = (size - 2 * padding) - ((yVal - yRange.min) / (yRange.max - yRange.min)) * (size - 2 * padding);

            return <circle key={idx} cx={xCoord} cy={yCoord} r="2.5" fill="#60a5fa" opacity="0.9" />;
        }).filter(Boolean);

        return (
            <g key={`${i}-${j}`} transform={`translate(${xPos + padding}, ${yPos + padding})`}>
                <rect width={size - 2 * padding} height={size - 2 * padding} className="plot-bg" rx="8" />
                {points}
            </g>
        );
    };

    return (
        <div className="pair-plot-container" style={{ overflowX: 'auto', padding: '1rem' }}>
            <svg width={totalSize} height={totalSize} viewBox={`0 0 ${totalSize} ${totalSize}`}>
                {columns.map((yCol, i) =>
                    columns.map((xCol, j) => renderPlot(xCol, yCol, i, j))
                )}
            </svg>
            <style jsx>{`
                .pair-plot-container {
                    background: var(--bg-card);
                    border-radius: 12px;
                    border: 1px solid var(--border);
                    display: flex;
                    justify-content: center;
                }
                .plot-bg {
                    fill: var(--bg-secondary);
                    stroke: var(--border);
                }
                .plot-diag {
                    fill: var(--accent-glow);
                    stroke: rgba(59, 130, 246, 0.3);
                }
                .plot-text {
                    fill: var(--accent);
                }
            `}</style>
        </div>
    );
};

export default PairPlot;
