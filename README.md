# Portfolio Lab

A personal investing dashboard: live holdings across all three Robinhood accounts, a watchlist with your theses, a valuation sandbox, and a Monte Carlo retirement projection.

Plain HTML, CSS and JavaScript. No frameworks, no build step, no server. It runs entirely in your browser.

> For learning, not financial advice. Prices come from Finnhub and may be delayed.

## Setup (about 10 minutes)

1. **Get a free API key** at <https://finnhub.io/register>. Copy the key from your dashboard.
2. **Create a repo** on GitHub named `portfolio-lab` (public is required for free GitHub Pages).
3. **Upload the files.** On the repo page, click *Add file → Upload files* and drag in everything from this folder, keeping the `css/`, `js/` and `tests/` folders. Commit.
   - Or from a terminal: `git init && git add . && git commit -m "Portfolio Lab v1" && git branch -M main && git remote add origin https://github.com/<you>/portfolio-lab.git && git push -u origin main`
4. **Turn on Pages:** *Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main, / (root) → Save.*
5. After a minute or two the site is live at `https://<you>.github.io/portfolio-lab/`. Open it, go to **Settings**, and paste your API key.
6. On your phone, open the same URL and use *Share → Add to Home Screen* so it opens like an app. Enter the key once there too.

### Your data and privacy
- Holdings, watchlist and settings are saved in **your browser's localStorage**, never in the repo. The public code holds no personal data.
- The API key is also stored only in your browser. Anyone with your key could use up your free Finnhub quota, so don't paste it into the code.
- Different devices don't sync automatically. Use **Settings → Download backup** on one device and **Import backup** on the other. Backups never include the key.

### Running locally
ES modules don't load from `file://`, so serve the folder:
```
python -m http.server 8000
```
Then open <http://localhost:8000>.

## How the code is organized

```
index.html            page shell: header, tabs, <main>
css/style.css         all styling; colors are CSS variables at the top
js/app.js             router: tabs → view modules, shared context (state, save, go)
js/storage.js         localStorage load/save, backup export/import
js/api.js             Finnhub client with caching (quotes 1 min, fundamentals 6 h)
js/finance.js         pure math: portfolio totals, valuation model, Monte Carlo
js/ui.js              formatting helpers, chart helper, HTML escaping
js/views/*.js         one file per tab
tests/finance.test.mjs  unit tests for the math: `node tests/finance.test.mjs`
```

The key design idea is that **`finance.js` has no DOM and no network**. All the math is testable on its own, and the views just collect inputs and display outputs. Keep it that way as you add features.

## The math, briefly

- **Valuation sandbox:** `future price = EPS × (1+g)^n × exit P/E`, and `CAGR = (future/price)^(1/n) − 1`. "Growth needed" solves that equation backwards for `g` given your target return. It's a simplified relative of a reverse DCF (discounted cash flow model).
- **Monte Carlo:** monthly returns are lognormal, `exp(μ + σZ)`, with `σ = vol/√12` and `μ = ln(1+r)/12 − σ²/2`. That calibration makes the *expected* annual growth equal your input `r`. It runs 2,000 paths with a fixed seed, so results are repeatable, and reports the 10th, 50th and 90th percentiles plus the worst peak-to-bottom drop along each path.
- **Real returns:** `(1+nominal)/(1+inflation) − 1`, so retirement numbers are in today's dollars.

## Ideas for v2 (good learning projects)

1. **ETF look-through:** paste VOO/QQQM top holdings from the fund's website and show your true exposure to each company (for example, how much NVDA you own across all funds).
2. **Historical risk from real data:** use Finnhub's daily price history to compute each holding's actual volatility, max drawdown and correlations, then feed real numbers into the Monte Carlo.
3. **Fat tails:** swap the normal distribution for a Student-t, or bootstrap from real historical monthly returns, and compare how the bad-case outcome changes.
4. **Contribution plan:** given a target allocation (for example 45/30/25), tell you which fund to buy with this month's contribution to rebalance without selling.
5. **Thesis journal:** date-stamped notes per ticker, so you can look back at why you bought.
6. **Python companion:** a notebook using `pandas` and `numpy` that reads your exported backup JSON for heavier analysis.
