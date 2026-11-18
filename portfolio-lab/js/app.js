// app.js — wires the tabs together. Each tab is a "view" module with a render function.
// To add a new tab: write js/views/yourtab.js, import it here, and add it to VIEWS.

import { loadState, saveState } from "./storage.js";
import { clearQuoteCache } from "./api.js";
import { renderPortfolio } from "./views/portfolio.js";
import { renderWatchlist } from "./views/watchlist.js";
import { renderValuation } from "./views/valuation.js";
import { renderRetirement } from "./views/retirement.js";
import { renderSettings } from "./views/settings.js";

const VIEWS = {
  portfolio: { label: "Portfolio", render: renderPortfolio },
  watchlist: { label: "Watchlist", render: renderWatchlist },
  valuation: { label: "Valuation", render: renderValuation },
  retirement: { label: "Retirement", render: renderRetirement },
  settings: { label: "Settings", render: renderSettings },
};

// Shared context handed to every view.
const ctx = {
  state: loadState(),
  current: "portfolio",
  lastSummary: null,
  save() { saveState(ctx.state); },
  replaceState(s) { ctx.state = s; ctx.lastSummary = null; saveState(s); },
  freshState() { localStorage.removeItem("portfolio-lab:v1"); return loadState(); },
  rerender() { show(ctx.current); },
  go(name, params) { location.hash = name; show(name, params); },
};

const nav = document.getElementById("nav");
const main = document.getElementById("main");

nav.innerHTML = Object.entries(VIEWS)
  .map(([k, v]) => `<a href="#${k}" data-view="${k}">${v.label}</a>`)
  .join("");

async function show(name, params = {}) {
  if (!VIEWS[name]) name = "portfolio";
  ctx.current = name;
  nav.querySelectorAll("a").forEach((a) => a.classList.toggle("active", a.dataset.view === name));

  // First visit without a key → send to Settings.
  if (!ctx.state.apiKey && name !== "settings") {
    main.innerHTML = `
      <section class="panel welcome">
        <h2>Welcome to Portfolio Lab</h2>
        <p>Add a free Finnhub API key to load live prices.</p>
        <a class="btn" href="#settings">Go to Settings</a>
      </section>`;
    return;
  }

  main.innerHTML = `<div class="muted pad">Loading…</div>`;
  try {
    await VIEWS[name].render(main, ctx, params);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="notice warn">Something went wrong: ${String(e.message).replace(/</g, "&lt;")}</div>`;
  }
}

window.addEventListener("hashchange", () => {
  const name = location.hash.slice(1);
  if (name !== ctx.current) show(name);
});

document.getElementById("refresh").addEventListener("click", () => {
  clearQuoteCache();
  show(ctx.current);
});

show(location.hash.slice(1) || "portfolio");
