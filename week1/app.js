/* ===========================================================
   Dorm Energy Meter Dashboard — Application Logic
   ===========================================================
   Sections:
     1. Constants & State
     2. Data Generator (simulated hourly dorm meter readings)
     3. Moving Average Smoothing
     4. Linear Regression (evening-peak prediction)
     5. Plotly Chart Rendering
     6. Stat-Card & Clock Updates
     7. Initialisation & Live Loop
   =========================================================== */

// ─── 1. Constants & State ──────────────────────────────────
const DORM_NAMES = ['Maple Hall', 'Oak Tower', 'Pine Lodge', 'Cedar Court', 'Elm Residence'];
const DORM_COLORS = ['#6366f1', '#fb7185', '#34d399', '#fbbf24', '#22d3ee'];
const HOURS_PER_DAY = 24;
const DAYS_HISTORY = 7;
const EVENING_START = 17;  // 5 PM
const EVENING_END = 22;    // 10 PM
const LIVE_INTERVAL_MS = 5000; // simulate new hour every 5 s

let meterData = [];        // [{ts, dorm, kWh}, …]
let currentSimHour = 0;    // simulation pointer (total hours generated)

// ─── 2. Data Generator ────────────────────────────────────
/**
 * Realistic daily profile for a dorm (kWh).
 *   - Low overnight (0-6h):   8-14 kWh
 *   - Morning ramp (6-9h):    20-35 kWh
 *   - Mid-day (9-16h):        15-25 kWh
 *   - Evening peak (17-22h):  30-55 kWh
 *   - Late-night drop (22-24): 12-18 kWh
 * Each dorm has a base-load multiplier for variation.
 */
function baseDormLoad(hour, dormIndex) {
  const dormMultiplier = 0.85 + dormIndex * 0.08;  // 0.85 … 1.17
  let base;
  if (hour < 6) {
    base = 10 + 2 * Math.sin(hour * 0.5);
  } else if (hour < 9) {
    base = 10 + (hour - 6) * 8;
  } else if (hour < 17) {
    base = 22 - (hour - 9) * 0.6;
  } else if (hour < 22) {
    // Evening peak — quadratic bump centred at 19:30
    const t = hour - 19.5;
    base = 50 - 3 * t * t;
  } else {
    base = 50 - (hour - 22) * 16;
  }
  return Math.max(5, base * dormMultiplier);
}

function generateReading(totalHour, dormIndex) {
  const hour = totalHour % HOURS_PER_DAY;
  const dayNoise = Math.sin(totalHour * 0.3 + dormIndex) * 3;
  const randomJitter = (Math.random() - 0.5) * 6;
  const weekdayBoost = (Math.floor(totalHour / 24) % 7 < 5) ? 1.05 : 1.0;
  const kWh = baseDormLoad(hour, dormIndex) * weekdayBoost + dayNoise + randomJitter;
  return Math.max(1, +kWh.toFixed(2));
}

function timestampForHour(totalHour) {
  const base = new Date();
  base.setHours(base.getHours() - (DAYS_HISTORY * HOURS_PER_DAY) + totalHour);
  base.setMinutes(0, 0, 0);
  return base;
}

function seedHistoricalData() {
  const totalHours = DAYS_HISTORY * HOURS_PER_DAY;
  for (let h = 0; h < totalHours; h++) {
    const ts = timestampForHour(h);
    for (let d = 0; d < DORM_NAMES.length; d++) {
      meterData.push({ ts, dorm: d, kWh: generateReading(h, d) });
    }
  }
  currentSimHour = totalHours;
}

function addLiveHour() {
  const ts = timestampForHour(currentSimHour);
  for (let d = 0; d < DORM_NAMES.length; d++) {
    meterData.push({ ts, dorm: d, kWh: generateReading(currentSimHour, d) });
  }
  currentSimHour++;
  // Keep only last 10 days to avoid unbounded growth
  const cutoff = new Date(ts);
  cutoff.setDate(cutoff.getDate() - 10);
  meterData = meterData.filter(r => r.ts >= cutoff);
}

// ─── 3. Moving Average Smoothing ──────────────────────────
function movingAverage(values, windowSize) {
  const result = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(values.length, i + Math.ceil(windowSize / 2));
    let sum = 0;
    for (let j = start; j < end; j++) sum += values[j];
    result.push(+(sum / (end - start)).toFixed(2));
  }
  return result;
}

