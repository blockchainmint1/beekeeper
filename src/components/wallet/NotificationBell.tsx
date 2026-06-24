import { Bell, Check, Trash2, ArrowDownLeft } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  clearNotifications,
  markAllRead,
  markRead,
  useNotifications,
  useUnreadCount,
} from "@/lib/wallet/notifications";

function timeAgo(sec: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - sec);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function NotificationBell() {
  const notifs = useNotifications();
  const unread = useUnreadCount();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="w-10 h-10 rounded-full glass-card flex items-center justify-center active:scale-95 transition relative"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" strokeWidth={2.25} />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-emerald-500 text-[10px] font-semibold leading-[16px] text-white text-center ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b">
          <div className="text-xs font-semibold uppercase tracking-wider">
            Alerts
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => markAllRead()}
              disabled={unread === 0}
              className="text-[11px] text-muted-foreground hover:text-foreground transition disabled:opacity-40 inline-flex items-center gap-1"
              title="Mark all read"
            >
              <Check className="w-3 h-3" /> Read
            </button>
            <button
              onClick={() => clearNotifications()}
              disabled={notifs.length === 0}
              className="text-[11px] text-muted-foreground hover:text-foreground transition disabled:opacity-40 inline-flex items-center gap-1 ml-2"
              title="Clear all"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          </div>
        </div>

        {notifs.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            <Bell className="mx-auto mb-2 h-4 w-4 opacity-60" />
            No alerts yet.
            <div className="mt-1 opacity-70">
              You'll be notified when funds arrive.
            </div>
          </div>
        ) : (
          <div className="max-h-[360px] overflow-y-auto">
            {notifs.map((n) => (
              <a
                key={n.id}
                href={n.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => markRead(n.id)}
                className={`flex items-start gap-2.5 px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/40 transition ${
                  !n.read ? "bg-emerald-500/[0.04]" : ""
                }`}
              >
                <div className="mt-0.5 w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      +{n.amount} {n.ticker}
                    </span>
                    {!n.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate font-mono">{n.txid.slice(0, 14)}…</span>
                    <span className="shrink-0">{timeAgo(n.whenSec)}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
