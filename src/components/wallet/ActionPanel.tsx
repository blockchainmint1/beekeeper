import type { LucideIcon } from "lucide-react";
import type { ChainConfig } from "@/lib/chains";
import { chainReflection } from "@/lib/wallet/chain-style";

export type ActionItem = {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
};

export function ActionPanel({ chain, actions }: { chain: ChainConfig; actions: ActionItem[] }) {
  const accent = chain.color;
  return (
    <div className="relative">
      <div
        className="absolute -inset-x-2 -bottom-4 h-10 rounded-full blur-2xl opacity-40 transition-colors duration-700 pointer-events-none"
        style={{ background: `color-mix(in oklab, ${accent} 35%, transparent)` }}
      />
      <div
        className="relative rounded-[28px] p-5 overflow-hidden transition-all duration-700"
        style={{
          background: "var(--glass)",
          backdropFilter: "blur(28px) saturate(190%)",
          WebkitBackdropFilter: "blur(28px) saturate(190%)",
          border: "1px solid var(--color-border)",
          boxShadow:
            "0 30px 60px -28px oklch(0 0 0 / 0.55), 0 4px 14px -6px oklch(0 0 0 / 0.25), inset 0 1px 0 0 oklch(1 0 0 / 0.1), inset 0 -1px 0 0 oklch(0 0 0 / 0.18)",
        }}
      >
        <div
          key={chain.id}
          className="absolute inset-0 pointer-events-none opacity-70 transition-all duration-700"
          style={{ background: chainReflection(accent) }}
        />
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent pointer-events-none" />

        <div className="relative grid grid-cols-4 gap-x-1 gap-y-5">
          {actions.map(({ label, icon: Icon, onClick, disabled }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              disabled={disabled}
              className="group flex flex-col items-center justify-start gap-2 select-none disabled:opacity-40"
            >
              <span
                className="relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-[1.06] group-active:scale-[0.92]"
                style={{
                  background: "linear-gradient(160deg, oklch(1 0 0 / 0.16), oklch(1 0 0 / 0.03))",
                  boxShadow:
                    "inset 0 1px 0 0 oklch(1 0 0 / 0.28), inset 0 -1px 0 0 oklch(0 0 0 / 0.22), 0 10px 22px -10px oklch(0 0 0 / 0.55), 0 1px 2px oklch(0 0 0 / 0.25)",
                  border: "1px solid oklch(1 0 0 / 0.1)",
                }}
              >
                <span
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-400"
                  style={{
                    boxShadow: `0 0 0 1px color-mix(in oklab, ${accent} 35%, transparent), 0 12px 26px -8px color-mix(in oklab, ${accent} 50%, transparent)`,
                  }}
                />
                <Icon
                  className="w-[19px] h-[19px] text-foreground relative drop-shadow-[0_1px_1px_oklch(0_0_0/0.35)]"
                  strokeWidth={2}
                />
              </span>
              <span className="text-[10.5px] font-medium text-foreground/85 tracking-tight">
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}