import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-bits";

export const Route = createFileRoute("/logout")({
  head: () => ({ meta: [{ title: "Logout — PricePilot" }] }),
  component: LogoutPage,
});

function LogoutPage() {
  return (
    <div>
      <PageHeader title="Logged out" subtitle="You have been signed out of this prototype workspace." />
      <div className="p-6">
        <div className="rounded-lg border border-hairline bg-surface p-5 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Session ended. Use Settings to reconnect your shop if needed.</p>
          <Link to="/settings" className="inline-flex items-center rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90">
            Open Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
