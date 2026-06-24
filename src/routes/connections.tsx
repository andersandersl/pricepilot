import { createFileRoute } from "@tanstack/react-router";
import { Check, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/connections")({
  head: () => ({ meta: [{ title: "Connections — PricePilot" }] }),
  component: ConnectionsPage,
});

const connections = [
  { name: "nordic-outdoor.myshopify.com", platform: "Shopify", connected: true, lastSync: "2 min ago", products: 1842, perms: "Read · Write" },
  { name: "fjell-sport.centra.com", platform: "Centra", connected: true, lastSync: "14 min ago", products: 612, perms: "Read · Write" },
];

const platforms = ["Shopify", "Centra", "WooCommerce", "Magento", "BigCommerce"];

function ConnectionsPage() {
  return (
    <div>
      <PageHeader title="Connections" subtitle="Connect your shop platform to read products and write prices" />
      <div className="p-6 space-y-5">
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Connected shops</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {connections.map((c) => (
              <div key={c.name} className="rounded-lg border border-hairline bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="grid h-1.5 w-1.5 rounded-full bg-positive" />
                      <span className="text-[10px] uppercase tracking-wider text-positive font-medium">Connected</span>
                    </div>
                    <div className="mt-1.5 text-sm font-semibold truncate">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">{c.platform}</div>
                  </div>
                  <button className="text-[11px] text-muted-foreground hover:text-negative">Disconnect</button>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <div className="text-muted-foreground uppercase tracking-wider text-[9px]">Last sync</div>
                    <div className="mt-0.5 font-medium">{c.lastSync}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground uppercase tracking-wider text-[9px]">Products</div>
                    <div className="mt-0.5 num font-medium">{c.products.toLocaleString("da-DK")}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground uppercase tracking-wider text-[9px]">Permissions</div>
                    <div className="mt-0.5 font-medium">{c.perms}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Connect a new shop</h2>
          <div className="rounded-lg border border-hairline bg-surface p-5">
            <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { step: "1", title: "Choose platform", body: "Pick from supported integrations" },
                { step: "2", title: "Enter credentials", body: "Paste your API key and store URL" },
                { step: "3", title: "Verify & sync", body: "We'll test read/write permissions" },
              ].map((s) => (
                <li key={s.step} className="flex gap-3">
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-hairline num text-[11px] font-semibold">{s.step}</div>
                  <div>
                    <div className="text-sm font-medium">{s.title}</div>
                    <div className="text-[11px] text-muted-foreground">{s.body}</div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap gap-2">
              {platforms.map((p) => (
                <button key={p} className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-xs hover:border-foreground/40 hover:bg-accent">
                  <Plus className="h-3 w-3" /> {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
