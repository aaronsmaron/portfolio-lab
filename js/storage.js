// storage.js — saves your data in this browser (localStorage).
// Nothing leaves your device except ticker lookups sent to Finnhub.

const KEY = "portfolio-lab:v1";

export const ACCOUNTS = ["Taxable", "Roth (self-directed)", "Roth (managed)"];

const DEFAULT_STATE = {
  apiKey: "",
  holdings: [], // { id, ticker, account, shares, avgCost }
  watchlist: [], // { id, ticker, target, thesis, added }
  contributions: { "Taxable": 0, "Roth (self-directed)": 0, "Roth (managed)": 0 }, // $/month
  retirement: { years: 25, annualReturn: 0.08, volatility: 0.16, inflation: 0.03, target: 1000000 },
};

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    // Merge so new fields added in later versions get defaults.
    const saved = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...saved,
      contributions: { ...DEFAULT_STATE.contributions, ...(saved.contributions || {}) },
      retirement: { ...DEFAULT_STATE.retirement, ...(saved.retirement || {}) },
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save", e);
  }
}

/** Backup file WITHOUT the API key, so it's safe to keep or share. */
export function exportState(state) {
  const { apiKey, ...rest } = state;
  return JSON.stringify({ app: "portfolio-lab", version: 1, exported: new Date().toISOString(), ...rest }, null, 2);
}

export function importState(json, current) {
  const data = JSON.parse(json);
  if (data.app !== "portfolio-lab") throw new Error("Not a Portfolio Lab backup file");
  const { app, version, exported, ...rest } = data;
  return { ...current, ...rest, apiKey: current.apiKey };
}

export const newId = () => Math.random().toString(36).slice(2, 10);
