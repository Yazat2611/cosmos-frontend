// Cosmos Hub motion layer: canvas scenes that are too dynamic for CSS.
// Each scene pauses when it is off screen or the tab is hidden, reads its colours from the
// active theme, and falls back to a still frame under prefers-reduced-motion.

const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => reduceMQ.matches;
const DPR = () => Math.min(2, window.devicePixelRatio || 1);
const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

// cubic-bezier(x1, y1, x2, y2) as a function of progress, for JS-driven tweens that must
// match the CSS curves (--ease-out, --ease-in-out)
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - x) / d;
    }
    return sy(Math.max(0, Math.min(1, t)));
  };
}
const easeOut = bezier(0.23, 1, 0.32, 1);
const easeInOut = bezier(0.77, 0, 0.175, 1);

// Seeded random so a given asteroid always has the same shape
function rng(seed) {
  let s = 0;
  for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  s = s || 7;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const cssVar = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();
const themeListeners = new Set();
new MutationObserver(() => themeListeners.forEach((f) => f())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// Shared loop driver: runs while visible, reports dt in seconds, stops when destroyed
function loop(el, frame) {
  let raf = 0, last = 0, visible = true, alive = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); });
  io.observe(el);
  const tick = (t) => {
    raf = 0;
    if (!alive) return;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
    last = t;
    frame(dt, t / 1000);
    if (visible && !document.hidden && !reduced()) raf = requestAnimationFrame(tick);
    else last = 0;
  };
  const kick = () => { if (alive && !raf && visible && !document.hidden) raf = requestAnimationFrame(tick); };
  const onVis = () => kick();
  document.addEventListener('visibilitychange', onVis);
  kick();
  return {
    kick,
    destroy() { alive = false; cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis); },
  };
}

function fitCanvas(canvas) {
  const r = canvas.getBoundingClientRect();
  const dpr = DPR();
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W: r.width, H: r.height };
}

// ---------------------------------------------------------------------------
// Asteroid body: an irregular, cratered rock lit from the upper left
function makeRock(seed) {
  const r = rng(seed);
  const n = 11 + Math.floor(r() * 4);
  const verts = [];
  for (let i = 0; i < n; i++) verts.push([(i / n) * TAU, 0.72 + r() * 0.36]);
  const craters = Array.from({ length: 3 + Math.floor(r() * 3) }, () => {
    const a = r() * TAU, d = r() * 0.5;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.1 + r() * 0.16 };
  });
  const spin = (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.9);
  return { verts, craters, spin, angle: r() * TAU };
}
function drawRock(ctx, rock, x, y, size, light = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rock.angle);
  ctx.beginPath();
  rock.verts.forEach(([a, k], i) => {
    const px = Math.cos(a) * k * size, py = Math.sin(a) * k * size;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  });
  ctx.closePath();
  // Lighting stays fixed while the rock spins, so counter-rotate the gradient
  const la = -rock.angle - 2.3;
  const g = ctx.createRadialGradient(Math.cos(la) * size * 0.5, Math.sin(la) * size * 0.5, size * 0.1, 0, 0, size * 1.15);
  g.addColorStop(0, `rgba(236, 214, 182, ${light})`);
  g.addColorStop(0.55, `rgba(150, 122, 96, ${light})`);
  g.addColorStop(1, `rgba(52, 40, 34, ${light})`);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  rock.craters.forEach((c) => {
    ctx.beginPath();
    ctx.arc(c.x * size, c.y * size, c.r * size, 0, TAU);
    ctx.fillStyle = 'rgba(40, 28, 22, 0.35)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x * size + Math.cos(la) * c.r * size * 0.3, c.y * size + Math.sin(la) * c.r * size * 0.3, c.r * size * 0.75, 0, TAU);
    ctx.fillStyle = 'rgba(255, 236, 210, 0.12)';
    ctx.fill();
  });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Background starfield: three depth layers, spring-smoothed pointer parallax, rare shooting stars
