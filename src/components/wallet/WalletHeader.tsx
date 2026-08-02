import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ScanLine, Eye, EyeOff, Plus, Settings as Cog, Sun, Moon, LogOut,
  Download, KeyRound, ShieldCheck, BookUser, ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "./NotificationBell";
import { QrScanDialog } from "./QrScanDialog";
import { parsePaymentUri } from "@/lib/wallet/payment-uri";
import { usePortfolioTotal, usePrices } from "@/lib/wallet/portfolio";
import { priceForChain, formatUsd } from "@/lib/wallet/price";
import { TXC } from "@/lib/chains";
import { getHideBalances, toggleHideBalances, useHideBalances, maskAmount } from "@/lib/wallet/hide-balances";

const THEME_KEY = "quad-wallet-theme";
type Theme = "dark" | "light";

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.toggle("light", t === "light");
  root.classList.toggle("dark", t === "dark");
  root.style.colorScheme = t;
}

/**
 * Compact sticky wallet header. The left block is a tap target that cycles
 * TXC spot price -> total portfolio, and the eye button masks every amount.
 */
export function WalletHeader({ mnemonic, onLock }: { mnemonic: string; onLock?: () => void }) {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>("dark");
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const hidden = useHideBalances();

  useEffect(() => {
    let t: Theme = "dark";
    try {
      const stored = localStorage.getItem(THEME_KEY) as Theme | null;
      if (stored === "light" || stored === "dark") t = stored;
    } catch { /* storage disabled */ }
    setTheme(t);
    applyTheme(t);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* noop */ }
  }

  const prices = usePrices();
  const total = usePortfolioTotal(mnemonic);
  const txcPrice = prices.data ? priceForChain(prices.data, TXC) : null;

  function handleScan(raw: string) {
    setScanOpen(false);
    try {
      const intent = parsePaymentUri(raw);
      if (!intent.address) {
        toast.error("That QR has no recipient address");
        return;
      }
      const chainId = intent.chain?.id ?? "txc";
      navigate({
        to: "/wallet/$chain/send",
        params: { chain: chainId },
        search: {
          to: intent.address,
          amount: intent.amount ?? undefined,
          asset: intent.tokenSymbol ?? undefined,
        },
      });
    } catch {
      toast.error("Couldn't recognize that QR code");
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
      <div className="mx-auto max-w-3xl px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 flex items-center gap-1">
        <Link
          to="/"
          aria-label="Back to My Funds summary"
          title="Back to My Funds"
          className="w-9 h-9 -ml-1 shrink-0 rounded-full flex items-center justify-center text-foreground/80 hover:bg-muted/60 active:scale-95 transition"
        >
          <ChevronLeft className="w-[20px] h-[20px]" strokeWidth={2.1} />
        </Link>

        <button
          onClick={() => setShowPortfolio((v) => !v)}
          className="flex-1 min-w-0 text-left"
          title="Tap to switch between TXC price and your portfolio total"
        >
          <div className="text-[9.5px] font-medium text-muted-foreground uppercase tracking-[0.2em]">
            {showPortfolio ? "Portfolio" : "TXC"}
          </div>
          <div className="text-[15px] font-semibold tabular truncate -mt-0.5">
            {showPortfolio
              ? maskAmount(total.data == null ? "—" : formatUsd(total.data), hidden)
              : maskAmount(
                  txcPrice == null
                    ? "—"
                    : `$${txcPrice.toLocaleString("en-US", { maximumFractionDigits: 6 })}`,
                  hidden,
                )}
          </div>
        </button>

        <IconButton label="Scan QR code" onClick={() => setScanOpen(true)}>
          <ScanLine className="w-[18px] h-[18px]" strokeWidth={2.1} />
        </IconButton>

        <IconButton
          label={getHideBalances() ? "Show balances" : "Hide balances"}
          onClick={toggleHideBalances}
        >
          {hidden ? <EyeOff className="w-[18px] h-[18px]" strokeWidth={2.1} /> : <Eye className="w-[18px] h-[18px]" strokeWidth={2.1} />}
        </IconButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="More wallet tools"
              className="w-9 h-9 rounded-full flex items-center justify-center text-foreground/80 hover:bg-muted/60 active:scale-95 transition"
            >
              <Plus className="w-[18px] h-[18px]" strokeWidth={2.1} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to="/wallet/contacts"><BookUser className="w-4 h-4 mr-2" /> Contacts</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/wallet/multisend"><KeyRound className="w-4 h-4 mr-2" /> Multi-send</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/wallet/sign"><Download className="w-4 h-4 mr-2" /> Sign a message</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/wallet/security"><ShieldCheck className="w-4 h-4 mr-2" /> Security &amp; rescan</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <NotificationBell />

        <IconButton label="Toggle theme" onClick={toggleTheme}>
          {theme === "dark" ? <Sun className="w-[18px] h-[18px]" strokeWidth={2.1} /> : <Moon className="w-[18px] h-[18px]" strokeWidth={2.1} />}
        </IconButton>

        <Link
          to="/wallet/settings"
          aria-label="Settings"
          className="w-9 h-9 rounded-full flex items-center justify-center text-foreground/80 hover:bg-muted/60 active:scale-95 transition"
        >
          <Cog className="w-[18px] h-[18px]" strokeWidth={2.1} />
        </Link>

        {onLock && (
          <IconButton label="Lock wallet" onClick={onLock}>
            <LogOut className="w-[18px] h-[18px]" strokeWidth={2.1} />
          </IconButton>
        )}
      </div>

      <QrScanDialog open={scanOpen} onOpenChange={setScanOpen} onResult={handleScan} />
    </header>
  );
}

function IconButton({
  label, onClick, children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="w-9 h-9 rounded-full flex items-center justify-center text-foreground/80 hover:bg-muted/60 active:scale-95 transition shrink-0"
    >
      {children}
    </button>
  );
}
