// Mock data for PricePilot prototype
import { getSavedCurrencyCode } from "@/lib/shop-connection";

export type Market = "DK" | "SE" | "NO" | "FI";
export type Status = "synced" | "pending" | "excluded";

export const shops = [
  { id: "shop_1", name: "nordic-outdoor.myshopify.com", platform: "Shopify", market: "DK" as Market },
  { id: "shop_2", name: "fjell-sport.centra.com", platform: "Centra", market: "NO" as Market },
];

export const markets: { code: Market; label: string; currency: string }[] = [
  { code: "DK", label: "Denmark", currency: "DKK" },
  { code: "SE", label: "Sweden", currency: "SEK" },
  { code: "NO", label: "Norway", currency: "NOK" },
  { code: "FI", label: "Finland", currency: "EUR" },
];

export const competitors = [
  { id: "c1", name: "Proshop", market: "DK" as Market, coverage: 0.94, lastCrawl: "2m ago", skus: 1840 },
  { id: "c2", name: "Elgiganten", market: "DK" as Market, coverage: 0.88, lastCrawl: "6m ago", skus: 1620 },
  { id: "c3", name: "Power", market: "DK" as Market, coverage: 0.81, lastCrawl: "12m ago", skus: 1410 },
  { id: "c4", name: "Komplett", market: "NO" as Market, coverage: 0.79, lastCrawl: "4m ago", skus: 1290 },
  { id: "c5", name: "NetOnNet", market: "SE" as Market, coverage: 0.86, lastCrawl: "9m ago", skus: 1560 },
  { id: "c6", name: "Verkkokauppa", market: "FI" as Market, coverage: 0.74, lastCrawl: "18m ago", skus: 1120 },
];

export const strategies = [
  { id: "s1", name: "Beat lowest by 1%", summary: "Match the lowest tracked competitor minus 1%, never below margin floor 18%", products: 142, edited: "2d ago" },
  { id: "s2", name: "Match market average", summary: "Set price within ±2% of market average across tracked competitors", products: 86, edited: "5d ago" },
  { id: "s3", name: "Margin floor 25%", summary: "Maintain at least 25% gross margin regardless of competitor moves", products: 38, edited: "1w ago" },
  { id: "s4", name: "Premium +8%", summary: "Position 8% above market average for selected hero products", products: 21, edited: "3w ago" },
];

const names = [
  "Helly Hansen Crew Jacket", "Fjällräven Kånken 16L", "Bergans Slingsby Hoodie",
  "Devold Nansen Wool Sweater", "Hestra Army Leather Gloves", "Norrøna Falketind Pants",
  "Houdini Power Houdi", "Klättermusen Atle Jacket", "Peak Performance Shell",
  "Tretorn Wings Rain Boots", "Icebreaker Merino Tee", "Haglöfs Roc Spirit",
  "Lundhags Authentic II", "Sätila Tyfon Hat", "Hellner Trail Pole",
  "Ortovox Merino Base", "Bergans Letto Vest", "Devold Expedition Pants",
  "Fjällräven High Coast Bag", "Helly Hansen Loke Jacket", "Norrøna Lofoten Bib",
  "Houdini C9 Shell", "Klättermusen Allgrön 2.0", "Peak Performance Vislight",
  "Icebreaker 200 Oasis", "Haglöfs LIM Mid", "Lundhags Skylta", "Sätila Beanie Pro",
  "Hestra Fall Line Mitt", "Bergans Røros Down",
];

function rand(seed: number) {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  cost: number;
  current: number;
  recommended: number;
  compMin: number;
  compAvg: number;
  compMax: number;
  strategyId: string;
  status: Status;
  market: Market;
  history: number[];
  competitorPrices: { competitor: string; price: number }[];
};

const cats = ["Jackets", "Pants", "Mid-layer", "Accessories", "Footwear"];

export const products: Product[] = names.map((name, i) => {
  const r = rand(i + 7);
  const cost = Math.round((400 + r() * 1600) / 10) * 10;
  const compAvg = Math.round((cost * (1.4 + r() * 0.8)) / 10) * 10;
  const compMin = Math.round(compAvg * (0.88 + r() * 0.06));
  const compMax = Math.round(compAvg * (1.06 + r() * 0.08));
  const current = Math.round(compAvg * (0.95 + r() * 0.12));
  const stratIdx = Math.floor(r() * strategies.length);
  const recommended = Math.round(compMin * 0.99);
  const status: Status = r() > 0.78 ? "pending" : r() > 0.1 ? "synced" : "excluded";
  const history = Array.from({ length: 30 }, (_, k) => Math.round(current * (0.95 + Math.sin(k / 4 + i) * 0.04 + r() * 0.03)));
  const competitorPrices = competitors.slice(0, 5).map((c) => ({
    competitor: c.name,
    price: Math.round(compAvg * (0.9 + r() * 0.2)),
  }));
  return {
    id: `p_${i}`,
    sku: `NO-${(1000 + i).toString()}`,
    name,
    category: cats[i % cats.length],
    cost,
    current,
    recommended,
    compMin,
    compAvg,
    compMax,
    strategyId: strategies[stratIdx].id,
    status,
    market: "DK",
    history,
    competitorPrices,
  };
});

export const pendingChanges = products
  .filter((p) => p.status === "pending")
  .slice(0, 8)
  .map((p) => ({
    product: p,
    reason:
      p.recommended < p.current
        ? "Competitor undercut by Proshop"
        : "Market average rose 3.2%",
  }));

export const competitorActivity = [
  { time: "14:32", competitor: "Proshop", product: "Helly Hansen Crew Jacket", change: -4.2 },
  { time: "14:18", competitor: "Elgiganten", product: "Fjällräven Kånken 16L", change: 2.1 },
  { time: "13:55", competitor: "Komplett", product: "Norrøna Falketind Pants", change: -1.8 },
  { time: "13:41", competitor: "NetOnNet", product: "Houdini Power Houdi", change: 5.6 },
  { time: "13:22", competitor: "Proshop", product: "Klättermusen Atle Jacket", change: -3.1 },
  { time: "12:58", competitor: "Power", product: "Devold Nansen Wool Sweater", change: 1.4 },
  { time: "12:30", competitor: "Verkkokauppa", product: "Peak Performance Shell", change: -2.7 },
];

export const kpis = [
  { label: "Price changes today", value: "247", delta: "+18%", series: [12, 14, 11, 18, 22, 19, 26, 24, 28, 31, 27, 33] },
  { label: "Avg margin", value: "31.4%", delta: "+0.6pp", series: [30, 30, 31, 30, 31, 31, 32, 31, 32, 31, 31, 32] },
  { label: "Revenue impact 7d", value: "+ 184k", delta: "+12.3%", series: [10, 14, 13, 18, 22, 24, 28, 31, 34, 38, 42, 46] },
  { label: "Competitor moves 24h", value: "1,284", delta: "-4%", series: [60, 58, 56, 54, 52, 50, 48, 50, 48, 46, 44, 42] },
];

export const priceIndex30d = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  pricepilot: 100 + Math.sin(i / 4) * 1.4 + i * 0.05,
  market: 100 + Math.sin(i / 5 + 1) * 2.2 + i * 0.08,
}));

export function fmt(n: number, currency = getSavedCurrencyCode()) {
  return `${n.toLocaleString("da-DK")} ${currency}`;
}
