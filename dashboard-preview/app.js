/* ========================================
   AQMRG Dashboard — App Logic
   ======================================== */

// ── Live Clock ──────────────────────────
function updateClock() {
    const now = new Date();
    const opts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Africa/Nairobi' };
    document.getElementById('currentTime').textContent = now.toLocaleString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', ...opts
    });
}
updateClock();
setInterval(updateClock, 1000);

// ── Chart.js Global Config ──────────────
Chart.defaults.color = '#8b9dc3';
Chart.defaults.borderColor = 'rgba(99, 130, 190, 0.08)';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 11;

// ── Helper: generate hours for labels ───
function generateHourLabels(count) {
    const labels = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 3600000);
        labels.push(d.getHours().toString().padStart(2, '0') + ':00');
    }
    return labels;
}

// ── AQI 24-Hour Trend Chart ─────────────
const aqiCtx = document.getElementById('aqiChart').getContext('2d');

const aqiData = [65, 70, 58, 52, 48, 44, 42, 45, 55, 68, 78, 85, 92, 95, 88, 82, 79, 85, 90, 86, 80, 76, 78, 78];

const gradient1 = aqiCtx.createLinearGradient(0, 0, 0, 240);
gradient1.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
gradient1.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

const gradient2 = aqiCtx.createLinearGradient(0, 0, 0, 240);
gradient2.addColorStop(0, 'rgba(139, 92, 246, 0.15)');
gradient2.addColorStop(1, 'rgba(139, 92, 246, 0.0)');

new Chart(aqiCtx, {
    type: 'line',
    data: {
        labels: generateHourLabels(24),
        datasets: [
            {
                label: 'Kampala Central',
                data: aqiData,
                borderColor: '#3b82f6',
                backgroundColor: gradient1,
                tension: 0.4,
                fill: true,
                borderWidth: 2.5,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#3b82f6',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
            },
            {
                label: 'Nakawa',
                data: aqiData.map(v => v + Math.floor(Math.random() * 20 - 5) + 8),
                borderColor: '#8b5cf6',
                backgroundColor: gradient2,
                tension: 0.4,
                fill: true,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#8b5cf6',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
            },
            {
                label: 'Entebbe',
                data: aqiData.map(v => Math.max(10, v - 30 + Math.floor(Math.random() * 10))),
                borderColor: '#06b6d4',
                backgroundColor: 'transparent',
                tension: 0.4,
                fill: false,
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#06b6d4',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: {
                position: 'top',
                align: 'end',
                labels: {
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 20,
                    font: { size: 11, weight: 500 },
                }
            },
            tooltip: {
                backgroundColor: 'rgba(10, 14, 28, 0.9)',
                borderColor: 'rgba(99, 130, 190, 0.2)',
                borderWidth: 1,
                titleFont: { weight: 600 },
                padding: 12,
                cornerRadius: 10,
                displayColors: true,
                callbacks: {
                    label: function (ctx) {
                        return ` ${ctx.dataset.label}: AQI ${ctx.parsed.y}`;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { maxRotation: 0, maxTicksLimit: 12 }
            },
            y: {
                min: 0,
                max: 150,
                grid: { color: 'rgba(99, 130, 190, 0.06)' },
                ticks: {
                    stepSize: 50,
                    callback: (v) => v
                }
            }
        }
    }
});

// ── Pollutant Breakdown (Doughnut) ──────
const pollCtx = document.getElementById('pollutantChart').getContext('2d');

new Chart(pollCtx, {
    type: 'doughnut',
    data: {
        labels: ['PM2.5', 'PM10', 'NO₂', 'O₃', 'SO₂', 'CO'],
        datasets: [{
            data: [35, 25, 15, 12, 8, 5],
            backgroundColor: [
                '#3b82f6',
                '#8b5cf6',
                '#06b6d4',
                '#22c55e',
                '#f59e0b',
                '#f97316',
            ],
            borderColor: 'rgba(10, 14, 28, 0.8)',
            borderWidth: 3,
            hoverOffset: 8,
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 14,
                    font: { size: 11, weight: 500 },
                    color: '#8b9dc3'
                }
            },
            tooltip: {
                backgroundColor: 'rgba(10, 14, 28, 0.9)',
                borderColor: 'rgba(99, 130, 190, 0.2)',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 10,
                callbacks: {
                    label: function (ctx) {
                        return ` ${ctx.label}: ${ctx.parsed}%`;
                    }
                }
            }
        }
    }
});

// ── Chart button interactivity ──────────
document.querySelectorAll('.chart-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// ── Sensor hover highlight ──────────────
document.querySelectorAll('.sensor-item').forEach(item => {
    item.addEventListener('mouseenter', () => {
        item.style.borderColor = 'rgba(59, 130, 246, 0.25)';
    });
    item.addEventListener('mouseleave', () => {
        item.style.borderColor = 'transparent';
    });
});

// ── Animate forecast bars on load ───────
window.addEventListener('load', () => {
    document.querySelectorAll('.forecast-fill').forEach(bar => {
        const w = bar.style.width;
        bar.style.width = '0%';
        setTimeout(() => { bar.style.width = w; }, 300);
    });
});

// ── Simulate live AQI value updates ─────
function randomFlicker(elementSelector, baseValue, range) {
    const el = document.querySelector(elementSelector);
    if (!el) return;
    setInterval(() => {
        const delta = (Math.random() - 0.5) * range;
        const newVal = Math.round((baseValue + delta) * 10) / 10;
        el.textContent = newVal;
    }, 5000);
}
