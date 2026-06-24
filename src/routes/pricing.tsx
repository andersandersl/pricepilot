import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/ui-bits";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [{ title: "Pricing — PricePilot" }] }),
  component: PricingPage,
});

const USED = 1247;
const TOTAL = 3000;

const plans = [
  {
    name: "Free",
    price: "€ 0",
    cadence: "/ month",
    updates: "3 000",
    sub: "100 updates each day · 30 days",
    features: ["1 shop", "Daily sync", "Email support"],
    current: true,
  },
  {
    name: "Growth",
    price: "€ 10",
    cadence: "/ month",
    updates: "100 000",
    sub: "≈ 330 products updated every day",
    features: ["3 shops", "Hourly sync", "Strategy library", "Priority support"],
  },
  {
    name: "Pay as you grow",
    price: "€ 0.10",
    cadence: "/ 1 000 extra updates",
    updates: "Unlimited",
    sub: "€ 0.0001 per update beyond the Growth plan",
    features: ["Everything in Growth", "No monthly cap", "Volume invoicing", "Dedicated CSM", "Minimum invoice € 0.10"],
  },
];

function PricingPage() {
  const pct = Math.min(100, (USED / TOTAL) * 100);
  return (
    <div>
      <PageHeader
        title="Plan & usage"
        subtitle="Every automated price update counts as one update. Manual exclusions and strategy edits are free."
      />

      <div className="p-6 space-y-8 max-w-5xl">
        <section className="rounded-lg border border-hairline bg-surface p-5">
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current plan · Free</div>
              <div className="text-lg font-semibold mt-1 num">
                {USED.toLocaleString("da-DK")} <span className="text-muted-foreground font-normal text-sm">of {TOTAL.toLocaleString("da-DK")} updates</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Resets on 1 July 2026 · {Math.round(pct)}% used</div>
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              <div>Avg. {(USED / 24).toFixed(0)} updates / day</div>
              <div>Projected month-end: {Math.round((USED / 24) * 30).toLocaleString("da-DK")}</div>
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-foreground" style={{ width: `${pct}%` }} />
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {plans.map((p) => (
            <div key={p.name} className={cn("rounded-lg border p-5 flex flex-col", p.current ? "border-foreground bg-surface" : "border-hairline bg-surface")}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{p.name}</div>
                {p.current && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-foreground text-background">Current</span>}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-2xl font-semibold num">{p.price}</span>
                <span className="text-xs text-muted-foreground">{p.cadence}</span>
              </div>
              <div className="text-[11px] font-medium num mt-1">{p.updates} updates</div>
              <div className="text-[11px] text-muted-foreground">{p.sub}</div>
              <ul className="mt-4 space-y-1.5 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs">
                    <Check className="h-3 w-3 text-positive" /> {f}
                  </li>
                ))}
              </ul>
              <button
                disabled={p.current}
                className={cn(
                  "mt-5 rounded-md px-3 py-2 text-xs font-medium",
                  p.current ? "border border-hairline text-muted-foreground cursor-default" : "bg-foreground text-background hover:opacity-90",
                )}
              >
                {p.current ? "Current plan" : `Switch to ${p.name}`}
              </button>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-hairline bg-surface p-4 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">How updates are counted:</span> one update = one product price pushed to your shop. A product that changes price 3 times in a day counts as 3 updates. Skipped updates (no price change) are free.
        </div>
      </div>
    </div>
  );
}
