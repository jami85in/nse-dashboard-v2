export default {
  async fetch(request) {
    const url = new URL(request.url);
    const symbols = (url.searchParams.get("symbols") || "")
      .split(",")
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (!symbols.length) {
      return json({ updated_at: new Date().toISOString(), prices: {}, error: "Pass ?symbols=BEL,MCX,CDSL" }, 400, cors);
    }

    const prices = {};
    await Promise.all(symbols.map(async symbol => {
      try {
        const endpoint = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`;
        const res = await fetch(endpoint, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            "Accept": "application/json,text/plain,*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`
          }
        });
        if (!res.ok) return;
        const data = await res.json();
        const info = data.priceInfo || {};
        const price = Number(info.lastPrice);
        if (Number.isFinite(price)) {
          prices[symbol] = {
            price,
            lastPrice: price,
            change: Number(info.change),
            changePercent: Number(info.pChange),
            previousClose: Number(info.previousClose),
            open: Number(info.open),
            dayHigh: Number(info.intraDayHighLow?.max),
            dayLow: Number(info.intraDayHighLow?.min)
          };
        }
      } catch (_) {}
    }));

    return json({ updated_at: new Date().toISOString(), count: Object.keys(prices).length, prices }, 200, cors);
  }
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
  });
}