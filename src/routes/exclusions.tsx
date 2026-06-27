import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, Search, Package, Radar, Sliders, Tag } from "lucide-react";
import { PageHeader } from "@/components/ui-bits";
import { products as ALL_PRODUCTS, fmt } from "@/lib/mock-data";
import { getSavedCurrencyCode } from "@/lib/shop-connection";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/exclusions")({
  head: () => ({ meta: [{ title: "Exclusions — PricePilot" }] }),
  component: ExclusionsPage,
});

type Tab = "eans" | "competitors" | "rules" | "manual";

function isTab(value: string | null): value is Tab {
  return value === "eans" || value === "competitors" || value === "rules" || value === "manual";
}

const TABS: { id: Tab; label: string; icon: typeof Package; hint: string }[] = [
  { id: "eans", label: "Excluded EANs", icon: Package, hint: "Products that should never receive automatic price updates." },
  { id: "competitors", label: "Excluded competitors", icon: Radar, hint: "Competitor prices to ignore when calculating recommendations." },
  { id: "rules", label: "Brand & category overrides", icon: Sliders, hint: "Deactivate all pricing rules for entire brands or categories." },
  { id: "manual", label: "Manual prices", icon: Tag, hint: "Locked manual prices on individual products, looked up by EAN." },
];

const allBrands = Array.from(new Set(ALL_PRODUCTS.map((p) => p.name.split(" ")[0]))).sort();
const allCats = Array.from(new Set(ALL_PRODUCTS.map((p) => p.category))).sort();
const DISCOVERED_SUPPLIERS_KEY = "pricepilot.discovered-suppliers.v1";
const EXCLUDED_SUPPLIERS_KEY = "pricepilot.excluded-suppliers.v1";

function ExclusionsPage() {
  const search = Route.useSearch() as Record<string, unknown>;
  const rawTab = typeof search.tab === "string" ? search.tab : null;
  const tab: Tab = isTab(rawTab) ? rawTab : "eans";
  const [currencyCode, setCurrencyCode] = useState("DKK");

  useEffect(() => {
    setCurrencyCode(getSavedCurrencyCode());
  }, []);

  // State
  const [excludedEans, setExcludedEans] = useState<{ ean: string; name: string; reason: string }[]>([
    { ean: "5712341001234", name: "Helly Hansen Crew Jacket", reason: "Discontinued EAN" },
    { ean: "5712341001891", name: "Fjällräven Kånken 16L", reason: "Vendor-controlled MAP" },
  ]);
  const [discoveredSuppliers, setDiscoveredSuppliers] = useState<string[]>([]);
  const [excludedComps, setExcludedComps] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<{ id: string; type: "brand" | "category"; value: string; note: string }[]>([
    { id: "o1", type: "brand", value: "Devold", note: "Negotiated supplier agreement" },
  ]);
  const [manualPrices, setManualPrices] = useState<{ ean: string; name: string; price: number; until: string }[]>([
    { ean: "5712341002001", name: "Norrøna Falketind Pants", price: 2199, until: "2026-07-31" },
  ]);

  useEffect(() => {
    const loadSuppliers = () => {
      if (typeof window === "undefined") return;

      try {
        const rawDiscovered = window.localStorage.getItem(DISCOVERED_SUPPLIERS_KEY);
        const parsedDiscovered = rawDiscovered ? JSON.parse(rawDiscovered) : [];
        const discovered = Array.isArray(parsedDiscovered)
          ? parsedDiscovered.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          : [];
        setDiscoveredSuppliers(discovered);
      } catch {
        setDiscoveredSuppliers([]);
      }

      try {
        const rawExcluded = window.localStorage.getItem(EXCLUDED_SUPPLIERS_KEY);
        const parsedExcluded = rawExcluded ? JSON.parse(rawExcluded) : [];
        const excluded = Array.isArray(parsedExcluded)
          ? parsedExcluded.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          : [];
        setExcludedComps(new Set(excluded));
      } catch {
        setExcludedComps(new Set());
      }
    };

    loadSuppliers();
    window.addEventListener("focus", loadSuppliers);
    window.addEventListener("storage", loadSuppliers);
    return () => {
      window.removeEventListener("focus", loadSuppliers);
      window.removeEventListener("storage", loadSuppliers);
    };
  }, []);

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div>
      <PageHeader
        title="Exclusions"
        subtitle="Carve-outs for products, competitors, brands and individual EANs that should bypass the normal pricing rules."
      />

      <div>
        <section className="p-6 space-y-5 max-w-4xl">
          <div>
            <h2 className="text-sm font-semibold">{current.label}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{current.hint}</p>
          </div>

          {tab === "eans" && (
            <EansPanel rows={excludedEans} onAdd={(r) => setExcludedEans((p) => [r, ...p])} onRemove={(ean) => setExcludedEans((p) => p.filter((r) => r.ean !== ean))} />
          )}
          {tab === "competitors" && (
            <CompetitorsPanel
              suppliers={discoveredSuppliers}
              excluded={excludedComps}
              onToggle={(supplier) => {
                setExcludedComps((prev) => {
                  const next = new Set(prev);
                  next.has(supplier) ? next.delete(supplier) : next.add(supplier);
                  window.localStorage.setItem(EXCLUDED_SUPPLIERS_KEY, JSON.stringify([...next]));
                  return next;
                });
              }}
            />
          )}
          {tab === "rules" && (
            <RulesPanel rows={overrides} onAdd={(r) => setOverrides((p) => [r, ...p])} onRemove={(id) => setOverrides((p) => p.filter((r) => r.id !== id))} />
          )}
          {tab === "manual" && (
            <ManualPanel currencyCode={currencyCode} rows={manualPrices} onAdd={(r) => setManualPrices((p) => [r, ...p])} onRemove={(ean) => setManualPrices((p) => p.filter((r) => r.ean !== ean))} />
          )}
        </section>
      </div>
    </div>
  );
}

