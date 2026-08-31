import { ArrowUpRight, ArrowDownRight, Layers, ChevronRight, Send, ArrowDownToLine, History as HistoryIcon, GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import type { ChainConfig } from "@/lib/chains";
import { chainStyle } from "@/lib/wallet/chain-style";
import { AssetBadge } from "./AssetBadge";
import { useHideBalances, maskAmount } from "@/lib/wallet/hide-balances";

export interface CardAction {
  label: string;
  icon: typeof Send;
  onClick: () => void;
}

export function MetalWalletCard({
  chain,
  label,
  nativeAmount,
  usdValue,
  usdPrice,
  change24h,
  walletCount = 1,
  onClick,
  onLongPress,
  loading,
  actions,
  footer,
}: {
  chain: ChainConfig;
  /** Optional nickname shown instead of the chain name. */
  label?: string;
  nativeAmount: number | null;
  usdValue: number | null;
  usdPrice: number | null;
  change24h?: number | null;
  walletCount?: number;
  onClick?: () => void;
  onLongPress?: () => void;
  loading?: boolean;
  actions?: CardAction[];
  footer?: ReactNode;
}) {
  const s = chainStyle(chain);
  const positive = (change24h ?? 0) >= 0;
  const hidden = useHideBalances();

  // Long-press (touch) / right-click (desktop) opens the reorder sheet.
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  const startPress = () => {
    if (!onLongPress) return;
    pressTimer = setTimeout(() => onLongPress(), 550);
  };
  const endPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
  };

  return (
    <div
      className="relative shrink-0 w-full max-w-[560px] rounded-3xl p-5 overflow-hidden snap-center isolate text-left"
      style={{ background: s.gradient, boxShadow: "none" }}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchMove={endPress}
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={endPress}
      onContextMenu={(e) => {
        if (!onLongPress) return;
        e.preventDefault();
        onLongPress();
      }}
    >
      <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-60"
        style={{ background: "var(--metal-brushed)" }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--metal-vignette)" }} />
      <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/15 blur-3xl pointer-events-none" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-3xl">
        <div className="absolute -inset-y-4 left-0 w-1/2 animate-sheen" style={{ background: "var(--metal-sheen)" }} />
      </div>
      <div
        className="absolute inset-0 rounded-3xl pointer-events-none ring-1 ring-inset ring-white/15"
        style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.18), inset 0 -28px 60px -42px oklch(0 0 0 / 0.32)" }}
      />

      <button type="button" onClick={onClick} className="relative block w-full text-left press">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10.5px] font-medium text-white/75 uppercase tracking-[0.22em]">
              {label ?? chain.name}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-white/85 text-[12.5px]">
              <Layers className="w-3.5 h-3.5" />
              {walletCount} {walletCount === 1 ? "address set" : "address sets"}
              <ChevronRight className="w-3.5 h-3.5 opacity-70" />
            </div>
          </div>
          <AssetBadge chain={chain} size={48} holo />
        </div>

        <div className="mt-7">
          <div className="text-white/70 text-[11px] tabular tracking-wide">
            {maskAmount(
              usdValue == null
                ? loading ? "—" : "≈ $0.00"
                : "≈ " + usdValue.toLocaleString("en-US", { style: "currency", currency: "USD" }),
              hidden,
            )}
          </div>
          <div className="mt-1 text-white text-[40px] leading-none font-semibold tabular tracking-tight drop-shadow-[0_2px_8px_oklch(0_0_0/0.35)]">
            {maskAmount(
              loading ? "—" : (nativeAmount ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 }),
              hidden,
            )}{" "}
            <span className="text-white/75 text-2xl font-medium">{chain.ticker}</span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/35 backdrop-blur-md text-[11px] font-medium text-white tabular ring-1 ring-white/10">
            {change24h == null ? (
              <>Live</>
            ) : (
              <>
                {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {positive ? "+" : ""}{change24h.toFixed(2)}% · 24h
              </>
            )}
          </div>
          <div className="text-white/75 text-[11px] tabular">
            {usdPrice == null ? "" : `$${usdPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}/${chain.ticker}`}
          </div>
        </div>
      </button>

      {footer && <div className="relative mt-4">{footer}</div>}

      {actions && actions.length > 0 && (
        <div className="relative mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className="press flex flex-col items-center gap-1 rounded-2xl bg-black/30 backdrop-blur-md ring-1 ring-white/15 py-2.5 text-white"
            >
              <a.icon className="w-4 h-4" strokeWidth={2.2} />
              <span className="text-[10.5px] font-medium tracking-wide">{a.label}</span>
            </button>
          ))}
        </div>
      )}

      {onLongPress && (
        <div className="absolute bottom-2 right-3 pointer-events-none text-white/30">
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      )}
    </div>
  );
}

export const CARD_ACTION_ICONS = { Send, Receive: ArrowDownToLine, History: HistoryIcon };
