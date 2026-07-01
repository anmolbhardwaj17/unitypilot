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
    const step = 9, cx = W * 0.42, cy = H * 0.5, rad = Math.min(W, H) * 0.66;
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

// --- below-footer: a slowly spinning dithered dot-cube ---
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
  const P = [], M = 6;
  for (let ax = 0; ax < 3; ax++) for (let s = -1; s <= 1; s += 2)
    for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
      const u = -1 + (2 * i) / (M - 1), v = -1 + (2 * j) / (M - 1);
      const p = [0, 0, 0]; p[ax] = s; p[(ax + 1) % 3] = u; p[(ax + 2) % 3] = v; P.push(p);
    }
  const CORNERS = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  let a = 0;
  const rot = (p) => {
    let [x, y, z] = p;
    const ct = Math.cos(-0.5), st = Math.sin(-0.5);
    [y, z] = [y * ct - z * st, y * st + z * ct];
    const ca = Math.cos(a), sa = Math.sin(a);
    [x, z] = [x * ca + z * sa, -x * sa + z * ca];
    return [x, y, z];
  };
  function frame() {
    if (!reduce) a += 0.006;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, s = Math.min(W, H) * 0.34, f = 3.6;
    const proj = (arr) => arr.map((p) => { const [x, y, z] = rot(p); const k = f / (f + z); return [cx + x * s * k, cy + y * s * k, z]; }).sort((A, B) => B[2] - A[2]);
    for (const p of proj(P)) {
      const t = (p[2] + 1.6) / 3.2;
      ctx.fillStyle = `rgba(237,237,234,${0.9 - t * 0.62})`;
      ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(0.6, 1.9 - t), 0, Math.PI * 2); ctx.fill();
    }
    for (const p of proj(CORNERS)) {
      const t = (p[2] + 1.6) / 3.2;
      ctx.fillStyle = "#c6f24a"; ctx.shadowColor = "rgba(198,242,74,.7)"; ctx.shadowBlur = 9 * (1 - t);
      ctx.beginPath(); ctx.arc(p[0], p[1], 3.2 - t * 1.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

