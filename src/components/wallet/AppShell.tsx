import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen mx-auto max-w-[480px] pb-32 relative">
      {children}
    </div>
  );
}