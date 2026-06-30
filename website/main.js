// Small enhancements only — the page is static and works without JS.

// Copy-to-clipboard for the install one-liner.
document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const text = btn.getAttribute("data-copy") || "";
    try {
      await navigator.clipboard.writeText(text);
      const prev = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => {
        btn.textContent = prev;
      }, 1400);
    } catch {
      // clipboard blocked (e.g. file://) — select-fallback is good enough
      btn.textContent = "Copy ⌘C";
    }
  });
});
