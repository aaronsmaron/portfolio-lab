// views/portfolio.js — holdings across all three accounts, valued live.

import { getQuotes } from "../api.js";
import { summarizePortfolio } from "../finance.js";
import { ACCOUNTS, newId } from "../storage.js";
import { usd, usd0, pct, num, tone, esc, cleanTicker, notice, drawChart, PALETTE } from "../ui.js";

export async function renderPortfolio(root, ctx) {
  const { state } = ctx;

  root.innerHTML = `
    <section class="cards" id="pf-cards"><div class="card muted">Loading prices…</div></section>

    <section class="panel">
      <h2>Holdings</h2>
      <div class="table-wrap"><table id="pf-table"></table></div>
      <form id="pf-add" class="row-form">
        <input name="ticker" placeholder="Ticker" required maxlength="10" autocapitalize="characters">
        <select name="account">${ACCOUNTS.map((a) => `<option>${a}</option>`).join("")}</select>
        <input name="shares" type="number" step="any" min="0" placeholder="Shares" required>
        <input name="avgCost" type="number" step="any" min="0" placeholder="Avg cost/share" required>
        <button>Add</button>
      </form>
      <p class="hint">Same ticker in two accounts? Add it once per account. Fractional shares are fine.</p>
    </section>

    <section class="grid2">
      <div class="panel"><h2>By position</h2><div class="chart-box"><canvas id="pf-pie"></canvas></div></div>
      <div class="panel"><h2>By account</h2><div class="chart-box"><canvas id="pf-acct"></canvas></div></div>
    </section>

    <section class="panel">
      <h2>Risk checks</h2>
      <ul id="pf-risk" class="checks"></ul>
    </section>

    <section class="panel">
      <h2>Monthly contributions</h2>
      <form id="pf-contrib" class="row-form">
        ${ACCOUNTS.map((a) => `
          <label>${a}<input type="number" step="any" min="0" name="${esc(a)}" value="${state.contributions[a] || 0}"></label>`).join("")}
        <button>Save</button>
      </form>
      <p class="hint">Used by the Retirement tab.</p>
    </section>`;

  // --- Add holding ---
  root.querySelector("#pf-add").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const ticker = cleanTicker(f.get("ticker"));
    if (!ticker) return;
    state.holdings.push({
      id: newId(),
      ticker,
      account: f.get("account"),
      shares: Number(f.get("shares")),
      avgCost: Number(f.get("avgCost")),
    });
    ctx.save();
    ctx.rerender();
  });

  root.querySelector("#pf-contrib").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    ACCOUNTS.forEach((a) => (state.contributions[a] = Number(f.get(a)) || 0));
    ctx.save();
    e.target.querySelector("button").textContent = "Saved ✓";
  });

  if (!state.holdings.length) {
    root.querySelector("#pf-cards").innerHTML =
      `<div class="card muted">No holdings yet. Add your first position below.</div>`;
    root.querySelector("#pf-table").innerHTML = "";
    return;
  }

  // --- Live prices ---
  const { quotes, error } = await getQuotes(state.holdings.map((h) => h.ticker), state.apiKey);
  if (error) notice(root, error, "warn");
  const s = summarizePortfolio(state.holdings, quotes);
  ctx.lastSummary = s; // shared with the Retirement tab

  root.querySelector("#pf-cards").innerHTML = `
    <div class="card"><span>Total value</span><strong>${usd(s.totalValue)}</strong></div>
    <div class="card"><span>Total gain</span><strong class="${tone(s.totalGain)}">${usd(s.totalGain)} (${pct(s.totalGainPct)})</strong></div>
    <div class="card"><span>Today</span><strong class="${tone(s.dayChange)}">${usd(s.dayChange)}</strong></div>
    <div class="card"><span>Cost basis</span><strong>${usd(s.totalCost)}</strong></div>`;

  // --- Table ---
  const rows = [...s.rows].sort((a, b) => (b.value || 0) - (a.value || 0));
  root.querySelector("#pf-table").innerHTML = `
    <thead><tr><th>Ticker</th><th>Account</th><th>Shares</th><th>Avg cost</th><th>Price</th>
      <th>Value</th><th>Gain</th><th>Weight</th><th></th></tr></thead>
    <tbody>${rows.map((r) => `
      <tr>
        <td><b>${esc(r.ticker)}</b></td>
        <td class="small">${esc(r.account)}</td>
        <td>${num(r.shares, 4).replace(/\.?0+$/, "")}</td>
        <td>${usd(r.avgCost)}</td>
        <td>${usd(r.price)}</td>
        <td>${usd(r.value)}</td>
        <td class="${tone(r.gain)}">${usd0(r.gain)}<br><span class="small">${pct(r.gainPct)}</span></td>
        <td>${pct(r.weight)}</td>
        <td><button class="icon" data-del="${r.id}" title="Remove">✕</button></td>
      </tr>`).join("")}
    </tbody>`;

  root.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => {
      state.holdings = state.holdings.filter((h) => h.id !== b.dataset.del);
      ctx.save();
      ctx.rerender();
    })
  );

  // --- Charts ---
  const tickers = Object.entries(s.byTicker).sort((a, b) => b[1] - a[1]);
  drawChart(root.querySelector("#pf-pie"), {
    type: "doughnut",
    data: {
      labels: tickers.map((t) => t[0]),
      datasets: [{ data: tickers.map((t) => t[1]), backgroundColor: PALETTE, borderWidth: 0 }],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: "right" } } },
  });
  const accts = ACCOUNTS.filter((a) => s.byAccount[a]);
  drawChart(root.querySelector("#pf-acct"), {
    type: "bar",
    data: {
      labels: accts,
      datasets: [{ data: accts.map((a) => s.byAccount[a]), backgroundColor: PALETTE[0], borderRadius: 4 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { callback: (v) => usd0(v) } } },
    },
  });

  // --- Risk checks: simple rules you can extend ---
  const checks = [];
  const top = tickers[0];
  const topW = top[1] / s.totalValue;
  checks.push(
    topW > 0.4
      ? `⚠️ ${top[0]} is ${pct(topW)} of your portfolio. That's fine for a broad index fund like VOO, but risky for a single stock.`
      : `✅ Largest position is ${top[0]} at ${pct(topW)}.`
  );
  const taxable = s.byAccount["Taxable"] || 0;
  checks.push(`ℹ️ ${pct(taxable / s.totalValue)} of your money is in the taxable account, where selling within a year is taxed at higher short-term rates.`);
  const losers = s.rows.filter((r) => r.gainPct !== null && r.gainPct < -0.2);
  if (losers.length)
    checks.push(`⚠️ Down more than 20%: ${losers.map((r) => esc(r.ticker)).join(", ")}. Re-read your thesis: has the story changed, or just the price?`);
  if (s.missing.length)
    checks.push(`⚠️ No price found for: ${s.missing.map(esc).join(", ")}. Check the ticker symbol.`);
  root.querySelector("#pf-risk").innerHTML = checks.map((c) => `<li>${c}</li>`).join("");
}
