import { strategies as defaultStrategies } from "@/lib/mock-data";

export type StrategyBasis = "lowest" | "average" | "premium";
export type StrategyRounding = "none" | "0.5" | "1" | "5";

export type StrategySettings = {
  basis: StrategyBasis;
  undercutPct: number;
  premiumPct: number;
  minMarginPct: number;
  maxStepChangePct: number;
  rounding: StrategyRounding;
  inStockOnly: boolean;
};

export type StrategyRecord = {
  id: string;
  name: string;
  summary: string;
  products: number;
  edited: string;
  active: boolean;
  settings: StrategySettings;
};

const STORAGE_KEY = "pricepilot.strategies.v1";

export function getDefaultStrategySettings(): StrategySettings {
  return {
    basis: "lowest",
    undercutPct: 1,
    premiumPct: 8,
    minMarginPct: 18,
    maxStepChangePct: 15,
    rounding: "1",
    inStockOnly: true,
  };
}

export function describeStrategySettings(settings: StrategySettings): string {
  const roundingLabel = settings.rounding === "none" ? "no rounding" : `round to ${settings.rounding} DKK`;

  if (settings.basis === "average") {
    return `Match market average, min margin ${settings.minMarginPct}%, max ${settings.maxStepChangePct}% step, ${roundingLabel}.`;
  }

  if (settings.basis === "premium") {
    return `Position +${settings.premiumPct}% vs market average, min margin ${settings.minMarginPct}%, ${roundingLabel}.`;
  }

  return `Beat lowest by ${settings.undercutPct}%, min margin ${settings.minMarginPct}%, max ${settings.maxStepChangePct}% step, ${roundingLabel}.`;
}

function parseSettings(raw: unknown): StrategySettings {
  const fallback = getDefaultStrategySettings();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const s = raw as Record<string, unknown>;

  const basis = s.basis === "lowest" || s.basis === "average" || s.basis === "premium" ? s.basis : fallback.basis;
  const undercutPct = typeof s.undercutPct === "number" && Number.isFinite(s.undercutPct) ? s.undercutPct : fallback.undercutPct;
  const premiumPct = typeof s.premiumPct === "number" && Number.isFinite(s.premiumPct) ? s.premiumPct : fallback.premiumPct;
  const minMarginPct = typeof s.minMarginPct === "number" && Number.isFinite(s.minMarginPct) ? s.minMarginPct : fallback.minMarginPct;
  const maxStepChangePct = typeof s.maxStepChangePct === "number" && Number.isFinite(s.maxStepChangePct) ? s.maxStepChangePct : fallback.maxStepChangePct;
  const rounding = s.rounding === "none" || s.rounding === "0.5" || s.rounding === "1" || s.rounding === "5" ? s.rounding : fallback.rounding;
  const inStockOnly = typeof s.inStockOnly === "boolean" ? s.inStockOnly : fallback.inStockOnly;

  return {
    basis,
    undercutPct,
    premiumPct,
    minMarginPct,
    maxStepChangePct,
    rounding,
    inStockOnly,
  };
}

export function getDefaultStrategies(): StrategyRecord[] {
  return defaultStrategies.map((s) => ({
    id: s.id,
    name: s.name,
    summary: s.summary,
    products: s.products,
    edited: s.edited,
    active: true,
    settings: getDefaultStrategySettings(),
  }));
}

export function readStoredStrategies(): StrategyRecord[] {
  if (typeof window === "undefined") return getDefaultStrategies();

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return getDefaultStrategies();

  try {
    const parsed = JSON.parse(raw) as StrategyRecord[];
    if (!Array.isArray(parsed) || parsed.length === 0) return getDefaultStrategies();
    return parsed
      .filter((s) => typeof s?.id === "string" && typeof s?.name === "string" && typeof s?.summary === "string")
      .map((s) => ({
        id: s.id,
        name: s.name,
        summary: typeof s.summary === "string" && s.summary.trim().length > 0 ? s.summary : describeStrategySettings(parseSettings((s as Record<string, unknown>).settings)),
        products: Number.isFinite(s.products) ? s.products : 0,
        edited: typeof s.edited === "string" ? s.edited : "just now",
        active: typeof s.active === "boolean" ? s.active : true,
        settings: parseSettings((s as Record<string, unknown>).settings),
      }));
  } catch {
    return getDefaultStrategies();
  }
}

export function saveStoredStrategies(strategies: StrategyRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
}
