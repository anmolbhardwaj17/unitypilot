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

// --- below-footer cube: a field of dots laid out as horizontal lines that
//     spring/assemble into a 3D cube as you scroll into the section ---
const cv = document.getElementById("cube");
if (cv && cv.getContext) {
  const ctx = cv.getContext("2d");
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
  const P = [], M = 9;
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
  const COLS = 26, ROWS = Math.ceil(P.length / COLS);

  let ang = 0, disp = 0, vel = 0;

  const progress = () => {
    if (reduce) return 1;
    const r = cv.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 when the section's top is at the bottom of the viewport, 1 once you've
    // scrolled it up by ~85% of a screen — assembly tracks the scroll.
    return clamp01((vh - r.top) / (vh * 0.85));
  };

  const rot = (p) => {
    let [x, y, z] = p;
    const tx = -0.5, ct = Math.cos(tx), st = Math.sin(tx);   // fixed tilt
    [y, z] = [y * ct - z * st, y * st + z * ct];
    const ca = Math.cos(ang), sa = Math.sin(ang);            // spin
    [x, z] = [x * ca + z * sa, -x * sa + z * ca];
    return [x, y, z];
  };

  function frame() {
    const tp = progress();
    vel += (tp - disp) * 0.05; vel *= 0.80; disp += vel;     // spring → slight overshoot
    const d = disp;
    if (!reduce) ang += 0.0035 * clamp01(d);

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