// ─── 4. Linear Regression ──────────────────────────────────
function linearRegression(xs, ys) {
  const n = xs.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxy += xs[i] * ys[i];
    sx2 += xs[i] * xs[i];
  }
  const denom = n * sx2 - sx * sx;
  if (denom === 0) return { slope: 0, intercept: sy / n };
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope: +slope.toFixed(4), intercept: +intercept.toFixed(2) };
}

/**
 * Extract evening-peak kWh for each day and run regression.
 * Returns { dailyPeaks: [{day, peak}], reg: {slope, intercept}, predictedPeak }
 */
function eveningPeakRegression(dormFilter) {
  // Group by day
  const dayMap = {};
  for (const r of meterData) {
    if (dormFilter !== 'all' && r.dorm !== +dormFilter) continue;
    const h = r.ts.getHours();
    if (h < EVENING_START || h > EVENING_END) continue;
    const dayKey = r.ts.toISOString().slice(0, 10);
    if (!dayMap[dayKey]) dayMap[dayKey] = [];
    dayMap[dayKey].push(r.kWh);
  }
  const sortedDays = Object.keys(dayMap).sort();
  const dailyPeaks = sortedDays.map((d, i) => ({
    day: d,
    idx: i,
    peak: Math.max(...dayMap[d])
  }));
  const xs = dailyPeaks.map(p => p.idx);
  const ys = dailyPeaks.map(p => p.peak);
  const reg = linearRegression(xs, ys);
  const predictedPeak = +(reg.slope * sortedDays.length + reg.intercept).toFixed(2);
  return { dailyPeaks, reg, predictedPeak };
}

// ─── 5. Plotly Chart Rendering ─────────────────────────────
const PLOTLY_LAYOUT_BASE = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { family: 'Inter, sans-serif', color: '#94a3b8', size: 12 },
  margin: { l: 52, r: 24, t: 24, b: 48 },
  xaxis: {
    gridcolor: 'rgba(99,102,241,0.08)',
    zerolinecolor: 'rgba(99,102,241,0.12)',
    tickfont: { size: 11 }
  },
  yaxis: {
    gridcolor: 'rgba(99,102,241,0.08)',
    zerolinecolor: 'rgba(99,102,241,0.12)',
    tickfont: { size: 11 },
    title: { text: 'kWh', standoff: 10 }
  },
  legend: { orientation: 'h', y: -0.18, x: 0.5, xanchor: 'center', font: { size: 11 } },
  hoverlabel: { bgcolor: '#1e293b', bordercolor: '#6366f1', font: { color: '#f1f5f9', size: 12 } }
};

const PLOTLY_CONFIG = {
  responsive: true,
  displayModeBar: true,
  modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  displaylogo: false
};

function aggregateByTimestamp(dormFilter) {
  const map = new Map();
  for (const r of meterData) {
    if (dormFilter !== 'all' && r.dorm !== +dormFilter) continue;
    const key = r.ts.getTime();
    map.set(key, (map.get(key) || 0) + r.kWh);
  }
  const sorted = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  return { times: sorted.map(e => new Date(e[0])), values: sorted.map(e => +e[1].toFixed(2)) };
}

function renderRawSmoothed(dormFilter, windowSize) {
  const { times, values } = aggregateByTimestamp(dormFilter);
  const smoothed = movingAverage(values, windowSize);
  const traces = [
    {
      x: times, y: values, type: 'scatter', mode: 'lines',
      name: 'Raw',
      line: { color: '#6366f1', width: 1.4 },
      opacity: 0.5
    },
    {
      x: times, y: smoothed, type: 'scatter', mode: 'lines',
      name: `Smoothed (${windowSize}h MA)`,
      line: { color: '#22d3ee', width: 2.6 }
    }
  ];
  const layout = {
    ...PLOTLY_LAYOUT_BASE,
    xaxis: { ...PLOTLY_LAYOUT_BASE.xaxis, title: { text: 'Time', standoff: 8 } }
  };
  Plotly.react('chartRawSmoothed', traces, layout, PLOTLY_CONFIG);
}

