// views/retirement.js — where your contributions could get you, and how bumpy the ride is.

import { getQuotes } from "../api.js";
import { summarizePortfolio, projectDeterministic, monteCarlo, realReturn, sum } from "../finance.js";
import { usd0, pct, drawChart, notice } from "../ui.js";

const PRESETS = {
  Conservative: { annualReturn: 0.06, volatility: 0.11 },
  Moderate: { annualReturn: 0.08, volatility: 0.16 },
  Aggressive: { annualReturn: 0.1, volatility: 0.2 },
};

export async function renderRetirement(root, ctx) {
  const { state } = ctx;
  const r = state.retirement;

  // Starting value: today's portfolio (reuses Portfolio tab data if already loaded).
  let start = ctx.lastSummary ? ctx.lastSummary.totalValue : null;
  if (start === null && state.holdings.length) {
    const { quotes, error } = await getQuotes(state.holdings.map((h) => h.ticker), state.apiKey);
    if (!error) start = summarizePortfolio(state.holdings, quotes).totalValue;
  }
  if (start === null) start = 0;
  const monthly = sum(Object.values(state.contributions));

  root.innerHTML = `
    <section class="panel">
      <h2>Retirement projection</h2>
      <p class="hint">Results are in <b>today's dollars</b> (after inflation). The shaded band is the middle 80% of 2,000 simulated markets.</p>
      <div class="presets">${Object.keys(PRESETS).map((k) => `<button class="ghost" data-preset="${k}">${k}</button>`).join("")}</div>
      <form id="rt-form" class="inputs">
        <label>Starting value ($)<input name="start" type="number" step="any" value="${Math.round(start)}"></label>
        <label>Monthly contribution ($)<input name="monthly" type="number" step="any" value="${monthly}"></label>
        <label>Years until retirement<input name="years" type="number" min="1" max="60" value="${r.years}"></label>
        <label>Expected return (%/yr)<input name="annualReturn" type="number" step="0.1" value="${(r.annualReturn * 100).toFixed(1)}"></label>
        <label>Volatility (%/yr)<input name="volatility" type="number" step="0.5" value="${(r.volatility * 100).toFixed(1)}"></label>
        <label>Inflation (%/yr)<input name="inflation" type="number" step="0.1" value="${(r.inflation * 100).toFixed(1)}"></label>
        <label>Target ($, today's dollars)<input name="target" type="number" step="any" value="${r.target}"></label>
      </form>
    </section>
    <section class="cards" id="rt-cards"></section>
    <section class="panel"><div class="chart-box tall"><canvas id="rt-chart"></canvas></div></section>
    <section class="panel small muted">
      <b>Reading the risk numbers.</b> Volatility is how much returns swing year to year. The S&P 500 has historically
      averaged roughly 15–20%. "Worst drop" is the largest peak-to-bottom fall along the way: the moment you'd be
      most tempted to sell. These are simulations with made-up returns, not predictions. Real markets have fatter tails.
    </section>`;

  const form = root.querySelector("#rt-form");
  const run = () => {
    const f = new FormData(form);
    const inp = {
      start: Number(f.get("start")) || 0,
      monthly: Number(f.get("monthly")) || 0,
      years: Math.min(60, Math.max(1, Math.round(Number(f.get("years")) || 1))),
      annualReturn: Number(f.get("annualReturn")) / 100,
      volatility: Math.max(0, Number(f.get("volatility")) / 100),
      inflation: Number(f.get("inflation")) / 100,
      target: Number(f.get("target")) || 0,
    };
    Object.assign(state.retirement, {
      years: inp.years, annualReturn: inp.annualReturn, volatility: inp.volatility,
      inflation: inp.inflation, target: inp.target,
    });
    ctx.save();
    draw(root, inp);
  };

  // Debounce: re-simulate 250 ms after you stop typing.
  let t;
  form.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(run, 250);
  });
  root.querySelectorAll("[data-preset]").forEach((b) =>
    b.addEventListener("click", () => {
      const p = PRESETS[b.dataset.preset];
      form.annualReturn.value = (p.annualReturn * 100).toFixed(1);
      form.volatility.value = (p.volatility * 100).toFixed(1);
      run();
    })
  );

  if (!state.holdings.length) notice(root, "Add holdings on the Portfolio tab to use your real starting value.", "info");
  run();
}

function draw(root, inp) {
  const real = realReturn(inp.annualReturn, inp.inflation);
  const contributed = inp.start + inp.monthly * 12 * inp.years;
  const det = projectDeterministic({ start: inp.start, monthly: inp.monthly, years: inp.years, annualReturn: real });
  const mc = monteCarlo({
    start: inp.start, monthly: inp.monthly, years: inp.years,
    annualReturn: real, volatility: inp.volatility, target: inp.target,
  });

  root.querySelector("#rt-cards").innerHTML = `
    <div class="card"><span>Median outcome</span><strong>${usd0(mc.bands[50][inp.years])}</strong></div>
    <div class="card"><span>Bad case (10th pct)</span><strong>${usd0(mc.bands[10][inp.years])}</strong></div>
    <div class="card"><span>Good case (90th pct)</span><strong>${usd0(mc.bands[90][inp.years])}</strong></div>
    <div class="card"><span>Chance of hitting target</span><strong>${pct(mc.probTarget, 0)}</strong></div>
    <div class="card"><span>You put in</span><strong>${usd0(contributed)}</strong></div>
    <div class="card"><span>Typical worst drop</span><strong class="neg">${pct(-mc.medianWorstDrawdown, 0)}</strong></div>`;

  const labels = det.map((_, i) => `Y${i}`);
  drawChart(root.querySelector("#rt-chart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "90th pct", data: mc.bands[90], borderWidth: 0, pointRadius: 0, backgroundColor: "rgba(79,140,255,.18)", fill: "+1" },
        { label: "10th pct", data: mc.bands[10], borderWidth: 0, pointRadius: 0 },
        { label: "Median", data: mc.bands[50], borderColor: "#4f8cff", borderWidth: 2, pointRadius: 0 },
        { label: "Steady return", data: det, borderColor: "#8a8f98", borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0 },
        ...(inp.target ? [{ label: "Target", data: det.map(() => inp.target), borderColor: "#2bb673", borderWidth: 1, pointRadius: 0 }] : []),
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { filter: (i) => !i.text.includes("pct") } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${usd0(c.parsed.y)}` } },
      },
      scales: { y: { ticks: { callback: (v) => usd0(v) } } },
    },
  });
}
