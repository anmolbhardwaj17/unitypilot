// UnityPilot site — progressive enhancement + cockpit motion.
// Works fully without JS; motion is decorative and respects reduced-motion.

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
  // --- live HUD telemetry: smooth random walk toward new targets ---
  const tels = Array.from(document.querySelectorAll(".hud .v")).map((el) => {
    const min = +el.dataset.min, max = +el.dataset.max;
    return {
      el, min, max,
      pad: +el.dataset.pad || 0,
      suffix: el.dataset.suffix || "",
      comma: el.dataset.comma === "1",
      val: min + Math.random() * (max - min),
      target: min + Math.random() * (max - min),
    };
  });
  const fmt = (t) => {
    let n = Math.round(t.val);
    let s = t.comma ? n.toLocaleString("en-US") : String(n);
    if (t.pad) s = s.padStart(t.pad, "0");
    return s + t.suffix;
  };
  let tick = 0;
  function telLoop() {
    tick++;
    for (const t of tels) {
      t.val += (t.target - t.val) * 0.08;            // ease toward target
      if (Math.abs(t.target - t.val) < (t.max - t.min) * 0.01 || tick % 90 === 0) {
        t.target = t.min + Math.random() * (t.max - t.min); // pick a new random target
      }
      t.el.textContent = fmt(t);
    }
    requestAnimationFrame(telLoop);
  }
  if (tels.length) requestAnimationFrame(telLoop);

  // --- nav status lights blink at random intervals ---
  document.querySelectorAll(".navlights .nl").forEach((nl) => {
    const flicker = () => {
      nl.classList.add("off");
      setTimeout(() => nl.classList.remove("off"), 90 + Math.random() * 130);
      setTimeout(flicker, 1800 + Math.random() * 4200);
    };
    setTimeout(flicker, Math.random() * 3000);
  });

  // --- HUD reticle drifts to random points, like it's scanning ---
  const ret = document.getElementById("reticle");
  if (ret) {
    const drift = () => {
      ret.style.left = `${18 + Math.random() * 64}%`;
      ret.style.top = `${22 + Math.random() * 56}%`;
      setTimeout(drift, 2600 + Math.random() * 1800);
    };
    setTimeout(drift, 600);
  }

  // --- radar blips jump to new bearings occasionally ---
  const blips = document.querySelectorAll(".radar .blip");
  if (blips.length) {
    setInterval(() => {
      blips.forEach((b) => {
        const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 38;
        b.style.left = `${50 + Math.cos(a) * r}%`;
        b.style.top = `${50 + Math.sin(a) * r}%`;
      });
    }, 3400);
  }
}
