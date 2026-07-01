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

// --- hero background: animated dithered dot-field (a shimmering orb) ---
const hd = document.getElementById("heroDither");
if (hd && hd.getContext) {
  const g = hd.getContext("2d");
  let W, H;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = hd.clientWidth; H = hd.clientHeight;
    hd.width = W * dpr; hd.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize(); window.addEventListener("resize", resize);
  let t = 0;
  function draw() {
    if (!reduce) t += 0.02;
    g.clearRect(0, 0, W, H);
    const step = 10, cx = W * 0.5, cy = H * 0.5, rad = Math.max(W, H) * 0.62;
    for (let y = 4; y < H; y += step) {
      for (let x = 4; x < W; x += step) {
        const fall = 1 - Math.hypot(x - cx, y - cy) / rad;
        if (fall <= 0) continue;
        const n = 0.5 + 0.5 * Math.sin(x * 0.03 + t) * Math.cos(y * 0.028 - t * 0.8) + 0.25 * Math.sin((x + y) * 0.02 + t * 1.4);
        const v = fall * Math.max(0, Math.min(1.2, n));
        if (v > 0.28) {
          g.fillStyle = `rgba(237,237,234,${Math.min(0.85, v * 0.8)})`;
          g.beginPath(); g.arc(x, y, Math.min(2.6, v * 2.4), 0, Math.PI * 2); g.fill();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

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

// --- below-footer: flat stacked lines that spring up into a wireframe cube on scroll ---
const cv = document.getElementById("cube");
if (cv && cv.getContext) {
  const ctx = cv.getContext("2d");
  let W, H;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize(); window.addEventListener("resize", resize);

  const CORNERS = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const EDGES = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

  let a = 0;              // rotation (only once assembled)
  let m = 0, vel = 0;     // morph 0=flat lines → 1=cube, springy
  const clampp = (n) => Math.max(0, Math.min(1, n));
  const rot = (p) => {
    let [x, y, z] = p;
    const ct = Math.cos(-0.5), st = Math.sin(-0.5);
    [y, z] = [y * ct - z * st, y * st + z * ct];
    const ca = Math.cos(a), sa = Math.sin(a);
    [x, z] = [x * ca + z * sa, -x * sa + z * ca];
    return [x, y, z];
  };
  const lerp = (A, B, e) => [A[0] + (B[0] - A[0]) * e, A[1] + (B[1] - A[1]) * e];

  function frame() {
    // scroll target: assemble as the 260px canvas rises a full canvas-height into view
    const rectTop = cv.getBoundingClientRect().top;
    const vh = window.innerHeight;
    const target = reduce ? 1 : clampp((vh - rectTop - 40) / 200);
    vel += (target - m) * 0.1; vel *= 0.78; m += vel;      // spring w/ overshoot
    const e = clampp(m);
    if (!reduce) a += 0.005 * e;

    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, s = Math.min(H * 0.32, 74), f = 4.2;
    const halfW = Math.min(W * 0.28, 360), gap = 15;

    // project cube corners (with perspective)
    const proj = CORNERS.map((p) => {
      const [x, y, z] = rot(p); const k = f / (f + z);
      return [cx + x * s * k, cy + y * s * k, z];
    });

    // draw the 12 edges: each blends from a stacked flat line → its cube edge
    ctx.lineCap = "round";
    EDGES.forEach((ed, i) => {
      const flatY = cy + (i - (EDGES.length - 1) / 2) * gap;
      const A = lerp([cx - halfW, flatY], proj[ed[0]], e);
      const B = lerp([cx + halfW, flatY], proj[ed[1]], e);
      const depth = (proj[ed[0]][2] + proj[ed[1]][2]) / 2;
      const t = (depth + 1.6) / 3.2;                         // 0 near → 1 far
      ctx.strokeStyle = `rgba(237,237,234,${(0.85 - t * 0.5) * (0.5 + 0.5 * e)})`;
      ctx.lineWidth = 1.4 - t * 0.6;
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    });

    // glowing green corner dots (fade in as it assembles)
    const order = proj.map((p, i) => i).sort((A, B) => proj[B][2] - proj[A][2]);
    for (const i of order) {
      const p = proj[i], t = (p[2] + 1.6) / 3.2;
      const flatY = cy + (i - 3.5) * gap;
      const pos = lerp([cx, flatY], [p[0], p[1]], e);
      ctx.fillStyle = `rgba(198,242,74,${0.55 + 0.45 * e})`;
      ctx.shadowColor = "rgba(198,242,74,.7)"; ctx.shadowBlur = 10 * (1 - t) * e;
      ctx.beginPath(); ctx.arc(pos[0], pos[1], 3.4 - t * 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

