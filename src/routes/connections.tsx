import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/connections")({
  head: () => ({ meta: [{ title: "Connections — PricePilot" }] }),
  component: ConnectionsPage,
});

function ConnectionsPage() {
  return (
    <div>
      <PageHeader title="Connections moved" subtitle="Connection setup is now part of Settings" />
      <div className="p-6">
        <div className="rounded-lg border border-hairline bg-surface p-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Go to Settings to choose platform and configure credentials.</p>
          <Link to="/settings" className="inline-flex items-center rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90">
            Open Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
