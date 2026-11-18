// views/watchlist.js — stocks you're researching, with your thesis next to live data.

import { getQuote, getMetrics, getProfile } from "../api.js";
import { newId } from "../storage.js";
import { usd, pct, num, big, tone, esc, cleanTicker, notice, researchLinks } from "../ui.js";

export async function renderWatchlist(root, ctx) {
  const { state } = ctx;

  root.innerHTML = `
    <section class="panel">
      <h2>Add to watchlist</h2>
      <form id="wl-add" class="row-form">
        <input name="ticker" placeholder="Ticker" required maxlength="10" autocapitalize="characters">
        <input name="target" type="number" step="any" min="0" placeholder="Target buy price (optional)">
        <textarea name="thesis" rows="2" placeholder="Why this stock? What would make you wrong?"></textarea>
        <button>Add</button>
      </form>
    </section>
    <section id="wl-list" class="stack"></section>`;

  root.querySelector("#wl-add").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const ticker = cleanTicker(f.get("ticker"));
    if (!ticker) return;
    state.watchlist.unshift({
      id: newId(),
      ticker,
      target: f.get("target") ? Number(f.get("target")) : null,
      thesis: String(f.get("thesis") || "").trim(),
      added: new Date().toISOString().slice(0, 10),
    });
    ctx.save();
    ctx.rerender();
  });

  const list = root.querySelector("#wl-list");
  if (!state.watchlist.length) {
    list.innerHTML = `<div class="card muted">Nothing on your watchlist yet.</div>`;
    return;
  }

  // Draw placeholders first, then fill each card as its data arrives.
  list.innerHTML = state.watchlist
    .map((w) => `<article class="panel" id="wl-${w.id}"><h2>${esc(w.ticker)}</h2><p class="muted">Loading…</p></article>`)
    .join("");

  let firstError = null;
  for (const w of state.watchlist) {
    const card = list.querySelector(`#wl-${w.id}`);
    try {
      const [q, m, p] = await Promise.all([
        getQuote(w.ticker, state.apiKey),
        getMetrics(w.ticker, state.apiKey),
        getProfile(w.ticker, state.apiKey),
      ]);
      card.innerHTML = cardHtml(w, q, m, p);
    } catch (e) {
      firstError = firstError || e.message;
      card.innerHTML = cardHtml(w, null, null, null);
    }
    wireCard(card, w, ctx);
  }
  if (firstError) notice(root, firstError, "warn");
}

function cardHtml(w, q, m, p) {
  m = m || {};
  const price = q ? q.price : null;
  // How far the price must fall to reach your target (0 or less = already there).
  const toTarget = price && w.target ? 1 - w.target / price : null;
  const range = price && m.high52 && m.low52 && m.high52 > m.low52 ? (price - m.low52) / (m.high52 - m.low52) : null;

  return `
    <header class="card-head">
      <div>
        <h2>${esc(w.ticker)} <span class="muted small">${esc(p ? p.name : "")}</span></h2>
        <div class="small muted">${esc(p ? p.industry || "" : "")} · added ${esc(w.added)}</div>
      </div>
      <div class="price">
        <strong>${usd(price)}</strong>
        <span class="${tone(q && q.changePct)}">${q ? pct(q.changePct, 2) : ""}</span>
      </div>
    </header>

    <div class="metrics">
      <div><span>Market cap</span><b>${big(p && p.marketCap)}</b></div>
      <div><span>P/E (TTM)</span><b>${num(m.peTTM)}</b></div>
      <div><span>P/S (TTM)</span><b>${num(m.psTTM)}</b></div>
      <div><span>EPS (TTM)</span><b>${usd(m.epsTTM)}</b></div>
      <div><span>Revenue growth</span><b class="${tone(m.revenueGrowth)}">${pct(m.revenueGrowth)}</b></div>
      <div><span>EPS growth</span><b class="${tone(m.epsGrowth)}">${pct(m.epsGrowth)}</b></div>
      <div><span>Operating margin</span><b>${pct(m.operatingMargin)}</b></div>
      <div><span>Return on equity</span><b>${pct(m.roe)}</b></div>
      <div><span>Beta</span><b>${num(m.beta, 2)}</b></div>
      <div><span>Dividend yield</span><b>${pct(m.dividendYield, 2)}</b></div>
    </div>

    ${range !== null ? `
      <div class="range">
        <div class="small muted">52-week range: ${usd(m.low52)} – ${usd(m.high52)}</div>
        <div class="bar"><i style="left:${(range * 100).toFixed(1)}%"></i></div>
      </div>` : ""}

    <div class="target">
      ${w.target ? `Your target: <b>${usd(w.target)}</b> →
        ${toTarget <= 0 ? `<b class="pos">at or below target</b>` : `needs to fall <b>${pct(toTarget)}</b>`}` : `<span class="muted">No target price set.</span>`}
    </div>

    <label class="small muted">Thesis</label>
    <textarea class="thesis" rows="3">${esc(w.thesis)}</textarea>

    <footer class="card-foot">
      <span class="small">${researchLinks(w.ticker)}</span>
      <span>
        <button class="ghost" data-act="value">Value it</button>
        <button class="ghost" data-act="save">Save</button>
        <button class="icon" data-act="del" title="Remove">✕</button>
      </span>
    </footer>`;
}

function wireCard(card, w, ctx) {
  card.querySelector('[data-act="save"]').addEventListener("click", (e) => {
    w.thesis = card.querySelector(".thesis").value.trim();
    ctx.save();
    e.target.textContent = "Saved ✓";
  });
  card.querySelector('[data-act="del"]').addEventListener("click", () => {
    ctx.state.watchlist = ctx.state.watchlist.filter((x) => x.id !== w.id);
    ctx.save();
    ctx.rerender();
  });
  card.querySelector('[data-act="value"]').addEventListener("click", () => {
    ctx.go("valuation", { ticker: w.ticker });
  });
}