/* ---------------- EANs ---------------- */
function EansPanel({ rows, onAdd, onRemove }: {
  rows: { ean: string; name: string; reason: string }[];
  onAdd: (r: { ean: string; name: string; reason: string }) => void;
  onRemove: (ean: string) => void;
}) {
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("");
  const matches = useMemo(() => {
    if (q.length < 2) return [];
    return ALL_PRODUCTS.filter((p) =>
      p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.toLowerCase().includes(q.toLowerCase()),
    ).slice(0, 5);
  }, [q]);

  return (
    <>
      <Card title="Add EAN to exclusion list">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by EAN or product name…"
              className="h-9 w-full rounded-md border border-hairline bg-background pl-8 pr-3 text-xs outline-none focus:border-foreground/30"
            />
            {matches.length > 0 && (
              <div className="absolute z-10 top-10 left-0 right-0 rounded-md border border-hairline bg-background shadow-sm divide-y divide-hairline">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { onAdd({ ean: `571234100${m.id.replace("p_", "").padStart(4, "0")}`, name: m.name, reason: reason || "Manually excluded" }); setQ(""); setReason(""); }}
                    className="w-full text-left px-3 py-2 hover:bg-accent text-xs"
                  >
                    <div className="font-medium truncate">{m.name}</div>
                    <div className="num text-[10px] text-muted-foreground">{m.sku} · {m.category}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="h-9 rounded-md border border-hairline bg-background px-3 text-xs outline-none focus:border-foreground/30"
          />
          <button disabled className="inline-flex items-center gap-1.5 rounded-md bg-foreground/40 px-3 text-xs font-medium text-background cursor-not-allowed">
            <Plus className="h-3.5 w-3.5" /> Select from list
          </button>
        </div>
      </Card>

      <Table headers={["EAN", "Product", "Reason", ""]}>
        {rows.map((r) => (
          <tr key={r.ean} className="border-b border-hairline">
            <td className="px-3 py-2.5 num text-[11px] text-muted-foreground">{r.ean}</td>
            <td className="px-3 py-2.5 text-xs font-medium">{r.name}</td>
            <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.reason}</td>
            <td className="px-3 py-2.5 text-right">
              <button onClick={() => onRemove(r.ean)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            </td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-xs text-muted-foreground">No EANs excluded.</td></tr>}
      </Table>
    </>
  );
}

/* ---------------- Competitors ---------------- */
function CompetitorsPanel({ suppliers, excluded, onToggle }: { suppliers: string[]; excluded: Set<string>; onToggle: (supplier: string) => void }) {
  if (suppliers.length === 0) {
    return (
      <div className="rounded-md border border-hairline px-4 py-6 text-xs text-muted-foreground">
        No competitors discovered yet. They appear here automatically after PriceRunner finds them.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-hairline divide-y divide-hairline">
      {suppliers.map((supplier) => {
        const off = excluded.has(supplier);
        return (
          <label key={supplier} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/40">
            <input
              type="checkbox"
              checked={off}
              onChange={() => onToggle(supplier)}
              className="rounded border-hairline"
            />
            <div className="min-w-0 flex-1">
              <div className={cn("text-xs font-medium", off && "line-through text-muted-foreground")}>{supplier}</div>
              <div className="text-[10px] text-muted-foreground">Discovered from PriceRunner</div>
            </div>
            {off && <span className="text-[10px] uppercase tracking-wider text-negative">Ignored</span>}
          </label>
        );
      })}
    </div>
  );
}

/* ---------------- Rules overrides ---------------- */
function RulesPanel({ rows, onAdd, onRemove }: {
  rows: { id: string; type: "brand" | "category"; value: string; note: string }[];
  onAdd: (r: { id: string; type: "brand" | "category"; value: string; note: string }) => void;
  onRemove: (id: string) => void;
}) {
  const [type, setType] = useState<"brand" | "category">("brand");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const options = type === "brand" ? allBrands : allCats;

  return (
    <>
      <Card title="Deactivate all rules for…">
        <div className="grid grid-cols-[120px_1fr_1fr_auto] gap-2">
          <select value={type} onChange={(e) => { setType(e.target.value as "brand" | "category"); setValue(""); }} className="h-9 rounded-md border border-hairline bg-background px-2 text-xs">
            <option value="brand">Brand</option>
            <option value="category">Category</option>
          </select>
          <select value={value} onChange={(e) => setValue(e.target.value)} className="h-9 rounded-md border border-hairline bg-background px-2 text-xs">
            <option value="">Select {type}…</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" className="h-9 rounded-md border border-hairline bg-background px-3 text-xs outline-none focus:border-foreground/30" />
          <button
            disabled={!value}
            onClick={() => { onAdd({ id: `o_${Date.now()}`, type, value, note: note || "—" }); setValue(""); setNote(""); }}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-3 text-xs font-medium", value ? "bg-foreground text-background hover:opacity-90" : "bg-foreground/30 text-background cursor-not-allowed")}
          >
            <Plus className="h-3.5 w-3.5" /> Add override
          </button>
        </div>
      </Card>

      <Table headers={["Type", "Value", "Note", ""]}>
        {rows.map((r) => {
          const count = ALL_PRODUCTS.filter((p) => r.type === "brand" ? p.name.startsWith(r.value) : p.category === r.value).length;
          return (
            <tr key={r.id} className="border-b border-hairline">
              <td className="px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground">{r.type}</td>
              <td className="px-3 py-2.5 text-xs font-medium">{r.value} <span className="text-muted-foreground font-normal">· {count} products</span></td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.note}</td>
              <td className="px-3 py-2.5 text-right">
                <button onClick={() => onRemove(r.id)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
              </td>
            </tr>
          );
        })}
        {rows.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-xs text-muted-foreground">No overrides set.</td></tr>}
      </Table>
    </>
  );
}

/* ---------------- Manual prices ---------------- */
function ManualPanel({ currencyCode, rows, onAdd, onRemove }: {
  currencyCode: string;
  rows: { ean: string; name: string; price: number; until: string }[];
  onAdd: (r: { ean: string; name: string; price: number; until: string }) => void;
  onRemove: (ean: string) => void;
}) {
  const [ean, setEan] = useState("");
  const [price, setPrice] = useState("");
  const [until, setUntil] = useState("");

  const match = useMemo(() => {
    if (ean.length < 4) return null;
    const idx = ALL_PRODUCTS.findIndex((p) => p.sku.includes(ean) || ean.includes(p.id.replace("p_", "")));
    return idx >= 0 ? ALL_PRODUCTS[idx] : null;
  }, [ean]);

  return (
    <>
      <Card title="Set manual price by EAN">
        <div className="grid grid-cols-[1fr_140px_160px_auto] gap-2">
          <input value={ean} onChange={(e) => setEan(e.target.value)} placeholder="EAN (try NO-1005)" className="h-9 rounded-md border border-hairline bg-background px-3 text-xs num outline-none focus:border-foreground/30" />
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder={`Price (${currencyCode})`} className="h-9 rounded-md border border-hairline bg-background px-3 text-xs num outline-none focus:border-foreground/30" />
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="h-9 rounded-md border border-hairline bg-background px-3 text-xs outline-none focus:border-foreground/30" />
          <button
            disabled={!match || !price}
            onClick={() => { if (!match) return; onAdd({ ean, name: match.name, price: Number(price), until: until || "—" }); setEan(""); setPrice(""); setUntil(""); }}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-3 text-xs font-medium", match && price ? "bg-foreground text-background hover:opacity-90" : "bg-foreground/30 text-background cursor-not-allowed")}
          >
            <Plus className="h-3.5 w-3.5" /> Lock price
          </button>
        </div>
        {ean.length >= 4 && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            {match ? <>Matches <span className="text-foreground font-medium">{match.name}</span> · current {fmt(match.current, currencyCode)}</> : <>No product found.</>}
          </div>
        )}
      </Card>

      <Table headers={["EAN", "Product", "Manual price", "Until", ""]}>
        {rows.map((r) => (
          <tr key={r.ean} className="border-b border-hairline">
            <td className="px-3 py-2.5 num text-[11px] text-muted-foreground">{r.ean}</td>
            <td className="px-3 py-2.5 text-xs font-medium">{r.name}</td>
            <td className="px-3 py-2.5 text-xs num">{fmt(r.price, currencyCode)}</td>
            <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.until}</td>
            <td className="px-3 py-2.5 text-right">
              <button onClick={() => onRemove(r.ean)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            </td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-xs text-muted-foreground">No manual prices set.</td></tr>}
      </Table>
    </>
  );
}

/* ---------------- Shared ---------------- */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-hairline bg-surface p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      {children}
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-hairline overflow-hidden">
      <table className="w-full">
        <thead className="bg-surface-2 border-b border-hairline">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={cn("px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground text-left", i === headers.length - 1 && "text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
