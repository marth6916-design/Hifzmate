/* ═══════════════════════════════════════════
   app.js — Shared JS for HifzMate
═══════════════════════════════════════════ */

// ── Starfield ──────────────────────────────
(function () {
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let stars = [];
  const STAR_COUNT = 180;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function initStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x:     Math.random() * canvas.width,
        y:     Math.random() * canvas.height,
        r:     Math.random() * 1.4 + 0.2,
        alpha: Math.random(),
        speed: Math.random() * 0.003 + 0.001,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function drawStars(t) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => {
      const a = 0.3 + 0.7 * Math.abs(Math.sin(s.phase + t * s.speed));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fill();
    });
  }

  let frame = 0;
  function animate() {
    frame++;
    drawStars(frame);
    requestAnimationFrame(animate);
  }

  resize();
  initStars();
  animate();
  window.addEventListener('resize', () => { resize(); initStars(); });
})();

// ── Animated Counters ──────────────────────
(function () {
  const counters = document.querySelectorAll('.stat-number[data-target]');
  if (!counters.length) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el     = entry.target;
      const target = parseInt(el.dataset.target, 10);
      const dur    = 1800;
      const step   = 16;
      const inc    = target / (dur / step);
      let current  = 0;
      const timer  = setInterval(() => {
        current += inc;
        if (current >= target) { current = target; clearInterval(timer); }
        el.textContent = Math.floor(current).toLocaleString();
      }, step);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });

  counters.forEach(c => observer.observe(c));
})();