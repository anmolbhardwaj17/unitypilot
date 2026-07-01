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

  // dots sampled along the 12 cube edges — a dotted wireframe
  const CORNERS = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const EDGES = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const PER = 6;
  const NODES = [];
  for (const [ia, ib] of EDGES) {
    const A = CORNERS[ia], B = CORNERS[ib];
    for (let i = 0; i < PER; i++) {
      const t = i / (PER - 1);
      NODES.push({ p: [A[0]+(B[0]-A[0])*t, A[1]+(B[1]-A[1])*t, A[2]+(B[2]-A[2])*t], corner: i === 0 || i === PER - 1 });
    }
  }
  const ROWS = 4;
  NODES.forEach((n, i) => { n.row = i % ROWS; n.col = Math.floor(i / ROWS); });
  const COLS = Math.ceil(NODES.length / ROWS);

  const clampp = (n) => Math.max(0, Math.min(1, n));
  let a = 0, m = 0, vel = 0, over = reduce ? 1 : 0;   // over = how hard you're pulling past the end
  const rot = (p) => {
    let [x, y, z] = p;
    const ct = Math.cos(-0.5), st = Math.sin(-0.5);
    [y, z] = [y * ct - z * st, y * st + z * ct];
    const ca = Math.cos(a), sa = Math.sin(a);
    [x, z] = [x * ca + z * sa, -x * sa + z * ca];
    return [x, y, z];
  };

  // pull-to-build: only fires when the page is already at the very bottom and you keep scrolling down
  if (!reduce) {
    window.addEventListener("wheel", (e) => {
      const doc = document.documentElement;
      const atBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 2;
      if (atBottom && e.deltaY > 0) {
        over = Math.min(1, over + e.deltaY / 650);
        e.preventDefault();               // capture the over-scroll instead of rubber-banding
      }
    }, { passive: false });
  }

  function frame() {
    if (reduce) { m = 1; } else {
      over *= 0.90;                        // stop pulling → springs back to the strip
      vel += (over - m) * 0.14; vel *= 0.72; m += vel;   // spring with a little overshoot
      a += 0.02 * clampp(m);
    }
    const e = clampp(m);

    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, s = Math.min(H * 0.30, 70), f = 4.2;
    const stripW = Math.min(W * 0.6, 720), gapX = stripW / (COLS - 1), gapY = 15;

    const pts = NODES.map((n) => {
      const [x, y, z] = rot(n.p); const k = f / (f + z);
      const fx = cx - stripW / 2 + n.col * gapX;
      const fy = cy + (n.row - (ROWS - 1) / 2) * gapY;
      return { x: (cx + x * s * k) * e + fx * (1 - e), y: (cy + y * s * k) * e + fy * (1 - e), z, corner: n.corner };
    }).sort((A, B) => B.z - A.z);

    for (const p of pts) {
      const t = (p.z + 1.6) / 3.2;         // 0 near → 1 far
      if (p.corner) {
        ctx.fillStyle = `rgba(198,242,74,${0.6 + 0.4 * e})`;
        ctx.shadowColor = "rgba(198,242,74,.7)"; ctx.shadowBlur = 9 * (1 - t) * e;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3 - t * 1.1, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = `rgba(237,237,234,${0.42 + (0.45 - t * 0.5) * e})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.8, 1.9 - t), 0, Math.PI * 2); ctx.fill();
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

