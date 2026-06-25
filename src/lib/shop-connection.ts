export type SavedShopConnection = {
  platform: "WooCommerce";
  storeUrl: string;
  apiVersion: string;
  currencyCode: string;
  consumerKey: string;
  consumerSecret: string;
  webhookSecret?: string;
  connectedAt: string;
};

const STORAGE_KEY = "pricepilot.connectedShop.v1";

export function readSavedShopConnection(): SavedShopConnection | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SavedShopConnection & { currencyCode?: string };
    if (!parsed?.storeUrl || !parsed?.consumerKey || !parsed?.consumerSecret) return null;
    if (parsed.platform !== "WooCommerce") return null;
    return {
      ...parsed,
      currencyCode: typeof parsed.currencyCode === "string" && parsed.currencyCode.trim().length > 0
        ? parsed.currencyCode
        : "DKK",
    };
  } catch {
    return null;
  }
}

export function saveShopConnection(connection: SavedShopConnection): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
}

export function clearSavedShopConnection(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
