import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMemo, useState, useRef, useEffect } from "react";
import { Download, X, Check, ChevronDown, RefreshCw } from "lucide-react";
import { PageHeader, StatusPill, Delta } from "@/components/ui-bits";
import { fmt, type Product } from "@/lib/mock-data";
import { readSavedShopConnection } from "@/lib/shop-connection";
import { readStoredStrategies, type StrategyRecord, type StrategySettings } from "@/lib/strategy-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/products")({
  head: () => ({ meta: [{ title: "Products — PricePilot" }] }),
  component: ProductsPage,
});

const NO_STRATEGY_OPTION = {
  id: "",
  name: "No strategy",
  summary: "No automatic updates. Product prices remain unchanged until a strategy is assigned.",
};

const DATE_PRESETS = [
  { id: "1d", label: "Last 24 h", days: 1 },
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "all", label: "All time", days: Infinity },
] as const;

const PAGE_SIZES = [25, 50, 100, 200, 500, 1000] as const;
type PageSize = (typeof PAGE_SIZES)[number];

type LiveWooInput = {
  storeUrl: string;
  apiVersion: string;
  consumerKey: string;
  consumerSecret: string;
  maxPages?: number;
};

type PriceRunnerQuote = {
  merchant?: string;
  amount: number;
  inStock?: boolean;
};

type PriceRunnerResult = {
  ean: string;
  quotes: PriceRunnerQuote[];
  cheapestDkk: number | null;
  error?: string;
};

type PriceRunnerLookupResponse = {
  results: PriceRunnerResult[];
};

type FirestoreCostLookupResponse = {
  results: Array<{
    ean: string;
    costDkk: number | null;
    supplier: string | null;
  }>;
};

type WooPriceSyncInput = {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  updates: { id: number; price: number }[];
};

type WooPriceSyncResponse = {
  total: number;
  updated: number;
  failed: number;
  results?: Array<{ id: number; ok: boolean; message?: string; status?: number }>;
};

type LiveWooProduct = {
  id: number;
  name: string;
  ean: string;
  sku: string;
  permalink: string;
  price: number | null;
  type: string;
  stockStatus: string;
  categories: string[];
  brand: string;
  modifiedAtMs: number | null;
  costDkk?: number | null;
};

type LiveProductsCacheEntry = {
  key: string;
  timestampMs: number;
  products: Product[];
  sourceLabel: string | null;
  modifiedMap: Record<string, number>;
  nonSyncableIds: string[];
};

const LIVE_PRODUCTS_CACHE_TTL_MS = 90 * 1000;
const WOO_PRODUCTS_PER_PAGE = 100;
const WOO_PRODUCTS_MAX_PAGES = 20;
const WOO_PRODUCTS_INITIAL_RECENT_MAX_PAGES = 3;
let liveProductsCache: LiveProductsCacheEntry | null = null;

function toConnectionKey(connection: LiveWooInput): string {
  return `${connection.storeUrl}|${connection.apiVersion}`;
}

const fetchConnectedWooProducts = createServerFn({ method: "POST" })
  .validator((input: LiveWooInput) => input)
  .handler(async ({ data }) => {
    const authToken = Buffer.from(`${data.consumerKey}:${data.consumerSecret}`, "utf-8").toString("base64");
    const maxPages = Math.max(1, Math.min(WOO_PRODUCTS_MAX_PAGES, data.maxPages ?? WOO_PRODUCTS_MAX_PAGES));
    const allProducts: LiveWooProduct[] = [];

    for (let page = 1; page <= maxPages; page += 1) {
      const endpoint = `${data.storeUrl}/wp-json/${data.apiVersion}/products?per_page=${WOO_PRODUCTS_PER_PAGE}&page=${page}`;

      let response = await fetch(endpoint, {
        headers: {
          Authorization: `Basic ${authToken}`,
          Accept: "application/json",
          "User-Agent": "PricePilot-Live-Sync",
        },
      });

      let rawBody = await response.text();
      let payload: unknown = null;
      try {
        payload = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        payload = null;
      }

      if ((response.status === 401 || response.status === 403) && endpoint.includes("?")) {
        const fallbackUrl = `${endpoint}&consumer_key=${encodeURIComponent(data.consumerKey)}&consumer_secret=${encodeURIComponent(data.consumerSecret)}`;
        response = await fetch(fallbackUrl, {
          headers: {
            Accept: "application/json",
            "User-Agent": "PricePilot-Live-Sync",
          },
        });

        rawBody = await response.text();
        try {
          payload = rawBody ? JSON.parse(rawBody) : null;
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload &&
          "message" in payload &&
          typeof (payload as { message?: unknown }).message === "string"
            ? (payload as { message: string }).message
            : `Live sync failed (${response.status}) on page ${page}.`;
        throw new Error(message);
      }

      const pageProducts = Array.isArray(payload)
        ? payload
            .filter((item) => typeof item === "object" && item !== null)
            .map((item) => {
              const obj = item as Record<string, unknown>;
              const categories = Array.isArray(obj.categories)
                ? obj.categories
                    .filter((c) => typeof c === "object" && c !== null)
                    .map((c) => (c as Record<string, unknown>).name)
                    .filter((name): name is string => typeof name === "string")
                : [];

              const name = typeof obj.name === "string" ? obj.name : "Unnamed product";
              const numericPrice =
                typeof obj.price === "string" && obj.price.trim() !== ""
                  ? Number(obj.price)
                  : typeof obj.price === "number"
                    ? obj.price
                    : null;

              return {
                id: Number(obj.id) || 0,
                name,
                ean: typeof obj.sku === "string" ? obj.sku : "",
                sku: typeof obj.sku === "string" ? obj.sku : "",
                permalink: typeof obj.permalink === "string" ? obj.permalink : "",
                price: numericPrice !== null && Number.isFinite(numericPrice) ? numericPrice : null,
                type: typeof obj.type === "string" ? obj.type : "",
                stockStatus: typeof obj.stock_status === "string" ? obj.stock_status : "instock",
                categories,
                brand: name.split(" ")[0] ?? "",
                modifiedAtMs:
                  typeof obj.date_modified_gmt === "string" && !Number.isNaN(Date.parse(obj.date_modified_gmt))
                    ? Date.parse(obj.date_modified_gmt)
                    : typeof obj.date_modified === "string" && !Number.isNaN(Date.parse(obj.date_modified))
                      ? Date.parse(obj.date_modified)
                      : null,
              } satisfies LiveWooProduct;
            })
            .filter((p) => p.id > 0)
        : [];

      allProducts.push(...pageProducts);

      const totalPagesHeader = Number(response.headers.get("x-wp-totalpages") || "");
      const knownTotalPages = Number.isFinite(totalPagesHeader) && totalPagesHeader > 0 ? totalPagesHeader : null;
      const reachedLastPage = (knownTotalPages !== null && page >= knownTotalPages) || pageProducts.length < WOO_PRODUCTS_PER_PAGE;
      if (reachedLastPage) break;
    }

    const products = Array.from(new Map(allProducts.map((product) => [product.id, product])).values());

    return {
      source: data.storeUrl,
      total: products.length,
      products,
    };
  });

const fetchPriceRunnerQuotes = createServerFn({ method: "POST" })
  .validator((input: { eans: string[] }) => input)
  .handler(async ({ data }): Promise<PriceRunnerLookupResponse> => {
    const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "http://127.0.0.1:8788";

    const response = await fetch(`${API_BASE}/api/v1/pricerunner/quotes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ eans: data.eans }),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload &&
        "error" in payload &&
        typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `PriceRunner lookup failed (${response.status}).`;
      throw new Error(message);
    }

    return (payload as PriceRunnerLookupResponse) ?? { results: [] };
  });

const fetchFirestoreCosts = createServerFn({ method: "POST" })
  .validator((input: { eans: string[] }) => input)
  .handler(async ({ data }): Promise<FirestoreCostLookupResponse> => {
    const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "http://127.0.0.1:8788";

    const response = await fetch(`${API_BASE}/api/v1/firestore/costs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ eans: data.eans }),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload &&
        "error" in payload &&
        typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `Firestore cost lookup failed (${response.status}).`;
      throw new Error(message);
    }

    return (payload as FirestoreCostLookupResponse) ?? { results: [] };
  });

