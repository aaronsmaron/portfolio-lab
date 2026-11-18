// finance.js — pure math, no DOM and no network.
// Everything here can be unit-tested with Node (see tests/finance.test.mjs).

// ---------- Portfolio aggregation ----------

/**
 * Combine holdings with live prices.
 * @param {Array<{ticker, account, shares, avgCost}>} holdings
 * @param {Object<string, {price:number, prevClose:number}>} quotes keyed by ticker
 */
export function summarizePortfolio(holdings, quotes) {
  const rows = holdings.map((h) => {
    const q = quotes[h.ticker] || {};
    const price = Number.isFinite(q.price) ? q.price : null;
    const value = price !== null ? price * h.shares : null;
    const cost = h.avgCost * h.shares;
    const gain = value !== null ? value - cost : null;
    const gainPct = value !== null && cost > 0 ? gain / cost : null;
    const dayChange =
      price !== null && Number.isFinite(q.prevClose) ? (price - q.prevClose) * h.shares : null;
    return { ...h, price, value, cost, gain, gainPct, dayChange };
  });

  const priced = rows.filter((r) => r.value !== null);
  const totalValue = sum(priced.map((r) => r.value));
  const totalCost = sum(priced.map((r) => r.cost));
  const dayChange = sum(priced.map((r) => r.dayChange || 0));

  rows.forEach((r) => {
    r.weight = r.value !== null && totalValue > 0 ? r.value / totalValue : null;
  });

  // Group by account and by ticker (the same ticker can sit in several accounts).
  const byAccount = groupSum(priced, (r) => r.account, (r) => r.value);
  const byTicker = groupSum(priced, (r) => r.ticker, (r) => r.value);

  return {
    rows,
    totalValue,
    totalCost,
    totalGain: totalValue - totalCost,
    totalGainPct: totalCost > 0 ? (totalValue - totalCost) / totalCost : null,
    dayChange,
    byAccount,
    byTicker,
    missing: rows.filter((r) => r.value === null).map((r) => r.ticker),
  };
}

// ---------- Valuation sandbox ----------
// Simple earnings-based model: future price = EPS grown for n years × exit P/E.
// It ignores dividends and buybacks; good enough to see what a price assumes.

export function futurePrice({ eps, growth, years, exitPE }) {
  return eps * Math.pow(1 + growth, years) * exitPE;
}

/** Annualized return (CAGR) from buying at `price` and selling at `future` after `years`. */
export function cagr(price, future, years) {
  if (price <= 0 || future <= 0 || years <= 0) return null;
  return Math.pow(future / price, 1 / years) - 1;
}

/**
 * Reverse the model: what EPS growth rate is needed to earn `targetReturn` per year?
 * Solves eps × (1+g)^n × exitPE = price × (1+r)^n for g.
 */
export function impliedGrowth({ price, eps, years, exitPE, targetReturn }) {
  if (eps <= 0 || exitPE <= 0 || price <= 0) return null;
  const needed = (price * Math.pow(1 + targetReturn, years)) / (eps * exitPE);
  return Math.pow(needed, 1 / years) - 1;
}

/** Grid of CAGRs for several growth rates (rows) and exit P/Es (columns). */
export function sensitivityGrid({ price, eps, years, growths, exitPEs }) {
  return growths.map((g) =>
    exitPEs.map((pe) => cagr(price, futurePrice({ eps, growth: g, years, exitPE: pe }), years))
  );
}

// ---------- Retirement projection ----------

/** Deterministic future value with monthly contributions at a fixed annual return. */
export function projectDeterministic({ start, monthly, years, annualReturn }) {
  const r = Math.pow(1 + annualReturn, 1 / 12) - 1; // equivalent monthly rate
  const path = [start];
  let v = start;
  for (let m = 1; m <= years * 12; m++) {
    v = v * (1 + r) + monthly;
    if (m % 12 === 0) path.push(v);
  }
  return path; // value at year 0..years
}

/**
 * Monte Carlo simulation of a portfolio with monthly contributions.
 * Monthly returns are lognormal, calibrated so the EXPECTED annual growth equals
 * `annualReturn` and the annual volatility equals `volatility`.
 * Returns percentile paths (per year) and the probability of reaching `target`.
 */
export function monteCarlo({
  start, monthly, years, annualReturn, volatility,
  sims = 2000, target = null, seed = 42, percentiles = [10, 50, 90],
}) {
  const rand = mulberry32(seed);
  const sigmaM = volatility / Math.sqrt(12);
  const muM = Math.log(1 + annualReturn) / 12 - 0.5 * sigmaM * sigmaM;

  // values[y][s] = value of simulation s at end of year y
  const values = Array.from({ length: years + 1 }, () => new Float64Array(sims));
  let worstDrawdowns = new Float64Array(sims);

  for (let s = 0; s < sims; s++) {
    let v = start;
    let peak = start;
    let maxDd = 0;
    values[0][s] = v;
    for (let m = 1; m <= years * 12; m++) {
      const z = normal(rand);
      v = v * Math.exp(muM + sigmaM * z) + monthly;
      if (v > peak) peak = v;
      const dd = peak > 0 ? (peak - v) / peak : 0;
      if (dd > maxDd) maxDd = dd;
      if (m % 12 === 0) values[m / 12][s] = v;
    }
    worstDrawdowns[s] = maxDd;
  }

  const bands = {};
  percentiles.forEach((p) => {
    bands[p] = values.map((arr) => percentile(arr, p));
  });

  const finals = values[years];
  const probTarget =
    target !== null ? finals.filter((v) => v >= target).length / sims : null;

  return {
    bands,
    probTarget,
    medianWorstDrawdown: percentile(worstDrawdowns, 50),
    badCaseWorstDrawdown: percentile(worstDrawdowns, 90),
  };
}

/** Convert a nominal return into a real (after-inflation) return. */
export function realReturn(nominal, inflation) {
  return (1 + nominal) / (1 + inflation) - 1;
}

// ---------- Helpers ----------

export function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function groupSum(rows, keyFn, valFn) {
  const out = {};
  rows.forEach((r) => {
    const k = keyFn(r);
    out[k] = (out[k] || 0) + valFn(r);
  });
  return out;
}

/** Percentile with linear interpolation (p in 0..100). */
export function percentile(arr, p) {
  const sorted = Array.from(arr).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Small seeded random generator so simulations are repeatable. */
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw via Box–Muller. */
function normal(rand) {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
