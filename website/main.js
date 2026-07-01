// UnityPilot site — progressive enhancement. Works without JS; motion respects reduced-motion.
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp01 = (n) => Math.max(0, Math.min(1, n));

// --- copy the install one-liner ---
document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(btn.getAttribute("data-copy") || "");
      const prev = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => { btn.textContent = prev; }, 1300);
    } catch { btn.textContent = "⌘C"; }
  });
});

// --- hero CRT screen: a small spinning green dithered cube + a typing build log ---
const hs = document.getElementById("heroScreen");
const hlog = document.getElementById("heroLog");
if (hs && hs.getContext) {
  const c = hs.getContext("2d");
  let HW, HH;
  const hr = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    HW = hs.clientWidth; HH = hs.clientHeight;
    hs.width = HW * dpr; hs.height = HH * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  hr(); window.addEventListener("resize", hr);

  // glowing green wireframe cube (vector-display look)
  const HV = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const HE = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  let a = 0;
  const rc = (p) => {
    let [x, y, z] = p;
    const ct = Math.cos(-0.5), stt = Math.sin(-0.5);
    [y, z] = [y * ct - z * stt, y * stt + z * ct];
    const ca = Math.cos(a), sa = Math.sin(a);
    [x, z] = [x * ca + z * sa, -x * sa + z * ca];
    return [x, y, z];
  };
  function hf() {
    if (!reduce) a += 0.009;
    c.clearRect(0, 0, HW, HH);
    const cx = HW / 2, cy = HH * 0.40, s = Math.min(HW, HH) * 0.30, f = 3.6;
    const pts = HV.map((p) => { const [x, y, z] = rc(p); const k = f / (f + z); return [cx + x * s * k, cy + y * s * k, z]; });
    c.lineWidth = 1.8; c.lineCap = "round"; c.lineJoin = "round";
    c.shadowColor = "rgba(185,242,74,.9)"; c.shadowBlur = 14;
    c.strokeStyle = "rgba(196,245,90,.95)";
    for (const [u, v] of HE) { c.beginPath(); c.moveTo(pts[u][0], pts[u][1]); c.lineTo(pts[v][0], pts[v][1]); c.stroke(); }
    c.fillStyle = "#dcff7a"; c.shadowBlur = 16;
    for (const p of pts) { c.beginPath(); c.arc(p[0], p[1], 2.6, 0, Math.PI * 2); c.fill(); }
    c.shadowBlur = 0;
    requestAnimationFrame(hf);
  }
  requestAnimationFrame(hf);

  // typing build log that loops
  if (hlog) {
    const lines = ['> build a spinning cube', '[ok] scene "Level1"', '[ok] cube + Spin.cs', '[ok] screenshot -> chat'];
    let li = 0, ci = 0;
    const step = () => {
      if (reduce) { hlog.innerHTML = lines.join("<br>"); return; }
      const shown = lines.slice(0, li).join("\n") + (li < lines.length ? "\n" + lines[li].slice(0, ci) : "");
      hlog.innerHTML = shown.replace(/\n/g, "<br>").replace(/^<br>/, "") + '<span class="cur">_</span>';
      if (li < lines.length) {
        ci++; if (ci > lines[li].length) { li++; ci = 0; }
        setTimeout(step, 36 + Math.random() * 46);
      } else {
        setTimeout(() => { li = 0; ci = 0; step(); }, 2800);
      }
    };
    step();
  }
}

