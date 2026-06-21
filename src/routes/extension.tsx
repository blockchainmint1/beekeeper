import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/extension")({
  component: ExtensionLayout,
});

function ExtensionLayout() {
  return <Outlet />;
}
