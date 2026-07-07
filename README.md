# NSE Dashboard V2

Static GitHub Pages dashboard for NSE swing-trading scanner output.

## What changed from nse-tracker

- Scanner logic is preserved in `scripts/scan.py`.
- `data/prices_live.json` is removed.
- `scripts/prices.py` is removed.
- `.github/workflows/prices.yml` is removed.
- Live prices are fetched in the browser from Cloudflare only:
  `https://nse-prices.jami85in.workers.dev/?symbols=BEL,MCX,CDSL`

## Repository Layout

```text
frontend/
  index.html
  app.js
  config.js
  styles.css
data/
  scan_latest.json
  active_positions.json
  market_status.json
  scan_version.txt
scripts/
  scan.py
  requirements.txt
cloudflare/
  worker.js
.github/workflows/
  scan.yml
index.html
wrangler.toml
```

## GitHub Upload Steps

1. Open the GitHub repository `jami85in/nse-dashboard-v2`.
2. Upload every file and folder from this package into the repository root.
3. Keep the same folder names exactly: `frontend`, `data`, `scripts`, `cloudflare`, `.github/workflows`.
4. Do not upload `data/prices_live.json`, `scripts/prices.py`, or `.github/workflows/prices.yml`.
5. Commit the upload to the `main` branch.
6. In GitHub, go to Settings -> Pages.
7. Set Source to `Deploy from a branch`, Branch `main`, Folder `/root`.
8. Open the Pages URL. The root `index.html` redirects to `frontend/`.

## Required Secret

The scan workflow still uses Claude commentary when needed. Add this repository secret:

- `ANTHROPIC_API_KEY`

GitHub path: Settings -> Secrets and variables -> Actions -> New repository secret.

## Live Price Flow

On page load, the dashboard:

1. Loads `data/scan_latest.json`.
2. Loads `data/active_positions.json`.
3. Builds a tracked symbol list from scan sections and active positions.
4. Calls the Cloudflare Worker with `?symbols=...`.
5. Merges returned prices into the dashboard.

Automatic refresh runs every 15 minutes. The `Refresh Prices` button runs the same Worker-only refresh manually.

During a price refresh, the frontend updates only price-derived fields:

- Current Price
- Today's Change %
- Distance to Entry
- Distance to Stop Loss
- Distance to Target
- Current P&L
- Live Status

It does not recalculate scanner indicators.

## Cloudflare Worker

The active endpoint is already configured in `frontend/config.js`:

```js
priceWorkerUrl: "https://nse-prices.jami85in.workers.dev"
```

`cloudflare/worker.js` is included so the Worker can be redeployed or audited later.

## Local Preview

From the repository root:

```bash
python -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/frontend/
```