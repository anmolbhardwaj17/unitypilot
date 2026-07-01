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

// --- hero: orbiting arc of capability cards around the pitch ---
const arc = document.getElementById("arc");
if (arc) {
  const names = ["setup", "scene", "code", "assets", "vision", "test", "controller", "crt-cube", "character", "cracked"];
  names.forEach((n) => {
    const el = document.createElement("div"); el.className = "ac";
    const im = document.createElement("img"); im.src = "assets/" + n + ".png"; im.alt = ""; im.loading = "lazy";
    el.appendChild(im); arc.appendChild(el);
  });
  const cards = Array.from(arc.children);
  const N = cards.length;
  let rot = -Math.PI / 2;                       // start with a card at the top
  function layout() {
    const R = Math.min(window.innerWidth * 0.36, window.innerHeight * 0.46, 440);
    for (let i = 0; i < N; i++) {
      const theta = (i / N) * Math.PI * 2 + rot;
      const x = Math.cos(theta) * R, y = Math.sin(theta) * R;
      const tilt = theta * 180 / Math.PI + 90;
      cards[i].style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${tilt.toFixed(1)}deg)`;
      cards[i].style.opacity = Math.max(0, Math.min(1, 0.9 - (y / R) * 0.85)).toFixed(2);
      cards[i].style.zIndex = String(200 - Math.round(y));
    }
  }
  function tick() { if (!reduce) rot += 0.0015; layout(); requestAnimationFrame(tick); }
  window.addEventListener("resize", layout);
  requestAnimationFrame(tick);
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