// --- below-footer cube: a field of dots laid out as horizontal lines that
//     spring/assemble into a 3D cube as you scroll into the section ---
const cv = document.getElementById("cube");
if (cv && cv.getContext) {
  const ctx = cv.getContext("2d");
  const panel = document.getElementById("cubereveal");
  let W, H, DPR;
  const resize = () => {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  // points on the 6 cube faces
  const P = [], M = 5;
  for (let axis = 0; axis < 3; axis++) {
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
        const u = -1 + (2 * i) / (M - 1), v = -1 + (2 * j) / (M - 1);
        const p = [0, 0, 0];
        p[axis] = s; p[(axis + 1) % 3] = u; p[(axis + 2) % 3] = v;
        P.push(p);
      }
    }
  }
  const COLS = 30, ROWS = Math.ceil(P.length / COLS);

  let ang = 0, disp = 0, vel = 0, target = 0, lastInput = -9999;

  // Engage only when the page is scrolled all the way to the bottom (the cube
  // sits below the footer). Then scrolling *fights a spring* to assemble it.
  const atBottom = () =>
    window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 6;

  // Rubber-band: pulling down adds with diminishing returns (tough to scroll),
  // and we swallow the scroll so the page stays put and you feel the tension.
  const pull = (delta, k) => {
    target = Math.min(1, target + delta * k * (1 - target * 0.5));
    lastInput = performance.now();
  };
  window.addEventListener("wheel", (e) => {
    if (reduce) return;
    if (e.deltaY > 0 && atBottom()) { pull(e.deltaY, 0.0017); e.preventDefault(); }
    else if (e.deltaY < 0) { target = Math.max(0, target - 0.09); }
  }, { passive: false });
  let ty = 0;
  window.addEventListener("touchstart", (e) => { ty = e.touches[0].clientY; }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (reduce) return;
    const y = e.touches[0].clientY, dy = ty - y; ty = y;
    if (dy > 0 && atBottom()) { pull(dy, 0.0065); if (e.cancelable) e.preventDefault(); }
    else if (dy < 0) { target = Math.max(0, target + dy * 0.012); }
  }, { passive: false });

  const rot = (p) => {
    let [x, y, z] = p;
    const tx = -0.5, ct = Math.cos(tx), st = Math.sin(tx);   // fixed tilt
    [y, z] = [y * ct - z * st, y * st + z * ct];
    const ca = Math.cos(ang), sa = Math.sin(ang);            // spin
    [x, z] = [x * ca + z * sa, -x * sa + z * ca];
    return [x, y, z];
  };

  function frame() {
    const now = performance.now();
    // hold the reveal while you're actively over-scrolling; ~1s after you stop, spring it back
    if (!reduce && now - lastInput > 1000) target += (0 - target) * 0.06;
    vel += (target - disp) * 0.12; vel *= 0.76; disp += vel;        // springy (overshoots)
    if (disp < 0.0004 && Math.abs(vel) < 0.0004) { disp = 0; vel = 0; }
    const d = disp;
    // slide the hidden panel up from the bottom by how far it's pulled
    if (panel) panel.style.transform = `translateY(${(1 - clamp01(d)) * 100}%)`;
    ang += (0.006 + 0.012 * clamp01(d)) * (reduce ? 0 : 1);

    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cyc = H / 2, s = Math.min(W, H) * 0.30, f = 3.6;
    const gx = Math.min(W * 0.66, 760) / (COLS - 1);
    const gy = Math.min(H * 0.5, 300) / (ROWS - 1);

    const dots = [];
    for (let i = 0; i < P.length; i++) {
      // flat target: a tidy grid of horizontal dotted lines
      const col = i % COLS, row = (i / COLS) | 0;
      const fx = cx + (col - (COLS - 1) / 2) * gx;
      const fy = cyc + (row - (ROWS - 1) / 2) * gy;
      // cube target
      const [x, y, z] = rot(P[i]);
      const k = f / (f + z);
      const px = cx + x * s * k, py = cyc + y * s * k;
      // interpolate (d can briefly exceed 1 → springy bounce past the cube)
      dots.push([fx + (px - fx) * d, fy + (py - fy) * d, z]);
    }
    dots.sort((a, b) => b[2] - a[2]);
    for (const p of dots) {
      const t = (p[2] + 1.6) / 3.2;
      ctx.fillStyle = `rgba(237,237,234,${0.9 - t * 0.6})`;
      ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(0.6, 2.0 - t * 1.2), 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
