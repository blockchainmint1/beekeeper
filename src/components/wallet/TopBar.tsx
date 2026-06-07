import { Bell, Sun, Moon, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

const KEY = "quad-wallet-theme";
type Theme = "dark" | "light";

function getInitial(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(KEY) as Theme | null;
  return stored === "light" || stored === "dark" ? stored : "dark";
}

function apply(t: Theme) {
  const root = document.documentElement;
  root.classList.toggle("light", t === "light");
  root.classList.toggle("dark", t === "dark");
  root.style.colorScheme = t;
}

export function TopBar({
  initials = "HM",
  handle = "Honest Money ID",
  onLock,
}: {
  initials?: string;
  handle?: string;
  onLock?: () => void;
}) {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    const t = getInitial();
    setTheme(t);
    apply(t);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    apply(next);
    try { localStorage.setItem(KEY, next); } catch { /* noop */ }
  }

  return (
    <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
      <div className="flex items-center gap-3">
        <div
          className="relative w-11 h-11 rounded-full flex items-center justify-center text-[13px] font-semibold tracking-tight overflow-hidden"
          style={{
            background: "linear-gradient(160deg, oklch(1 0 0 / 0.18), oklch(1 0 0 / 0.04))",
            boxShadow:
              "inset 0 1px 0 0 oklch(1 0 0 / 0.3), inset 0 -1px 0 0 oklch(0 0 0 / 0.25), 0 6px 18px -8px oklch(0 0 0 / 0.45)",
            border: "1px solid oklch(1 0 0 / 0.1)",
          }}
        >
          <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/15" />
          {initials}
        </div>
        <div>
          <div className="text-[10.5px] text-muted-foreground uppercase tracking-[0.18em]">Honest Money ID</div>
          <div className="text-[13.5px] font-semibold -mt-0.5">{handle}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="w-10 h-10 rounded-full glass-card flex items-center justify-center active:scale-95 transition"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" strokeWidth={2.25} /> : <Moon className="w-4 h-4" strokeWidth={2.25} />}
        </button>
        <button
          className="w-10 h-10 rounded-full glass-card flex items-center justify-center active:scale-95 transition relative"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" strokeWidth={2.25} />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[var(--zcu)] ring-2 ring-background" />
        </button>
        {onLock && (
          <button
            onClick={onLock}
            aria-label="Lock wallet"
            className="w-10 h-10 rounded-full glass-card flex items-center justify-center active:scale-95 transition"
          >
            <LogOut className="w-4 h-4" strokeWidth={2.25} />
          </button>
        )}
      </div>
    </div>
  );
}