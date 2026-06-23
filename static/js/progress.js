/* ═══════════════════════════════════════════
   progress.js — Progress Page Logic
═══════════════════════════════════════════ */

const SURAH_NAMES = {
  1:'Al-Fatiha', 2:'Al-Baqarah', 3:"Ali 'Imran", 4:'An-Nisa',
  5:'Al-Maidah', 36:'Ya-Sin', 67:'Al-Mulk',
  112:'Al-Ikhlas', 113:'Al-Falaq', 114:'An-Nas'
};

async function loadProgress() {
  let data;
  try {
    const res = await fetch('/api/all_sessions');
    data = await res.json();
  } catch (e) {
    data = getDemoSessions();
  }

  renderSummaryCards(data);
  renderTrendChart(data);
  renderSurahBar(data);
  renderHeatmap(data);
  renderAllSessions(data);
}

// ── Demo Data ─────────────────────────────
function getDemoSessions() {
  const sessions = [];
  const surahs   = [1, 112, 113, 114, 36];
  for (let i = 0; i < 20; i++) {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(Math.random() * 30));
    sessions.push({
      id       : i + 1,
      surah    : surahs[Math.floor(Math.random() * surahs.length)],
      ayah     : Math.floor(Math.random() * 7) + 1,
      accuracy : Math.round(50 + Math.random() * 50),
      mistakes : Math.floor(Math.random() * 6),
      timestamp: d.toISOString()
    });
  }
  return sessions;
}

// ── Summary Cards ─────────────────────────
function renderSummaryCards(sessions) {
  const best    = sessions.length ? Math.max(...sessions.map(s => s.accuracy)) : 0;
  const total_m = sessions.reduce((a, s) => a + (s.mistakes || 0), 0);
  const perfect = sessions.filter(s => s.accuracy >= 90).length;
  const surahs  = new Set(sessions.map(s => s.surah)).size;

  document.getElementById('bestAccuracy').textContent   = best    ? best + '%'  : '—';
  document.getElementById('totalMistakes').textContent  = total_m || '—';
  document.getElementById('perfectSessions').textContent= perfect || '—';
  document.getElementById('surahsCount').textContent    = surahs  || '—';
}

// ── Trend Chart ───────────────────────────
function renderTrendChart(sessions) {
  const sorted = [...sessions].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
  const labels = sorted.map(s => new Date(s.timestamp).toLocaleDateString('en-GB', { day:'numeric', month:'short' }));
  const values = sorted.map(s => s.accuracy);

  const ctx = document.getElementById('trendChart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label          : 'Accuracy %',
        data           : values,
        borderColor    : '#2dd4bf',
        backgroundColor: 'rgba(45,212,191,0.08)',
        tension        : 0.4,
        fill           : true,
        pointBackgroundColor: '#2dd4bf',
        pointRadius    : 5,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend : { display: false },
        tooltip: {
          backgroundColor: '#131c2e',
          borderColor    : 'rgba(45,212,191,0.3)',
          borderWidth    : 1,
          titleColor     : '#2dd4bf',
          bodyColor      : '#e8eaf0',
          callbacks      : { label: ctx => ` ${ctx.parsed.y}% accuracy` }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: v => v + '%' } }
      }
    }
  });
}

// ── Surah Bar Chart ───────────────────────
function renderSurahBar(sessions) {
  const surahMap = {};
  sessions.forEach(s => {
    const name = SURAH_NAMES[s.surah] || `Surah ${s.surah}`;
    if (!surahMap[name]) surahMap[name] = [];
    surahMap[name].push(s.accuracy);
  });
  const labels = Object.keys(surahMap);
  const values = labels.map(l => Math.round(surahMap[l].reduce((a,b) => a+b,0) / surahMap[l].length));
  const colors = values.map(v => v >= 90 ? '#4ade80' : v >= 70 ? '#d4a843' : '#f87171');

  const ctx = document.getElementById('surahBarChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label          : 'Avg Accuracy',
        data           : values,
        backgroundColor: colors,
        borderRadius   : 6,
        borderSkipped  : false
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: v => v + '%' } }
      }
    }
  });
}

// ── Heatmap ───────────────────────────────
function renderHeatmap(sessions) {
  const grid = document.getElementById('heatmapGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const countByDate = {};
  sessions.forEach(s => {
    const d = new Date(s.timestamp).toLocaleDateString('en-CA');
    countByDate[d] = (countByDate[d] || 0) + 1;
  });

  for (let i = 29; i >= 0; i--) {
    const d   = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-CA');
    const cnt = countByDate[key] || 0;
    const lvl = cnt === 0 ? 0 : cnt === 1 ? 1 : cnt <= 3 ? 2 : 3;
    const box = document.createElement('div');
    box.className = `hm-box hm-${lvl}`;
    box.title     = `${d.toDateString()}: ${cnt} session(s)`;
    grid.appendChild(box);
  }
}

// ── All Sessions Table ─────────────────────
function renderAllSessions(sessions) {
  const tbody = document.getElementById('allSessionsBody');
  if (!tbody) return;

  if (!sessions.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem">No sessions yet. Start reciting!</td></tr>';
    return;
  }

  const sorted = [...sessions].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  tbody.innerHTML = '';
  sorted.forEach((s, idx) => {
    const name  = SURAH_NAMES[s.surah] || `Surah ${s.surah}`;
    const grade = s.accuracy >= 90 ? '<span class="status-good">A — Excellent</span>'
                : s.accuracy >= 75 ? '<span class="status-avg">B — Good</span>'
                : s.accuracy >= 60 ? '<span class="status-avg">C — Average</span>'
                :                    '<span class="status-poor">D — Needs Work</span>';
    const dt = new Date(s.timestamp).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${dt}</td>
      <td>${name}</td>
      <td>${s.ayah}</td>
      <td><b>${s.accuracy}%</b></td>
      <td>${s.mistakes ?? '—'}</td>
      <td>${grade}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.addEventListener('DOMContentLoaded', loadProgress);
