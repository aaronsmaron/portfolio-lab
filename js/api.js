// api.js — talks to Finnhub (https://finnhub.io). Free tier: 60 calls/minute.
// Responses are cached briefly so switching tabs doesn't burn through the limit.

const BASE = "https://finnhub.io/api/v1";
const QUOTE_TTL = 60 * 1000; // quotes: 1 minute
const FUNDAMENTALS_TTL = 6 * 60 * 60 * 1000; // metrics/profile: 6 hours (they change quarterly)

const cache = new Map(); // url -> { at, data }

export class ApiError extends Error {}

/** Forget cached quotes (keeps fundamentals) — used by the Refresh button. */
export function clearQuoteCache() {
  for (const url of cache.keys()) if (url.includes("/quote?")) cache.delete(url);
}

async function get(path, params, apiKey, ttl) {
  if (!apiKey) throw new ApiError("Add your Finnhub API key in Settings.");
  const qs = new URLSearchParams({ ...params, token: apiKey }).toString();
  const url = `${BASE}${path}?${qs}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.data;

  const res = await fetch(url);
  if (res.status === 401) throw new ApiError("Finnhub rejected the API key. Check it in Settings.");
  if (res.status === 429) throw new ApiError("Hit Finnhub's rate limit (60/min). Wait a minute and refresh.");
  if (!res.ok) throw new ApiError(`Finnhub error ${res.status}`);
  const data = await res.json();
  cache.set(url, { at: Date.now(), data });
  return data;
}

/** Live quote → { price, prevClose, change, changePct, high, low } */
export async function getQuote(symbol, apiKey) {
  const q = await get("/quote", { symbol }, apiKey, QUOTE_TTL);
  // Finnhub returns c = 0 for unknown symbols.
  if (!q || !q.c) return null;
  return { price: q.c, prevClose: q.pc, change: q.d, changePct: q.dp / 100, high: q.h, low: q.l };
}

/** Company profile (empty for most ETFs). marketCap is converted to dollars. */
export async function getProfile(symbol, apiKey) {
  const p = await get("/stock/profile2", { symbol }, apiKey, FUNDAMENTALS_TTL);
  if (!p || !p.name) return null;
  return {
    name: p.name,
    industry: p.finnhubIndustry,
    marketCap: p.marketCapitalization ? p.marketCapitalization * 1e6 : null,
  };
}

/**
 * Key fundamentals. Finnhub's field names vary a little between companies,
 * so each value tries a few names before giving up.
 */
export async function getMetrics(symbol, apiKey) {
  const r = await get("/stock/metric", { symbol, metric: "all" }, apiKey, FUNDAMENTALS_TTL);
  const m = (r && r.metric) || {};
  const pick = (...names) => {
    for (const n of names) if (Number.isFinite(m[n])) return m[n];
    return null;
  };
  const pct = (v) => (v === null ? null : v / 100); // Finnhub sends percents as 12.3
  return {
    peTTM: pick("peTTM", "peBasicExclExtraTTM", "peExclExtraTTM"),
    epsTTM: pick("epsTTM", "epsBasicExclExtraItemsTTM", "epsExclExtraItemsTTM", "epsInclExtraItemsTTM"),
    psTTM: pick("psTTM", "priceToSalesTTM"),
    revenueGrowth: pct(pick("revenueGrowthTTMYoy", "revenueGrowthQuarterlyYoy")),
    epsGrowth: pct(pick("epsGrowthTTMYoy", "epsGrowthQuarterlyYoy")),
    operatingMargin: pct(pick("operatingMarginTTM")),
    netMargin: pct(pick("netProfitMarginTTM")),
    roe: pct(pick("roeTTM")),
    beta: pick("beta"),
    high52: pick("52WeekHigh"),
    low52: pick("52WeekLow"),
    dividendYield: pct(pick("dividendYieldIndicatedAnnual", "currentDividendYieldTTM")),
  };
}

/** Fetch quotes for many tickers, a few at a time. Failures come back as null. */
export async function getQuotes(symbols, apiKey) {
  const unique = [...new Set(symbols)];
  const out = {};
  const errors = [];
  const batchSize = 5;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (s) => {
        try {
          out[s] = await getQuote(s, apiKey);
        } catch (e) {
          out[s] = null;
          errors.push(e.message);
        }
      })
    );
  }
  return { quotes: out, error: errors[0] || null };
}
