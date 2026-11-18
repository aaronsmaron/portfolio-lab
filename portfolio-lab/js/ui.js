// ui.js — small formatting and rendering helpers shared by every view.

export const usd = (v, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits });

export const usd0 = (v) => usd(v, 0);

export const pct = (v, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(digits)}%`;

export const num = (v, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(digits);

/** $2.81T / $415B / $12.3M */
export const big = (v) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return usd0(v);
};

/** CSS class for positive / negative numbers. */
export const tone = (v) => (v === null || !Number.isFinite(v) ? "" : v >= 0 ? "pos" : "neg");

/** Always escape anything a user typed before putting it into HTML. */
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const cleanTicker = (s) => String(s || "").trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");

export function notice(container, message, kind = "info") {
  container.insertAdjacentHTML("afterbegin", `<div class="notice ${kind}">${esc(message)}</div>`);
}

// ---- Charts (Chart.js is loaded globally from a CDN in index.html) ----
const charts = new Map();

export function drawChart(canvas, config) {
  if (!window.Chart) return; // offline: page still works, just without charts
  const old = charts.get(canvas.id);
  if (old) old.destroy();
  const css = getComputedStyle(document.documentElement);
  window.Chart.defaults.color = css.getPropertyValue("--muted").trim();
  window.Chart.defaults.borderColor = css.getPropertyValue("--line").trim();
  window.Chart.defaults.font.family = css.getPropertyValue("--font").trim();
  charts.set(canvas.id, new window.Chart(canvas, config));
}

export const PALETTE = ["#4f8cff", "#2bb673", "#f5a524", "#e5484d", "#8e6cef", "#12a5a5", "#d6609b", "#8a8f98"];

/** Research links that open outside the app. */
export const researchLinks = (t) => `
  <a href="https://stockanalysis.com/stocks/${encodeURIComponent(t.toLowerCase())}/" target="_blank" rel="noopener">Stock Analysis</a> ·
  <a href="https://finviz.com/quote.ashx?t=${encodeURIComponent(t)}" target="_blank" rel="noopener">Finviz</a> ·
  <a href="https://app.koyfin.com/" target="_blank" rel="noopener">Koyfin</a>`;
