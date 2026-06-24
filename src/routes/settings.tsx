import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — PricePilot" }] }),
  component: SettingsPage,
});

const sections = [
  { title: "Profile", desc: "Your name, email, and avatar" },
  { title: "Team", desc: "Invite analysts, manage roles" },
  { title: "Notifications", desc: "Daily digest, competitor alerts, sync errors" },
  { title: "Billing", desc: "Plan, usage, invoices" },
  { title: "API tokens", desc: "Programmatic access to PricePilot" },
];

function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="p-6 max-w-2xl space-y-2">
        {sections.map((s) => (
          <div key={s.title} className="flex items-center justify-between rounded-lg border border-hairline bg-surface p-4 hover:border-foreground/30 cursor-pointer">
            <div>
              <div className="text-sm font-medium">{s.title}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{s.desc}</div>
            </div>
            <span className="text-xs text-muted-foreground">→</span>
          </div>
        ))}
      </div>
    </div>
  );
}
