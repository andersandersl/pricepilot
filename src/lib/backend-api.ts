export type WooProduct = {
  id: number;
  name: string;
  ean: string;
  sku: string;
  permalink: string;
  price: number | null;
  stockStatus: string;
  categories: string[];
  brand: string;
};

export type WooProductsResponse = {
  source: string;
  total: number;
  products: WooProduct[];
};

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "http://127.0.0.1:8788";

export async function fetchWooProducts(): Promise<WooProductsResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}/api/v1/woocommerce/products`);
  } catch {
    throw new Error("Cannot reach legacy API. Ensure backend is running on http://127.0.0.1:8788.");
  }

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
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }

  return payload as WooProductsResponse;
}
