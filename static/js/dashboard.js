/* ═══════════════════════════════════════════
   dashboard.js — Dashboard Analytics
═══════════════════════════════════════════ */

// ── Load Stats from Backend ───────────────
async function loadDashboard() {
  try {
    const res  = await fetch('/api/stats');
    const data = await res.json();
    renderStats(data);
    renderCharts(data);
    renderSessions(data.sessions || []);
    renderRevisionPlanner(data.revisions || []);
  } catch (e) {
    // Demo data fallback
    const demo = getDemoData();
    renderStats(demo);
    renderCharts(demo);
    renderSessions(demo.sessions);
    renderRevisionPlanner(demo.revisions);
  }
}

function getDemoData() {
  return {
    total_sessions : 12,
    avg_accuracy   : 78,
    streak         : 4,
    total_ayahs    : 38,
    accuracy_series: [62, 70, 68, 75, 80, 78, 85, 82, 88, 90, 87, 92],
    labels         : ['Jun 1','Jun 2','Jun 3','Jun 4','Jun 5','Jun 6','Jun 7','Jun 8','Jun 9','Jun 10','Jun 11','Jun 12'],
    surah_dist     : { 'Al-Fatiha': 8, 'Al-Ikhlas': 12, 'Al-Nas': 6, 'Al-Falaq': 7, 'Al-Baqarah': 5 },
    sessions: [
      { date:'2025-01-12', surah:'Al-Fatiha',  ayah:1, accuracy:92, mistakes:1, status:'good'  },
      { date:'2025-01-12', surah:'Al-Ikhlas',  ayah:3, accuracy:85, mistakes:2, status:'good'  },
      { date:'2025-01-11', surah:'Al-Ikhlas',  ayah:1, accuracy:70, mistakes:4, status:'avg'   },
      { date:'2025-01-11', surah:'Al-Fatiha',  ayah:5, accuracy:60, mistakes:6, status:'poor'  },
      { date:'2025-01-10', surah:'Al-Nas',     ayah:2, accuracy:88, mistakes:2, status:'good'  },
    ],
    revisions: [
      { surah:'Al-Fatiha', ayah:5, accuracy:60, label:'low'  },
      { surah:'Al-Ikhlas', ayah:1, accuracy:70, label:'mid'  },
      { surah:'Al-Baqarah',ayah:1, accuracy:75, label:'mid'  },
    ]
  };
}

// ── Render Stats Cards ─────────────────────
function renderStats(data) {
  animateValue('totalSessions', 0, data.total_sessions, 1000);
  animateValue('avgAccuracy',   0, data.avg_accuracy,   1200, '%');
  animateValue('streakDays',    0, data.streak,          800);
  animateValue('totalAyahs',   0, data.total_ayahs,    1100);
}

function animateValue(id, from, to, duration, suffix='') {
  const el    = document.getElementById(id);
  if (!el) return;
  const step  = 16;
  const inc   = (to - from) / (duration / step);
  let current = from;
  const timer = setInterval(() => {
    current += inc;
    if (current >= to) { current = to; clearInterval(timer); }
    el.textContent = Math.floor(current) + suffix;
  }, step);
}

// ── Render Charts ─────────────────────────
function renderCharts(data) {
  const chartDefaults = {
    font  : { family: "'Nunito', sans-serif" },
    color : '#8892a4'
  };
  Chart.defaults.font  = chartDefaults.font;
  Chart.defaults.color = chartDefaults.color;

  // Accuracy Line Chart
  const accCtx = document.getElementById('accuracyChart').getContext('2d');
  new Chart(accCtx, {
    type: 'line',
    data: {
      labels  : data.labels,
      datasets: [{
        label          : 'Accuracy %',
        data           : data.accuracy_series,
        borderColor    : '#d4a843',
        backgroundColor: 'rgba(212,168,67,0.08)',
        tension        : 0.4,
        fill           : true,
        pointBackgroundColor: '#d4a843',
        pointRadius    : 4,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#131c2e',
          borderColor    : 'rgba(212,168,67,0.3)',
          borderWidth    : 1,
          titleColor     : '#d4a843',
          bodyColor      : '#e8eaf0',
          callbacks       : { label: ctx => ` ${ctx.parsed.y}% accuracy` }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' } },
        y: {
          min  : 0, max: 100,
          grid : { color: 'rgba(255,255,255,0.04)' },
          ticks: { callback: v => v + '%' }
        }
      }
    }
  });

  // Surah Doughnut Chart
  const surahCtx = document.getElementById('surahChart').getContext('2d');
  const surahLabels = Object.keys(data.surah_dist);
  const surahValues = Object.values(data.surah_dist);
  const palette = ['#d4a843','#2dd4bf','#f87171','#a78bfa','#34d399','#fb923c','#60a5fa'];
  new Chart(surahCtx, {
    type: 'doughnut',
    data: {
      labels  : surahLabels,
      datasets: [{
        data           : surahValues,
        backgroundColor: palette.slice(0, surahLabels.length),
        borderWidth    : 0,
        hoverOffset    : 8
      }]
    },
    options: {
      responsive: true,
      cutout    : '70%',
      plugins   : {
        legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } },
        tooltip: {
          backgroundColor: '#131c2e',
          borderColor    : 'rgba(212,168,67,0.3)',
          borderWidth    : 1
        }
      }
    }
  });
}

// ── Render Sessions Table ──────────────────
function renderSessions(sessions) {
  const tbody = document.getElementById('sessionsBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!sessions.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem">No sessions yet. Start reciting!</td></tr>';
    return;
  }
  sessions.forEach(s => {
    const statusClass = s.status === 'good' ? 'status-good' : s.status === 'avg' ? 'status-avg' : 'status-poor';
    const statusLabel = s.status === 'good' ? '✅ Excellent' : s.status === 'avg' ? '⚠️ Average' : '❌ Needs Work';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.date}</td>
      <td>${s.surah}</td>
      <td>${s.ayah}</td>
      <td><b>${s.accuracy}%</b></td>
      <td>${s.mistakes}</td>
      <td class="${statusClass}">${statusLabel}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Render Revision Planner ────────────────
function renderRevisionPlanner(revisions) {
  const list = document.getElementById('revisionList');
  if (!list) return;
  list.innerHTML = '';
  if (!revisions.length) {
    list.innerHTML = '<li style="color:var(--text-muted);font-size:0.9rem">No revisions suggested yet.</li>';
    return;
  }
  revisions.forEach(r => {
    const li = document.createElement('li');
    li.className = 'revision-item';
    li.innerHTML = `
      <span class="rev-info">
        <b>${r.surah}</b> · Ayah ${r.ayah}
      </span>
      <span class="rev-acc ${r.label}">${r.accuracy}% last attempt</span>
    `;
    list.appendChild(li);
  });
}

// ── Badge Logic ────────────────────────────
function updateBadges(data) {
  const badges = document.querySelectorAll('.badge-item');
  // Earned logic based on stats (expand as needed)
  if (data.total_sessions >= 1)   badges[0]?.classList.add('earned');
  if (data.total_sessions >= 5)   badges[1]?.classList.add('earned');
  if (data.avg_accuracy   >= 90)  badges[2]?.classList.add('earned');
  if (data.streak         >= 7)   badges[3]?.classList.add('earned');
  if (data.total_ayahs    >= 100) badges[5]?.classList.add('earned');
}

// ── Init ──────────────────────────────────
window.addEventListener('DOMContentLoaded', loadDashboard);