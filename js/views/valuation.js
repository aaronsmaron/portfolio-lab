// views/valuation.js — "what do I have to believe?" sandbox for any stock.

import { getQuote, getMetrics } from "../api.js";
import { futurePrice, cagr, impliedGrowth, sensitivityGrid } from "../finance.js";
import { usd, pct, num, esc, cleanTicker, notice } from "../ui.js";

const DEFAULTS = { ticker: "", price: 100, eps: 5, growth: 0.1, years: 5, exitPE: 20, targetReturn: 0.1 };
let last = { ...DEFAULTS }; // keeps inputs while you switch tabs

export async function renderValuation(root, ctx, params = {}) {
  root.innerHTML = `
    <section class="panel">
      <h2>Valuation sandbox</h2>
      <p class="hint">Future price = EPS × (1 + growth)<sup>years</sup> × exit P/E. Change the assumptions and see what return they imply.</p>
      <form id="va-load" class="row-form">
        <input name="ticker" placeholder="Ticker" maxlength="10" value="${esc(last.ticker)}" autocapitalize="characters">
        <button>Load live data</button>
      </form>
      <form id="va-form" class="inputs">
        <label>Price today ($)<input name="price" type="number" step="any" value="${last.price}"></label>
        <label>EPS, last 12 months ($)<input name="eps" type="number" step="any" value="${last.eps}"></label>
        <label>EPS growth per year (%)<input name="growth" type="number" step="any" value="${(last.growth * 100).toFixed(1)}"></label>
        <label>Years held<input name="years" type="number" min="1" max="30" step="1" value="${last.years}"></label>
        <label>P/E when you sell<input name="exitPE" type="number" step="any" value="${last.exitPE}"></label>
        <label>Return you want per year (%)<input name="targetReturn" type="number" step="any" value="${(last.targetReturn * 100).toFixed(1)}"></label>
      </form>
    </section>
    <section class="cards" id="va-out"></section>
    <section class="panel">
      <h2>Sensitivity: annual return</h2>
      <p class="hint">Rows are EPS growth; columns are the P/E you sell at. Green beats your target return; red loses money.</p>
      <div class="table-wrap"><table id="va-grid" class="grid"></table></div>
    </section>
    <section class="panel small muted" id="va-notes">
      <b>How to read this.</b> Today's P/E already bakes in the market's growth expectations.
      "Growth needed" shows how fast earnings must grow for you to earn your target return.
      If that number is far above what the company has ever done, the price assumes a lot.
      Exit P/E usually shrinks as fast growers mature, so be conservative there.
      The model ignores dividends and share buybacks, and it doesn't work for companies with negative earnings.
    </section>`;

  const form = root.querySelector("#va-form");
  const update = () => {
    const f = new FormData(form);
    last = {
      ...last,
      price: Number(f.get("price")),
      eps: Number(f.get("eps")),
      growth: Number(f.get("growth")) / 100,
      years: Math.max(1, Math.round(Number(f.get("years")))),
      exitPE: Number(f.get("exitPE")),
      targetReturn: Number(f.get("targetReturn")) / 100,
    };
    drawResults(root, last);
  };
  form.addEventListener("input", update);

  root.querySelector("#va-load").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ticker = cleanTicker(new FormData(e.target).get("ticker"));
    if (ticker) await load(root, ctx, ticker);
  });

  if (params.ticker && params.ticker !== last.ticker) {
    await load(root, ctx, params.ticker);
  } else {
    update();
  }
}

async function load(root, ctx, ticker) {
  try {
    const [q, m] = await Promise.all([getQuote(ticker, ctx.state.apiKey), getMetrics(ticker, ctx.state.apiKey)]);
    if (!q) throw new Error(`No quote found for ${ticker}.`);
    last.ticker = ticker;
    last.price = +q.price.toFixed(2);
    if (m.epsTTM) last.eps = +m.epsTTM.toFixed(2);
    // Starting guesses: today's P/E as the exit P/E (you'll usually want lower).
    if (m.peTTM && m.peTTM > 0) last.exitPE = +m.peTTM.toFixed(1);
    if (m.epsGrowth !== null && m.epsGrowth > -0.5 && m.epsGrowth < 1) last.growth = +m.epsGrowth.toFixed(3);
  } catch (e) {
    await renderValuation(root, ctx);
    notice(root, e.message, "warn");
    return;
  }
  await renderValuation(root, ctx);
  notice(root, `Loaded ${ticker}. Growth and exit P/E are starting guesses from recent data. Adjust them.`, "info");
}

function drawResults(root, a) {
  const out = root.querySelector("#va-out");
  if (!(a.price > 0) || !(a.eps > 0) || !(a.exitPE > 0)) {
    out.innerHTML = `<div class="card muted">Needs a positive price, EPS and exit P/E.</div>`;
    root.querySelector("#va-grid").innerHTML = "";
    return;
  }
  const fp = futurePrice(a);
  const r = cagr(a.price, fp, a.years);
  const need = impliedGrowth(a);
  const pe = a.price / a.eps;

  out.innerHTML = `
    <div class="card"><span>P/E today</span><strong>${num(pe)}</strong></div>
    <div class="card"><span>Price in ${a.years} yrs</span><strong>${usd(fp)}</strong></div>
    <div class="card"><span>Your annual return</span><strong class="${r >= a.targetReturn ? "pos" : r < 0 ? "neg" : ""}">${pct(r)}</strong></div>
    <div class="card"><span>Growth needed for ${pct(a.targetReturn, 0)}</span><strong>${pct(need)}</strong></div>`;

  // Build the grid around the user's assumptions.
  const growths = [-0.1, -0.05, 0, 0.05, 0.1].map((d) => a.growth + d);
  const exitPEs = [0.6, 0.8, 1, 1.2, 1.4].map((k) => Math.max(1, Math.round(a.exitPE * k)));
  const grid = sensitivityGrid({ price: a.price, eps: a.eps, years: a.years, growths, exitPEs });

  root.querySelector("#va-grid").innerHTML = `
    <thead><tr><th>Growth ↓ / P/E →</th>${exitPEs.map((p) => `<th>${p}×</th>`).join("")}</tr></thead>
    <tbody>${grid.map((row, i) => `
      <tr><th>${pct(growths[i], 0)}</th>${row.map((v, j) => {
        const cls = v === null ? "" : v >= a.targetReturn ? "good" : v < 0 ? "bad" : "meh";
        const base = i === 2 && j === 2 ? " base" : "";
        return `<td class="${cls}${base}">${pct(v)}</td>`;
      }).join("")}</tr>`).join("")}
    </tbody>`;
}