export function starfield(canvas) {
  let W = 0, H = 0, ctx, stars = [], meteors = [];
  let ink = '255,255,255', light = false;
  const pointer = { tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0 };
  let nextMeteor = 3 + Math.random() * 5;

  const readTheme = () => {
    ink = cssVar(document.documentElement, '--ov') || '255,255,255';
    light = cssVar(document.documentElement, 'color-scheme') === 'light';
    if (reduced()) draw(0);
  };
  const seed = () => {
    ({ ctx, W, H } = fitCanvas(canvas));
    const count = Math.round((W * H) / 5200);
    stars = Array.from({ length: count }, () => {
      const d = Math.random();
      return { x: Math.random(), y: Math.random(), d, r: 0.35 + d * 1.05, a: 0.25 + d * 0.6, tw: Math.random() * TAU, ts: 0.4 + Math.random() * 1.6 };
    });
  };
  const onMove = (e) => { pointer.tx = e.clientX / innerWidth - 0.5; pointer.ty = e.clientY / innerHeight - 0.5; };
  window.addEventListener('pointermove', onMove, { passive: true });

  function draw(dt, t = 0) {
    // Spring toward the pointer so the parallax has momentum instead of tracking 1:1
    pointer.vx += (pointer.tx - pointer.x) * 0.045; pointer.vx *= 0.82; pointer.x += pointer.vx;
    pointer.vy += (pointer.ty - pointer.y) * 0.045; pointer.vy *= 0.82; pointer.y += pointer.vy;

    ctx.clearRect(0, 0, W, H);
    const alphaScale = light ? 0.45 : 1;
    for (const s of stars) {
      const px = ((s.x * W - pointer.x * 36 * s.d + t * 2.2 * s.d) % W + W) % W;
      const py = ((s.y * H - pointer.y * 26 * s.d) % H + H) % H;
      const tw = reduced() ? 1 : 0.65 + 0.35 * Math.sin(t * s.ts + s.tw);
      ctx.globalAlpha = s.a * tw * alphaScale;
      ctx.fillStyle = `rgb(${ink})`;
      ctx.beginPath();
      ctx.arc(px, py, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (reduced() || light) return;
    nextMeteor -= dt;
    if (nextMeteor <= 0) {
      nextMeteor = 7 + Math.random() * 9;
      const ang = (20 + Math.random() * 25) * D2R;
      meteors.push({ x: Math.random() * W * 0.7, y: Math.random() * H * 0.35, ang, len: 140 + Math.random() * 120, life: 0, dur: 0.9 + Math.random() * 0.4 });
    }
    meteors = meteors.filter((m) => (m.life += dt) < m.dur);
    for (const m of meteors) {
      const p = easeOut(m.life / m.dur);
      const dist = p * 520;
      const hx = m.x + Math.cos(m.ang) * dist, hy = m.y + Math.sin(m.ang) * dist;
      const tail = m.len * (1 - p * 0.6);
      const g = ctx.createLinearGradient(hx, hy, hx - Math.cos(m.ang) * tail, hy - Math.sin(m.ang) * tail);
      const fade = 1 - p;
      g.addColorStop(0, `rgba(255,255,255,${0.85 * fade})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - Math.cos(m.ang) * tail, hy - Math.sin(m.ang) * tail);
      ctx.stroke();
    }
  }

  seed();
  readTheme();
  themeListeners.add(readTheme);
  let time = 0;
  const l = loop(canvas, (dt) => { time += dt; draw(dt, time); });
  const ro = new ResizeObserver(() => { seed(); draw(0, time); });
  ro.observe(canvas);
  draw(0, 0);
  reduceMQ.addEventListener('change', () => { draw(0, time); l.kick(); });
}

// ---------------------------------------------------------------------------
// First-visit intro: a short hyperspace warp that settles into the app (skippable)
export function intro() {
  return new Promise((resolve) => {
    let seen = false;
    try { seen = sessionStorage.getItem('cosmos-intro') === '1'; sessionStorage.setItem('cosmos-intro', '1'); } catch {}
    if (seen || reduced()) return resolve();

    const root = document.createElement('div');
    root.className = 'intro';
    root.innerHTML = `
      <canvas></canvas>
      <div class="intro-brand">
        <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" fill="currentColor"/>
          <ellipse class="intro-ring" cx="12" cy="12" rx="10.5" ry="4.6" fill="none" stroke="currentColor" stroke-opacity=".6" stroke-width="1.2" transform="rotate(-24 12 12)"/>
        </svg>
        <div class="intro-word">Cosmos Hub</div>
        <div class="intro-sub">Near-Earth objects and natural events, live from NASA</div>
      </div>
      <div class="intro-skip">Click or press any key to skip</div>`;
    document.body.appendChild(root);
    const canvas = root.querySelector('canvas');
    let { ctx, W, H } = fitCanvas(canvas);
    const stars = Array.from({ length: 520 }, () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random() }));
    const DUR = 1.55;
    let t = 0, last = 0, done = false, raf = 0;

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      root.setAttribute('data-leaving', '');
      window.removeEventListener('keydown', finish, true);
      setTimeout(() => root.remove(), 420);
      resolve();
    };
    root.addEventListener('pointerdown', finish);
    setTimeout(finish, 3200); // never hold the app hostage if frames are throttled
    window.addEventListener('keydown', finish, true);

    const frame = (now) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      t += dt;
      // Speed ramps up then brakes hard, like dropping out of hyperspace
      const p = Math.min(1, t / DUR);
      const speed = p < 0.45 ? easeInOut(p / 0.45) : 1 - easeOut((p - 0.45) / 0.55);
      ctx.fillStyle = 'rgba(8, 7, 20, 0.34)';
      ctx.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2, f = Math.max(W, H) * 0.5;
      ctx.lineCap = 'round';
      for (const s of stars) {
        const pz = s.z;
        s.z -= dt * (0.08 + speed * 1.9);
        if (s.z <= 0.02) { s.z = 1; s.x = (Math.random() - 0.5) * 2; s.y = (Math.random() - 0.5) * 2; continue; }
        const x1 = cx + (s.x / pz) * f * 0.5, y1 = cy + (s.y / pz) * f * 0.5;
        const x2 = cx + (s.x / s.z) * f * 0.5, y2 = cy + (s.y / s.z) * f * 0.5;
        const b = Math.min(1, (1 - s.z) * 1.4);
        ctx.strokeStyle = `rgba(${200 + 55 * b | 0}, ${210 + 45 * b | 0}, 255, ${b})`;
        ctx.lineWidth = 0.6 + (1 - s.z) * 1.6;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      if (t >= DUR + 0.45) return finish();
      raf = requestAnimationFrame(frame);
    };
    ctx.fillStyle = '#080714';
    ctx.fillRect(0, 0, W, H);
    raf = requestAnimationFrame(frame);
    root.offsetWidth;
    root.setAttribute('data-in', '');
  });
}

// ---------------------------------------------------------------------------
// Hero flyby: the next asteroid falls past Earth on a gravity-bent path, with a live distance readout
export function flyby(canvas, { ld, label, fmt, seed }) {
  let ctx, W, H;
  const rock = makeRock(seed);
  const stars = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), d: Math.random(), tw: Math.random() * TAU }));
  const particles = [];
  const rings = [];
  const pointer = { tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0 };
  let geo;
  let s = 0.06; // progress along the path; 0.115 is the left edge, 0.88 the right
  let wait = 0, passed = false, moonA = 0.6;

  const layout = () => {
    ({ ctx, W, H } = fitCanvas(canvas));
    const ex = W * 0.56, ey = H * 0.9, er = Math.max(16, H * 0.085);
    const moonR = H * 0.3;
    const scale = H * 0.2;
    const dPx = Math.min(H * 0.62, ld <= 1 ? moonR * Math.sqrt(ld) : moonR + scale * Math.log10(ld));
    geo = { ex, ey, er, moonR, scale, dPx };
    // The drawing scale is capped, so calibrate the readout to show the true miss distance at perigee
    geo.cal = ld / rawLd(dPx);
  };
  // Path in screen space: far from Earth at the edges, bending in to the true miss distance at perigee
  const pathAt = (u) => {
    const { ex, ey, dPx } = geo;
    const x = -W * 0.15 + u * W * 1.3;
    const k = (x - ex) / (W * 0.28);
    const y = ey - dPx - H * 0.12 * (1 - Math.exp(-k * k)) + k * H * 0.03;
    return [x, y];
  };
  const rawLd = (px) => {
    const { moonR, scale } = geo;
    return px <= moonR ? Math.pow(px / moonR, 2) : Math.pow(10, (px - moonR) / scale);
  };
  const pxToLd = (px) => rawLd(px) * geo.cal;
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.tx = (e.clientX - r.left) / r.width - 0.5;
    pointer.ty = (e.clientY - r.top) / r.height - 0.5;
  };
  canvas.parentElement.addEventListener('pointermove', onMove);

  function draw(dt, t) {
    const { ex, ey, er, moonR } = geo;
    pointer.vx += (pointer.tx - pointer.x) * 0.05; pointer.vx *= 0.8; pointer.x += pointer.vx;
    pointer.vy += (pointer.ty - pointer.y) * 0.05; pointer.vy *= 0.8; pointer.y += pointer.vy;
    ctx.clearRect(0, 0, W, H);

    // Stars, with depth parallax
    for (const st of stars) {
      const x = st.x * W - pointer.x * 18 * st.d, y = st.y * H - pointer.y * 12 * st.d;
      ctx.globalAlpha = (0.15 + st.d * 0.55) * (0.7 + 0.3 * Math.sin(t * 1.3 + st.tw));
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, y, st.d > 0.85 ? 1.4 : 0.9, st.d > 0.85 ? 1.4 : 0.9);
    }
    ctx.globalAlpha = 1;

    // Earth: glow, ocean sphere, night side, atmosphere rim
    const glow = ctx.createRadialGradient(ex, ey, er * 0.6, ex, ey, er * 7);
    glow.addColorStop(0, 'rgba(91, 140, 255, 0.32)');
    glow.addColorStop(1, 'rgba(91, 140, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    const sph = ctx.createRadialGradient(ex - er * 0.45, ey - er * 0.5, er * 0.1, ex, ey, er);
    sph.addColorStop(0, '#9cc8ff');
    sph.addColorStop(0.45, '#3f74e0');
    sph.addColorStop(1, '#0d2160');
    ctx.fillStyle = sph;
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
    const night = ctx.createRadialGradient(ex + er * 0.9, ey + er * 0.7, 0, ex + er * 0.9, ey + er * 0.7, er * 1.6);
    night.addColorStop(0, 'rgba(5, 8, 24, 0.85)');
    night.addColorStop(1, 'rgba(5, 8, 24, 0)');
    ctx.fillStyle = night;
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(150, 195, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(120, 170, 255, 0.9)';
    ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(ex, ey, er + 0.5, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0;

    // Moon on its 1 LD orbit
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ex, ey, moonR, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    moonA -= dt * 0.12;
    const mx = ex + Math.cos(moonA) * moonR, my = ey + Math.sin(moonA) * moonR;
    const mg = ctx.createRadialGradient(mx - 1.5, my - 1.5, 0.5, mx, my, 4);
    mg.addColorStop(0, '#f1f2f5'); mg.addColorStop(1, '#6f7380');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, my, 3.6, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('Moon · 1 LD', ex + moonR * 0.72 + 6, ey - moonR * 0.72 - 4);

    // Advance along the path; faster near perigee, the way gravity speeds a flyby up
    if (wait > 0) {
      wait -= dt;
      if (wait <= 0) { s = 0.06; passed = false; particles.length = 0; }
    } else {
      const [px] = pathAt(s);
      const k = (px - ex) / (W * 0.3);
      s += dt * (0.05 + 0.07 * Math.exp(-k * k));
      if (s > 0.95) wait = 1.4;
    }
    const [ax, ay] = pathAt(Math.min(0.95, s));
    const [bx, by] = pathAt(Math.min(0.95, s) + 0.002);
    const heading = Math.atan2(by - ay, bx - ax);

    // Predicted path ahead (dashed) and the travelled arc behind (fading)
    ctx.setLineDash([2, 6]);
    ctx.strokeStyle = 'rgba(255, 196, 120, 0.22)';
    ctx.beginPath();
    for (let u = s; u <= 0.95; u += 0.01) { const [x, y] = pathAt(u); u === s ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 26; i++) {
      const u0 = s - i * 0.007, u1 = s - (i + 1) * 0.007;
      if (u1 < 0) break;
      const [x0, y0] = pathAt(u0), [x1, y1] = pathAt(u1);
      ctx.strokeStyle = `rgba(255, 190, 110, ${0.55 * (1 - i / 26)})`;
      ctx.lineWidth = 2.2 * (1 - i / 26) + 0.3;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }

    // Dust shed by the rock, drawn additively so it glows
    if (wait <= 0) {
      for (let i = 0; i < 2; i++) {
        particles.push({
          x: ax - Math.cos(heading) * 5, y: ay - Math.sin(heading) * 5,
          vx: -Math.cos(heading) * (8 + Math.random() * 16) + (Math.random() - 0.5) * 10,
          vy: -Math.sin(heading) * (8 + Math.random() * 16) + (Math.random() - 0.5) * 10,
          life: 0, max: 0.8 + Math.random() * 0.9, r: 0.6 + Math.random() * 1.4,
        });
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.max) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const f = 1 - p.life / p.max;
      ctx.fillStyle = `rgba(255, ${170 + 60 * f | 0}, ${90 + 80 * f | 0}, ${0.55 * f})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + f), 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Live distance line from Earth to the rock
    const dist = Math.hypot(ax - ex, ay - ey) - 0;
    const liveLd = pxToLd(dist);
    const near = Math.exp(-Math.pow((ax - ex) / (W * 0.22), 2));
    if (near > 0.08 && wait <= 0) {
      const fadeIn = Math.min(1, (near - 0.08) * 5);
      ctx.strokeStyle = `rgba(255,255,255,${(0.1 + near * 0.25) * fadeIn})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ex, ey - er - 2); ctx.lineTo(ax, ay); ctx.stroke();
      const lx = (ex + ax) / 2 + 8, ly = (ey - er + ay) / 2;
      ctx.fillStyle = `rgba(255,255,255,${(0.45 + near * 0.45) * fadeIn})`;
      ctx.font = '500 11.5px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(`${fmt(liveLd)} LD`, lx, ly);
      if (near > 0.6) {
        ctx.fillStyle = `rgba(255, 200, 120, ${(near - 0.6) * 2.2})`;
        ctx.font = '10.5px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText('closest approach', lx, ly + 14);
      }
    }

    // Pulse rings when the rock reaches perigee
    if (!passed && ax >= ex && wait <= 0) {
      passed = true;
      rings.push({ x: ax, y: ay, t: 0 }, { x: ex, y: ey, t: -0.12, big: true });
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt;
      if (r.t > 1.2) { rings.splice(i, 1); continue; }
      if (r.t < 0) continue;
      const p = easeOut(r.t / 1.2);
      ctx.strokeStyle = r.big ? `rgba(140, 180, 255, ${0.5 * (1 - p)})` : `rgba(255, 200, 120, ${0.7 * (1 - p)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(r.x, r.y, (r.big ? er + 4 : 5) + p * (r.big ? 40 : 30), 0, TAU); ctx.stroke();
    }

    // The rock itself
    rock.angle += dt * rock.spin;
    if (wait <= 0) {
      ctx.shadowColor = 'rgba(255, 190, 110, 0.6)';
      ctx.shadowBlur = 12;
      drawRock(ctx, rock, ax, ay, Math.max(5, H * 0.022));
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '500 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(label, ax + 12, ay - 10);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.font = '9.5px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Distances not to scale beyond the Moon', W - 10, H - 10);
    ctx.textAlign = 'left';
  }

  layout();
  if (reduced()) { s = 0.5; draw(0, 0); }
  const l = loop(canvas, (dt, t) => draw(dt, t));
  const ro = new ResizeObserver(() => { layout(); if (reduced()) draw(0, 0); });
  ro.observe(canvas);
  return { destroy() { l.destroy(); ro.disconnect(); canvas.parentElement?.removeEventListener('pointermove', onMove); } };
}

// ---------------------------------------------------------------------------
// Small spinning rock for the asteroid drawer header, sized by estimated diameter
export function rockAvatar(canvas, seed, sizeFactor) {
  const rock = makeRock(seed);
  const draw = (dt) => {
    // Fit every frame: the drawer may still be hidden when this starts
    const { ctx, W, H } = fitCanvas(canvas);
    rock.angle += dt * rock.spin * 0.6;
    ctx.clearRect(0, 0, W, H);
    drawRock(ctx, rock, W / 2, H / 2, (Math.min(W, H) / 2) * (0.55 + 0.35 * sizeFactor));
  };
  draw(0);
  const l = loop(canvas, draw);
  return l;
}

// ---------------------------------------------------------------------------
// Dotted 3D globe for Earth events: drag to spin with inertia, click a marker, fly to an event
let landDots = null;
function buildLandDots(landPath) {
  if (landDots) return landDots;
  const rings = landPath.split('M').filter(Boolean).map((r) =>
    r.replace(/Z/g, '').split('L').map((p) => { const [x, y] = p.trim().split(/\s+/).map(Number); return [x - 180, 90 - y]; }));
  const boxes = rings.map((r) => {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const [x, y] of r) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); }
    return [a, b, c, d];
  });
  const inside = (lon, lat) => {
    let hit = false;
    for (let k = 0; k < rings.length; k++) {
      const [a, b, c, d] = boxes[k];
      if (lon < a || lon > b || lat < c || lat > d) continue;
      const r = rings[k];
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i], [xj, yj] = r[j];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
      }
    }
    return hit;
  };
  const out = [];
  const step = 1.5;
  for (let lat = -84; lat <= 84; lat += step) {
    const lonStep = step / Math.max(0.2, Math.cos(lat * D2R));
    for (let lon = -180; lon < 180; lon += lonStep) if (inside(lon, lat)) out.push(lon, lat);
  }
  landDots = new Float32Array(out);
  return landDots;
}

export function globe(canvas, { land, events, isOn, onSelect, onHover }) {
  const dots = buildLandDots(land);
  let ctx, W, H, R, cx, cy;
  let rotLon = -30, rotLat = 18, zoom = 1;
  let velLon = 0, velLat = 0, dragging = false, lastInteract = -10, clock = 0;
  let tween = null, selected = null, hoverId = null;
  let colors = {};

  const readColors = () => {
    const el = canvas;
    colors = {
      bg: cssVar(el, '--map-bg') || '#151a2e',
      ink: cssVar(el, '--ov') || '255,255,255',
      accent: cssVar(el, '--accent') || '#a8b6ff',
      light: cssVar(document.documentElement, 'color-scheme') === 'light',
      cat: Object.fromEntries(['wildfires', 'severeStorms', 'volcanoes', 'seaLakeIce', 'dustHaze', 'floods', 'snow', 'landslides'].map((k) => [k, cssVar(el, `--c-${k}`) || '#fff'])),
    };
  };
  const layout = () => {
    ({ ctx, W, H } = fitCanvas(canvas));
    cx = W / 2; cy = H / 2;
    R = Math.min(W, H) * 0.42;
  };
  const project = (lon, lat) => {
    const l = (lon - rotLon) * D2R, p = lat * D2R, p0 = rotLat * D2R;
    const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
    const x = Math.cos(p) * Math.sin(l);
    const y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l);
    return [cx + x * R * zoom, cy - y * R * zoom, cosc];
  };
  const last = (e) => e.geometries[e.geometries.length - 1];

  function draw(dt) {
    clock += dt;
    // Motion sources, in priority order: a fly-to tween, drag inertia, idle auto-rotate
    if (tween) {
      tween.t += dt;
      const p = easeInOut(Math.min(1, tween.t / tween.dur));
      rotLon = tween.lon0 + tween.dLon * p;
      rotLat = tween.lat0 + (tween.lat1 - tween.lat0) * p;
      zoom = tween.z0 + (tween.z1 - tween.z0) * p;
      if (tween.t >= tween.dur) tween = null;
    } else if (!dragging && (Math.abs(velLon) > 0.01 || Math.abs(velLat) > 0.01)) {
      rotLon += velLon * dt * 60; rotLat = Math.max(-70, Math.min(70, rotLat + velLat * dt * 60));
      velLon *= Math.pow(0.93, dt * 60); velLat *= Math.pow(0.93, dt * 60);
    } else if (!dragging && !selected && clock - lastInteract > 2.5) {
      rotLon += dt * 5;
    }

    const r = R * zoom;
    ctx.clearRect(0, 0, W, H);

    // Atmosphere glow and the sphere
    const halo = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.22);
    halo.addColorStop(0, colors.light ? 'rgba(80,110,160,0.18)' : 'rgba(140,170,255,0.22)');
    halo.addColorStop(1, 'rgba(140,170,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.22, 0, TAU); ctx.fill();
    const sph = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    sph.addColorStop(0, `rgba(${colors.ink}, ${colors.light ? 0.10 : 0.09})`);
    sph.addColorStop(1, `rgba(${colors.ink}, 0.015)`);
    ctx.fillStyle = colors.bg;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.fillStyle = sph;
    ctx.fill();
    ctx.strokeStyle = `rgba(${colors.ink}, 0.14)`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Graticule
    ctx.strokeStyle = `rgba(${colors.ink}, 0.06)`;
    ctx.lineWidth = 0.8;
    const line = (pts) => {
      ctx.beginPath();
      let on = false;
      for (const [lo, la] of pts) {
        const [x, y, c] = project(lo, la);
        if (c > 0) { on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; } else on = false;
      }
      ctx.stroke();
    };
    for (let lo = -180; lo < 180; lo += 30) line(Array.from({ length: 61 }, (_, i) => [lo, -90 + i * 3]));
    for (let la = -60; la <= 60; la += 30) line(Array.from({ length: 121 }, (_, i) => [-180 + i * 3, la]));

    // Land as dots, fading toward the limb
    const dotSize = Math.max(1.1, r / 260) * (colors.light ? 1.1 : 1);
    const buckets = [[], [], [], []];
    for (let i = 0; i < dots.length; i += 2) {
      const [x, y, c] = project(dots[i], dots[i + 1]);
      if (c <= 0.02) continue;
      buckets[Math.min(3, (c * 4) | 0)].push(x, y);
    }
    buckets.forEach((b, k) => {
      ctx.fillStyle = `rgba(${colors.ink}, ${(colors.light ? 0.16 : 0.16) + k * (colors.light ? 0.09 : 0.13)})`;
      for (let i = 0; i < b.length; i += 2) ctx.fillRect(b[i] - dotSize / 2, b[i + 1] - dotSize / 2, dotSize, dotSize);
    });

    // Events
    const hits = [];
    for (const e of events) {
      if (!isOn(e)) continue;
      const col = colors.cat[e.categoryId] || colors.accent;
      if (e.geometries.length > 1) {
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1.4;
        line(e.geometries.map((g) => [g.longitude, g.latitude]));
        ctx.globalAlpha = 1;
      }
      const g = last(e);
      const [x, y, c] = project(g.longitude, g.latitude);
      if (c <= 0.05) continue;
      const isSel = e.eventId === selected, isHover = e.eventId === hoverId;
      const fresh = !e.closed && Date.now() - new Date(g.observationDate + 'Z') < 864e5;
      if (fresh && !reduced()) {
        const ph = ((clock * 0.45 + (e.id % 7) / 7) % 1);
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.55 * (1 - ph) * c;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, 3 + easeOut(ph) * 14, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const rad = (isSel ? 5.5 : isHover ? 4.6 : 3.2) * (0.6 + 0.4 * c);
      ctx.shadowColor = col;
      ctx.shadowBlur = isSel ? 16 : 8;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      if (isSel) {
        ctx.strokeStyle = colors.light ? 'rgba(20,24,33,.85)' : '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, rad + 3, 0, TAU); ctx.stroke();
      }
      hits.push([e, x, y, c]);
    }
    hitList = hits;
  }
  let hitList = [];
  const hitTest = (mx, my) => {
    let best = null, bd = 12;
    for (const [e, x, y] of hitList) { const d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = [e, x, y]; } }
    return best;
  };

  // Pointer: drag rotates with inertia; a press that barely moves is a click
  let start = null, prev = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (dragging) return;
    dragging = true; tween = null;
    start = prev = { x: e.clientX, y: e.clientY, t: performance.now() };
    velLon = velLat = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    l.kick();
  });
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    if (dragging) {
      const k = 0.28 / zoom;
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      rotLon -= dx * k;
      rotLat = Math.max(-70, Math.min(70, rotLat + dy * k));
      velLon = -dx * k; velLat = dy * k;
      prev = { x: e.clientX, y: e.clientY, t: performance.now() };
      lastInteract = clock;
      if (reduced()) draw(0);
      return;
    }
    const h = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    const id = h ? h[0].eventId : null;
    canvas.style.cursor = h ? 'pointer' : 'grab';
    if (id !== hoverId) { hoverId = id; if (reduced()) draw(0); }
    onHover(h ? h[0] : null, h ? rect.left + h[1] : 0, h ? rect.top + h[2] : 0);
  });
  const up = (e) => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = 'grab';
    lastInteract = clock;
    if (performance.now() - prev.t > 80) { velLon = velLat = 0; }
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) {
      const rect = canvas.getBoundingClientRect();
      const h = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (h) onSelect(h[0].eventId);
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => { if (!dragging) { hoverId = null; onHover(null); } });

  readColors();
  layout();
  themeListeners.add(readColors);
  const l = loop(canvas, draw);
  const ro = new ResizeObserver(() => { layout(); draw(0); });
  ro.observe(canvas);
  draw(0);

  return {
    select(id, ev) {
      selected = id;
      if (ev) {
        const g = last(ev);
        let dLon = g.longitude - rotLon;
        dLon = ((dLon + 540) % 360) - 180; // shortest way round
        const target = { lon0: rotLon, dLon, lat0: rotLat, lat1: Math.max(-60, Math.min(60, g.latitude * 0.85)), z0: zoom, z1: 1.18 };
        if (reduced()) { rotLon += dLon; rotLat = target.lat1; zoom = 1.18; draw(0); }
        else tween = { ...target, t: 0, dur: 1.1 };
      } else if (zoom !== 1) {
        if (reduced()) { zoom = 1; draw(0); }
        else tween = { lon0: rotLon, dLon: 0, lat0: rotLat, lat1: rotLat, z0: zoom, z1: 1, t: 0, dur: 0.7 };
      }
      lastInteract = clock;
      l.kick();
    },
    redraw() { draw(0); },
    destroy() { l.destroy(); ro.disconnect(); themeListeners.delete(readColors); },
  };
}

