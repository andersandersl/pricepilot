import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui-bits";
import { readSavedShopConnection, saveShopConnection } from "@/lib/shop-connection";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — PricePilot" }] }),
  component: SettingsPage,
});

const platforms = ["WooCommerce", "Shopify", "Centra", "Magento", "BigCommerce"] as const;
const EU_CURRENCIES = [
  { code: "EUR", label: "Euro" },
  { code: "BGN", label: "Bulgarian lev" },
  { code: "CZK", label: "Czech koruna" },
  { code: "DKK", label: "Danish krone" },
  { code: "HUF", label: "Hungarian forint" },
  { code: "PLN", label: "Polish zloty" },
  { code: "RON", label: "Romanian leu" },
  { code: "SEK", label: "Swedish krona" },
] as const;

type ConnectedShop = {
  name: string;
  platform: string;
  currencyCode: string;
  connected: boolean;
  lastSync: string;
};

type WooConnectionInput = {
  storeUrl: string;
  apiVersion: string;
  consumerKey: string;
  consumerSecret: string;
};

type ConnectionTestResult = {
  normalizedStoreUrl: string;
  apiVersion: string;
  sampleProductName: string | null;
};

function normalizeStoreUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  return `${parsed.protocol}//${parsed.host}`;
}

function normalizeApiVersion(rawVersion: string): string {
  const clean = rawVersion.trim().replace(/^\/+|\/+$/g, "");
  return clean.length > 0 ? clean : "wc/v3";
}

const testWooCommerceConnection = createServerFn({ method: "POST" })
  .validator((input: WooConnectionInput) => input)
  .handler(async ({ data }): Promise<ConnectionTestResult> => {
    const storeBaseUrl = normalizeStoreUrl(data.storeUrl);
    const apiVersion = normalizeApiVersion(data.apiVersion);

    const authToken = Buffer.from(`${data.consumerKey}:${data.consumerSecret}`, "utf-8").toString("base64");
    const endpoint = `${storeBaseUrl}/wp-json/${apiVersion}/products?per_page=1`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: {
          Authorization: `Basic ${authToken}`,
          Accept: "application/json",
          "User-Agent": "PricePilot-Connection-Test",
        },
      });
    } catch {
      throw new Error("Could not reach WooCommerce API endpoint. Check store URL and network access.");
    }

    const rawBody = await response.text();
    let payload: unknown = null;
    try {
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      payload = null;
    }

    if ((response.status === 401 || response.status === 403) && endpoint.includes("?")) {
      // Some hosts/proxies strip Authorization headers; Woo also supports key/secret in query.
      const fallbackUrl = `${endpoint}&consumer_key=${encodeURIComponent(data.consumerKey)}&consumer_secret=${encodeURIComponent(data.consumerSecret)}`;
      try {
        response = await fetch(fallbackUrl, {
          headers: {
            Accept: "application/json",
            "User-Agent": "PricePilot-Connection-Test",
          },
        });

        const fallbackBody = await response.text();
        try {
          payload = fallbackBody ? JSON.parse(fallbackBody) : null;
        } catch {
          payload = null;
        }
      } catch {
        throw new Error("Could not reach WooCommerce API endpoint during fallback validation.");
      }
    }

    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload &&
        "message" in payload &&
        typeof (payload as { message?: unknown }).message === "string"
          ? (payload as { message: string }).message
          : `Connection failed (${response.status}).`;

      if (/cannot list resources|forbidden|permission/i.test(message)) {
        throw new Error(
          "WooCommerce rejected access. Ensure the REST API key is created in WooCommerce > Settings > Advanced > REST API with Read/Write permissions and attached to an admin or shop manager user.",
        );
      }

      throw new Error(message);
    }

    const sampleProductName = Array.isArray(payload)
      ? payload.find((item) => typeof item === "object" && item && "name" in item && typeof (item as { name?: unknown }).name === "string")
      : null;

    return {
      normalizedStoreUrl: storeBaseUrl,
      apiVersion,
      sampleProductName: sampleProductName ? (sampleProductName as { name: string }).name : null,
    };
  });

type TestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; message: string; testedStore: string }
  | { status: "error"; message: string };

function SettingsPage() {
  const [platform, setPlatform] = useState<(typeof platforms)[number]>("WooCommerce");
  const [isShopConnectionOpen, setIsShopConnectionOpen] = useState(false);
  const [testState, setTestState] = useState<TestState>({ status: "idle" });
  const [connectedShop, setConnectedShop] = useState<ConnectedShop | null>(null);
  const [savedCurrencyCode, setSavedCurrencyCode] = useState<string | null>(null);
  const [wooConnection, setWooConnection] = useState({
    storeUrl: "",
    apiVersion: "wc/v3",
    currencyCode: "DKK",
    consumerKey: "",
    consumerSecret: "",
    webhookSecret: "",
  });

  useEffect(() => {
    const saved = readSavedShopConnection();
    if (!saved) return;

    setPlatform(saved.platform);
    setConnectedShop({
      name: saved.storeUrl.replace(/^https?:\/\//, ""),
      platform: saved.platform,
      currencyCode: saved.currencyCode,
      connected: true,
      lastSync: "active",
    });
    setSavedCurrencyCode(saved.currencyCode);
    setWooConnection({
      storeUrl: saved.storeUrl,
      apiVersion: saved.apiVersion,
      currencyCode: saved.currencyCode,
      consumerKey: saved.consumerKey,
      consumerSecret: saved.consumerSecret,
      webhookSecret: saved.webhookSecret ?? "",
    });
  }, []);

  function confirmCurrencyChange(): boolean {
    if (!savedCurrencyCode || savedCurrencyCode === wooConnection.currencyCode) return true;

    const first = window.confirm(
      `You are changing store currency from ${savedCurrencyCode} to ${wooConnection.currencyCode}. This affects pricing and sync behavior. Continue?`,
    );
    if (!first) return false;

    const typed = window.prompt(`Type ${wooConnection.currencyCode} to confirm currency change.`);
    return (typed ?? "").trim().toUpperCase() === wooConnection.currencyCode;
  }

  const platformHint = useMemo(() => {
    if (platform === "WooCommerce") {
      return "Use WooCommerce REST API credentials from your test shop. Use Test connection to validate API access before saving.";
    }
    return `${platform} setup is available next. Select WooCommerce now to connect your real test shop.`;
  }, [platform]);

  async function handleTestConnection() {
    if (!wooConnection.storeUrl || !wooConnection.consumerKey || !wooConnection.consumerSecret) {
      setTestState({ status: "error", message: "Store URL, consumer key, and consumer secret are required." });
      return;
    }

    setTestState({ status: "loading" });

    try {
      if (!confirmCurrencyChange()) {
        setTestState({ status: "error", message: "Currency change cancelled. No changes were saved." });
        return;
      }

      const result = await testWooCommerceConnection({
        data: {
          storeUrl: wooConnection.storeUrl,
          apiVersion: wooConnection.apiVersion,
          consumerKey: wooConnection.consumerKey,
          consumerSecret: wooConnection.consumerSecret,
        },
      });

      const productInfo = result.sampleProductName ? ` Sample product: ${result.sampleProductName}.` : "";
      saveShopConnection({
        platform: "WooCommerce",
        storeUrl: result.normalizedStoreUrl,
        apiVersion: result.apiVersion,
        currencyCode: wooConnection.currencyCode,
        consumerKey: wooConnection.consumerKey,
        consumerSecret: wooConnection.consumerSecret,
        webhookSecret: wooConnection.webhookSecret || undefined,
        connectedAt: new Date().toISOString(),
      });

      setConnectedShop({
        name: result.normalizedStoreUrl.replace(/^https?:\/\//, ""),
        platform: "WooCommerce",
        currencyCode: wooConnection.currencyCode,
        connected: true,
        lastSync: "active",
      });
      setSavedCurrencyCode(wooConnection.currencyCode);

      setTestState({
        status: "success",
        testedStore: result.normalizedStoreUrl,
        message: `Connection verified and saved against ${result.apiVersion}.${productInfo}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed.";
      setTestState({ status: "error", message });
    }
  }

  function handleSaveConnection() {
    if (testState.status !== "success") {
      setTestState({ status: "error", message: "Run Test connection successfully before saving." });
      return;
    }

    if (!confirmCurrencyChange()) {
      setTestState({ status: "error", message: "Currency change cancelled. No changes were saved." });
      return;
    }

    const normalizedName = testState.testedStore.replace(/^https?:\/\//, "");

    setConnectedShop({
      name: normalizedName,
      platform: "WooCommerce",
      currencyCode: wooConnection.currencyCode,
      connected: true,
      lastSync: "just now",
    });
    setSavedCurrencyCode(wooConnection.currencyCode);

    saveShopConnection({
      platform: "WooCommerce",
      storeUrl: testState.testedStore,
      apiVersion: normalizeApiVersion(wooConnection.apiVersion),
      currencyCode: wooConnection.currencyCode,
      consumerKey: wooConnection.consumerKey,
      consumerSecret: wooConnection.consumerSecret,
      webhookSecret: wooConnection.webhookSecret || undefined,
      connectedAt: new Date().toISOString(),
    });

    setTestState({ status: "success", testedStore: testState.testedStore, message: "Connection saved and sync enabled." });
    setIsShopConnectionOpen(false);
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure workspace defaults and connect your e-commerce platform" />
      <div className="p-6 space-y-6 max-w-4xl">
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shop connection</h2>
          <div className="rounded-lg border border-hairline bg-surface">
            <button
              type="button"
              onClick={() => setIsShopConnectionOpen((v) => !v)}
              className="w-full flex items-center justify-between p-4 hover:bg-foreground/5"
            >
              <div>
                <div className="text-sm font-medium text-left">Shop connection</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 text-left">Connect one platform account to this workspace</div>
              </div>
              {isShopConnectionOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>

            {isShopConnectionOpen && (
              <div className="px-5 pb-5 space-y-4 border-t border-hairline">
                <div className="pt-4">
                  <label htmlFor="platform" className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Platform
                  </label>
                  <select
                    id="platform"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as (typeof platforms)[number])}
                    className="mt-1 h-10 w-full rounded-md border border-hairline bg-background px-3 text-sm outline-none focus:border-foreground/40"
                  >
                    {platforms.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <p className="mt-2 text-[11px] text-muted-foreground">{platformHint}</p>
                </div>

                {platform === "WooCommerce" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">Store URL</span>
                      <input
                        placeholder="https://your-test-shop.com"
                        value={wooConnection.storeUrl}
                        onChange={(e) => setWooConnection((prev) => ({ ...prev, storeUrl: e.target.value }))}
                        className="h-10 w-full rounded-md border border-hairline bg-background px-3 text-sm outline-none focus:border-foreground/40"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">API version</span>
                      <input
                        value={wooConnection.apiVersion}
                        onChange={(e) => setWooConnection((prev) => ({ ...prev, apiVersion: e.target.value }))}
                        className="h-10 w-full rounded-md border border-hairline bg-background px-3 text-sm outline-none focus:border-foreground/40"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-muted-foreground">Store currency (EU)</span>
                      <select
                        value={wooConnection.currencyCode}
                        onChange={(e) => setWooConnection((prev) => ({ ...prev, currencyCode: e.target.value }))}
                        className="h-10 w-full rounded-md border border-hairline bg-background px-3 text-sm outline-none focus:border-foreground/40"
                      >
                        {EU_CURRENCIES.map((currency) => (
                          <option key={currency.code} value={currency.code}>{currency.code} · {currency.label}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-muted-foreground">
                        Changing currency after first save requires double confirmation.
                      </p>
                    </label>
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-[11px] font-medium text-muted-foreground">Consumer key</span>
                      <input
                        placeholder="ck_..."
                        value={wooConnection.consumerKey}
                        onChange={(e) => setWooConnection((prev) => ({ ...prev, consumerKey: e.target.value }))}
                        className="h-10 w-full rounded-md border border-hairline bg-background px-3 text-sm outline-none focus:border-foreground/40"
                      />
                    </label>
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-[11px] font-medium text-muted-foreground">Consumer secret</span>
                      <input
                        type="password"
                        placeholder="cs_..."
                        value={wooConnection.consumerSecret}
                        onChange={(e) => setWooConnection((prev) => ({ ...prev, consumerSecret: e.target.value }))}
                        className="h-10 w-full rounded-md border border-hairline bg-background px-3 text-sm outline-none focus:border-foreground/40"
                      />
                    </label>
                    <label className="space-y-1 md:col-span-2">
                      <span className="text-[11px] font-medium text-muted-foreground">Webhook secret (optional)</span>
                      <input
                        placeholder="Optional, used for secure webhook validation"
                        value={wooConnection.webhookSecret}
                        onChange={(e) => setWooConnection((prev) => ({ ...prev, webhookSecret: e.target.value }))}
                        className="h-10 w-full rounded-md border border-hairline bg-background px-3 text-sm outline-none focus:border-foreground/40"
                      />
                    </label>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleTestConnection}
                    disabled={testState.status === "loading"}
                    className="inline-flex items-center rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
                  >
                    {testState.status === "loading" ? "Testing..." : "Test connection"}
                  </button>
                  <button
                    onClick={handleSaveConnection}
                    className="inline-flex items-center rounded-md border border-hairline px-4 py-2 text-sm hover:bg-foreground/5"
                  >
                    Save and enable sync
                  </button>
                  <span className="text-[11px] text-muted-foreground">Credentials are stored locally in this browser for prototype syncing.</span>
                </div>

                {testState.status === "error" && <p className="text-[12px] text-negative">{testState.message}</p>}
                {testState.status === "success" && <p className="text-[12px] text-positive">{testState.message}</p>}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Connected shop</h2>
          <div className="grid grid-cols-1 gap-3">
            {connectedShop ? (
              <div className="rounded-lg border border-hairline bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold truncate">{connectedShop.name}</div>
                    <div className="text-[11px] text-muted-foreground">{connectedShop.platform} · {connectedShop.currencyCode}</div>
                  </div>
                  {connectedShop.connected && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-positive font-medium">
                      <Check className="h-3 w-3" /> Connected
                    </span>
                  )}
                </div>
                <div className="mt-3 text-[11px] text-muted-foreground">Last sync: {connectedShop.lastSync}</div>
              </div>
            ) : (
              <div className="rounded-lg border border-hairline bg-surface p-4 text-[12px] text-muted-foreground">
                No shop connected yet.
              </div>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">General</h2>
          {[
            { title: "Profile", desc: "Your name, email, and avatar" },
            { title: "Team", desc: "Invite analysts, manage roles" },
            { title: "Notifications", desc: "Daily digest, competitor alerts, sync errors" },
            { title: "Billing", desc: "Plan, usage, invoices" },
            { title: "API tokens", desc: "Programmatic access to PricePilot" },
          ].map((s) => (
            <div key={s.title} className="flex items-center justify-between rounded-lg border border-hairline bg-surface p-4 hover:border-foreground/30 cursor-pointer">
            <div>
              <div className="text-sm font-medium">{s.title}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{s.desc}</div>
            </div>
            <span className="text-xs text-muted-foreground">→</span>
          </div>
          ))}
        </section>
      </div>
    </div>
  );
}