const runWooPriceSync = createServerFn({ method: "POST" })
  .validator((input: WooPriceSyncInput) => input)
  .handler(async ({ data }): Promise<WooPriceSyncResponse> => {
    const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "http://127.0.0.1:8788";

    const response = await fetch(`${API_BASE}/api/v1/woocommerce/price-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-woo-base-url": data.storeUrl,
        "x-woo-consumer-key": data.consumerKey,
        "x-woo-consumer-secret": data.consumerSecret,
      },
      body: JSON.stringify({ updates: data.updates }),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const message =
        typeof payload === "object" && payload && "error" in payload && typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `Price sync failed (${response.status}).`;
      throw new Error(message);
    }

    return (payload as WooPriceSyncResponse) ?? { total: 0, updated: 0, failed: 0 };
  });

function applyRounding(value: number, rounding: StrategySettings["rounding"]): number {
  if (rounding === "none") return Number(value.toFixed(2));
  const step = rounding === "0.5" ? 0.5 : rounding === "1" ? 1 : 5;
  return Number((Math.round(value / step) * step).toFixed(2));
}

function computeTargetPrice(params: {
  current: number;
  cost: number;
  lowestPrice: number;
  settings: StrategySettings;
}): number {
  const { current, cost, lowestPrice, settings } = params;

  const marginFloor = cost / (1 - settings.minMarginPct / 100);
  const basisPrice = settings.basis === "premium"
    ? lowestPrice * (1 + settings.premiumPct / 100)
    : lowestPrice * (1 - settings.undercutPct / 100);

  const unclamped = Math.max(marginFloor, basisPrice);
  const maxStep = Math.max(0, settings.maxStepChangePct) / 100;
  const minAllowed = current * (1 - maxStep);
  const maxAllowed = current * (1 + maxStep);
  const stepped = Math.min(maxAllowed, Math.max(minAllowed, unclamped));
  return applyRounding(stepped, settings.rounding);
}

function brandOf(name: string) {
  return name.split(" ")[0];
}

function formatTimeAgo(fromMs: number): string {
  const deltaMs = Date.now() - fromMs;
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return "just now";

  const mins = Math.floor(deltaMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

function toDisplayProduct(index: number, source: {
  id: number;
  sku: string;
  ean: string;
  name: string;
  categories: string[];
  brand: string;
  price: number | null;
  stockStatus: string;
  costDkk?: number | null;
}): Product {
  const r = seeded(source.id || index + 1000);
  const current = source.price && source.price > 0 ? source.price : Math.round((350 + r() * 1500) / 10) * 10;
  const fallbackCost = Math.max(1, Math.round(current * (0.62 + r() * 0.15)));
  const cost = typeof source.costDkk === "number" && Number.isFinite(source.costDkk) && source.costDkk > 0
    ? source.costDkk
    : fallbackCost;
  const compAvg = Math.max(1, Math.round(current * (0.98 + r() * 0.08)));
  const compMin = Math.max(1, Math.round(compAvg * (0.9 + r() * 0.05)));
  const compMax = Math.max(compAvg, Math.round(compAvg * (1.06 + r() * 0.08)));
  const recommended = Math.max(compMin, Math.round((cost / 0.8) * 100) / 100);
  const competitorNames = ["Proshop", "Elgiganten", "Power", "Komplett", "NetOnNet"];

  return {
    id: `woo_${source.id}`,
    sku: source.sku || source.ean || `SKU-${source.id}`,
    name: source.name,
    category: source.categories?.[0] || source.brand || "General",
    cost,
    current,
    recommended,
    compMin,
    compAvg,
    compMax,
    // Imported products start without a pricing strategy until user assigns one.
    strategyId: "",
    status: source.stockStatus?.toLowerCase().includes("out") ? "excluded" : "synced",
    market: "DK",
    history: Array.from({ length: 30 }, (_, k) => Math.round(current * (0.95 + Math.sin(k / 4 + index) * 0.03 + r() * 0.02))),
    competitorPrices: competitorNames.map((competitor) => ({
      competitor,
      price: Math.max(1, Math.round(compAvg * (0.92 + r() * 0.16))),
    })),
  };
}

export function ProductsPage({ mode = "products" }: { mode?: "products" | "recent" }) {
  const [storedStrategies, setStoredStrategies] = useState<StrategyRecord[]>([]);
  const [liveProducts, setLiveProducts] = useState<Product[] | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [isLiveLoading, setIsLiveLoading] = useState(true);
  const [hasShopConnection, setHasShopConnection] = useState<boolean | null>(null);
  const [priceRunnerByEan, setPriceRunnerByEan] = useState<Record<string, PriceRunnerResult>>({});
  const [priceRunnerFetchedEans, setPriceRunnerFetchedEans] = useState<Set<string>>(new Set());
  const [priceRunnerLoadingEans, setPriceRunnerLoadingEans] = useState<Set<string>>(new Set());
  const [priceRunnerErrorByEan, setPriceRunnerErrorByEan] = useState<Record<string, string>>({});
  const [syncRunning, setSyncRunning] = useState(false);
  const [nonSyncableProductIds, setNonSyncableProductIds] = useState<Set<string>>(new Set());
  const [lastSyncedAtByProductId, setLastSyncedAtByProductId] = useState<Record<string, number>>({});
  const [wooModifiedAtByProductId, setWooModifiedAtByProductId] = useState<Record<string, number>>({});

  async function enrichProductsWithFirestoreCosts(products: LiveWooProduct[]): Promise<LiveWooProduct[]> {
    const eans = [...new Set(products
      .map((p) => (p.sku || p.ean || "").trim())
      .filter(Boolean))];

    if (eans.length === 0) {
      return products;
    }

    try {
      const costResponse = await fetchFirestoreCosts({ data: { eans } });
      const costByEan = new Map<string, number>();
      for (const row of costResponse.results ?? []) {
        if (!row?.ean) continue;
        if (typeof row.costDkk === "number" && Number.isFinite(row.costDkk) && row.costDkk > 0) {
          costByEan.set(row.ean.trim(), row.costDkk);
        }
      }

      return products.map((p) => {
        const key = (p.sku || p.ean || "").trim();
        return {
          ...p,
          costDkk: costByEan.get(key) ?? null,
        };
      });
    } catch {
      return products;
    }
  }

  useEffect(() => {
    const syncStrategies = () => setStoredStrategies(readStoredStrategies());

    syncStrategies();
    window.addEventListener("focus", syncStrategies);
    const onStorage = () => syncStrategies();
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("focus", syncStrategies);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setIsLiveLoading(true);
      const connection = readSavedShopConnection();
      if (!connection || connection.platform !== "WooCommerce") {
        setLiveProducts([]);
        setSourceLabel(null);
        setLiveError(null);
        setHasShopConnection(false);
        setIsLiveLoading(false);
        return;
      }

      try {
        setHasShopConnection(true);
        const cacheKey = toConnectionKey({
          storeUrl: connection.storeUrl,
          apiVersion: connection.apiVersion,
          consumerKey: connection.consumerKey,
          consumerSecret: connection.consumerSecret,
        });

        if (liveProductsCache && liveProductsCache.key === cacheKey && (Date.now() - liveProductsCache.timestampMs) < LIVE_PRODUCTS_CACHE_TTL_MS) {
          setLiveProducts(liveProductsCache.products);
          setWooModifiedAtByProductId(liveProductsCache.modifiedMap);
          setNonSyncableProductIds(new Set(liveProductsCache.nonSyncableIds));
          setSourceLabel(liveProductsCache.sourceLabel);
          setLiveError(null);
          setIsLiveLoading(false);
          return;
        }

        const response = await fetchConnectedWooProducts({
          data: {
            storeUrl: connection.storeUrl,
            apiVersion: connection.apiVersion,
            consumerKey: connection.consumerKey,
            consumerSecret: connection.consumerSecret,
            maxPages: mode === "recent" ? WOO_PRODUCTS_INITIAL_RECENT_MAX_PAGES : WOO_PRODUCTS_MAX_PAGES,
          },
        });
        if (cancelled) return;
        const withCosts = await enrichProductsWithFirestoreCosts(response.products);
        if (cancelled) return;
        const mapped = withCosts.map((item, idx) => toDisplayProduct(idx, item));
        const modifiedMap: Record<string, number> = {};
        withCosts.forEach((item) => {
          if (item.modifiedAtMs) {
            modifiedMap[`woo_${item.id}`] = item.modifiedAtMs;
          }
        });
        const nonSyncable = new Set(
          withCosts
            .filter((item) => item.price === null || item.type === "variable" || item.type === "grouped" || item.type === "external")
            .map((item) => `woo_${item.id}`),
        );
        setLiveProducts(mapped);
        setWooModifiedAtByProductId(modifiedMap);
        setNonSyncableProductIds(nonSyncable);
        setSourceLabel(response.source);
        setLiveError(null);
        liveProductsCache = {
          key: cacheKey,
          timestampMs: Date.now(),
          products: mapped,
          sourceLabel: response.source,
          modifiedMap,
          nonSyncableIds: [...nonSyncable],
        };
      } catch (error) {
        if (cancelled) return;
        setLiveProducts([]);
        setWooModifiedAtByProductId({});
        setNonSyncableProductIds(new Set());
        setSourceLabel(null);
        setLiveError(error instanceof Error ? error.message : "Failed to load products from connected shop.");
      } finally {
        if (!cancelled) setIsLiveLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  const productsData = liveProducts ?? [];
  const strategyOptions = useMemo(() => [NO_STRATEGY_OPTION, ...storedStrategies], [storedStrategies]);
  const strategyMap = useMemo(() => new Map(storedStrategies.map((s) => [s.id, s])), [storedStrategies]);

  const allBrands = useMemo(
    () => Array.from(new Set(productsData.map((p) => brandOf(p.name)))).sort(),
    [productsData],
  );
  const allCategories = useMemo(
    () => Array.from(new Set(productsData.map((p) => p.category))).sort(),
    [productsData],
  );

  const priceBounds = useMemo(() => {
    const prices = productsData.map((p) => p.current);
    if (prices.length === 0) return { min: 0, max: 0 };
    return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
  }, [productsData]);

  const [brands, setBrands] = useState<Set<string>>(new Set());
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailStrategyOpen, setDetailStrategyOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [dateId, setDateId] = useState<(typeof DATE_PRESETS)[number]["id"]>("7d");
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [visible, setVisible] = useState<number>(25);

  const minNum = priceMin === "" ? null : Number(priceMin);
  const maxNum = priceMax === "" ? null : Number(priceMax);

  const filtered = useMemo(() => {
    return productsData.filter((p) => {
      if (brands.size && !brands.has(brandOf(p.name))) return false;
      if (cats.size && !cats.has(p.category)) return false;
      if (minNum !== null && !Number.isNaN(minNum) && p.current < minNum) return false;
      if (maxNum !== null && !Number.isNaN(maxNum) && p.current > maxNum) return false;
      return true;
    });
  }, [brands, cats, minNum, maxNum, productsData]);

  const dateDays = DATE_PRESETS.find((d) => d.id === dateId)?.days ?? Infinity;

  const filteredByDate = useMemo(() => {
    if (mode !== "recent") return filtered;
    if (!Number.isFinite(dateDays)) return filtered;

    const cutoffMs = Date.now() - dateDays * 24 * 60 * 60 * 1000;
    return filtered.filter((p) => {
      const changedAt = lastSyncedAtByProductId[p.id] ?? wooModifiedAtByProductId[p.id];
      return typeof changedAt === "number" && changedAt >= cutoffMs;
    });
  }, [filtered, mode, dateDays, lastSyncedAtByProductId, wooModifiedAtByProductId]);

  useEffect(() => {
    if (mode !== "recent") return;
    setVisible(pageSize);
  }, [pageSize, dateId, brands, cats, priceMin, priceMax, productsData, mode]);

  const shownRows = mode === "recent" ? filteredByDate.slice(0, visible) : filteredByDate;
  const remaining = Math.max(0, filteredByDate.length - shownRows.length);

  const detail = productsData.find((p) => p.id === detailId);
  const allVisibleSelected = shownRows.length > 0 && shownRows.every((p) => selected.has(p.id));
  const stratFor = (p: Product) => {
    const strategyId = overrides[p.id] ?? p.strategyId;
    if (!strategyId) return "";
    return strategyMap.has(strategyId) ? strategyId : "";
  };

  async function loadPriceRunnerForEans(eans: string[]) {
    const unique = [...new Set(eans.map((e) => e.trim()).filter(Boolean))];
    if (unique.length === 0) return;

    setPriceRunnerLoadingEans((prev) => {
      const next = new Set(prev);
      unique.forEach((ean) => next.add(ean));
      return next;
    });

    try {
      const response = await fetchPriceRunnerQuotes({ data: { eans: unique } });

      setPriceRunnerByEan((prev) => {
        const next = { ...prev };
        for (const result of response.results ?? []) {
          if (result?.ean) next[result.ean] = result;
        }
        return next;
      });

      setPriceRunnerErrorByEan((prev) => {
        const next = { ...prev };
        unique.forEach((ean) => {
          const result = (response.results ?? []).find((r) => r.ean === ean);
          if (result?.error) next[ean] = result.error;
          else delete next[ean];
        });
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "PriceRunner lookup failed.";
      setPriceRunnerErrorByEan((prev) => {
        const next = { ...prev };
        unique.forEach((ean) => {
          next[ean] = message;
        });
        return next;
      });
    } finally {
      setPriceRunnerLoadingEans((prev) => {
        const next = new Set(prev);
        unique.forEach((ean) => next.delete(ean));
        return next;
      });
      setPriceRunnerFetchedEans((prev) => {
        const next = new Set(prev);
        unique.forEach((ean) => next.add(ean));
        return next;
      });
    }
  }

  useEffect(() => {
    const eansToLoad = productsData
      .filter((p) => Boolean(stratFor(p)))
      .map((p) => p.sku?.trim() ?? "")
      .filter((ean) => Boolean(ean) && !priceRunnerLoadingEans.has(ean) && !priceRunnerFetchedEans.has(ean));

    if (eansToLoad.length === 0) return;
    void loadPriceRunnerForEans(eansToLoad);
  }, [productsData, overrides, storedStrategies, priceRunnerLoadingEans, priceRunnerFetchedEans]);

  useEffect(() => {
    setDetailStrategyOpen(false);
  }, [detailId]);

  function toggleSet<T>(set: Set<T>, val: T, setter: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  }

  function applyStrategy(stratId: string) {
    const strat = strategyOptions.find((s) => s.id === stratId) ?? NO_STRATEGY_OPTION;
    const count = selected.size;
    setOverrides((prev) => {
      const next = { ...prev };
      selected.forEach((id) => { next[id] = stratId; });
      return next;
    });
    setToast(
      strat.id
        ? `Applied "${strat.name}" to ${count} products · queued for next sync`
        : `Removed strategy on ${count} products · automatic updates paused`,
    );
    setApplyOpen(false);
    setSelected(new Set());
    setTimeout(() => setToast(null), 3500);
  }

  async function handleRunSyncNow() {
    const connection = readSavedShopConnection();
    if (!connection || connection.platform !== "WooCommerce") {
      setToast("Connect your WooCommerce shop first.");
      setTimeout(() => setToast(null), 3500);
      return;
    }

    setSyncRunning(true);
    try {
      const eansNeedingLookup = productsData
        .filter((p) => {
          const stratId = stratFor(p);
          return Boolean(stratId) && p.status !== "excluded";
        })
        .map((p) => p.sku?.trim() ?? "")
        .filter((ean) => Boolean(ean) && !priceRunnerByEan[ean]);

      if (eansNeedingLookup.length > 0) {
        await loadPriceRunnerForEans(eansNeedingLookup);
      }

      const updates = productsData
        .map((p) => {
          const strategyId = stratFor(p);
          const strategy = strategyId ? strategyMap.get(strategyId) : undefined;
          if (!strategy) return null;
          if (p.status === "excluded") return null;
          if (nonSyncableProductIds.has(p.id)) return null;

          const ean = p.sku?.trim() ?? "";
          const lowest = ean ? priceRunnerByEan[ean]?.cheapestDkk : null;
          if (!lowest || !Number.isFinite(lowest) || lowest <= 0) return null;

          const target = computeTargetPrice({
            current: p.current,
            cost: p.cost,
            lowestPrice: lowest,
            settings: strategy.settings,
          });

          if (!Number.isFinite(target) || target <= 0) return null;
          if (Math.abs(target - p.current) < 0.01) return null;

          const numericId = Number(String(p.id).replace("woo_", ""));
          if (!Number.isFinite(numericId) || numericId <= 0) return null;

          return {
            id: numericId,
            price: Number(target.toFixed(2)),
          };
        })
        .filter((v): v is { id: number; price: number } => Boolean(v));

      if (updates.length === 0) {
        setToast("No in-stock products with price changes to sync.");
        setTimeout(() => setToast(null), 3500);
        return;
      }

      const result = await runWooPriceSync({
        data: {
          storeUrl: connection.storeUrl,
          consumerKey: connection.consumerKey,
          consumerSecret: connection.consumerSecret,
          updates,
        },
      });

      const syncedUpdateIds = new Set(
        (result.results ?? [])
          .filter((r) => r.ok)
          .map((r) => `woo_${r.id}`),
      );
      if (syncedUpdateIds.size > 0) {
        const now = Date.now();
        setLastSyncedAtByProductId((prev) => {
          const next = { ...prev };
          syncedUpdateIds.forEach((id) => {
            next[id] = now;
          });
          return next;
        });
      }

      // Refresh from Woo after sync so the table reflects source-of-truth prices.
      try {
        const refreshed = await fetchConnectedWooProducts({
          data: {
            storeUrl: connection.storeUrl,
            apiVersion: connection.apiVersion,
            consumerKey: connection.consumerKey,
            consumerSecret: connection.consumerSecret,
          },
        });
        const withCosts = await enrichProductsWithFirestoreCosts(refreshed.products);
        const mapped = withCosts.map((item, idx) => toDisplayProduct(idx, item));
        const modifiedMap: Record<string, number> = {};
        withCosts.forEach((item) => {
          if (item.modifiedAtMs) {
            modifiedMap[`woo_${item.id}`] = item.modifiedAtMs;
          }
        });
        setLiveProducts(mapped);
        setWooModifiedAtByProductId(modifiedMap);
        setSourceLabel(refreshed.source);
      } catch {
        // If refresh fails, still keep sync result toast below.
      }

      const firstFailure = result.results?.find((r) => !r.ok)?.message;
      const permissionDenied = (firstFailure ?? "").toLowerCase().includes("not allowed to edit this resource");

      if (result.updated === 0 && result.failed > 0) {
        setToast(
          permissionDenied
            ? "Sync failed: Woo key has no write access. Use a Read/Write key in Settings."
            : `Sync failed: ${result.failed} update(s) failed${firstFailure ? ` (${firstFailure})` : ""}.`,
        );
      } else {
        setToast(
          result.failed > 0
            ? `Sync complete: ${result.updated} updated, ${result.failed} failed${firstFailure ? ` (${firstFailure})` : ""}.`
            : `Sync complete: ${result.updated} updated.`,
        );
      }
      setTimeout(() => setToast(null), 4500);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Price sync failed.");
      setTimeout(() => setToast(null), 4500);
    } finally {
      setSyncRunning(false);
    }
  }


  const priceActive = (minNum !== null && !Number.isNaN(minNum)) || (maxNum !== null && !Number.isNaN(maxNum));
  const activeFilterCount = brands.size + cats.size + (priceActive ? 1 : 0);

  if (isLiveLoading) {
    return (
      <div>
        <PageHeader
          title={mode === "recent" ? "Recent changes" : "Products"}
          subtitle="Loading products..."
        />
        <div className="mx-6 my-4 rounded-md border border-hairline bg-surface px-4 py-6 text-sm text-muted-foreground">
          This can take a few seconds.
        </div>
      </div>
    );
  }

  if (hasShopConnection === false) {
    return (
      <div>
        <PageHeader
          title={mode === "recent" ? "Recent changes" : "Products"}
          subtitle="No connected shop"
        />
        <div className="mx-6 my-4 rounded-md border border-hairline bg-surface px-4 py-6 text-sm text-muted-foreground">
          Connect your shop to load products. Go to <Link to="/settings" className="font-medium text-foreground hover:opacity-80">Settings</Link>.
        </div>
      </div>
    );
  }

  if (productsData.length === 0) {
    return (
      <div>
        <PageHeader
          title={mode === "recent" ? "Recent changes" : "Products"}
          subtitle="No products from connected shop"
        />
        <div className="mx-6 my-4 rounded-md border border-hairline bg-surface px-4 py-6 text-sm text-muted-foreground">
          {liveError ? `Could not load products: ${liveError}` : "No products were returned from your connected shop yet."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={mode === "recent" ? "Recent changes" : "Products"}
        subtitle={`${filteredByDate.length} of ${filtered.length} EANs${sourceLabel ? ` · source ${sourceLabel}` : ""}`}
        actions={
          <>
            {selected.size > 0 && (
              <button
                onClick={() => setApplyOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90"
              >
                Apply strategy to {selected.size}
              </button>
            )}
            <button
              onClick={() => void handleRunSyncNow()}
              disabled={syncRunning}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-xs hover:bg-accent disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", syncRunning && "animate-spin")} />
              {syncRunning ? "Running sync..." : "Run sync now"}
            </button>
            {mode !== "recent" && (
              <button className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-xs hover:bg-accent">
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            )}
          </>
        }
      />

      {liveError && (
        <div className="mx-6 mt-3 rounded-md border border-hairline bg-surface px-3 py-2 text-[11px] text-muted-foreground">
          Could not refresh products from your connected shop. {liveError}
        </div>
      )}

      <div className="flex items-center gap-2 px-6 py-3 border-b border-hairline text-xs flex-wrap">
        {mode === "recent" && (
          <>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Date</span>
            <Segmented
              options={DATE_PRESETS.map((d) => ({ value: d.id, label: d.label }))}
              value={dateId}
              onChange={(v) => setDateId(v as (typeof DATE_PRESETS)[number]["id"])}
            />
          </>
        )}
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Filters</span>
        <FilterDropdown
          label="Brand"
          options={allBrands}
          selected={brands}
          onToggle={(v) => toggleSet(brands, v, setBrands)}
        />
        <FilterDropdown
          label="Category"
          options={allCategories}
          selected={cats}
          onToggle={(v) => toggleSet(cats, v, setCats)}
        />
        <PriceRangeFilter
          min={priceMin}
          max={priceMax}
          onMinChange={setPriceMin}
          onMaxChange={setPriceMax}
          bounds={priceBounds}
          active={priceActive}
        />
        {activeFilterCount > 0 && (
          <button
            onClick={() => { setBrands(new Set()); setCats(new Set()); setPriceMin(""); setPriceMax(""); }}
            className="ml-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear ({activeFilterCount})
          </button>
        )}
        {mode === "recent" && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Show</span>
            <SelectInline
              value={String(pageSize)}
              onChange={(v) => setPageSize(Number(v) as PageSize)}
              options={PAGE_SIZES.map((s) => ({ value: String(s), label: `${s} per page` }))}
            />
            <span className="text-[11px] text-muted-foreground num">
              {shownRows.length.toLocaleString("da-DK")} of {filteredByDate.length.toLocaleString("da-DK")}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto]">
        {/* Table */}
        <div className="min-w-0">
          <div className="overflow-auto">
            <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-2 border-b border-hairline text-muted-foreground z-10">
              <tr className="text-left">
                <Th className="pl-6 w-8">
                  <input
                    type="checkbox"
                    className="rounded border-hairline"
                    checked={allVisibleSelected}
                    onChange={() => {
                      if (allVisibleSelected) {
                        const next = new Set(selected);
                        shownRows.forEach((p) => next.delete(p.id));
                        setSelected(next);
                      } else {
                        const next = new Set(selected);
                        shownRows.forEach((p) => next.add(p.id));
                        setSelected(next);
                      }
                    }}
                  />
                </Th>
                <Th>EAN</Th>
                <Th>Product</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Current</Th>
                <Th className="text-right">Current margin</Th>
                <Th className="text-right">lowest price</Th>
                <Th>Strategy</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {shownRows.map((p) => {
                const stratId = stratFor(p);
                const strat = stratId ? strategyMap.get(stratId) : undefined;
                const hasStrategy = Boolean(stratId);
                const margin = ((p.current - p.cost) / p.current) * 100;
                const marginFloor = strat?.settings.minMarginPct ?? 20;
                const productEan = p.sku?.trim() ?? "";
                const quoteResult = productEan ? priceRunnerByEan[productEan] : undefined;
                const compMinFromPriceRunner = quoteResult?.cheapestDkk ?? null;
                const rowCompMin = compMinFromPriceRunner;
                const active = detailId === p.id;
                const checked = selected.has(p.id);
                const syncedAtSource = lastSyncedAtByProductId[p.id] ?? wooModifiedAtByProductId[p.id];
                const syncedAt = syncedAtSource ? formatTimeAgo(syncedAtSource) : "unknown";
                return (
                  <tr
                    key={p.id}
                    onClick={() => setDetailId(p.id === detailId ? null : p.id)}
                    className={cn("border-b border-hairline cursor-pointer hover:bg-accent/40", active && "bg-accent/60", checked && "bg-foreground/[0.03]")}
                  >
                    <Td className="pl-6">
                      <input
                        type="checkbox"
                        className="rounded border-hairline"
                        checked={checked}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSet(selected, p.id, setSelected)}
                      />
                    </Td>
                    <Td><span className="num text-[10px] text-muted-foreground">{p.sku}</span></Td>
                    <Td>
                      <div className="font-medium max-w-[260px] truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground">{brandOf(p.name)} · {p.category}</div>
                    </Td>
                    <Num>{fmt(p.cost)}</Num>
                    <Num className="font-medium">{fmt(p.current)}</Num>
                    <Num
                      className={cn(margin < marginFloor ? "text-negative" : "text-foreground")}
                      title={`Strategy floor: ${marginFloor.toFixed(1)}%`}
                    >
                      {margin.toFixed(1)}%
                    </Num>
                    <Num className={cn(!hasStrategy && "text-muted-foreground")}>
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <span>
                          {rowCompMin !== null
                          ? fmt(rowCompMin)
                          : priceRunnerLoadingEans.has(productEan)
                            ? "Loading..."
                            : "-"}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void loadPriceRunnerForEans(productEan ? [productEan] : []);
                          }}
                          disabled={!productEan || priceRunnerLoadingEans.has(productEan)}
                          title="Refresh lowest price"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                        >
                          <RefreshCw className={cn("h-3 w-3", priceRunnerLoadingEans.has(productEan) && "animate-spin")} />
                        </button>
                      </div>
                    </Num>
                    <Td>
                      <span className={cn("truncate text-[11px]", !strat && "text-muted-foreground")}>{strat?.name ?? "No strategy"}</span>
                    </Td>
                    <Td>
                      {!strat ? (
                        <span className="text-[10px] text-muted-foreground">No strategy</span>
                      ) : p.status === "excluded" ? (
                        <StatusPill status="excluded" />
                      ) : p.status === "pending" ? (
                        <span className="text-[10px] text-signal">Pending next sync</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Synced {syncedAt}</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
              {filteredByDate.length === 0 && (
                <tr><td colSpan={9} className="text-center py-16 text-xs text-muted-foreground">No products match the current filters.</td></tr>
              )}
            </tbody>
            </table>
          </div>

          {mode === "recent" && (
            <div className="flex items-center justify-center pt-3 pb-2">
              {remaining > 0 ? (
                <button
                  onClick={() => setVisible((v) => v + pageSize)}
                  className="rounded-md border border-hairline bg-surface px-4 py-2 text-xs font-medium hover:bg-accent"
                >
                  Load {Math.min(pageSize, remaining).toLocaleString("da-DK")} more
                  <span className="text-muted-foreground font-normal"> · {remaining.toLocaleString("da-DK")} left</span>
                </button>
              ) : (
                <div className="text-[11px] text-muted-foreground">All loaded</div>
              )}
            </div>
          )}
        </div>

        {/* Detail */}
        {detail && (
          <aside className="w-[380px] border-l border-hairline bg-surface min-h-[calc(100vh-8.5rem)] sticky top-0">
            {(() => {
              const detailEan = detail.sku?.trim() ?? "";
              const detailHasStrategy = Boolean(stratFor(detail));
              const detailStrategy = strategyMap.get(stratFor(detail));
              const detailQuoteResult = detailEan ? priceRunnerByEan[detailEan] : undefined;
              const detailQuotes = detailQuoteResult?.quotes ?? [];
              const detailLowestPrice = detailQuoteResult?.cheapestDkk ?? null;
              const detailLoading = detailEan ? priceRunnerLoadingEans.has(detailEan) : false;
              const detailError = detailEan ? priceRunnerErrorByEan[detailEan] : undefined;
              const pendingTarget = detailStrategy && detailLowestPrice
                ? computeTargetPrice({
                  current: detail.current,
                  cost: detail.cost,
                  lowestPrice: detailLowestPrice,
                  settings: detailStrategy.settings,
                })
                : null;
              const pendingDelta = pendingTarget !== null ? pendingTarget - detail.current : null;
              const hasPendingChange = pendingTarget !== null && Math.abs(pendingTarget - detail.current) >= 0.01;

              return (
                <>
            <div className="border-b border-hairline p-4 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] text-muted-foreground num">{detail.sku}</div>
                <div className="text-sm font-semibold mt-0.5 truncate">{detail.name}</div>
                <div className="text-[11px] text-muted-foreground">{brandOf(detail.name)} · {detail.category}</div>
              </div>
              <button onClick={() => setDetailId(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Current" value={fmt(detail.current)} />
                <Stat label="Cost" value={fmt(detail.cost)} />
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Competitors</div>
                <div className="divide-y divide-hairline border border-hairline rounded-md">
                  {detailLoading && (
                    <div className="px-3 py-3 text-[11px] text-muted-foreground">Loading prices from PriceRunner...</div>
                  )}

                  {!detailLoading && detailQuotes.length === 0 && (
                    <div className="px-3 py-3 text-[11px] text-muted-foreground">
                      {detailError
                        ? `PriceRunner lookup failed: ${detailError}`
                        : detailHasStrategy
                          ? "No competitor prices returned yet for this EAN."
                          : "No strategy assigned, so competitor prices are not loaded automatically."}
                    </div>
                  )}

                  {!detailLoading && detailQuotes.map((c, idx) => {
                    const diff = ((c.amount - detail.current) / detail.current) * 100;
                    return (
                      <div key={`${c.merchant ?? "shop"}-${idx}`} className="flex items-center justify-between px-3 py-2">
                        <span className="text-xs truncate">{c.merchant || `Competitor ${idx + 1}`}</span>
                        <div className="flex items-center gap-2">
                          <span className="num text-xs">{fmt(c.amount)}</span>
                          <Delta value={diff} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!detailHasStrategy && (
                  <button
                    onClick={() => void loadPriceRunnerForEans(detailEan ? [detailEan] : [])}
                    className="mt-2 inline-flex items-center rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent"
                  >
                    Refresh prices
                  </button>
                )}
              </div>

              <div className="rounded-md border border-hairline p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Applied strategy</div>
                    <button
                      onClick={() => setDetailStrategyOpen((v) => !v)}
                      className="inline-flex items-center gap-1 text-sm font-medium hover:opacity-80"
                    >
                      {strategyMap.get(stratFor(detail))?.name ?? "No strategy"}
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {strategyMap.get(stratFor(detail))?.summary ?? "No automatic updates until a strategy is assigned."}
                    </div>

                    <div className="mt-3 rounded-md border border-hairline bg-surface px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pending price change</div>
                      {!detailStrategy && (
                        <div className="text-[11px] text-muted-foreground mt-1">Assign a strategy to calculate a pending update.</div>
                      )}
                      {detailStrategy && detailLoading && (
                        <div className="text-[11px] text-muted-foreground mt-1">Loading competitor price data...</div>
                      )}
                      {detailStrategy && !detailLoading && detailLowestPrice === null && (
                        <div className="text-[11px] text-muted-foreground mt-1">No lowest competitor price available yet. Refresh prices to calculate.</div>
                      )}
                      {detailStrategy && !detailLoading && detailLowestPrice !== null && pendingTarget !== null && (
                        <>
                          <div className="text-xs mt-1.5">
                            <span className="num font-medium">{fmt(detail.current)}</span>
                            <span className="mx-1.5 text-muted-foreground">→</span>
                            <span className="num font-semibold">{fmt(pendingTarget)}</span>
                          </div>
                          <div className={cn("text-[11px] mt-1", hasPendingChange ? "text-foreground" : "text-muted-foreground") }>
                            {hasPendingChange
                              ? `Delta ${pendingDelta && pendingDelta >= 0 ? "+" : ""}${fmt(pendingDelta ?? 0)} · will apply on next sync`
                              : "No change needed. Current price already matches strategy target."}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {detailStrategyOpen && (
                  <div className="mt-2 divide-y divide-hairline rounded-md border border-hairline bg-background">
                    {strategyOptions.map((s) => (
                      <button
                        key={s.id || "no-strategy"}
                        onClick={() => {
                          setOverrides((prev) => ({ ...prev, [detail.id]: s.id }));
                          setDetailStrategyOpen(false);
                          setToast(
                            s.id
                              ? `Updated strategy for ${detail.name} to "${s.name}"`
                              : `Removed strategy for ${detail.name} · automatic updates paused`,
                          );
                          setTimeout(() => setToast(null), 3500);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-accent"
                      >
                        <div className="text-xs font-medium">{s.name}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{s.summary}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-[11px] text-muted-foreground">
                Prices update automatically on the next sync — no manual approval needed.
              </div>
            </div>
                </>
              );
            })()}
          </aside>
        )}
      </div>

      {/* Apply strategy modal */}
      {applyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20" onClick={() => setApplyOpen(false)}>
          <div className="w-[440px] rounded-lg border border-hairline bg-background shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-hairline px-5 py-4">
              <div className="text-sm font-semibold">Apply strategy</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Will be applied to {selected.size} selected products on the next sync.</div>
            </div>
            <div className="p-2">
              {strategyOptions.map((s) => (
                <button
                  key={s.id || "no-strategy"}
                  onClick={() => applyStrategy(s.id)}
                  className="w-full text-left rounded-md px-3 py-2.5 hover:bg-accent"
                >
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{s.summary}</div>
                </button>
              ))}
            </div>
            <div className="border-t border-hairline px-5 py-3 flex justify-end">
              <button onClick={() => setApplyOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-md bg-foreground text-background px-4 py-2.5 text-xs shadow-lg flex items-center gap-2">
          <Check className="h-3.5 w-3.5" /> {toast}
        </div>
      )}
    </div>
  );
}

type DropdownOption = string | { value: string; label: string };

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-hairline bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3 py-1 text-[11px] transition-colors",
            value === o.value
              ? "bg-foreground text-background font-semibold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SelectInline({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-full border border-hairline bg-surface pl-3 pr-7 py-1 text-[11px] font-medium hover:bg-foreground/5 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
    </div>
  );
}

function PriceRangeFilter({
  min,
  max,
  onMinChange,
  onMaxChange,
  bounds,
  active,
}: {
  min: string;
  max: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  bounds: { min: number; max: number };
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const label =
    active
      ? `${min || bounds.min} – ${max || bounds.max}`
      : "Any";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs hover:bg-foreground/5",
          active && "border-foreground/40",
        )}
      >
        <span className="font-medium">Price</span>
        <span className="text-muted-foreground num">{label}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-hairline bg-surface shadow-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Price range · {bounds.min}–{bounds.max}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex-1">
              <div className="text-[10px] text-muted-foreground mb-1">Min</div>
              <input
                type="number"
                inputMode="numeric"
                value={min}
                onChange={(e) => onMinChange(e.target.value)}
                placeholder={String(bounds.min)}
                className="num w-full rounded-md border border-hairline bg-background px-2 py-1.5 text-xs outline-none focus:border-foreground/40"
              />
            </label>
            <span className="text-muted-foreground pt-4">–</span>
            <label className="flex-1">
              <div className="text-[10px] text-muted-foreground mb-1">Max</div>
              <input
                type="number"
                inputMode="numeric"
                value={max}
                onChange={(e) => onMaxChange(e.target.value)}
                placeholder={String(bounds.max)}
                className="num w-full rounded-md border border-hairline bg-background px-2 py-1.5 text-xs outline-none focus:border-foreground/40"
              />
            </label>
          </div>
          {active && (
            <button
              onClick={() => { onMinChange(""); onMaxChange(""); }}
              className="mt-3 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Reset range
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: DropdownOption[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  const count = normalized.filter((o) => selected.has(o.value)).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs hover:bg-foreground/5",
          count > 0 && "border-foreground/40",
        )}
      >
        <span className="font-medium">{label}</span>
        {count > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background">
            {count}
          </span>
        )}
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-hairline bg-surface shadow-lg p-1 max-h-72 overflow-auto">
          {normalized.map((o) => {
            const checked = selected.has(o.value);
            return (
              <label
                key={o.value}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-foreground/5"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(o.value)}
                  className="rounded border-hairline"
                />
                <span className={cn("text-xs", checked && "font-medium")}>{o.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-2 py-2 text-[10px] font-medium uppercase tracking-wider", className)}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-2 py-2 align-middle", className)}>{children}</td>;
}
function Num({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-2 py-2 text-right num", className)}>{children}</td>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="num text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}
