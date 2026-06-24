import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useRef, useEffect } from "react";
import { Download, X, Check, ChevronDown } from "lucide-react";
import { PageHeader, StatusPill, Delta } from "@/components/ui-bits";
import { products as ALL_PRODUCTS, strategies, fmt, type Product } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/products")({
  head: () => ({ meta: [{ title: "Products — PricePilot" }] }),
  component: ProductsPage,
});



const SYNC_TIMES = ["2m ago", "8m ago", "14m ago", "23m ago", "41m ago", "1h ago", "2h ago"];

function brandOf(name: string) {
  return name.split(" ")[0];
}

function ProductsPage() {
  const allBrands = useMemo(
    () => Array.from(new Set(ALL_PRODUCTS.map((p) => brandOf(p.name)))).sort(),
    [],
  );
  const allCategories = useMemo(
    () => Array.from(new Set(ALL_PRODUCTS.map((p) => p.category))).sort(),
    [],
  );

  const priceBounds = useMemo(() => {
    const prices = ALL_PRODUCTS.map((p) => p.current);
    return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
  }, []);

  const [brands, setBrands] = useState<Set<string>>(new Set());
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const minNum = priceMin === "" ? null : Number(priceMin);
  const maxNum = priceMax === "" ? null : Number(priceMax);

  const filtered = useMemo(() => {
    return ALL_PRODUCTS.filter((p) => {
      if (brands.size && !brands.has(brandOf(p.name))) return false;
      if (cats.size && !cats.has(p.category)) return false;
      if (minNum !== null && !Number.isNaN(minNum) && p.current < minNum) return false;
      if (maxNum !== null && !Number.isNaN(maxNum) && p.current > maxNum) return false;
      return true;
    });
  }, [brands, cats, minNum, maxNum]);

  const detail = ALL_PRODUCTS.find((p) => p.id === detailId);
  const allVisibleSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const stratFor = (p: Product) => overrides[p.id] ?? p.strategyId;

  function toggleSet<T>(set: Set<T>, val: T, setter: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setter(next);
  }

  function applyStrategy(stratId: string) {
    const strat = strategies.find((s) => s.id === stratId)!;
    const count = selected.size;
    setOverrides((prev) => {
      const next = { ...prev };
      selected.forEach((id) => { next[id] = stratId; });
      return next;
    });
    setToast(`Applied "${strat.name}" to ${count} products · queued for next sync`);
    setApplyOpen(false);
    setSelected(new Set());
    setTimeout(() => setToast(null), 3500);
  }


  const priceActive = (minNum !== null && !Number.isNaN(minNum)) || (maxNum !== null && !Number.isNaN(maxNum));
  const activeFilterCount = brands.size + cats.size + (priceActive ? 1 : 0);

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${filtered.length} of ${ALL_PRODUCTS.length} SKUs · 5 competitors tracked`}
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
            <button className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-xs hover:bg-accent">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          </>
        }
      />

      <div className="flex items-center gap-2 px-6 py-3 border-b border-hairline text-xs flex-wrap">
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
      </div>

      <div className="grid grid-cols-[1fr_auto]">
        {/* Table */}
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
                        filtered.forEach((p) => next.delete(p.id));
                        setSelected(next);
                      } else {
                        const next = new Set(selected);
                        filtered.forEach((p) => next.add(p.id));
                        setSelected(next);
                      }
                    }}
                  />
                </Th>
                <Th>SKU</Th>
                <Th>Product</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Current</Th>
                <Th className="text-right">Margin</Th>
                <Th className="text-right">Comp min</Th>
                <Th className="text-right">Comp avg</Th>
                <Th className="text-right">Comp max</Th>
                <Th>Strategy</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const margin = ((p.current - p.cost) / p.current) * 100;
                const strat = strategies.find((s) => s.id === stratFor(p))!;
                const active = detailId === p.id;
                const checked = selected.has(p.id);
                const syncedAt = SYNC_TIMES[i % SYNC_TIMES.length];
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
                    <Num className={cn(margin < 20 ? "text-negative" : "text-foreground")}>{margin.toFixed(1)}%</Num>
                    <Num>{fmt(p.compMin)}</Num>
                    <Num className="text-muted-foreground">{fmt(p.compAvg)}</Num>
                    <Num>{fmt(p.compMax)}</Num>
                    <Td><span className="truncate text-[11px]">{strat.name}</span></Td>
                    <Td>
                      {p.status === "excluded" ? (
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
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="text-center py-16 text-xs text-muted-foreground">No products match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detail */}
        {detail && (
          <aside className="w-[380px] border-l border-hairline bg-surface min-h-[calc(100vh-8.5rem)] sticky top-0">
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
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Price history · 30d</div>
                <svg viewBox="0 0 300 60" className="w-full h-14">
                  <polyline
                    fill="none"
                    stroke="var(--foreground)"
                    strokeWidth="1.5"
                    points={detail.history.map((v, i) => {
                      const min = Math.min(...detail.history);
                      const max = Math.max(...detail.history);
                      const x = (i / (detail.history.length - 1)) * 300;
                      const y = 55 - ((v - min) / (max - min || 1)) * 50;
                      return `${x},${y}`;
                    }).join(" ")}
                  />
                </svg>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Competitors</div>
                <div className="divide-y divide-hairline border border-hairline rounded-md">
                  {detail.competitorPrices.map((c) => {
                    const diff = ((c.price - detail.current) / detail.current) * 100;
                    return (
                      <div key={c.competitor} className="flex items-center justify-between px-3 py-2">
                        <span className="text-xs truncate">{c.competitor}</span>
                        <div className="flex items-center gap-2">
                          <span className="num text-xs">{fmt(c.price)}</span>
                          <Delta value={diff} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-md border border-hairline p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Applied strategy</div>
                <div className="text-sm font-medium">{strategies.find((s) => s.id === stratFor(detail))?.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{strategies.find((s) => s.id === stratFor(detail))?.summary}</div>
              </div>

              <div className="text-[11px] text-muted-foreground">
                Prices update automatically on the next sync — no manual approval needed.
              </div>
            </div>
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
              {strategies.map((s) => (
                <button
                  key={s.id}
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
