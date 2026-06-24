import { createFileRoute } from "@tanstack/react-router";
import { Plus, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/ui-bits";
import { strategies } from "@/lib/mock-data";

export const Route = createFileRoute("/strategies")({
  head: () => ({ meta: [{ title: "Strategies — PricePilot" }] }),
  component: StrategiesPage,
});

function StrategiesPage() {
  return (
    <div>
      <PageHeader
        title="Strategies"
        subtitle="Rules that drive recommended prices. Exceptions live inside each strategy."
        actions={
          <button className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90">
            <Plus className="h-3.5 w-3.5" /> New strategy
          </button>
        }
      />
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        {strategies.map((s) => (
          <div key={s.id} className="rounded-lg border border-hairline bg-surface p-4 hover:border-foreground/30 transition-colors">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{s.name}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{s.summary}</div>
              </div>
              <button className="grid h-7 w-7 place-items-center rounded hover:bg-accent">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-4 text-[11px] text-muted-foreground">
              <span><span className="num font-semibold text-foreground">{s.products}</span> products</span>
              <span>·</span>
              <span>Edited {s.edited}</span>
              <span className="ml-auto inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-positive" /> Active
              </span>
            </div>
          </div>
        ))}

        <div className="rounded-lg border border-dashed border-hairline p-4 grid place-items-center text-center hover:border-foreground/30 cursor-pointer">
          <div>
            <Plus className="h-5 w-5 mx-auto text-muted-foreground" />
            <div className="text-xs mt-1.5 font-medium">Create strategy</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">3 fields. Takes under a minute.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
