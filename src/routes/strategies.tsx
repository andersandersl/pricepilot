import { createFileRoute } from "@tanstack/react-router";
import { Plus, MoreHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui-bits";
import {
  describeStrategySettings,
  getDefaultStrategies,
  getDefaultStrategySettings,
  readStoredStrategies,
  saveStoredStrategies,
  type StrategyRecord,
  type StrategySettings,
} from "@/lib/strategy-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/strategies")({
  head: () => ({ meta: [{ title: "Strategies — PricePilot" }] }),
  component: StrategiesPage,
});

function StrategiesPage() {
  const [items, setItems] = useState<StrategyRecord[]>(getDefaultStrategies());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; active: boolean; settings: StrategySettings }>({
    name: "",
    active: true,
    settings: getDefaultStrategySettings(),
  });

  useEffect(() => {
    setItems(readStoredStrategies());
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm({ name: "", active: true, settings: getDefaultStrategySettings() });
    setModalOpen(true);
  }

  function openEdit(item: StrategyRecord) {
    setEditingId(item.id);
    setForm({ name: item.name, active: item.active, settings: item.settings });
    setModalOpen(true);
  }

  function persist(next: StrategyRecord[]) {
    setItems(next);
    saveStoredStrategies(next);
  }

  function saveStrategy() {
    const name = form.name.trim();
    if (!name) return;

    const summary = describeStrategySettings(form.settings);

    if (editingId) {
      const next = items.map((s) =>
        s.id === editingId
          ? { ...s, name, summary, active: form.active, settings: form.settings, edited: "just now" }
          : s,
      );
      persist(next);
    } else {
      const next: StrategyRecord = {
        id: `s_${Date.now()}`,
        name,
        summary,
        products: 0,
        edited: "just now",
        active: form.active,
        settings: form.settings,
      };
      persist([next, ...items]);
    }

    setModalOpen(false);
  }

  function deleteStrategy() {
    if (!editingId) return;
    const next = items.filter((s) => s.id !== editingId);
    persist(next.length ? next : getDefaultStrategies());
    setModalOpen(false);
  }

  const editing = useMemo(() => items.find((s) => s.id === editingId) ?? null, [items, editingId]);

  return (
    <div>
      <PageHeader
        title="Strategies"
        subtitle="Rules that drive recommended prices. Exceptions live inside each strategy."
        actions={
          <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90">
            <Plus className="h-3.5 w-3.5" /> New strategy
          </button>
        }
      />
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((s) => (
          <div key={s.id} className="rounded-lg border border-hairline bg-surface p-4 hover:border-foreground/30 transition-colors">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{s.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{s.summary}</div>
                <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="rounded bg-accent px-1.5 py-0.5">Margin floor {s.settings.minMarginPct}%</span>
                  <span className="rounded bg-accent px-1.5 py-0.5">Max step {s.settings.maxStepChangePct}%</span>
                  <span className="rounded bg-accent px-1.5 py-0.5">Round {s.settings.rounding} DKK</span>
                </div>
              </div>
              <button onClick={() => openEdit(s)} className="grid h-7 w-7 place-items-center rounded hover:bg-accent">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-4 text-[11px] text-muted-foreground">
              <span><span className="num font-semibold text-foreground">{s.products}</span> products</span>
              <span>·</span>
              <span>Edited {s.edited}</span>
              <span className="ml-auto inline-flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", s.active ? "bg-positive" : "bg-muted-foreground")} /> {s.active ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        ))}

        <div onClick={openCreate} className="rounded-lg border border-dashed border-hairline p-4 grid place-items-center text-center hover:border-foreground/30 cursor-pointer">
          <div>
            <Plus className="h-5 w-5 mx-auto text-muted-foreground" />
            <div className="text-xs mt-1.5 font-medium">Create strategy</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">3 fields. Takes under a minute.</div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20" onClick={() => setModalOpen(false)}>
          <div className="w-[520px] rounded-lg border border-hairline bg-background shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-hairline px-5 py-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{editing ? "Edit strategy" : "Create strategy"}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Define a reusable pricing rule for product groups.</div>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <label className="space-y-1 block">
                <span className="text-[11px] font-medium text-muted-foreground">Strategy name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Margin floor 20%"
                  className="h-10 w-full rounded-md border border-hairline bg-background px-3 text-sm outline-none focus:border-foreground/40"
                />
              </label>

              <label className="space-y-1 block">
                <span className="text-[11px] font-medium text-muted-foreground">Price basis</span>
                <select
                  value={form.settings.basis}
                  onChange={(e) => setForm((p) => ({ ...p, settings: { ...p.settings, basis: e.target.value as StrategySettings["basis"] } }))}
                  className="h-10 w-full rounded-md border border-hairline bg-background px-3 text-sm outline-none focus:border-foreground/40"
                >
                  <option value="lowest">Beat lowest competitor</option>
                  <option value="average">Match market average</option>
                  <option value="premium">Premium vs market average</option>
                </select>
              </label>

              {form.settings.basis === "lowest" && (
                <label className="space-y-1 block">
                  <span className="text-[11px] font-medium text-muted-foreground">Undercut (%)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={form.settings.undercutPct}
                    onChange={(e) => setForm((p) => ({ ...p, settings: { ...p.settings, undercutPct: Number(e.target.value || 0) } }))}
                    className="h-10 w-full rounded-md border border-hairline bg-background px-3 text-sm outline-none focus:border-foreground/40"
                  />
                </label>
              )}

              {form.settings.basis === "premium" && (
                <label className="space-y-1 block">
                  <span className="text-[11px] font-medium text-muted-foreground">Premium (%)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={form.settings.premiumPct}
                    onChange={(e) => setForm((p) => ({ ...p, settings: { ...p.settings, premiumPct: Number(e.target.value || 0) } }))}
                    className="h-10 w-full rounded-md border border-hairline bg-background px-3 text-sm outline-none focus:border-foreground/40"
                  />
                </label>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="text-[11px] font-medium text-muted-foreground">Min margin floor (%)</span>
                  <input
                    type="number"
                    min={1}
                    max={95}
                    value={form.settings.minMarginPct}
                    onChange={(e) => setForm((p) => ({ ...p, settings: { ...p.settings, minMarginPct: Number(e.target.value || 0) } }))}
                    className="h-10 w-full rounded-md border border-hairline bg-background px-3 text-sm outline-none focus:border-foreground/40"
                  />
                </label>

                <label className="space-y-1 block">
                  <span className="text-[11px] font-medium text-muted-foreground">Max step change (%)</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={form.settings.maxStepChangePct}
                    onChange={(e) => setForm((p) => ({ ...p, settings: { ...p.settings, maxStepChangePct: Number(e.target.value || 0) } }))}
                    className="h-10 w-full rounded-md border border-hairline bg-background px-3 text-sm outline-none focus:border-foreground/40"
                  />
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-[11px] font-medium text-muted-foreground">Rounding</span>
                <select
                  value={form.settings.rounding}
                  onChange={(e) => setForm((p) => ({ ...p, settings: { ...p.settings, rounding: e.target.value as StrategySettings["rounding"] } }))}
                  className="h-10 w-full rounded-md border border-hairline bg-background px-3 text-sm outline-none focus:border-foreground/40"
                >
                  <option value="none">No rounding</option>
                  <option value="0.5">0.5 DKK</option>
                  <option value="1">1 DKK</option>
                  <option value="5">5 DKK</option>
                </select>
              </label>

              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.settings.inStockOnly}
                  onChange={(e) => setForm((p) => ({ ...p, settings: { ...p.settings, inStockOnly: e.target.checked } }))}
                  className="rounded border-hairline"
                />
                Use only in-stock competitor offers
              </label>

              <div className="rounded-md border border-hairline bg-surface px-3 py-2 text-[11px] text-muted-foreground">
                {describeStrategySettings(form.settings)}
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                  className="rounded border-hairline"
                />
                Active
              </label>
            </div>

            <div className="border-t border-hairline px-5 py-3 flex items-center justify-between">
              <div>
                {editing && (
                  <button onClick={deleteStrategy} className="text-xs text-negative hover:opacity-80">
                    Delete strategy
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setModalOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                <button
                  onClick={saveStrategy}
                  disabled={!form.name.trim()}
                  className="inline-flex items-center rounded-md bg-foreground text-background px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