function renderPeakPrediction(dormFilter) {
  const { dailyPeaks, reg, predictedPeak } = eveningPeakRegression(dormFilter);
  if (dailyPeaks.length === 0) return;
  const labels = dailyPeaks.map(p => p.day);
  const peaks = dailyPeaks.map(p => p.peak);
  // Regression line points (extend one day into future)
  const regX = [...labels, 'Today (pred)'];
  const regY = dailyPeaks.map((_, i) => +(reg.slope * i + reg.intercept).toFixed(2));
  regY.push(predictedPeak);

  const traces = [
    {
      x: labels, y: peaks, type: 'bar',
      name: 'Evening Peak',
      marker: {
        color: peaks.map((_, i) => {
          const t = i / (peaks.length || 1);
          return `rgba(251,113,133,${0.4 + t * 0.6})`;
        }),
        line: { color: '#fb7185', width: 1 }
      }
    },
    {
      x: regX, y: regY, type: 'scatter', mode: 'lines+markers',
      name: 'Regression',
      line: { color: '#fbbf24', width: 2.4, dash: 'dot' },
      marker: { size: 7, color: '#fbbf24' }
    },
    {
      x: ['Today (pred)'], y: [predictedPeak], type: 'scatter', mode: 'markers',
      name: 'Predicted Peak',
      marker: { size: 14, color: '#fb7185', symbol: 'star', line: { color: '#fff', width: 2 } }
    }
  ];
  const layout = {
    ...PLOTLY_LAYOUT_BASE,
    xaxis: { ...PLOTLY_LAYOUT_BASE.xaxis, title: { text: 'Day', standoff: 8 } },
    yaxis: { ...PLOTLY_LAYOUT_BASE.yaxis, title: { text: 'Peak kWh', standoff: 10 } },
    barmode: 'group'
  };
  Plotly.react('chartPeakPred', traces, layout, PLOTLY_CONFIG);
}

function renderDormBreakdown() {
  const traces = DORM_NAMES.map((name, d) => {
    const recs = meterData.filter(r => r.dorm === d).sort((a, b) => a.ts - b.ts);
    return {
      x: recs.map(r => r.ts),
      y: recs.map(r => r.kWh),
      type: 'scatter',
      mode: 'lines',
      stackgroup: 'one',
      name,
      line: { color: DORM_COLORS[d], width: 0 },
      fillcolor: DORM_COLORS[d].replace(')', ',0.45)').replace('rgb', 'rgba'),
      hovertemplate: `${name}<br>%{x|%b %d %H:%M}<br>%{y:.1f} kWh<extra></extra>`
    };
  });
  const layout = {
    ...PLOTLY_LAYOUT_BASE,
    xaxis: { ...PLOTLY_LAYOUT_BASE.xaxis, title: { text: 'Time', standoff: 8 } }
  };
  Plotly.react('chartDormBreak', traces, layout, PLOTLY_CONFIG);
}

// ─── 6. Stat-Card & Clock Updates ──────────────────────────
function updateStats(dormFilter, windowSize) {
  const { values } = aggregateByTimestamp(dormFilter);
  const latest = values.length ? values[values.length - 1] : 0;
  const smoothed = movingAverage(values, windowSize);
  const latestSmoothed = smoothed.length ? smoothed[smoothed.length - 1] : 0;
  const { reg, predictedPeak } = eveningPeakRegression(dormFilter);

  document.getElementById('valCurrent').textContent = latest.toFixed(1);
  document.getElementById('valPeak').textContent = predictedPeak.toFixed(1);
  document.getElementById('valSmoothed').textContent = latestSmoothed.toFixed(1);
  document.getElementById('valSlope').textContent = reg.slope.toFixed(2);

  const dormLabel = dormFilter === 'all' ? 'all dorms' : DORM_NAMES[+dormFilter];
  document.getElementById('subCurrent').textContent = `latest hour · ${dormLabel}`;
  document.getElementById('subPeak').textContent = `evening window ${EVENING_START}:00–${EVENING_END}:00`;
  document.getElementById('subSmoothed').textContent = `${windowSize}-hour moving average`;
  document.getElementById('subSlope').textContent = reg.slope >= 0 ? '↑ trending up' : '↓ trending down';
}

function tickClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  });
}

// ─── 7. Initialisation & Live Loop ─────────────────────────
function refreshAll() {
  const dormFilter = document.getElementById('dormSelect').value;
  const windowSize = +document.getElementById('maWindow').value;
  renderRawSmoothed(dormFilter, windowSize);
  renderPeakPrediction(dormFilter);
  renderDormBreakdown();
  updateStats(dormFilter, windowSize);
}

function init() {
  seedHistoricalData();
  refreshAll();
  tickClock();

  // Live update loop — add new simulated hour every LIVE_INTERVAL_MS
  setInterval(() => {
    addLiveHour();
    refreshAll();
  }, LIVE_INTERVAL_MS);

  // Clock tick every second
  setInterval(tickClock, 1000);

  // Re-render on control changes
  document.getElementById('dormSelect').addEventListener('change', refreshAll);
  document.getElementById('maWindow').addEventListener('change', refreshAll);
}

document.addEventListener('DOMContentLoaded', init);
