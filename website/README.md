# UnityPilot website

A static landing page for UnityPilot. No build step — plain HTML/CSS/JS.

- `index.html` — the page (all content + inline SVG diagrams).
- `styles.css` — all styling. The theme is driven by CSS variables in `:root`, so restyling is mostly editing that block.
- `main.js` — tiny progressive enhancement (copy-to-clipboard only; the page works without it).
- `assets/demo-screenshot.png` — a real frame captured by the `screenshot` tool during testing.

## Preview

```bash
cd website
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly via `file://` works too; the clipboard button just falls back.)

## Notes

This is the first content-complete pass — structure, copy, diagrams, and a light/modern default
theme. Visual style is intended to be iterated; the CSS variables make re-skinning quick.
