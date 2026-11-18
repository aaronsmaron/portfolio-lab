// Run with: node tests/finance.test.mjs
import assert from "node:assert/strict";
import {
  summarizePortfolio, futurePrice, cagr, impliedGrowth, sensitivityGrid,
  projectDeterministic, monteCarlo, realReturn, percentile,
} from "../js/finance.js";

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

// Portfolio
const p = summarizePortfolio(
  [
    { ticker: "VOO", account: "Roth (self)", shares: 2, avgCost: 500 },
    { ticker: "VOO", account: "Taxable", shares: 1, avgCost: 550 },
    { ticker: "XYZ", account: "Taxable", shares: 10, avgCost: 5 },
  ],
  { VOO: { price: 600, prevClose: 590 } }
);
close(p.totalValue, 1800);
close(p.totalCost, 1550);
close(p.dayChange, 30);
close(p.byTicker.VOO, 1800);
close(p.byAccount["Taxable"], 600);
assert.deepEqual(p.missing, ["XYZ"]);

// Valuation: EPS 10 growing 10% for 5y at P/E 20
const fp = futurePrice({ eps: 10, growth: 0.1, years: 5, exitPE: 20 });
close(fp, 10 * 1.1 ** 5 * 20);
close(cagr(100, 200, 1), 1);
// implied growth should reproduce the target return when plugged back in
const g = impliedGrowth({ price: 300, eps: 10, years: 5, exitPE: 25, targetReturn: 0.1 });
close(cagr(300, futurePrice({ eps: 10, growth: g, years: 5, exitPE: 25 }), 5), 0.1);
const grid = sensitivityGrid({ price: 200, eps: 10, years: 5, growths: [0.05, 0.1], exitPEs: [15, 20] });
assert.equal(grid.length, 2);
assert.ok(grid[1][1] > grid[0][0]);

// Deterministic projection: 0 return, 100/mo for 2 years → 2400 + start
const d = projectDeterministic({ start: 1000, monthly: 100, years: 2, annualReturn: 0 });
close(d[2], 3400);

// Monte Carlo: zero volatility must match the deterministic path
const mc = monteCarlo({ start: 1000, monthly: 100, years: 10, annualReturn: 0.07, volatility: 0, sims: 50 });
const det = projectDeterministic({ start: 1000, monthly: 100, years: 10, annualReturn: 0.07 });
close(mc.bands[50][10], det[10], 1e-3);

// With volatility: the mean of final values should be near the deterministic value
const mc2 = monteCarlo({ start: 10000, monthly: 0, years: 10, annualReturn: 0.07, volatility: 0.18, sims: 20000, target: 19671 });
assert.ok(mc2.bands[10][10] < mc2.bands[50][10] && mc2.bands[50][10] < mc2.bands[90][10]);
assert.ok(mc2.probTarget > 0.3 && mc2.probTarget < 0.6, `probTarget ${mc2.probTarget}`);

close(realReturn(0.07, 0.03), 1.07 / 1.03 - 1);
close(percentile([1, 2, 3, 4], 50), 2.5);

console.log("All finance tests passed ✔");
