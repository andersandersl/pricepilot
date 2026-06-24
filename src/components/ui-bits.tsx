import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 px-6 pt-8 pb-6">
      <div className="min-w-0">
        <h1 className="text-[34px] leading-[1.05] font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted-foreground max-w-xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: "synced" | "pending" | "excluded" }) {
  const map = {
    synced: "bg-positive/10 text-positive border-positive/20",
    pending: "bg-accent/15 text-accent border-accent/30",
    excluded: "bg-muted text-muted-foreground border-hairline",
  } as const;
  const label = { synced: "Synced", pending: "Pending", excluded: "Excluded" }[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", map[status])}>
      <span className="h-1 w-1 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const pos = value >= 0;
  return (
    <span className={cn("num text-[11px] font-semibold", pos ? "text-positive" : "text-negative")}>
      {pos ? "+" : ""}{value.toFixed(1)}{suffix}
    </span>
  );
}
