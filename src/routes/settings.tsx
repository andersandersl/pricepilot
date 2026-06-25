import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — PricePilot" }] }),
  component: SettingsPage,
});

const platforms = ["WooCommerce", "Shopify", "Centra", "Magento", "BigCommerce"] as const;

const defaultConnectedShops = [
  { name: "nordic-outdoor.myshopify.com", platform: "Shopify", connected: true, lastSync: "2 min ago" },
  { name: "fjell-sport.centra.com", platform: "Centra", connected: true, lastSync: "14 min ago" },
];

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

    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload &&
        "message" in payload &&
        typeof (payload as { message?: unknown }).message === "string"
          ? (payload as { message: string }).message
          : `Connection failed (${response.status}).`;
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
  const [testState, setTestState] = useState<TestState>({ status: "idle" });
  const [connectedShops, setConnectedShops] = useState(defaultConnectedShops);
  const [wooConnection, setWooConnection] = useState({
    storeUrl: "",
    apiVersion: "wc/v3",
    consumerKey: "",
    consumerSecret: "",
    webhookSecret: "",
  });

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
      const result = await testWooCommerceConnection({
        data: {
          storeUrl: wooConnection.storeUrl,
          apiVersion: wooConnection.apiVersion,
          consumerKey: wooConnection.consumerKey,
          consumerSecret: wooConnection.consumerSecret,
        },
      });

      const productInfo = result.sampleProductName ? ` Sample product: ${result.sampleProductName}.` : "";
      setTestState({
        status: "success",
        testedStore: result.normalizedStoreUrl,
        message: `Connection verified against ${result.apiVersion}.${productInfo}`,
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

    const normalizedName = testState.testedStore.replace(/^https?:\/\//, "");

    setConnectedShops((prev) => {
      if (prev.some((shop) => shop.name === normalizedName)) return prev;
      return [
        { name: normalizedName, platform: "WooCommerce", connected: true, lastSync: "just now" },
        ...prev,
      ];
    });

    setTestState({ status: "success", testedStore: testState.testedStore, message: "Connection saved and sync enabled." });
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure workspace defaults and connect your e-commerce platform" />
      <div className="p-6 space-y-6 max-w-4xl">
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shop connections</h2>
          <div className="rounded-lg border border-hairline bg-surface p-5 space-y-4">
            <div>
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
              <span className="text-[11px] text-muted-foreground">Credentials are sent only during validation and are not persisted yet.</span>
            </div>

            {testState.status === "error" && <p className="text-[12px] text-negative">{testState.message}</p>}
            {testState.status === "success" && <p className="text-[12px] text-positive">{testState.message}</p>}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Connected shops</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {connectedShops.map((shop) => (
              <div key={shop.name} className="rounded-lg border border-hairline bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold truncate">{shop.name}</div>
                    <div className="text-[11px] text-muted-foreground">{shop.platform}</div>
                  </div>
                  {shop.connected && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-positive font-medium">
                      <Check className="h-3 w-3" /> Connected
                    </span>
                  )}
                </div>
                <div className="mt-3 text-[11px] text-muted-foreground">Last sync: {shop.lastSync}</div>
              </div>
            ))}
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
