import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Check, User, ChevronDown } from "lucide-react";
import { PageHeader } from "@/components/ui-bits";
import { products, competitors, strategies, fmt } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Recent changes — PricePilot" }] }),
  component: RecentChanges,
});

type Entry = {
  id: string;
  daysAgo: number; // 0 = today
  time: string;
  product: { sku: string; name: string };
  from: number;
  to: number;
  cost: number;
  source: "auto" | "manual";
  by: string;
  trigger: string;
};

const triggers = [
  "Proshop dropped price",
  "Market average rose",
  "Competitor restocked",
  "Elgiganten matched",
  "Komplett undercut",
  "Strategy recalculated",
  "NetOnNet OOS",
  "Power lowered price",
];

// Fabricate a large feed so paging feels real
function buildEntries(): Entry[] {
  const out: Entry[] = [];
  const total = 12480;
  for (let i = 0; i < total; i++) {
    const p = products[i % products.length];
    const strat = strategies[i % strategies.length];
    const manual = i % 11 === 4;

    // Distribute roughly: more recent days denser
    let daysAgo: number;
    let time: string;
    if (i < 420) {
      daysAgo = 0;
      const h = String(23 - Math.floor(i / 20)).padStart(2, "0");
      const m = String((i * 7) % 60).padStart(2, "0");
      time = `${h}:${m}`;
    } else if (i < 900) {
      daysAgo = 1;
      const h = String(23 - Math.floor((i - 420) / 22)).padStart(2, "0");
      const m = String((i * 13) % 60).padStart(2, "0");
      time = `${h}:${m}`;
    } else {
      daysAgo = 2 + Math.floor((i - 900) / 220); // up to ~50 days
      time = `${daysAgo}d ago`;
    }

    const drop = i % 3 !== 0;
    const from = p.current;
    const to = drop
      ? Math.round(from * (0.94 - (i % 5) * 0.005))
      : Math.round(from * (1.03 + (i % 4) * 0.004));
    out.push({
      id: `e_${i}`,
      daysAgo,
      time,
      product: { sku: p.sku, name: p.name },
      from,
      to,
      cost: p.cost,
      source: manual ? "manual" : "auto",
      by: manual ? "Emil M." : strat.name,
      trigger: manual ? "Manual override" : triggers[i % triggers.length],
    });
  }
  return out;
}

const ALL_ENTRIES = buildEntries();

const DATE_PRESETS = [
  { id: "1d", label: "Last 24 h", days: 1 },
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "all", label: "All time", days: Infinity },
] as const;

const PAGE_SIZES = [25, 50, 100, 200, 500, 1000] as const;
type PageSize = (typeof PAGE_SIZES)[number];

function RecentChanges() {
  const [dateId, setDateId] = useState<(typeof DATE_PRESETS)[number]["id"]>("7d");
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [visible, setVisible] = useState<number>(25);

  const dateDays = DATE_PRESETS.find((d) => d.id === dateId)!.days;

  const matching = useMemo(
    () => ALL_ENTRIES.filter((e) => e.daysAgo < dateDays),
    [dateDays],
  );

  const shown = matching.slice(0, visible);
  const remaining = matching.length - shown.length;

  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; items: Entry[] }>();
    for (const e of shown) {
      const key =
        e.daysAgo === 0 ? "today" : e.daysAgo === 1 ? "yesterday" : "earlier";
      const label = key === "today" ? "Today" : key === "yesterday" ? "Yesterday" : "Earlier";
      if (!byKey.has(key)) byKey.set(key, { key, label, items: [] });
      byKey.get(key)!.items.push(e);
    }
    return Array.from(byKey.values());
  }, [shown]);

  function changeDate(id: typeof dateId) {
    setDateId(id);
    setVisible(pageSize);
  }
  function changePageSize(s: PageSize) {
    setPageSize(s);
    setVisible(s);
  }

  return (
    <div>
      <PageHeader
        title="Recent price changes"
        subtitle={`${ALL_ENTRIES.length.toLocaleString("da-DK")} changes tracked · ${competitors.length} competitors`}
      />

      <div className="flex items-center gap-2 px-6 py-3 border-b border-hairline text-xs flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Date</span>
        <Segmented
          options={DATE_PRESETS.map((d) => ({ value: d.id, label: d.label }))}
          value={dateId}
          onChange={(v) => changeDate(v as typeof dateId)}
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Show</span>
          <SelectInline
            value={String(pageSize)}
            onChange={(v) => changePageSize(Number(v) as PageSize)}
            options={PAGE_SIZES.map((s) => ({ value: String(s), label: `${s} per page` }))}
          />
          <span className="text-[11px] text-muted-foreground num">
            {shown.length.toLocaleString("da-DK")} of {matching.length.toLocaleString("da-DK")}
          </span>
        </div>
      </div>

      <div className="px-6 py-8 space-y-8">
        {groups.map((group) => (
          <section key={group.key}>
            <h2 className="mb-2 flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>{group.label}</span>
              <span className="num text-muted-foreground/70 normal-case tracking-normal">
                {group.items.length.toLocaleString("da-DK")}
              </span>
            </h2>
            <div className="rounded-lg border border-hairline bg-surface divide-y divide-hairline">
              {group.items.map((e) => {
                const delta = ((e.to - e.from) / e.from) * 100;
                const up = delta >= 0;
                return (
                  <div
                    key={e.id}
                    className="flex h-10 items-center gap-3 px-4 text-sm hover:bg-accent/40"
                  >
                    <div
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                        up ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"
                      }`}
                    >
                      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    </div>

                    <span className="num text-[10px] text-muted-foreground w-16 shrink-0">
                      {e.product.sku}
                    </span>

                    <span className="min-w-0 flex-1 truncate font-medium">{e.product.name}</span>

                    <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[180px]">
                      {e.source === "auto" ? <Check className="h-3 w-3 shrink-0" /> : <User className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{e.trigger}</span>
                    </span>

                    <span className="num text-xs text-muted-foreground hidden sm:inline w-20 text-right">
                      {fmt(e.from)}
                    </span>
                    <span className="num text-sm font-semibold w-24 text-right">{fmt(e.to)}</span>
                    <span
                      className={`num text-[11px] font-medium w-14 text-right ${
                        up ? "text-positive" : "text-negative"
                      }`}
                    >
                      {up ? "+" : ""}
                      {delta.toFixed(1)}%
                    </span>
                    {(() => {
                      const margin = ((e.to - e.cost) / e.to) * 100;
                      return (
                        <span
                          className={`num text-[11px] hidden md:inline w-16 text-right ${
                            margin < 20 ? "text-negative" : "text-muted-foreground"
                          }`}
                          title="Current margin"
                        >
                          {margin.toFixed(1)}% m
                        </span>
                      );
                    })()}

                    <span className="num text-[11px] text-muted-foreground w-16 text-right shrink-0">
                      {e.time}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {matching.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-16">
            No price changes in this date range.
          </div>
        ) : remaining > 0 ? (
          <div className="flex items-center justify-center pt-2">
            <button
              onClick={() => setVisible((v) => v + pageSize)}
              className="rounded-md border border-hairline bg-surface px-4 py-2 text-xs font-medium hover:bg-accent"
            >
              Load {Math.min(pageSize, remaining).toLocaleString("da-DK")} more
              <span className="text-muted-foreground font-normal"> · {remaining.toLocaleString("da-DK")} left</span>
            </button>
          </div>
        ) : (
          <div className="text-center text-[11px] text-muted-foreground pt-2">End of list</div>
        )}
      </div>
    </div>
  );
}

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
