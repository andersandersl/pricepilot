import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Sliders, Settings, Search, Ban, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Recent changes", icon: Activity, exact: true },
  { to: "/strategies", label: "Strategies", icon: Sliders },
  { to: "/exclusions", label: "Exclusions", icon: Ban },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/logout", label: "Logout", icon: LogOut },
];

const CREDITS_USED = 1247;
const CREDITS_TOTAL = 3000;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="hidden md:flex w-60 shrink-0 flex-col px-4 py-5">
        <div className="flex items-center gap-2 px-2 pb-6">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-foreground text-background text-[13px] font-black">P</div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-tight">PricePilot</div>
            <div className="text-[10px] text-muted-foreground -mt-0.5 font-medium">Nordic</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">Workspace</div>
          {nav.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-full px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-foreground text-background font-semibold"
                    : "text-foreground/70 hover:text-foreground hover:bg-foreground/5",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pt-3 text-[10px] text-muted-foreground font-mono">
          <div className="flex items-center justify-between">
            <span>v0.4.2 · prototype</span>
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-positive" />
          </div>
        </div>
      </aside>

      <div className="flex-1 flex min-w-0 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 px-5 pt-4">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search EAN, product, competitor…"
              className="h-9 w-full rounded-full border border-hairline bg-surface pl-9 pr-3 text-xs outline-none focus:border-foreground/40"
            />
          </div>
          <Link
            to="/pricing"
            title={`${CREDITS_USED.toLocaleString("da-DK")} of ${CREDITS_TOTAL.toLocaleString("da-DK")} updates used this month`}
            className="flex items-center gap-2.5 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs hover:bg-foreground/5"
          >
            <div className="leading-tight text-right">
              <div className="num font-semibold text-foreground">
                {CREDITS_USED.toLocaleString("da-DK")}
                <span className="text-muted-foreground"> / {CREDITS_TOTAL.toLocaleString("da-DK")}</span>
              </div>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground -mt-0.5 font-mono">Updates this month</div>
            </div>
            <div className="h-1 w-14 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-foreground"
                style={{ width: `${Math.min(100, (CREDITS_USED / CREDITS_TOTAL) * 100)}%` }}
              />
            </div>
          </Link>
        </header>

        <main className="flex-1 min-w-0 overflow-auto">
          <div className="m-4 mt-3 rounded-[20px] border border-hairline bg-surface min-h-[calc(100vh-5.5rem)]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
