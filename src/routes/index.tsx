import { createFileRoute } from "@tanstack/react-router";
import { ProductsPage } from "./products";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Recent changes — PricePilot" }] }),
  component: RecentChanges,
});

function RecentChanges() {
  return <ProductsPage mode="recent" />;
}
