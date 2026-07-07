const CFG = window.NSE_DASHBOARD_CONFIG;
const state = { scan: null, positions: {}, prices: {}, tab: "long", loadingPrices: false };
const $ = id => document.getElementById(id);
const lists = ["squeeze_stocks", "blast_stocks", "watchlist_stocks", "short_squeeze_stocks", "short_breakdown_stocks"];

function fmt(n, d = 2) { return Number.isFinite(Number(n)) ? Number(n).toFixed(d) : "--"; }
function pct(n) { return Number.isFinite(Number(n)) ? `${Number(n) >= 0 ? "+" : ""}${fmt(n)}%` : "--"; }
function money(n) { return Number.isFinite(Number(n)) ? `Rs ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "--"; }
function istTime() { return new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }); }
function dataUrl(name) { return `${CFG.dataBasePath}/${name}?v=${Date.now()}`; }

async function loadJson(name, fallback = null) {
  const res = await fetch(dataUrl(name), { cache: "no-store" });
  if (!res.ok) {
    if (fallback !== null) return fallback;
    throw new Error(`Could not load ${name}: HTTP ${res.status}`);
  }
  return res.json();
}

function normalizePricePayload(payload) {
  const raw = payload?.prices || payload?.data || payload || {};
  const out = {};
  for (const [symbol, value] of Object.entries(raw)) {
    if (typeof value === "number") out[symbol.toUpperCase()] = { price: value };
    else if (value && typeof value === "object") {
      const price = value.price ?? value.lastPrice ?? value.ltp ?? value.last ?? value.regularMarketPrice;
      const changePct = value.changePercent ?? value.pChange ?? value.percentChange ?? value.regularMarketChangePercent;
      const change = value.change ?? value.absoluteChange ?? value.regularMarketChange;
      out[symbol.toUpperCase()] = { price: Number(price), changePct: Number(changePct), change: Number(change) };
    }
  }
  return out;
}

function allScanRows() {
  if (!state.scan) return [];
  return lists.flatMap(key => state.scan[key] || []);
}

function trackedSymbols() {
  const syms = new Set();
  for (const row of allScanRows()) if (row.symbol) syms.add(row.symbol.toUpperCase());
  for (const key of Object.keys(state.positions || {})) syms.add(key.toUpperCase());
  return [...syms].sort();
}

function liveFor(stock) {
  const p = state.prices[stock.symbol?.toUpperCase()];
  if (!p || !Number.isFinite(p.price)) return { price: Number(stock.price), changePct: null, isLive: false };
  return { ...p, isLive: true };
}

function distancePct(fromPrice, toPrice) {
  if (!Number.isFinite(Number(fromPrice)) || !Number.isFinite(Number(toPrice)) || Number(fromPrice) === 0) return null;
  return ((Number(toPrice) - Number(fromPrice)) / Number(fromPrice)) * 100;
}

function statusFor(stock, live) {
  const price = Number(live.price);
  const entry = Number(stock.entry_price ?? stock.blast_entry_price);
  const target = Number(stock.target_price ?? stock.pivot_r1 ?? stock.cover_target);
  const stop = Number(stock.stop_price ?? stock.pivot_s1);
  if (!Number.isFinite(price)) return stock.status || stock.setup || "Awaiting Breakout";
  if (Number.isFinite(stop) && price <= stop) return "Stop Loss Hit";
  if (Number.isFinite(target) && price >= target) return "Target 1 Hit";
  if (Number.isFinite(entry) && price >= entry) {
    if ((stock.setup || "").includes("BLAST")) return "Book Profit";
    return "Entry Triggered";
  }
  if ((stock.setup || "").includes("BLAST")) return "Book Profit";
  if ((stock.setup || "").includes("WATCHLIST")) return "Awaiting Breakout";
  return "Hold";
}

function pnlFor(stock, live) {
  const entry = Number(stock.entry_price ?? stock.blast_entry_price);
  const price = Number(live.price);
  if (!Number.isFinite(entry) || !Number.isFinite(price) || entry === 0) return null;
  return ((price - entry) / entry) * 100;
}

async function refreshPrices() {
  const symbols = trackedSymbols();
  if (!symbols.length) return;
  state.loadingPrices = true;
  $("refresh-prices").disabled = true;
  try {
    const url = `${CFG.priceWorkerUrl}/?symbols=${encodeURIComponent(symbols.join(","))}&t=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Cloudflare Worker price fetch failed: HTTP ${res.status}`);
    state.prices = normalizePricePayload(await res.json());
    $("last-updated").textContent = istTime();
    $("price-source").textContent = "Cloudflare Worker";
    setError("");
  } catch (err) {
    setError(err.message);
  } finally {
    state.loadingPrices = false;
    $("refresh-prices").disabled = false;
    render();
  }
}

function setError(message) {
  const box = $("error");
  box.hidden = !message;
  box.textContent = message || "";
}

function stat(label, value) { return `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`; }

function card(stock, kind) {
  const live = liveFor(stock);
  const livePrice = Number(live.price);
  const change = Number.isFinite(live.changePct) ? live.changePct : distancePct(Number(stock.price), livePrice);
  const entry = Number(stock.entry_price ?? stock.blast_entry_price);
  const target = Number(stock.target_price ?? stock.pivot_r1 ?? stock.cover_target);
  const stop = Number(stock.stop_price ?? stock.pivot_s1);
  const pnl = pnlFor(stock, live);
  const klass = kind === "blast" ? "hot" : kind === "watchlist" ? "watch" : kind === "shorts" ? "short" : "";
  return `<article class="card ${klass}">
    <div class="card-head">
      <div><div class="symbol">${stock.symbol}</div><div class="reason">${stock.reason || stock.handoff_note || stock.setup || ""}</div></div>
      <span class="badge ${klass}">${statusFor(stock, live)}</span>
    </div>
    <div class="price-row"><div class="price">${money(livePrice)}</div><div class="change ${change >= 0 ? "pos" : "neg"}">${pct(change)}</div></div>
    <div class="stats">
      ${stat("Current P&L", pct(pnl))}
      ${stat("Distance to Entry", pct(distancePct(livePrice, entry)))}
      ${stat("Distance to Stop Loss", pct(distancePct(livePrice, stop)))}
      ${stat("Distance to Target", pct(distancePct(livePrice, target)))}
      ${stat("BB Width", `${fmt(stock.bb_width)}%`)}
      ${stat("Stoch K/D", `${fmt(stock.stoch_k, 1)} / ${fmt(stock.stoch_d, 1)}`)}
      ${stat("EMA 10/30", `${fmt(stock.ema10)} / ${fmt(stock.ema30)}`)}
      ${stat("Setup", stock.setup || stock.status || "--")}
    </div>
  </article>`;
}

function renderList(title, note, rows, kind) {
  const body = rows.length ? `<div class="grid">${rows.map(r => card(r, kind)).join("")}</div>` : `<div class="empty">No records in this section.</div>`;
  return `<div class="section-head"><div><h2>${title}</h2><p>${note}</p></div><p>${rows.length} item${rows.length === 1 ? "" : "s"}</p></div>${body}`;
}

function renderPositions() {
  const rows = Object.values(state.positions || {});
  return renderList("Active Positions", "Loaded from data/active_positions.json and refreshed with Worker prices.", rows, "long");
}

function render() {
  if (!state.scan) return;
  $("scan-time").textContent = state.scan.scan_time || "--";
  $("tracked-count").textContent = trackedSymbols().length;
  $("subtitle").textContent = `${state.scan.market_mood || "Latest scan"} | ${state.scan.scanned_count || 0} stocks scanned`;
  const map = {
    long: () => renderList("Long Setups", "Scanner calculations are static; only price-derived fields refresh.", state.scan.squeeze_stocks || [], "long"),
    blast: () => renderList("Blast Exits", "Exit and booking-profit candidates from the latest scan.", state.scan.blast_stocks || [], "blast"),
    watchlist: () => renderList("Watchlist", "Forming setups that are not confirmed entries yet.", state.scan.watchlist_stocks || [], "watchlist"),
    shorts: () => renderList("Short Signals", "Short squeeze and breakdown signals from the scanner.", [...(state.scan.short_squeeze_stocks || []), ...(state.scan.short_breakdown_stocks || [])], "shorts"),
    positions: renderPositions
  };
  $("content").innerHTML = map[state.tab]();
}

async function init() {
  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.tab = btn.dataset.tab;
    render();
  }));
  $("refresh-prices").addEventListener("click", refreshPrices);
  try {
    const [scan, positions] = await Promise.all([
      loadJson("scan_latest.json"),
      loadJson("active_positions.json", {})
    ]);
    state.scan = scan;
    state.positions = positions || {};
    render();
    await refreshPrices();
    window.setInterval(refreshPrices, CFG.autoRefreshMinutes * 60 * 1000);
  } catch (err) {
    setError(err.message);
  }
}

init();