// ---------------------------------------------------------------------------
// Orbit time-lapse in the asteroid drawer: Earth and the rock move along their orbits
export function orbitPlayer(svg, { a, e, w, S, ma, n, L0, onDate }) {
  const earth = svg.querySelector('[data-earth]');
  const ast = svg.querySelector('[data-ast]');
  const DAYS_PER_SEC = 36.5; // one year in ten seconds
  let days = 0, playing = !reduced();
  const place = () => {
    const L = (L0 + 0.98565 * days) * D2R;
    earth.setAttribute('cx', (Math.cos(L) * S).toFixed(1));
    earth.setAttribute('cy', (-Math.sin(L) * S).toFixed(1));
    const M = ((ma + n * days) % 360) * D2R;
    let E = M;
    for (let k = 0; k < 8; k++) E = M + e * Math.sin(E);
    const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    const r = a * (1 - e * Math.cos(E));
    ast.setAttribute('cx', (r * Math.cos(nu + w) * S).toFixed(1));
    ast.setAttribute('cy', (-r * Math.sin(nu + w) * S).toFixed(1));
    onDate(days);
  };
  let delay = 1.1; // let the path finish drawing first
  const l = loop(svg, (dt) => {
    if (!svg.isConnected) return l.destroy();
    if (!playing) return;
    if (delay > 0) { delay -= dt; return; }
    days += dt * DAYS_PER_SEC;
    place();
  });
  place();
  return {
    destroy() { l.destroy(); },
    toggle() { playing = !playing; if (playing) { delay = 0; l.kick(); } return playing; },
    get playing() { return playing; },
  };
}

