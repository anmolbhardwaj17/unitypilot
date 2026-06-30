// UnityPilot site — progressive enhancement. Works without JS; motion respects reduced-motion.
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

if (!reduce) {
  // --- HUD reticle drifts to random points over the band ---
  const ret = document.getElementById("reticle");
  if (ret) {
    const drift = () => {
      ret.style.left = `${20 + Math.random() * 60}%`;
      ret.style.top = `${24 + Math.random() * 52}%`;
      setTimeout(drift, 2600 + Math.random() * 1800);
    };
    setTimeout(drift, 600);
  }

  // --- interactive springy wireframe cube in the footer ---
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

    // cube geometry
    const V = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
    const E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

    // rotation + angular velocity; spring pulls velocity back toward a gentle idle spin
    let rx = -0.5, ry = 0.6, vx = 0, vy = 0.006;
    const idleVx = 0.0016, idleVy = 0.006;     // resting spin
    let dragging = false, lastX = 0, lastY = 0;

    const rot = (p) => {
      let [x, y, z] = p;
      // X axis
      let cy_ = Math.cos(rx), sy_ = Math.sin(rx);
      [y, z] = [y * cy_ - z * sy_, y * sy_ + z * cy_];
      // Y axis
      let cx_ = Math.cos(ry), sx_ = Math.sin(ry);
      [x, z] = [x * cx_ + z * sx_, -x * sx_ + z * cx_];
      return [x, y, z];
    };

    function frame() {
      if (!dragging) {
        // spring toward idle spin (gives the springy settle after a fling)
        vx += (idleVx - vx) * 0.018;
        vy += (idleVy - vy) * 0.018;
      }
      rx += vx; ry += vy;
      if (!dragging) { vx *= 0.96; vy = vy; } // damp fling on x; y eases via spring

      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cyc = H / 2, s = Math.min(W, H) * 0.22, f = 3.2;
      const pts = V.map((p) => {
        const [x, y, z] = rot(p);
        const k = f / (f + z);
        return [cx + x * s * k, cyc + y * s * k, z];
      });
      // edges
      ctx.lineWidth = 1.4;
      for (const [a, b] of E) {
        const za = pts[a][2], zb = pts[b][2];
        const depth = (za + zb) / 2;                 // -1 (near) .. 1 (far)
        const t = (depth + 1.4) / 2.8;               // 0..1
        ctx.strokeStyle = `rgba(255,90,20,${0.95 - t * 0.6})`;
        ctx.shadowColor = "rgba(255,90,20,0.5)"; ctx.shadowBlur = 8 * (1 - t);
        ctx.beginPath(); ctx.moveTo(pts[a][0], pts[a][1]); ctx.lineTo(pts[b][0], pts[b][1]); ctx.stroke();
      }
      // vertices
      ctx.shadowBlur = 0;
      for (const p of pts) {
        ctx.fillStyle = "#ff5a14";
        ctx.beginPath(); ctx.arc(p[0], p[1], 2.4, 0, Math.PI * 2); ctx.fill();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    const down = (e) => { dragging = true; const t = e.touches ? e.touches[0] : e; lastX = t.clientX; lastY = t.clientY; };
    const move = (e) => {
      if (!dragging) return;
      const t = e.touches ? e.touches[0] : e;
      vy = (t.clientX - lastX) * 0.012;   // fling velocity from drag delta
      vx = (t.clientY - lastY) * 0.012;
      ry += (t.clientX - lastX) * 0.012;
      rx += (t.clientY - lastY) * 0.012;
      lastX = t.clientX; lastY = t.clientY;
      if (e.cancelable) e.preventDefault();
    };
    const up = () => { dragging = false; };
    cv.addEventListener("mousedown", down); window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    cv.addEventListener("touchstart", down, { passive: true }); cv.addEventListener("touchmove", move, { passive: false }); window.addEventListener("touchend", up);
  }
}
